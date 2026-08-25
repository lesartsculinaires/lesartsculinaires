-- ¿Cómo está un contacto ahora mismo, y se aplicó todo lo que hace falta?
--
-- ------------------------------------------------------------------------
-- QUÉ CONTESTA
-- ------------------------------------------------------------------------
--
-- Viene con el teléfono de katy G puesto. Para otro contacto se cambia la
-- línea marcada «CAMBIAR ACÁ» y nada más.
--
-- Devuelve una sola tabla con cuatro bloques, en este orden:
--
--   1. Si están puestas las migraciones que hacen falta. Si alguna falta, el
--      resto se explica solo.
--   2. Cuántas fichas hay con ese teléfono. Más de una es un duplicado de
--      contacto y se arregla con `fusionar_contactos`.
--   3. Un renglón por LEAD. Acá está la respuesta a «lo sigo viendo repetido»:
--      el módulo Clientes lista oportunidades, una fila por lead, así que dos
--      renglones son dos leads aunque la ficha sea una sola.
--   4. Por qué canales llegó, con fechas.
--
-- No cambia nada. Es sólo lectura y se puede correr las veces que haga falta.
--
-- ------------------------------------------------------------------------
-- POR QUÉ BUSCA POR TELÉFONO Y NO POR CÓDIGO
-- ------------------------------------------------------------------------
--
-- Porque si buscara por los dos códigos que ya conocemos, no encontraría un
-- tercer lead de la misma persona, que es justamente lo que hay que descartar
-- cuando algo «sigue apareciendo repetido». Por los últimos ocho dígitos
-- aparecen todos, sin importar cómo esté escrito el número en cada ficha.

with buscado as (
  -- ------------------------------------------------------- CAMBIAR ACÁ
  select right(regexp_replace('7095-6875', '\D', '', 'g'), 8) as clave
  -- --------------------------------------------------------------------
),

fichas as (
  select c.*
    from public.clientes c, buscado b
   where right(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), 8) = b.clave
),

migraciones as (
  select * from (values
    ('canales_del_contacto',    to_regclass('public.contactos_canal') is not null),
    ('fusionar_contactos',      exists (select 1 from pg_proc where proname = 'fusionar_contactos')),
    ('fusionar_oportunidades',  exists (select 1 from pg_proc where proname = 'fusionar_oportunidades')),
    ('fusionar_desde_el_editor',exists (select 1 from pg_proc where proname = 'exige_direccion')),
    ('solo_direccion_borra',    exists (select 1 from pg_policies
                                         where schemaname='public' and tablename='clientes'
                                           and cmd='DELETE' and qual='es_admin()'))
  ) as m(archivo, puesta)
)

select 1 as orden,
       'migración: ' || m.archivo                       as que,
       case when m.puesta then '✓ puesta' else '✗ FALTA CORRERLA' end as detalle
  from migraciones m

union all
select 2,
       'fichas con ese teléfono',
       case when count(*) = 0 then 'ninguna: revisá el número'
            when count(*) = 1 then '1 — bien, una sola ficha'
            else count(*) || ' — HAY QUE UNIRLAS con fusionar_contactos'
       end
  from fichas

union all
select 3,
       'LEAD ' || o.codigo,
       c.nombre || ' · ' || coalesce(e.nombre, 'sin etapa')
         || ' · ' || coalesce(ca.nombre, 'sin canal')
         || ' · desde ' || to_char(o.fecha_registro, 'DD/MM/YY')
         || ' · ' || (select count(*) from public.oportunidad_notas n
                       where n.oportunidad_id = o.id) || ' notas'
  from public.oportunidades o
  join fichas c on c.id = o.cliente_id
  left join public.etapas  e  on e.id  = o.etapa_id
  left join public.canales ca on ca.id = o.canal_id

union all
select 4,
       'llegó por ' || ca.nombre,
       'primera vez ' || to_char(cc.primera_vez at time zone 'America/El_Salvador', 'DD/MM/YY HH24:MI')
         || ' · última ' || to_char(cc.ultima_vez at time zone 'America/El_Salvador', 'DD/MM/YY HH24:MI')
  from public.contactos_canal cc
  join fichas c on c.id = cc.cliente_id
  join public.canales ca on ca.id = cc.canal_id

order by orden, que;
