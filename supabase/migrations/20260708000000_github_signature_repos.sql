-- Persist a user's computed "signature repositories" snapshot independently of
-- the GitHub connection (HB-10).
--
-- Same rationale and security model as github_language_stats (HB-7): GitHub-
-- derived data references auth.users directly and lives in its own user-scoped
-- table, so unlinking GitHub never cascades the snapshot away — the signature
-- route can keep serving the last snapshot (flagged as no-longer-updating) until
-- the user reconnects. RLS is enabled with no policies, so only the service role
-- (via /api/github/signature) reads or writes it.

create table if not exists public.github_signature_repos (
	user_id uuid primary key references auth.users (id) on delete cascade,
	repos jsonb not null,
	computed_at timestamptz not null,
	updated_at timestamptz not null default now()
);

comment on table public.github_signature_repos is 'Per-user cached signature repositories (pinned + top-starred); outlives the GitHub connection (HB-10).';

alter table public.github_signature_repos enable row level security;

-- Reuses public.set_updated_at() defined in the initial profiles migration.
drop trigger if exists github_signature_repos_set_updated_at on public.github_signature_repos;
create trigger github_signature_repos_set_updated_at
before update on public.github_signature_repos
for each row
execute function public.set_updated_at();
