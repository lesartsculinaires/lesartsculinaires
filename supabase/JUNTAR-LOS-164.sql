-- ===========================================================================
-- JUNTAR LOS 164 QUE DESTAPÓ LA FUSIÓN DE FICHAS
-- ===========================================================================
--
-- El PASO 1 de `REVISAR-LEADS-TRAS-JUNTAR-FICHAS.sql` dio:
--
--   1. nada que perder: juntar sin mirar | 164 grupos | 164 leads | 0 a 1 días
--
-- Los 164 en la clase segura, y separados por 0 o 1 día. O sea: la misma
-- consulta cargada dos veces el mismo día, en dos fichas que después juntamos.
-- Ninguno tiene monto, ninguno tiene dos asesoras, ninguno pasó de la primera
-- etapa. No hay nada que juntarlos pueda perder.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ HACE FALTA ESTE ARCHIVO Y NO SIRVE EL PASO 3 DEL OTRO
-- ---------------------------------------------------------------------------
--
-- Porque aquél sólo junta CASCARONES: exige `producto_id is null`, porque los
-- duplicados que arreglaba —los del botón de unificar— venían completamente en
-- blanco.
--
-- Éstos no están en blanco: tienen programa, y de hecho agruparon justamente
-- porque los dos tienen el MISMO programa. Corriendo aquél no se juntaría
-- ninguno de los 164, y parecería que no hizo nada.
--
-- ---------------------------------------------------------------------------
-- QUÉ SE JUNTA, EXACTAMENTE
-- ---------------------------------------------------------------------------
--
-- Sólo grupos donde se cumplen las cuatro, que son las mismas que definieron
-- la clase 1:
--
--   sin monto            Ningún lead del grupo tiene `valor_oportunidad`.
--   una sola asesora     A lo sumo una, contando los que la tienen puesta.
--   sin etapa avanzada   Ninguno pasó de la primera etapa del embudo.
--   de la misma época    A lo sumo un mes entre el primero y el último.
--
-- Se conserva el que tiene asesora —si alguno la tiene— y entre iguales el más
-- viejo, que es el del código más bajo y por el que la gente lo busca.
--
-- Las condiciones se vuelven a comprobar acá y no se confía en el número 164:
-- si entre que se miró y se corre alguien cargó un monto, ese grupo deja de
-- cumplir y se queda afuera solo.
--
-- ---------------------------------------------------------------------------
-- CÓMO SE USA
-- ---------------------------------------------------------------------------
--
-- PASO 1 no escribe: dice qué va a pasar. PASO 2 escribe. PASO 3 comprueba.
-- Volver a correrlo es seguro: lo ya junto no vuelve a aparecer.
-- Hay que estar conectado como dirección.
-- ===========================================================================


-- ===========================================================================
-- PASO 1 — QUÉ SE VA A JUNTAR (no cambia nada)
-- ===========================================================================
with abiertas as (
  select o.id, o.codigo, o.cliente_id, coalesce(o.producto_id, -1) as prog,
         o.fecha_registro, o.vendedor_id, o.valor_oportunidad,
         coalesce(e.orden, 0) as etapa_orden
    from public.oportunidades o
    left join public.estados s on s.id = o.estado_id
    left join public.etapas  e on e.id = o.etapa_id
   where coalesce(s.es_final, false) = false
     and coalesce(o.venta_cerrada, 0) = 0
),
seguros as (
  select cliente_id, prog
    from abiertas
   group by cliente_id, prog
  having count(*) > 1
     and count(*) filter (where valor_oportunidad is not null) = 0
     and count(distinct vendedor_id) filter (where vendedor_id is not null) <= 1
     and count(*) filter (where etapa_orden > 1) = 0
     and max(fecha_registro) - min(fecha_registro) <= 31
)
select
  (select count(*) from seguros)                                    as grupos,
  count(*)                                                          as leads_en_juego,
  count(*) - (select count(*) from seguros)                         as leads_que_desaparecen,
  min(a.fecha_registro)                                             as el_mas_viejo,
  max(a.fecha_registro)                                             as el_mas_nuevo
