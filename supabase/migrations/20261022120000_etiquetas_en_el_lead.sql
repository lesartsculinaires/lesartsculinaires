begin;

-- ============================================================================
-- Las mismas etiquetas, ahora también sobre el lead
-- ============================================================================
--
-- Lo pidió la escuela: «quiero que pongamos en la ficha de cada lead una
-- opción para colocar etiquetas o viñetas, para que eso ayude al momento de
-- hacer los envíos masivos y seleccionarlos o agruparlos».
--
-- ----------------------------------------------------------------------------
-- POR QUÉ EL MISMO CATÁLOGO Y NO UNO NUEVO
-- ----------------------------------------------------------------------------
--
-- Porque «pidió beca» es «pidió beca» esté escrito en el chat o en la ficha, y
-- dos catálogos separados terminarían con la etiqueta escrita dos veces, con
-- dos colores, y con filtros que devuelven la mitad de la gente según por
-- dónde se pregunte. Se reusa `etiquetas`: se crean en un solo lugar, se
-- administran en un solo lugar y se ven iguales en los dos.
--
-- Lo que sí es nuevo es dónde se pega. Una conversación y un lead no son lo
-- mismo: hay leads sin conversación —los que entraron por una base o por el
-- formulario— y la escuela quiere poder agruparlos igual, que es justamente
-- para lo que los quiere. Por eso la tabla de al lado y no una columna más en
-- `conversacion_etiquetas`.
--
-- ----------------------------------------------------------------------------
-- Y POR QUÉ ESTO NO PISA A LA ETAPA NI AL ESTADO
-- ----------------------------------------------------------------------------
--
-- Vale la misma advertencia que dejó escrita la migración de las etiquetas de
-- la bandeja, y acá vale más todavía porque estamos sobre la tabla de las
-- ventas: una etiqueta «GANADO» al lado del estado Ganado haría que la ficha
-- diga una cosa y el tablero otra, sin manera de saber cuál vale.
--
-- La etapa dice dónde está en el embudo. El estado, cómo terminó. Las
-- etiquetas son para lo que ninguno de los dos cubre y cambia seguido: «viene
-- de feria», «pidió beca», «hablar en enero», «lista de espera». Nada de eso
-- se mide; todo eso sirve para juntar gente a la que escribirle.
-- ============================================================================

create table if not exists public.oportunidad_etiquetas (
  oportunidad_id bigint not null references public.oportunidades(id) on delete cascade,
  etiqueta_id    bigint not null references public.etiquetas(id)     on delete cascade,
  puesta_por     uuid references auth.users(id) on delete set null,
  puesta_en      timestamptz not null default now(),
  primary key (oportunidad_id, etiqueta_id)
);

-- Para el camino que importa: «dame todos los leads con esta etiqueta», que es
-- el que usa el armado de un envío. La clave primaria ya resuelve el otro
-- —«qué etiquetas tiene este lead»— porque empieza por la oportunidad.
create index if not exists ix_op_etiquetas_etiqueta
  on public.oportunidad_etiquetas (etiqueta_id);

alter table public.oportunidad_etiquetas enable row level security;

/*
 * Quién puede etiquetar: quien puede ver ese lead.
 *
 * No es `using (true)` como en la bandeja, y la diferencia no es capricho. Las
 * conversaciones las ve todo el equipo a propósito —un mensaje que entra tiene
 * que poder atenderlo quien esté—, pero los leads no: `oportunidades_ver` deja
 * a cada asesora ver los suyos y los que no tienen dueño. Si acá se pusiera
 * `true`, alguien podría etiquetar un lead que ni siquiera puede abrir, y esa
 * etiqueta aparecería en un envío armado por otra persona.
 *
 * La condición se escribe como «existe esa oportunidad para mí»: si RLS no me
 * deja verla, el `exists` no la encuentra y la fila no se puede ni leer ni
 * escribir. No hay que repetir la regla, que es lo bueno: el día que cambie,
 * cambia en un solo lugar.
 */
drop policy if exists op_etiquetas_todo on public.oportunidad_etiquetas;
create policy op_etiquetas_todo on public.oportunidad_etiquetas
  for all to authenticated
  using (
    exists (select 1 from public.oportunidades o where o.id = oportunidad_id)
  )
  with check (
    exists (select 1 from public.oportunidades o where o.id = oportunidad_id)
  );

commit;

-- ------------------------------------------------------------- cómo quedó
select
  case when exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'oportunidad_etiquetas'
  ) then '✓ los leads ya se pueden etiquetar' else '⚠ REVISAR' end       as tabla,
  (select count(*) from public.etiquetas where activa)                   as etiquetas_disponibles,
  (select count(*) from public.oportunidad_etiquetas)                    as puestas;
