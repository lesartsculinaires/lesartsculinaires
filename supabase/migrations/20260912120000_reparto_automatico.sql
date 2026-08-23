begin;

-- Reparto automático de los leads que entran por WhatsApp.
--
-- ------------------------------------------------------------------------
-- QUÉ DECIDE QUIÉN RECIBE
-- ------------------------------------------------------------------------
--
-- Una casilla en el rol, no una lista de nombres. La diferencia importa: con
-- una lista, cada persona que entra o sale del equipo obliga a tocar código o
-- SQL, y el día que nadie se acuerde de hacerlo los leads se le van a seguir
-- asignando a alguien que ya no está.
--
-- Con la casilla en el rol, el CRM pregunta en cada mensaje «¿quién tiene hoy
-- un rol que recibe leads?». Sumar a alguien al equipo es darle el rol, y ya
-- está adentro del sorteo. Sacarlo es quitárselo.
--
-- Arranca prendida en «Ventas» y «Jefe de ventas», que son los dos roles que
-- la escuela usa hoy para atender lo que entra. Se cambia desde Usuarios y
-- Roles sin volver a tocar SQL.
--
-- ------------------------------------------------------------------------
-- LOS TRES FILTROS, Y POR QUÉ NINGUNO SOBRA
-- ------------------------------------------------------------------------
--
--   Rol que recibe    lo que se acaba de explicar.
--   Usuario activo    a quien está dado de baja no se le asigna trabajo.
--   Vendedor vinculado y activo
--                     acá está el caso que muerde. Una persona puede tener el
--                     rol y no tener ficha de vendedor —hoy mismo pasa con la
--                     gerencia—, y `oportunidades.vendedor_id` apunta a
--                     `vendedores`, no a `usuarios`. Sin ficha no hay a qué
--                     apuntar: si no se filtrara, el sorteo elegiría a alguien
--                     que no puede recibir nada y el lead quedaría en el aire.
--
-- ------------------------------------------------------------------------
-- TAMBIÉN: RECORDATORIOS DE REACTIVACIÓN
-- ------------------------------------------------------------------------
--
-- A quien dijo que no le interesa se le escribe de nuevo a los tres meses. Eso
-- es un recordatorio más, así que va en la tabla que ya existe en vez de una
-- nueva; lo único que hace falta es dejar entrar un tercer tipo.
--
-- Sólo agrega una columna, una función y un valor permitido. Se puede correr
-- con gente trabajando, y dos veces.

-- ------------------------------------------------------- la casilla del rol

alter table public.roles
  add column if not exists recibe_leads boolean not null default false;

comment on column public.roles.recibe_leads is
  'Quien tenga este rol entra al sorteo de los leads que llegan por WhatsApp.';

do $$
begin
  -- Sólo la primera vez. Si mañana lo cambian desde Usuarios y Roles y alguien
  -- vuelve a correr este archivo, la decisión de ellos manda sobre la de acá.
  if not exists (select 1 from public.roles where recibe_leads) then
    update public.roles set recibe_leads = true
     where nombre in ('Ventas', 'Jefe de ventas');
    raise notice 'reparto prendido en Ventas y Jefe de ventas';
  else
    raise notice 'ya había roles configurados; no se toca nada';
  end if;
end $$;

-- --------------------------------------------------------- quiénes reciben

/*
 * Los vendedores que hoy pueden recibir un lead.
 *
 * `security definer` porque la llama el webhook, que corre sin nadie con
 * sesión detrás, y también la pantalla de administración. Devuelve nada más
 * ids y nombres: no hay por qué exponer correos ni roles para sortear.
 */
create or replace function public.vendedores_para_reparto()
returns table (id bigint, nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.nombre
    from public.vendedores v
    join public.usuarios u on u.id = v.usuario_id
    join public.roles    r on r.id = u.rol_id
   where r.recibe_leads
     and u.activo
     and v.activo
   order by v.id;
$$;

revoke execute on function public.vendedores_para_reparto() from anon;
grant execute on function public.vendedores_para_reparto() to authenticated;

-- ------------------------------------------------- recordar en tres meses

do $$
begin
  if to_regclass('public.seguimientos') is null then
    raise notice 'todavía no existen los seguimientos; no hay dónde agregar el tipo';
    return;
  end if;

  -- El nombre de la restricción lo pone Postgres al crear la tabla; se busca
  -- en vez de escribirlo fijo para no depender de cómo lo haya llamado.
  execute (
    select 'alter table public.seguimientos drop constraint ' || quote_ident(conname)
      from pg_constraint
     where conrelid = 'public.seguimientos'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%tipo%'
     limit 1
  );

  alter table public.seguimientos
    add constraint seguimientos_tipo_check
    check (tipo in ('pago', 'cierre', 'reactivacion'));

  raise notice 'los seguimientos ahora aceptan el tipo reactivacion';
exception
  when others then
    -- Si ya estaba puesto, no es un error.
    raise notice 'el tipo reactivacion ya estaba permitido (%)', sqlerrm;
end $$;

commit;
