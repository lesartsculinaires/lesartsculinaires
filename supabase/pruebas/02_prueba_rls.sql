-- Prueba de permisos (RLS). Ver supabase/pruebas/README.md.
-- Corre sobre la base local de prueba, nunca sobre producción.

\set ON_ERROR_STOP off
\pset pager off

-- Dos cuentas de mentira: una admin, una de ventas.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@prueba.test'),
  ('22222222-2222-2222-2222-222222222222', 'ventas@prueba.test')
on conflict (id) do nothing;
insert into public.usuarios (id, nombre, correo, rol_id) values
  ('11111111-1111-1111-1111-111111111111', 'Admin Prueba',  'admin@prueba.test',  1),
  ('22222222-2222-2222-2222-222222222222', 'Ventas Prueba', 'ventas@prueba.test', 2)
on conflict (id) do nothing;

insert into public.autorizaciones (nombre, descripcion, solicitado_por)
values ('Descuento 20% septiembre', 'Promo de prueba', '22222222-2222-2222-2222-222222222222');

\echo '=== 1. ANON no debe ver clientes ni autorizaciones ==='
set role anon;
select 'anon ve clientes: '        || count(*) from public.clientes;
select 'anon ve autorizaciones: '  || count(*) from public.autorizaciones;
reset role;

\echo '=== 2. VENTAS: puede ver, NO debe poder autorizar ==='
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'ventas es_admin(): ' || public.es_admin()::text;
select 'ventas ve autorizaciones: ' || count(*) from public.autorizaciones;
update public.autorizaciones set estado='autorizada' where estado='pendiente';
select 'ventas: filas autorizadas por el update de arriba -> ' || count(*) from public.autorizaciones where estado='autorizada';
reset role; reset request.jwt.claim.sub;

\echo '=== 3. ADMIN: si debe poder autorizar ==='
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'admin es_admin(): ' || public.es_admin()::text;
update public.autorizaciones set estado='autorizada', resuelto_por='11111111-1111-1111-1111-111111111111', resuelto_en=now() where estado='pendiente';
select 'admin: filas autorizadas -> ' || count(*) from public.autorizaciones where estado='autorizada';
reset role; reset request.jwt.claim.sub;

\echo '=== 4. VENTAS no debe poder ascenderse a administrador ==='
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.usuarios set rol_id=1 where id='22222222-2222-2222-2222-222222222222';
reset role; reset request.jwt.claim.sub;
select 'rol de ventas despues del intento: ' || rol_id from public.usuarios where correo='ventas@prueba.test';
