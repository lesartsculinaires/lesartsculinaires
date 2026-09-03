-- ===========================================================================
-- ACOMODAR LOS LEADS QUE QUEDARON EN LA COLUMNA EQUIVOCADA
-- ===========================================================================
--
-- QUÉ PASÓ
--
-- La etapa «Cierre» —la que iba después de «Pago», donde caían los tratos que
-- se estaban cerrando— se renombró a «Perdido». Los leads no se movieron, que
-- es lo correcto para un renombre. Lo que no se dijo en ese momento es que
-- «Cierre» no significaba «Perdido»: de un día para el otro, 169 leads pasaron
-- a leerse como perdidos. Muchos estaban ganados y cobrados.
--
-- Se ve así en la base:
--
--   CRM-0044  Sebastian Canales   etapa: Perdido   estado: Ganado   $420
--   CRM-0586  Albin Sanchez       etapa: Perdido   estado: Ganado   $395
--   CRM-0051  Juana Romero        etapa: Perdido   estado: Reserva  $230
--
-- POR QUÉ LOS NÚMEROS NO CUADRABAN
--
--   Los indicadores del Dashboard    Miran el ESTADO. Contaban bien.
--   (venta cerrada, tasa de cierre)
--
--   El gráfico «Etapas» y el         Miran la ETAPA. Mostraban esas ventas
--   tablero del Pipeline             como perdidas.
--
-- El estado es el que tiene razón: es el campo que dice cómo terminó el trato
-- y es el que la escuela viene manteniendo al día. La etapa es dónde quedó la
-- tarjeta. Este archivo mueve las tarjetas para que digan lo mismo.
--
-- ---------------------------------------------------------------------------
-- CÓMO SE USA
-- ---------------------------------------------------------------------------
--
-- PASO 1 no escribe: dice cuántas tarjetas se van a mover y a dónde.
-- PASO 2 muestra una por una, para reconocerlas antes de tocarlas.
-- PASO 3 mueve las ganadas y las perdidas. Es el que hay que correr.
-- PASO 4 es aparte y hay que decidirlo: las que siguen VIVAS.
-- PASO 5 comprueba.
--
-- Conviene correr antes la migración `20261019120000_etapa_y_estado_de_acuerdo`,
-- que pone el candado para que esto no se vuelva a desarmar. Sin ella el
-- arreglo funciona igual, pero el problema puede volver.
--
-- Volver a correrlo es seguro: lo ya acomodado no vuelve a aparecer.
-- Hay que estar conectado como dirección.
-- ===========================================================================


-- ===========================================================================
-- PASO 1 — CUÁNTAS SON Y A DÓNDE VAN (no cambia nada)
-- ===========================================================================
with torcidos as (
  select o.id, o.venta_cerrada,
         coalesce(e.nombre, '(sin etapa)') as etapa,
         coalesce(s.nombre, '(sin estado)') as estado,
         coalesce(s.es_final, false)        as terminado
    from public.oportunidades o
    left join public.etapas  e on e.id = o.etapa_id
    left join public.estados s on s.id = o.estado_id
)
select
  case
    when estado = 'Ganado'  and etapa <> 'Ganado'  then '1. GANADAS mal ubicadas → van a la columna Ganado'
    when estado = 'Perdido' and etapa <> 'Perdido' then '2. perdidas mal ubicadas → van a la columna Perdido'
    when not terminado and etapa = 'Perdido'       then '3. VIVAS en la columna Perdido → hay que decidir (paso 4)'
  end                                            as que_son,
  count(*)                                       as tarjetas,
  coalesce(sum(venta_cerrada), 0)                as plata_en_juego
from torcidos
where (estado = 'Ganado'  and etapa <> 'Ganado')
   or (estado = 'Perdido' and etapa <> 'Perdido')
   or (not terminado and etapa = 'Perdido')
group by 1
order by 1;


-- ===========================================================================
-- PASO 2 — UNA POR UNA, PARA RECONOCERLAS (no cambia nada)
-- ===========================================================================
select
  o.codigo,
  c.nombre                              as cliente,
  coalesce(v.nombre, '(sin asesora)')   as asesora,
  coalesce(e.nombre, '(sin etapa)')     as esta_en_la_columna,
  coalesce(s.nombre, '(sin estado)')    as pero_el_estado_dice,
  case
    when s.nombre = 'Ganado'  then 'Ganado'
    when s.nombre = 'Perdido' then 'Perdido'
    else 'Pago  (decidir: paso 4)'
  end                                   as se_moveria_a,
  coalesce(o.venta_cerrada::text, '—')  as venta_cerrada,
  o.fecha_registro
from public.oportunidades o
join public.clientes c        on c.id = o.cliente_id
left join public.vendedores v on v.id = o.vendedor_id
left join public.etapas e     on e.id = o.etapa_id
left join public.estados s    on s.id = o.estado_id
where (s.nombre = 'Ganado'  and coalesce(e.nombre,'') <> 'Ganado')
   or (s.nombre = 'Perdido' and coalesce(e.nombre,'') <> 'Perdido')
   or (not coalesce(s.es_final, false) and e.nombre = 'Perdido')
