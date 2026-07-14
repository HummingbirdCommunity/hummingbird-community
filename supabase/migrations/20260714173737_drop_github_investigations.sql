-- Drop the legacy github_investigations table (HB-26, Milestone 3.1).
--
-- Superseded by developer_profiles + investigation_runs. The read and write
-- paths were cut over in the same milestone, so nothing references this table
-- anymore. Historical rows are discarded, not migrated: they were
-- requester-owned investigation records with no subject-owned equivalent, and
-- the early-stage data is disposable (design §10).
--
-- cascade takes the table's indexes, RLS policy, and updated_at trigger with it.

drop table if exists public.github_investigations cascade;
