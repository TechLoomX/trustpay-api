-- CI-ONLY shim, applied after supabase/migrations/*.sql. Real Supabase
-- grants its anon/authenticated/service_role roles table-level privileges
-- on the public schema itself (RLS then narrows per-row access on top of
-- that); a bare postgres:15 container has no such grants, so every query
-- would fail on a permission-denied error before RLS is even evaluated.
--
-- Do NOT run this against a real Supabase project — see
-- 00-roles-and-auth-shim.sql for why.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;
