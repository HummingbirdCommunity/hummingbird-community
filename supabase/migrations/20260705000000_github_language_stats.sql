-- Cached GitHub language distribution (HB-7).
--
-- HB-6 established the per-user GitHub connection. This adds a cache for the
-- aggregated public-repo language breakdown so the profile can render a
-- distribution chart without re-hitting the GitHub API on every page load.
--
--   * language_stats: aggregated { "<language>": <bytes> } summed across the
--     user's owned public repos (and forks they've authored commits in). jsonb
--     so the language set can grow without a schema change. Null until first
--     computed.
--   * languages_fetched_at: when the cache was last (re)computed. The languages
--     route treats a row older than its TTL as stale and recomputes.
--
-- Both live on the existing 1:1 github_connections table and inherit its
-- security model: RLS-enabled with no policies, service-role only. The browser
-- reads this through the protected /api/github/languages route, never directly.

alter table public.github_connections
	add column if not exists language_stats jsonb;

alter table public.github_connections
	add column if not exists languages_fetched_at timestamptz;

comment on column public.github_connections.language_stats is
	'Cached { language: bytes } aggregated across the user''s public repos (HB-7).';
comment on column public.github_connections.languages_fetched_at is
	'When language_stats was last recomputed; used for TTL-based staleness (HB-7).';
