-- ===========================================================================
-- JUNTAR FICHAS REPETIDAS DE LA MISMA PERSONA
-- ===========================================================================
--
-- Esto es OTRA COSA que `JUNTAR-LEADS-YA-REPETIDOS.sql`, y conviene tener
-- clara la diferencia antes de correrlo:
--
--   AQUÉL juntaba LEADS repetidos que colgaban de UNA SOLA ficha.
--   ÉSTE junta FICHAS: la misma persona cargada dos veces, con dos
--   `cliente_id` distintos, cada una con sus propios leads.
--
-- Es el caso de «Celina Yolanda Ayala de Portillo», que está con el mismo
-- correo en dos fichas, y de «Yolanda Eloisa Granados Henríquez».
--
-- ---------------------------------------------------------------------------
-- CÓMO SE USA
-- ---------------------------------------------------------------------------
--
-- En el SQL Editor, paso por paso. El PASO 1 y el 2 NO CAMBIAN NADA. El 3 es
-- el único que escribe. Hay que estar conectado como dirección.
--
-- ---------------------------------------------------------------------------
-- QUÉ SE JUNTA
-- ---------------------------------------------------------------------------
--
-- Sólo fichas que comparten el CORREO exacto, normalizado a minúsculas y sin
-- espacios. Por correo y no por nombre, y la razón es la de siempre: dos
-- alumnas se pueden llamar igual, y unir sus fichas mezcla dos historias que
-- después no se separan. El correo es de una persona.
--
-- Se conserva la ficha MÁS VIEJA —la del id más bajo—, que es la que tiene la
-- historia larga y la que aparece en los informes de antes.
--
-- `fusionar_contactos` mueve a la ficha que queda los leads, las
-- conversaciones de WhatsApp, los cursos realizados y las respuestas de
-- formulario de las que se van, y completa los huecos de la que queda sin
-- pisar lo que ya tenía. No se pierde nada.
--
-- ---------------------------------------------------------------------------
-- OJO CON LO QUE PASA DESPUÉS
-- ---------------------------------------------------------------------------
--
-- Al juntar dos fichas, sus leads quedan colgando de la misma persona. Si esos
-- leads eran el mismo trato —el mismo programa, los dos abiertos— van a
-- aparecer como repetidos en la pantalla de Clientes.
--
-- Por eso, DESPUÉS de correr esto conviene volver a pasar el PASO 2 de
-- `JUNTAR-LEADS-YA-REPETIDOS.sql`, que ahora sí los va a ver.
-- ===========================================================================


-- ===========================================================================
-- PASO 1 — ¿CUÁNTAS HAY? (no cambia nada)
-- ===========================================================================
with repetidas as (
  select lower(trim(correo)) as correo, count(*) as fichas
    from public.clientes
   where correo is not null and trim(correo) <> ''
   group by lower(trim(correo))
  having count(*) > 1
)
select
  count(*)                  as correos_repetidos,
  sum(fichas)               as fichas_involucradas,
  sum(fichas) - count(*)    as fichas_que_desaparecerian
from repetidas;


-- ===========================================================================
-- PASO 2 — QUÉ SE JUNTARÍA CON QUÉ (no cambia nada)
-- ===========================================================================
--
-- Mirá esta lista antes de correr el paso 3. Si alguna fila junta a dos
-- personas que NO son la misma —dos hermanas que comparten un correo, por
-- ejemplo— hay que sacarla a mano y no correr el paso 3 tal cual.
-- ===========================================================================
with ordenadas as (
  select c.id, c.nombre, c.telefono, c.correo,
         lower(trim(c.correo)) as clave,
         row_number() over (partition by lower(trim(c.correo)) order by c.id) as puesto,
         (select count(*) from public.oportunidades o where o.cliente_id = c.id) as leads
    from public.clientes c
   where c.correo is not null and trim(c.correo) <> ''
),
repetidas as (
  select clave from ordenadas group by clave having count(*) > 1
)
select
  o.correo,
  o.id                                                     as cliente_id,
  case when o.puesto = 1 then 'SE CONSERVA' else 'se absorbe' end as papel,
  o.nombre,
  coalesce(o.telefono, '—')                                as telefono,
  o.leads
from ordenadas o
join repetidas r on r.clave = o.clave
order by o.correo, o.puesto;


-- ===========================================================================
-- PASO 3 — JUNTARLAS (ESTE SÍ ESCRIBE)
-- ===========================================================================
--
-- Cada correo es su propia operación: si algo fallara a mitad, lo ya juntado
-- queda junto. Volver a correrlo es seguro.
-- ===========================================================================
do $$
declare fila record; hechas int := 0; fichas int := 0;
begin
  for fila in
    with ordenadas as (
      select c.id, lower(trim(c.correo)) as clave,
             row_number() over (partition by lower(trim(c.correo)) order by c.id) as puesto
        from public.clientes c
       where c.correo is not null and trim(c.correo) <> ''
    ),
    repetidas as (select clave from ordenadas group by clave having count(*) > 1)
    select
      min(o.id) filter (where o.puesto = 1)     as conservar,
      array_agg(o.id) filter (where o.puesto > 1) as absorber
    from ordenadas o
    join repetidas r on r.clave = o.clave
    group by o.clave
  loop
    perform public.fusionar_contactos(fila.conservar, fila.absorber);
    hechas := hechas + 1;
    fichas := fichas + array_length(fila.absorber, 1);
  end loop;

  raise notice 'Se juntaron % personas; desaparecieron % fichas repetidas.', hechas, fichas;
end $$;


-- ===========================================================================
-- PASO 4 — COMPROBAR (no cambia nada)
-- ===========================================================================
-- `correos_repetidos` tiene que dar cero, y ninguna oportunidad puede haber
-- quedado apuntando a una ficha que ya no existe.
-- ===========================================================================
select
  (select count(*) from (
     select 1 from public.clientes
      where correo is not null and trim(correo) <> ''
      group by lower(trim(correo)) having count(*) > 1) q)   as correos_repetidos,
  (select count(*) from public.clientes)                     as fichas,
  (select count(*) from public.oportunidades)                as leads,
  (select count(*) from public.oportunidades o
     where not exists (select 1 from public.clientes c
                        where c.id = o.cliente_id))          as leads_huerfanos;


-- ===========================================================================
-- PASO 5 — Y AHORA SÍ, LOS LEADS
-- ===========================================================================
-- Al juntar las fichas, los leads de las dos quedaron en la misma persona y
-- algunos pueden ser el mismo trato. Corré el PASO 2 de
-- `JUNTAR-LEADS-YA-REPETIDOS.sql`, que ahora sí los va a ver, y decidí desde
-- ahí. Esta consulta te dice si hace falta.
-- ===========================================================================
select count(*) as grupos_de_leads_a_revisar
from (
  select o.cliente_id
    from public.oportunidades o
    left join public.estados s on s.id = o.estado_id
   where coalesce(s.es_final, false) = false
     and coalesce(o.venta_cerrada, 0) = 0
   group by o.cliente_id, coalesce(o.producto_id, -1)
  having count(*) > 1
) q;
