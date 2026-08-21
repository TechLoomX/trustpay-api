-- CI-ONLY shim. supabase/migrations/0002_rls_policies.sql references
-- `authenticated`/`anon`/`service_role` Postgres roles and an `auth.jwt()`
-- function, all of which a real Supabase project provisions for you. CI
-- only has a bare `postgres:15` container, so this recreates the minimal
-- pieces needed for the real migrations to apply and for RLS to actually be
-- exercisable in tests.
--
-- Do NOT run this against a real Supabase project (local `supabase start`
-- or hosted) — it already has real, more complete versions of all of this.
-- This file lives outside supabase/migrations/ specifically so it can never
-- be picked up by `supabase db push`/`supabase migration up`.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists auth;

-- Mirrors real Supabase's auth.jwt(): reads whatever claims the current
-- session/transaction set via `set local request.jwt.claims = '{...}'`.
create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
