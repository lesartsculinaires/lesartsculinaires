-- ============================================================================
-- Los errores que el navegador ataja, anotados.
-- ============================================================================
--
-- El 10 de octubre de 2026 el CRM se quedó en una pantalla blanca —«Application
-- error: a client-side exception has occurred»— y lo único que hubo para
-- diagnosticarlo fue una foto del monitor. El error de verdad estaba en la
-- consola de esa computadora y se perdió al recargar.
--
-- Ahora la pantalla se recupera sola (`src/app/error.tsx`) y, de paso, le
-- cuenta al servidor qué falló (`src/app/api/errores/route.ts`). Esto es donde
-- queda.
--
-- QUIÉN PUEDE QUÉ
--
--   Anotar   cualquiera con sesión, y sólo a su nombre: la política exige que
--            `usuario_id` sea quien manda. Nadie deja errores firmados por otro.
--   Leer     sólo administradores. La pila de un error puede traer pedazos de
--            lo que había en pantalla.
--   Cambiar o borrar: nadie desde la aplicación.
--
-- Cada campo tiene tope de largo acá también, no sólo en la ruta que lo recibe:
-- la tabla no confía en que todo el que escriba pase por ahí.

create table if not exists public.errores_cliente (
  id          bigint generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  usuario_id  uuid not null default auth.uid(),
  mensaje     text not null check (char_length(mensaje) <= 1000),
  nombre      text check (char_length(nombre) <= 120),
  pila        text check (char_length(pila) <= 4000),
  digest      text check (char_length(digest) <= 120),
  url         text check (char_length(url) <= 500),
  modulo      text check (char_length(modulo) <= 80),
  donde       text not null default 'pagina' check (donde in ('pagina', 'raiz')),
  intento     int not null default 0 check (intento between 0 and 99),
  navegador   text check (char_length(navegador) <= 300),
  despliegue  text check (char_length(despliegue) <= 120)
);

-- El comentario no nombra archivos a propósito: con una ruta adentro, el
-- conector de Supabase que se usó para aplicar esto se colgaba sin llegar a la
-- base (10 de octubre de 2026, cuatro intentos). La explicación está arriba.
comment on table public.errores_cliente is
  'Fallas de pantalla que el navegador atajo y de las que se recupero sola.';

create index if not exists ix_errores_cliente_reciente on public.errores_cliente (creado_en desc);

alter table public.errores_cliente enable row level security;

-- Supabase les da TODO a `anon` y `authenticated` sobre cada tabla nueva, y
-- RLS no frena un TRUNCATE. Se quita todo y se devuelve sólo lo que se usa.
revoke all on public.errores_cliente from anon;
revoke all on public.errores_cliente from authenticated;
grant insert, select on public.errores_cliente to authenticated;

drop policy if exists errores_cliente_anotar on public.errores_cliente;
create policy errores_cliente_anotar on public.errores_cliente
  for insert to authenticated
  with check (usuario_id = (select auth.uid()));

drop policy if exists errores_cliente_ver on public.errores_cliente;
create policy errores_cliente_ver on public.errores_cliente
  for select to authenticated
  using ((select public.es_admin()));
