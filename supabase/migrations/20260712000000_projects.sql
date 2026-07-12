-- Projects launched from Explore (HB-17).
--
-- One row per project a member launches from the Explore page. The signature
-- field is `manifesto` ("项目启动书") — a longer statement about why the founder
-- started the project. Projects form a public community directory (like
-- profiles), so anyone may read them; a member may create and edit only their
-- own. Editing/deletion UI, a detail page, moderation and the my-project view
-- are out of scope here and arrive in follow-up tickets.
--
-- The optional logo image lives in the public `project-logos` Storage bucket;
-- the row stores only a pointer (`logo_path`). Bytes live in Storage.

-- Projects -------------------------------------------------------------------
create table if not exists public.projects (
	id uuid primary key default gen_random_uuid(),
	owner_id uuid not null references auth.users (id) on delete cascade,
	name text not null check (char_length(name) between 1 and 80),
	tagline text not null check (char_length(tagline) between 1 and 120),
	manifesto text not null check (char_length(manifesto) between 1 and 500),
	repo_url text,
	logo_path text,
	created_at timestamptz not null default now()
);

comment on table public.projects is 'Projects launched from Explore; public community directory (HB-17).';

create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists projects_created_at_idx on public.projects (created_at desc);

alter table public.projects enable row level security;

-- Public directory: anyone (including anonymous visitors) can read projects.
drop policy if exists "Projects are viewable by everyone" on public.projects;
create policy "Projects are viewable by everyone" on public.projects for select using (true);

-- A member may create projects only under their own ownership.
drop policy if exists "Users can insert their own projects" on public.projects;
create policy "Users can insert their own projects" on public.projects for insert with check (auth.uid() = owner_id);

-- A member may edit only their own projects (edit UI lands in a follow-up).
drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects" on public.projects for update using (auth.uid() = owner_id);

-- Public logo bucket ---------------------------------------------------------
-- Public so logos render via a plain public URL in the directory. Writes are
-- owner-scoped: Storage stamps each upload with the authenticated uploader, so
-- a member can only write (and later replace) their own logo files however the
-- helper names them. Images only, 2MB cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-logos', 'project-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read logo objects (bucket is public anyway; explicit for clarity).
drop policy if exists "Project logos are readable by everyone" on storage.objects;
create policy "Project logos are readable by everyone" on storage.objects for select
	using (bucket_id = 'project-logos');

drop policy if exists "Users can upload their own project logos" on storage.objects;
create policy "Users can upload their own project logos" on storage.objects for insert
	with check (bucket_id = 'project-logos' and owner_id = auth.uid()::text);

drop policy if exists "Users can update their own project logos" on storage.objects;
create policy "Users can update their own project logos" on storage.objects for update
	using (bucket_id = 'project-logos' and owner_id = auth.uid()::text);
