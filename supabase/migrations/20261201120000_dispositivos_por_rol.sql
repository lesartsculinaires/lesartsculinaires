-- Cuántos dispositivos puede tener abiertos cada persona, según su rol (12/11/2026).
--
-- Se pidió que cada persona tenga una sola sesión en computadora y una en
-- celular, y que ventas tenga además una en tablet (el iPad con el que se
-- llenan los formularios en ferias). Al pasar el límite se cerrará la sesión
-- anterior de ese tipo.
--
-- Por ahora esto sólo GUARDA el límite de cada rol, para que administración lo
-- pueda ajustar en Usuarios y Roles. Hacerlo cumplir llega con el CRM
-- unificado (crm-peñagroup).
--
-- La misma migración en LAC y en HC: los roles de ventas se buscan por nombre.

begin;

alter table public.roles
  add column if not exists disp_computadora smallint not null default 1
    check (disp_computadora between 0 and 9),
  add column if not exists disp_celular smallint not null default 1
    check (disp_celular between 0 and 9),
  add column if not exists disp_tablet smallint not null default 0
    check (disp_tablet between 0 and 9);

comment on column public.roles.disp_computadora is
  'Cuántas sesiones en computadora puede tener abiertas cada persona con este rol.';
comment on column public.roles.disp_celular is
  'Cuántas sesiones en celular puede tener abiertas cada persona con este rol.';
comment on column public.roles.disp_tablet is
  'Cuántas sesiones en tablet (iPad) puede tener abiertas cada persona con este rol.';

-- Ventas, Jefe de ventas y Gerente de ventas: también el iPad.
update public.roles
   set disp_tablet = 1
 where nombre ilike 'ventas'
    or nombre ilike 'jefe de ventas%'
    or nombre ilike 'gerente de ventas%';

commit;
