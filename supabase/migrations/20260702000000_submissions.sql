-- Submission intake for the post-login panel (HB-3).
--
-- Two intake tables — one per path the user can take from the dashboard panel:
--   * resumes      — a resume uploaded for a (future) free resume scan.
--   * uploaded_jds — a job description submitted as a potential opportunity,
--                    pending review (trust-point award lands in a later ticket).
--
-- Both store only a pointer (file_path) into the private `submissions` Storage
-- bucket; the file bytes live in Storage, not the row. RLS is self-scoped: a
-- user can see and create only their own submissions. Review/scan workflows and
-- the trust-point economy are out of scope here and arrive in follow-up tickets.

-- Resumes --------------------------------------------------------------------
create table if not exists public.resumes (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	file_path text not null,
	status text not null default 'received',
	created_at timestamptz not null default now()
);

comment on table public.resumes is 'Resumes uploaded from the dashboard panel for a free resume scan (HB-3).';

create index if not exists resumes_user_id_idx on public.resumes (user_id);

alter table public.resumes enable row level security;

drop policy if exists "Users can read their own resumes" on public.resumes;
create policy "Users can read their own resumes" on public.resumes for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own resumes" on public.resumes;
create policy "Users can insert their own resumes" on public.resumes for insert with check (auth.uid() = user_id);

-- Uploaded JDs ---------------------------------------------------------------
create table if not exists public.uploaded_jds (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	file_path text not null,
	status text not null default 'pending',
	created_at timestamptz not null default now()
);

comment on table public.uploaded_jds is 'Job descriptions submitted from the dashboard panel, pending review (HB-3).';

create index if not exists uploaded_jds_user_id_idx on public.uploaded_jds (user_id);

alter table public.uploaded_jds enable row level security;

drop policy if exists "Users can read their own uploaded jds" on public.uploaded_jds;
create policy "Users can read their own uploaded jds" on public.uploaded_jds for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own uploaded jds" on public.uploaded_jds;
create policy "Users can insert their own uploaded jds" on public.uploaded_jds for insert with check (auth.uid() = user_id);

-- Private Storage bucket -----------------------------------------------------
-- Access is scoped by object ownership, not path layout: Storage stamps each
-- upload with the authenticated uploader, so a user can only read or write
-- their own files however the helper chooses to name them. PDF-only, 5MB cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 5242880, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own submission files" on storage.objects;
create policy "Users can read their own submission files" on storage.objects for select
	using (bucket_id = 'submissions' and owner_id = auth.uid()::text);

drop policy if exists "Users can upload their own submission files" on storage.objects;
create policy "Users can upload their own submission files" on storage.objects for insert
	with check (bucket_id = 'submissions' and owner_id = auth.uid()::text);
