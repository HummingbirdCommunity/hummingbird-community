-- Admin flag for the "view as user" impersonation feature (HB-15).
--
-- One boolean per profile. Only admins may open the user switcher and, more
-- importantly, only an admin caller is allowed to resolve another user's data
-- server-side (the GitHub read routes verify this flag before honoring a
-- `viewAs` target). The column is world-readable via the existing "Profiles are
-- viewable by everyone" select policy — that's fine: knowing who is an admin
-- grants no access on its own; the server still checks the flag on every call,
-- and RLS keeps every write scoped to the real signed-in user.
--
-- No user is an admin by default; grant it explicitly, e.g.
--   update public.profiles set is_admin = true where id = '<your-auth-uid>';

alter table public.profiles
	add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is 'Grants access to the admin user switcher / view-as impersonation (HB-15).';
