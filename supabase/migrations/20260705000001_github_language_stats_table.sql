-- Persist GitHub language stats independently of the connection (HB-7).
--
-- HB-7 first cached the aggregate as columns on github_connections, but that row
-- is deleted on disconnect — taking the snapshot with it. GitHub-derived data
-- must reference auth.users directly (see the github_connections migration) so
-- unlinking GitHub never cascades it away. Moving the cache to its own
-- user-scoped table means the last snapshot survives a disconnect: the languages
-- route can keep showing it (flagged as no-longer-updating) until the user
-- reconnects.
--
-- Same security model as github_connections: RLS enabled with no policies, so
-- only the service role (via /api/github/languages) reads or writes it.

create table if not exists public.github_language_stats (
	user_id uuid primary key references auth.users (id) on delete cascade,
	language_stats jsonb not null,
	repo_count integer not null default 0,
	computed_at timestamptz not null,
	updated_at timestamptz not null default now()
);

comment on table public.github_language_stats is 'Per-user cached public-repo language byte totals; outlives the GitHub connection (HB-7).';

alter table public.github_language_stats enable row level security;

-- Reuses public.set_updated_at() defined in the initial profiles migration.
drop trigger if exists github_language_stats_set_updated_at on public.github_language_stats;
create trigger github_language_stats_set_updated_at
before update on public.github_language_stats
for each row
execute function public.set_updated_at();

-- The stats briefly lived on github_connections (HB-7 first cut); they now have
-- their own table, so drop the redundant columns.
alter table public.github_connections
	drop column if exists language_stats;
alter table public.github_connections
	drop column if exists languages_fetched_at;
