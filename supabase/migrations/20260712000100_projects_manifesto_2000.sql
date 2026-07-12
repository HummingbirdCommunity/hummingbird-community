-- Widen the project manifesto cap from 500 to 2000 characters (HB-17).
--
-- The signature "启动书" field needs more room for founders to tell the full
-- story behind their project. Forward migration (not an edit of the original)
-- so staging — which already has the 500 constraint — and a fresh prod both
-- converge on 2000. Idempotent: drop-if-exists then re-add.

alter table public.projects drop constraint if exists projects_manifesto_check;
alter table public.projects
	add constraint projects_manifesto_check check (char_length(manifesto) between 1 and 2000);