from abiertas a
join seguros s on s.cliente_id = a.cliente_id and s.prog = a.prog;


-- ===========================================================================
-- PASO 2 — JUNTARLOS (ESTE SÍ ESCRIBE)
-- ===========================================================================
do $$
declare fila record; hechos int := 0; leads int := 0;
begin
  for fila in
    with abiertas as (
      select o.id, o.cliente_id, coalesce(o.producto_id, -1) as prog,
             o.fecha_registro, o.vendedor_id, o.valor_oportunidad,
             coalesce(e.orden, 0) as etapa_orden
        from public.oportunidades o
        left join public.estados s on s.id = o.estado_id
        left join public.etapas  e on e.id = o.etapa_id
       where coalesce(s.es_final, false) = false
         and coalesce(o.venta_cerrada, 0) = 0
    ),
    seguros as (
      select cliente_id, prog
        from abiertas
       group by cliente_id, prog
      having count(*) > 1
         and count(*) filter (where valor_oportunidad is not null) = 0
         and count(distinct vendedor_id) filter (where vendedor_id is not null) <= 1
         and count(*) filter (where etapa_orden > 1) = 0
         and max(fecha_registro) - min(fecha_registro) <= 31
    ),
    ordenadas as (
      select a.*,
        row_number() over (
          partition by a.cliente_id, a.prog
          -- Se conserva el que tiene asesora, y entre iguales el más viejo:
          -- es el del código más bajo, por el que la gente lo busca.
          order by (a.vendedor_id is not null) desc,
                   a.fecha_registro asc,
                   a.id asc
        ) as puesto
      from abiertas a
      join seguros s on s.cliente_id = a.cliente_id and s.prog = a.prog
    )
    select
      (select f.id from ordenadas f
        where f.cliente_id = m.cliente_id and f.prog = m.prog and f.puesto = 1) as conservar,
      array_agg(m.id) as absorber
    from ordenadas m
    where m.puesto > 1
    group by m.cliente_id, m.prog
  loop
    perform public.fusionar_oportunidades(fila.conservar, fila.absorber);
    hechos := hechos + 1;
    leads  := leads + array_length(fila.absorber, 1);
  end loop;

  raise notice 'Se juntaron % grupos; desaparecieron % leads repetidos.', hechos, leads;
end $$;


-- ===========================================================================
-- PASO 3 — COMPROBAR (no cambia nada)
-- ===========================================================================
-- `quedan_seguros` tiene que dar cero. `quedan_para_mirar` es lo que sigue
-- repetido pero tiene algo en juego —dos asesoras, dos montos— y se decide
-- mirándolo, con el PASO 2 de `REVISAR-LEADS-TRAS-JUNTAR-FICHAS.sql`.
-- Ninguna nota puede haber quedado colgada de un lead que ya no existe.
-- ===========================================================================
with abiertas as (
  select o.id, o.cliente_id, coalesce(o.producto_id, -1) as prog,
         o.fecha_registro, o.vendedor_id, o.valor_oportunidad,
         coalesce(e.orden, 0) as etapa_orden
    from public.oportunidades o
    left join public.estados s on s.id = o.estado_id
    left join public.etapas  e on e.id = o.etapa_id
   where coalesce(s.es_final, false) = false
     and coalesce(o.venta_cerrada, 0) = 0
),
repetidos as (
  select cliente_id, prog,
         count(*) filter (where valor_oportunidad is not null)              as con_monto,
         count(distinct vendedor_id) filter (where vendedor_id is not null) as asesoras,
         count(*) filter (where etapa_orden > 1)                            as avanzados
    from abiertas group by cliente_id, prog having count(*) > 1
)
select
  (select count(*) from repetidos
    where con_monto = 0 and asesoras <= 1 and avanzados = 0)   as quedan_seguros,
  (select count(*) from repetidos)                             as quedan_para_mirar,
  (select count(*) from public.oportunidades)                  as leads,
  (select count(*) from public.oportunidad_notas n
     where not exists (select 1 from public.oportunidades o
                        where o.id = n.oportunidad_id))        as notas_huerfanas;
