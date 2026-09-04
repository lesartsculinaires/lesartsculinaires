begin;

-- ============================================================================
-- Dos motivos más para cuando un lead no cierra
-- ============================================================================
--
-- Los pidió la escuela: «en la opción de Estado de un lead salen las opciones
-- del por qué se perdió, quiero agregar otra opción de "Solo cotizó" y otro
-- que diga "Envía a buzón"».
--
-- Los dos nombran cosas que hoy caían en «Dejó de contestar» y en «No
-- interesado», que es donde termina todo lo que no tiene su propia casilla.
-- Separarlos importa porque no se trabajan igual:
--
--   Solo cotizó      Preguntó el precio y no volvió. Es un lead frío pero
--                    vivo: sirve para una promoción, no para insistirle.
--
--   Envía a buzón    El teléfono manda directo al contestador. No dice nada
--                    del interés de la persona —dice que por ahí no se la
--                    alcanza— y lo que corresponde es escribirle, no seguir
--                    marcando.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ NO ES UN `insert` A SECAS
-- ----------------------------------------------------------------------------
--
-- Por el `on conflict`. Si alguien ya los cargó a mano desde la pantalla de
-- catálogos —que se puede— un insert pelado reventaría contra la restricción
-- de nombre único y la migración quedaría a medias. Con esto, correrla dos
-- veces es seguro y correrla sobre una base donde ya están los despierta si
-- estaban apagados, que es lo que se querría en ese caso.
--
-- El orden los deja al final de la lista, después de los seis que ya había.
-- Los motivos se ofrecen en ese orden y los de arriba son los que la escuela
-- viene usando más; empujarlos hacia abajo por agregar dos nuevos sería
-- cambiarle la lista a quien la tiene aprendida de memoria.
-- ============================================================================

insert into public.motivos_perdida (nombre, orden)
values ('Solo cotizó', 7), ('Envía a buzón', 8)
on conflict (nombre) do update set activo = true;

commit;

-- ------------------------------------------------------------- cómo quedó
select nombre, orden, case when activo then '✓' else 'apagado' end as estado
  from public.motivos_perdida
 order by orden nulls last, id;
