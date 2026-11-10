-- Quién entra al sitio de Dirección (LAC + HC) (10/11/2026).
--
-- Se entra con la cuenta de este CRM. El sitio muestra también lo de Haute
-- Couture, que lee con la llave de servicio de HC, así que la puerta tiene
-- que estar acá y tiene que ser estricta.
--
-- ============================================================================
-- POR QUÉ UNA FUNCIÓN PROPIA Y NO `puede()`
-- ============================================================================
--
-- `puede()` sigue la regla general del CRM: un módulo sin fila guardada para
-- un rol se puede VER. Para un módulo del CRM eso está bien; para el sitio
-- sería abrirle los números de HC a cualquier rol nuevo sin que nadie lo
-- decida. `puede_ver_sitio_de_direccion()` sólo dice que sí a Dirección
-- (roles administradores) o a un rol con la casilla marcada a propósito.
--
-- La casilla aparece en Usuarios y Roles debajo de «Tablero Comercial»:
-- «Ver el sitio de Dirección (LAC + HC)». Quien la tenga, para ver lo de LAC,
-- necesita además ver el Tablero Comercial (lo de LAC se lee con su sesión).

begin;

insert into public.modulos (clave, nombre, padre, orden) values
  ('tablero.sitio', 'Ver el sitio de Dirección (LAC + HC)', 'tablero', 175)
on conflict (clave) do update
  set nombre = excluded.nombre,
      padre  = excluded.padre,
      orden  = excluded.orden;

-- Cerrada para todos los roles que no son de dirección, a la vista en la
-- pantalla de roles. Sólo donde no hay nada guardado.
insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'tablero.sitio', false, false, false, false
  from public.roles r
 where not r.es_admin
on conflict (rol_id, modulo) do nothing;

create or replace function public.puede_ver_sitio_de_direccion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.es_admin
        or coalesce((select rp.ver
                       from public.rol_permisos rp
                      where rp.rol_id = u.rol_id and rp.modulo = 'tablero.sitio'), false)
      from public.usuarios u
      join public.roles r on r.id = u.rol_id
     where u.id = (select auth.uid())
  ), false);
$$;

comment on function public.puede_ver_sitio_de_direccion() is
  'Si quien pide puede entrar al sitio de Dirección: administradores, o roles con «tablero.sitio» marcado. Sin fila: no.';

revoke execute on function public.puede_ver_sitio_de_direccion() from public, anon;
grant  execute on function public.puede_ver_sitio_de_direccion() to authenticated;

commit;