order by o.venta_cerrada desc nulls last, o.codigo;


-- ===========================================================================
-- PASO 3 — ACOMODAR LAS TERMINADAS (ESTE SÍ ESCRIBE)
-- ===========================================================================
--
-- Sólo las que el estado da por cerradas: ganadas y perdidas. De ésas no hay
-- nada que decidir —el estado ya dice cómo terminó el trato— y la tarjeta
-- tiene que estar en la columna que dice lo mismo.
--
-- Las que siguen vivas NO se tocan acá: van en el paso 4, que es una decisión.
-- ===========================================================================
do $$
declare gan bigint; per bigint; movidas_g int; movidas_p int;
begin
  select id into gan from public.etapas where nombre = 'Ganado'  limit 1;
  select id into per from public.etapas where nombre = 'Perdido' limit 1;

  if gan is null or per is null then
    raise notice 'Faltan las etapas Ganado y/o Perdido en el catálogo; no se movió nada.';
    return;
  end if;

  update public.oportunidades o
     set etapa_id = gan
    from public.estados s
   where s.id = o.estado_id
     and s.nombre = 'Ganado'
     and o.etapa_id is distinct from gan;
  get diagnostics movidas_g = row_count;

  update public.oportunidades o
     set etapa_id = per
    from public.estados s
   where s.id = o.estado_id
     and s.nombre = 'Perdido'
     and o.etapa_id is distinct from per;
  get diagnostics movidas_p = row_count;

  raise notice '% ventas ganadas salieron de donde estaban y entraron a «Ganado».', movidas_g;
  raise notice '% perdidas quedaron en la columna «Perdido».', movidas_p;
end $$;


-- ===========================================================================
-- PASO 4 — LAS QUE SIGUEN VIVAS (ESCRIBE, Y HAY QUE DECIDIRLO)
-- ===========================================================================
--
-- Son los leads que estaban «en Cierre» y no terminaron: estado Activo, o con
-- Reserva pagada. Hoy están en una columna que dice «Perdido» y no lo están.
--
-- El problema es que la etapa donde estaban ya no existe con ese significado,
-- así que hay que elegirles una. «Pago» es la que queda antes: es donde estaba
-- «Cierre» en el embudo y lo que mejor describe un trato que se está cerrando.
--
-- SE CORRE APARTE PORQUE NO ES UN ARREGLO, ES UNA DECISIÓN. Si en el paso 2
-- estas fichas se ven mejor en otro lado —o si conviene repartirlas a mano
-- entre «Negociación» y «Pago»— es preferible hacerlo desde el tablero,
-- arrastrando, y saltear este paso.
--
-- Para correrlo, sacarle los guiones de comentario a las líneas de abajo.
-- ===========================================================================
-- do $$
-- declare destino bigint; movidas int;
-- begin
--   select id into destino from public.etapas where nombre = 'Pago' limit 1;
--   if destino is null then
--     raise notice 'No hay etapa «Pago»; no se movió nada.';
--     return;
--   end if;
--
--   update public.oportunidades o
--      set etapa_id = destino
--     from public.etapas e, public.estados s
--    where e.id = o.etapa_id and s.id = o.estado_id
--      and e.nombre = 'Perdido'
--      and not coalesce(s.es_final, false);
--   get diagnostics movidas = row_count;
--
--   raise notice '% tarjetas vivas salieron de «Perdido» y quedaron en «Pago».', movidas;
-- end $$;


-- ===========================================================================
-- PASO 5 — COMPROBAR (no cambia nada)
-- ===========================================================================
--
-- `ganadas_mal` y `perdidas_mal` tienen que dar cero. `vivas_en_perdido` da
-- cero sólo si se corrió el paso 4; si se decidió acomodarlas a mano desde el
-- tablero, va a ir bajando a medida que se muevan.
--
-- `plata_en_ganado` es la que ahora suma la columna «Ganado» del Pipeline, y
-- tiene que coincidir con «Venta cerrada» del Dashboard mirando el mismo
-- período.
-- ===========================================================================
select
  (select count(*) from public.oportunidades o
     join public.estados s on s.id = o.estado_id
     left join public.etapas e on e.id = o.etapa_id
    where s.nombre = 'Ganado' and coalesce(e.nombre,'') <> 'Ganado')   as ganadas_mal,
  (select count(*) from public.oportunidades o
     join public.estados s on s.id = o.estado_id
     left join public.etapas e on e.id = o.etapa_id
    where s.nombre = 'Perdido' and coalesce(e.nombre,'') <> 'Perdido') as perdidas_mal,
  (select count(*) from public.oportunidades o
     join public.estados s on s.id = o.estado_id
     join public.etapas e on e.id = o.etapa_id
    where e.nombre = 'Perdido' and not coalesce(s.es_final,false))     as vivas_en_perdido,
  (select coalesce(sum(o.venta_cerrada),0) from public.oportunidades o
     join public.etapas e on e.id = o.etapa_id
    where e.nombre = 'Ganado')                                         as plata_en_ganado,
  (select coalesce(sum(venta_cerrada),0) from public.oportunidades)    as plata_total;
