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

/**
 * Quién está pidiendo, imitando lo que hace Supabase.
 *
 * Se miran los dos lugares donde puede estar el dato. Con `psql` se fija a
 * mano `request.jwt.claim.sub`, que es lo cómodo para una prueba suelta.
 * PostgREST, en cambio, deja todas las claims juntas en `request.jwt.claims`
 * como JSON; mirando sólo la primera forma, `auth.uid()` devuelve nulo con
 * PostgREST y todo lo que dependa de `es_admin()` da falso sin explicar por
 * qué —el síntoma es «sólo dirección puede…» para alguien que sí es
 * dirección.
 */
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ------------------------------------------------------------- almacenamiento
--
-- Lo mínimo de `storage` para poder probar la migración de adjuntos: el balde
-- y los objetos, con RLS prendido como viene en Supabase. No guarda archivos
-- —acá no hay dónde—, sólo permite comprobar que las políticas se crean y que
-- dejan pasar a quien deben.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
