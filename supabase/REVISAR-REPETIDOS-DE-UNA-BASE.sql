-- ============================================================================
-- ¿Los leads repetidos son de una ficha sola o de fichas duplicadas?
-- ============================================================================
--
-- Para correr en Supabase → SQL Editor. NO CAMBIA NADA: sólo lee y cuenta.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ HAY QUE MIRAR ESTO ANTES DE ARREGLAR NADA
-- ----------------------------------------------------------------------------
--
-- «Marco Tulio aparece cuatro veces» puede ser dos cosas muy distintas, y
-- llevan a soluciones opuestas:
--
--   UNA FICHA, CUATRO LEADS     La unificación funcionó. Hay una sola persona
--                               en Clientes y cuatro consultas suyas, que es
--                               como está pensado el CRM: cada fila de una
--                               planilla es una consulta, y una persona puede
--                               preguntar por cuatro programas.
--
--                               Se arregla borrando la base repetida, o
--                               fusionando los leads de a uno desde la ficha.
--
--   CUATRO FICHAS               La unificación no agarró. Son cuatro personas
--                               distintas para el CRM: cuatro fichas, cuatro
--                               teléfonos que no se hablan entre sí, y cuatro
--                               asesoras que pueden estar llamando a la misma
--                               persona sin saberlo.
--
--                               Eso sí es un problema y se arregla fusionando
--                               contactos.
--
-- Las tres consultas de abajo lo contestan. Se corren de una vez y devuelven
-- tres resultados; en el editor de Supabase se ven uno debajo del otro.

-- ----------------------------------------------------------------------------
-- 1. EL RESUMEN: ¿cuántas personas tienen la ficha partida?
-- ----------------------------------------------------------------------------
--
-- Agrupa por correo, que es el dato más confiable de una planilla: el nombre
-- viene escrito de diez formas y el teléfono con y sin código de país.

select
  count(*)                                          as correos_con_mas_de_una_ficha,
  coalesce(sum(fichas), 0)                          as fichas_involucradas,
  coalesce(sum(fichas) - count(*), 0)               as fichas_de_mas
from (
  select lower(trim(correo)) as correo, count(distinct id) as fichas
    from public.clientes
   where correo is not null and trim(correo) <> ''
   group by 1
  having count(distinct id) > 1
) q;

-- ----------------------------------------------------------------------------
-- 2. LOS CASOS, UNO POR UNO
-- ----------------------------------------------------------------------------
--
-- Los veinte peores. `fichas` es lo que importa: si dice 1, la unificación
-- anduvo y lo que sobra son leads; si dice 2 o más, la ficha se partió.

select
  lower(trim(c.correo))                             as correo,
  count(distinct c.id)                              as fichas,
  count(o.id)                                       as leads,
  string_agg(distinct c.nombre, ' | ')              as nombres,
  string_agg(distinct o.codigo, ', ' order by o.codigo) as codigos
  from public.clientes c
  left join public.oportunidades o on o.cliente_id = c.id
 where c.correo is not null and trim(c.correo) <> ''
 group by 1
having count(o.id) > 1
 order by count(distinct c.id) desc, count(o.id) desc
 limit 20;

-- ----------------------------------------------------------------------------
-- 3. DE DÓNDE SALIERON
-- ----------------------------------------------------------------------------
--
-- Cuántos leads dejó cada carga, y cuántas personas distintas. Si una base
-- tiene muchos más leads que clientes, esa carga traía gente repetida adentro
-- del propio archivo.
--
-- «Sin base» son los que no vinieron de una importación: los que abrió el
-- webhook de WhatsApp o alguien a mano.

select
  coalesce(i.archivo, 'sin base')                   as base,
  to_char(i.creado_en, 'DD/MM/YYYY HH24:MI')        as cargada,
  count(o.id)                                       as leads,
  count(distinct o.cliente_id)                      as personas,
  count(o.id) - count(distinct o.cliente_id)        as leads_de_mas
  from public.oportunidades o
  left join public.importaciones i on i.id = o.importacion_id
 group by 1, 2
 order by count(o.id) desc
 limit 20;
