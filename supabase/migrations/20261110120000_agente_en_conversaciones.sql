-- Las tres columnas del agente en `conversaciones`.
--
-- ============================================================================
-- ESTAS COLUMNAS YA EXISTEN EN PRODUCCIÓN
-- ============================================================================
--
-- Se agregaron a mano en Supabase, sin pasar por acá, igual que había pasado
-- con `canal_credenciales`. Todo lo de abajo es `if not exists`: CORRERLO EN
-- PRODUCCIÓN NO CAMBIA NADA.
--
-- Está escrito por lo que esa diferencia costaba: el banco de pruebas no las
-- tenía, así que cualquier código que las tocara no se podía probar. Se
-- descubrió escribiendo el aviso de desautorización de Meta —que apaga
-- `agente_activo`— cuando la prueba falló con «column "agente_activo" of
-- relation "conversaciones" does not exist» sobre algo que en producción
-- funciona. Una prueba que no puede correr no es una prueba.
--
-- ============================================================================
-- QUÉ SON
-- ============================================================================
--
--   agente_activo       Si el agente automático contesta en este hilo. Es la
--                       única de las tres que decide algo, y la que hay que
--                       apagar cuando alguien pide que lo dejen en paz: es lo
--                       único que podría volver a escribirle solo.
--
--   agente_cambiado_en  Cuándo se prendió o apagó, y
--   agente_motivo       por qué. Las dos existen para poder contestar «¿y esto
--                       quién lo apagó?» sin reconstruirlo de memoria.
--
-- Sólo se documentan las tres columnas de `conversaciones`. El resto de las
-- tablas del agente —`agente_config`, `agente_casos`, `agente_eventos` y las
-- demás— también están fuera del repositorio, pero no se tocan desde acá y
-- escribir de memoria la forma de algo que no se usa sería peor que no tenerlo:
-- quedaría una migración que dice una cosa y una base que dice otra.

alter table public.conversaciones
  add column if not exists agente_activo      boolean not null default false,
  add column if not exists agente_cambiado_en timestamptz,
  add column if not exists agente_motivo      text;

comment on column public.conversaciones.agente_activo is
  'Si el agente automático contesta en este hilo. Se apaga al desautorizar la app.';
