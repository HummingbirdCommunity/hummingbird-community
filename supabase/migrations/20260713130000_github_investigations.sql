-- GitHub investigation runs (HB-20, Phase 1 foundation).
--
-- One row per investigation a member starts from the Investigate page. The row
-- is created up front (status 'running') so the agent's async workflow has a
-- durable home to write its result into — the Vercel Workflow run is ephemeral
-- and gets garbage-collected, so results must live here to survive a refresh.
--
-- `workflow_run_id` is the join key between this row and the Vercel Workflow
-- run: the browser navigates and streams by run id, so the result route looks
-- the row up by it. It's nullable because the row is inserted before start()
-- returns the id, then stamped in a follow-up update.
--
-- `profile_data` holds the whole investigation result as JSONB (identity +
-- AI summary) — the schema is still evolving and the result is always read and
-- written as one unit, so a JSONB blob beats normalizing into many tables.

create table if not exists public.github_investigations (
	id uuid primary key default gen_random_uuid(),
	target_username text not null,
	requested_by uuid not null references auth.users (id) on delete cascade,
	workflow_run_id text unique,
	status text not null default 'running' check (status in ('running', 'completed', 'failed')),
	profile_data jsonb,
	error_message text,
	created_at timestamptz not null default now(),
	completed_at timestamptz,
	updated_at timestamptz not null default now()
);

comment on table public.github_investigations is 'GitHub developer investigations; per-user history, service-role writes (HB-20).';

-- "My recent investigations" reads by requester, newest first.
create index if not exists github_investigations_requested_by_idx
	on public.github_investigations (requested_by, created_at desc);

-- Lookups by the investigated username (future caching / dedupe).
create index if not exists github_investigations_target_idx
	on public.github_investigations (target_username);

-- Row Level Security ---------------------------------------------------------
-- Self-scoped: a member may read only their own investigations. All writes go
-- through the service role (POST route + workflow steps), which bypasses RLS,
-- so no insert/update policy is needed.
alter table public.github_investigations enable row level security;

drop policy if exists "Users can read own investigations" on public.github_investigations;
create policy "Users can read own investigations" on public.github_investigations for select
	using (auth.uid() = requested_by);

-- Keep updated_at current on every write ------------------------------------
-- Reuses public.set_updated_at() defined in the initial profiles migration.
drop trigger if exists github_investigations_set_updated_at on public.github_investigations;
create trigger github_investigations_set_updated_at
before update on public.github_investigations
for each row
execute function public.set_updated_at();
