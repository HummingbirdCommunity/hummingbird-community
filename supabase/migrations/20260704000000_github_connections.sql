-- GitHub account connections (HB-6).
--
-- One row per user linking their platform account to a GitHub account, so later
-- tickets can fetch information from GitHub on the user's behalf. This ticket
-- only establishes the connection.
--
-- Security model:
--   * The access/refresh tokens are stored ENCRYPTED (AES-256-GCM, app-managed
--     key) — this table never holds a plaintext credential.
--   * RLS is enabled with NO policies, so neither anon nor authenticated clients
--     can read or write it. Only the service role (which bypasses RLS) touches
--     this table, exclusively through the server's /api/github/* routes. The
--     browser never sees the token, not even as ciphertext.
--
-- Disconnect deletes only this row. Nothing else may FK-cascade to this table:
-- a user's GitHub-derived collaboration evidence is community public knowledge
-- and must reference auth.users(id), never github_connections, so unlinking
-- GitHub can never cascade it away.
--
-- github_user_id is unique: one GitHub account maps to at most one platform
-- account, so the same identity can't be linked to two users to game evidence.
--
-- Expiry/refresh columns are nullable to support both non-expiring OAuth App
-- tokens (today) and expiring tokens with a refresh token (if we enable token
-- expiration or move to a GitHub App later) without another migration. The
-- refresh routine itself is out of scope here.

create table if not exists public.github_connections (
	user_id uuid primary key references auth.users (id) on delete cascade,
	github_user_id bigint not null unique,
	github_username text not null,
	avatar_url text,
	access_token_encrypted text not null,
	refresh_token_encrypted text,
	token_type text,
	scopes text,
	expires_at timestamptz,
	refresh_token_expires_at timestamptz,
	connected_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on table public.github_connections is 'Per-user GitHub account link with encrypted tokens; service-role only (HB-6).';

-- Row Level Security ---------------------------------------------------------
-- Enabled with no policies on purpose: only the service role may access this
-- table. Any client access (connection status, disconnect) goes through the
-- protected /api/github/* server routes.
alter table public.github_connections enable row level security;

-- Keep updated_at current on every write ------------------------------------
-- Reuses public.set_updated_at() defined in the initial profiles migration.
drop trigger if exists github_connections_set_updated_at on public.github_connections;
create trigger github_connections_set_updated_at
before update on public.github_connections
for each row
execute function public.set_updated_at();
