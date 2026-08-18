-- Prueba de permisos de los adjuntos. Ver supabase/pruebas/README.md.
-- Corre sobre la base local de prueba, nunca sobre producción.
--
-- Lo que se comprueba es una sola cosa, dicha de varias maneras: un
-- comprobante de transferencia es el respaldo de que alguien pagó, así que
-- todo el equipo tiene que poder verlo y nadie tiene que poder borrar el de
-- otro. La excepción es el administrador, que sí puede.

\set ON_ERROR_STOP off
\pset pager off

-- Tres cuentas de mentira: dos de ventas y una admin. Las de ventas van con
-- el mismo rol para que la diferencia entre ellas sea sólo quién subió qué.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@prueba.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'beto@prueba.test'),
  ('cccccccc-0000-0000-0000-000000000003', 'jefa@prueba.test')
on conflict (id) do nothing;

insert into public.usuarios (id, nombre, correo, rol_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana Prueba',  'ana@prueba.test',  2),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Beto Prueba', 'beto@prueba.test', 2),
  ('cccccccc-0000-0000-0000-000000000003', 'Jefa Prueba', 'jefa@prueba.test', 1)
on conflict (id) do nothing;

insert into public.clientes (nombre) values ('Cliente de prueba adjuntos');
insert into public.oportunidades (codigo, cliente_id, fecha_registro)
values (
  'CRM-A001',
  (select id from public.clientes where nombre = 'Cliente de prueba adjuntos' limit 1),
  current_date
);

\echo ''
\echo '=== 1. ANA sube un comprobante (esperado: 1 fila) ==='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.adjuntos (oportunidad_id, ruta, nombre, tipo_mime, tamano_bytes, subido_por)
values (
  (select id from public.oportunidades where codigo = 'CRM-A001'),
  'prueba/ana.png', 'transferencia.png', 'image/png', 12345,
  'aaaaaaaa-0000-0000-0000-000000000001'
);
select 'adjuntos de ana -> ' || count(*) from public.adjuntos where ruta = 'prueba/ana.png';

\echo ''
\echo '=== 2. ANA no puede subir a nombre de BETO (esperado: ERROR de política) ==='
insert into public.adjuntos (oportunidad_id, ruta, nombre, subido_por)
values (
  (select id from public.oportunidades where codigo = 'CRM-A001'),
  'prueba/falso.png', 'falso.png',
  'bbbbbbbb-0000-0000-0000-000000000002'
);
reset role; reset request.jwt.claim.sub;

\echo ''
\echo '=== 3. BETO ve el comprobante de ANA (esperado: 1) ==='
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select 'beto ve -> ' || count(*) from public.adjuntos where ruta = 'prueba/ana.png';

\echo ''
\echo '=== 4. BETO no puede borrarlo (esperado: 0 borradas) ==='
with d as (delete from public.adjuntos where ruta = 'prueba/ana.png' returning 1)
select 'beto borró -> ' || count(*) from d;
reset role; reset request.jwt.claim.sub;

\echo ''
\echo '=== 5. ANA sí puede borrar el suyo (esperado: 1 borrada) ==='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
with d as (delete from public.adjuntos where ruta = 'prueba/ana.png' returning 1)
select 'ana borró -> ' || count(*) from d;
reset role; reset request.jwt.claim.sub;

\echo ''
\echo '=== 6. LA JEFA puede borrar el de cualquiera (esperado: 1 borrada) ==='
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
insert into public.adjuntos (oportunidad_id, ruta, nombre, subido_por)
values (
  (select id from public.oportunidades where codigo = 'CRM-A001'),
  'prueba/beto.png', 'beto.png',
  'bbbbbbbb-0000-0000-0000-000000000002'
);
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select 'jefa es_admin() -> ' || public.es_admin()::text;
with d as (delete from public.adjuntos where ruta = 'prueba/beto.png' returning 1)
select 'jefa borró -> ' || count(*) from d;
reset role; reset request.jwt.claim.sub;

\echo ''
\echo '=== 7. Los archivos siguen la misma regla que las fichas ==='
insert into storage.objects (bucket_id, name, owner)
values ('adjuntos', 'prueba/archivo-de-ana.png', 'aaaaaaaa-0000-0000-0000-000000000001');

set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
with d as (delete from storage.objects where name = 'prueba/archivo-de-ana.png' returning 1)
select 'beto borró el archivo de ana -> ' || count(*) || ' (esperado 0)' from d;
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
with d as (delete from storage.objects where name = 'prueba/archivo-de-ana.png' returning 1)
select 'ana borró el suyo -> ' || count(*) || ' (esperado 1)' from d;
reset role; reset request.jwt.claim.sub;

\echo ''
\echo '=== 8. El balde tiene que ser privado ==='
select 'balde público -> ' || public::text || ' (esperado false)'
from storage.buckets where id = 'adjuntos';
