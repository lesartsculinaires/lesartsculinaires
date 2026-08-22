-- Gente y fichas inventadas para el banco de pruebas.
--
-- Ningún dato es de una persona real. Los ids van altos a propósito, para no
-- chocar con los catálogos de fábrica que trae el bootstrap.

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','ale@lac.test'),
  ('44444444-0000-0000-0000-000000000004','huri@lac.test'),
  ('cccccccc-0000-0000-0000-000000000003','jefa@lac.test')
on conflict do nothing;

insert into public.usuarios (id, nombre, correo, rol_id) values
  ('11111111-0000-0000-0000-000000000001','Ale','ale@lac.test',
    (select id from public.roles where nombre='Ventas')),
  ('44444444-0000-0000-0000-000000000004','Huri','huri@lac.test',
    (select id from public.roles where nombre='Ventas')),
  ('cccccccc-0000-0000-0000-000000000003','Jefa','jefa@lac.test',
    (select id from public.roles where es_admin limit 1))
on conflict (id) do update set rol_id = excluded.rol_id;

insert into public.vendedores (id, nombre, correo) values
  (901,'Ale Prueba','ale@lac.test'), (902,'Huri Prueba','huri@lac.test')
on conflict (id) do update set correo = excluded.correo;

-- El enlace cuenta ↔ vendedor es lo que hace que cada asesor vea lo suyo.
update public.vendedores v set usuario_id = u.id
  from public.usuarios u
 where lower(v.correo) = lower(u.correo) and v.usuario_id is null;

-- Siete fichas repartidas por todo el plazo de la reserva, para poder ver las
-- cinco urgencias del módulo de Recordatorios de una sola pasada.
insert into public.clientes (id, nombre, telefono) values
  (911,'Vencida Hace Cinco','50370000911'),
  (912,'Vence Hoy','50370000912'),
  (913,'Vence En Dos','50370000913'),
  (914,'Recién Reservó','50370000914'),
  (915,'Sin Fecha Antigua','50370000915'),
  (916,'Ya Pagó Todo','50370000916'),
  (917,'De Huri Vencida','50370000917')
on conflict (id) do nothing;

insert into public.oportunidades
  (id, cliente_id, codigo, vendedor_id, producto_id, etapa_id, estado_id,
   valor_oportunidad, reserva, venta_cerrada)
values
  (911,911,'CRM-9911',901,1,(select id from etapas where nombre='Pago'),1,500,100,null),
  (912,912,'CRM-9912',901,1,(select id from etapas where nombre='Pago'),1,600,150,null),
  (913,913,'CRM-9913',901,1,(select id from etapas where nombre='Propuesta'),1,450,80,null),
  (914,914,'CRM-9914',901,1,(select id from etapas where nombre='Propuesta'),1,700,200,null),
  (915,915,'CRM-9915',901,1,(select id from etapas where nombre='Pago'),1,400,120,null),
  (916,916,'CRM-9916',901,1,(select id from etapas where nombre='Cierre'),1,550,100,550),
  (917,917,'CRM-9917',902,1,(select id from etapas where nombre='Pago'),1,300,90,null)
on conflict (id) do nothing;

-- Las fechas de reserva, puestas a mano para fabricar cada urgencia.
update public.oportunidades set reserva_en = now() - interval '20 days' where id = 911;
update public.oportunidades set reserva_en = now() - interval '15 days' where id = 912;
update public.oportunidades set reserva_en = now() - interval '13 days' where id = 913;
update public.oportunidades set reserva_en = now() - interval '1 day'   where id = 914;
update public.oportunidades set reserva_en = null                        where id = 915;
update public.oportunidades set reserva_en = now() - interval '18 days' where id = 916;
update public.oportunidades set reserva_en = now() - interval '17 days' where id = 917;

-- Las secuencias, para que lo que se cree después no choque con estos ids.
select setval(pg_get_serial_sequence('public.clientes','id'), 2000);
select setval(pg_get_serial_sequence('public.oportunidades','id'), 2000);
