-- Imita lo mínimo que Supabase ya trae de fábrica: el esquema `auth`, los
-- roles (anon / authenticated / service_role) y `auth.uid()`.
--
-- Sirve SÓLO para probar `supabase/bootstrap.sql` contra un Postgres local.
-- NO correr esto en un proyecto de Supabase: allá esas piezas ya existen y
-- son de verdad; esta versión es de mentira y las pisaría.
do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role authenticator noinherit login; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
do $$ begin create role supabase_auth_admin noinherit createrole login bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
