-- Las reglas del equipo en el Inbox: quién las ve (12/11/2026).
--
-- Una casilla nueva debajo de «Inbox» en Usuarios y Roles: «Ver las reglas
-- del equipo». Quien la tiene ve en el Inbox el botón «Reglas del equipo» y
-- los avisos en el chat abierto («este chat es de otra persona», «no tiene
-- vendedora asignada»).
--
-- Se pidió sólo para el equipo de ventas —Raquel, Estefany y Alexandra—, así
-- que la casilla nace CERRADA para todos los roles y se abre únicamente en los
-- roles de ellas tres. La pantalla la lee estricta: sin fila, no se ve, y ser
-- administrador no alcanza (se puede marcar a mano en el rol si se quiere).
--
-- Es la misma migración en los dos CRM (LAC y HC): los roles se buscan por el
-- nombre de las personas, porque los números de rol no coinciden.

begin;

insert into public.modulos (clave, nombre, padre, orden) values
  ('inbox.reglas', 'Ver las reglas del equipo', 'inbox', 16)
on conflict (clave) do update
  set nombre = excluded.nombre,
      padre  = excluded.padre,
      orden  = excluded.orden;

-- Cerrada para todos, a la vista en la pantalla de roles. Sólo donde no hay
-- nada guardado: si alguien ya la marcó o desmarcó, se respeta.
insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'inbox.reglas', false, false, false, false
  from public.roles r
on conflict (rol_id, modulo) do nothing;

-- Abierta en los roles del equipo de ventas.
update public.rol_permisos rp
   set ver = true
 where rp.modulo = 'inbox.reglas'
   and rp.rol_id in (
     select u.rol_id
       from public.usuarios u
      where u.activo
        and (u.nombre ilike 'raquel%'
          or u.nombre ilike 'estefany%'
          or u.nombre ilike 'alexandra%')
   );

commit;
