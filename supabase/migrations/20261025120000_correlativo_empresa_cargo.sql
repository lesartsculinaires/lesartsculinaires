begin;

-- ============================================================================
-- El correlativo de la escuela, y dónde trabaja el alumno
-- ============================================================================
--
-- Lo que pidió la escuela, textual: «poner en la ficha de cada lead una caja de
-- texto en la que se pueda poner el "Correlativo" y que se refleje cuando se
-- cree el link de registro y aparezca ese correlativo. También en la ficha de
-- cada lead quiero otra caja de texto en donde pueda colocar "Nombre de la
-- empresa" y "Cargo"».
--
-- ----------------------------------------------------------------------------
-- POR QUÉ EL CORRELATIVO NO ES `codigo`
-- ----------------------------------------------------------------------------
--
-- Porque ya hay un número y no es éste. `oportunidades.codigo` lo pone el CRM
-- solo —CRM-0001, CRM-0002— y sirve para que dos personas hablen del mismo
-- lead sin confundirse. Nadie lo elige y nadie lo puede repetir: lo sostienen
-- un disparador y un índice único.
--
-- El correlativo es de la escuela. Sale de su numeración de inscripciones, la
-- que usan para cobrar y para archivar, y la escribe quien cierra. Puede tener
-- cualquier forma, puede llegar días después de que el lead entró, y puede
-- estar vacío para siempre en los leads que nunca se inscribieron.
--
-- Meterlo en `codigo` significaría pisar el número del CRM —o pelearse con su
-- índice único la primera vez que alguien tipee mal— y perder el que sirve
-- para buscar el lead. Son dos numeraciones distintas que conviven, y por eso
-- son dos columnas.
--
-- Va en `oportunidades` y no en `clientes` porque es POR INSCRIPCIÓN: la misma
-- persona que se inscribe a Pastelería en marzo y a Barismo en agosto tiene dos
-- correlativos, no uno.
--
-- Texto libre y sin índice único, a propósito. La numeración es de ellos y no
-- se conoce su forma; obligar a un formato acá haría que el CRM rechace el
-- número real de la escuela, que es exactamente al revés de lo que sirve. Y sin
-- unicidad porque un correlativo repetido por error tiene que poder guardarse y
-- corregirse después: frenar el guardado dejaría al asesor sin poder anotar lo
-- que ya está escrito en el recibo de papel.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ EMPRESA Y CARGO VAN EN `clientes`
-- ----------------------------------------------------------------------------
--
-- Porque son de la persona, no de la inscripción. Quien es «Chef ejecutivo en
-- Hotel Real» lo sigue siendo cuando pregunta por el segundo diplomado, y
-- cargarlo de nuevo en cada lead terminaría con la misma persona diciendo dos
-- empresas distintas según qué ficha se abra.
--
-- Es el mismo lugar donde ya viven el teléfono, el correo y el país, y la ficha
-- ya avisa que esos campos son compartidos entre todos los leads de la persona.
--
-- Se puede correr con gente trabajando, y dos veces.

alter table public.oportunidades
  add column if not exists correlativo text;

alter table public.clientes
  add column if not exists empresa text,
  add column if not exists cargo text;

comment on column public.oportunidades.correlativo is
  'Correlativo de inscripción de la escuela. Lo escribe ventas; sale en el link de registro. Distinto de `codigo`, que lo pone el CRM.';
comment on column public.clientes.empresa is
  'Dónde trabaja la persona. Compartido entre todos sus leads.';
comment on column public.clientes.cargo is
  'Qué puesto ocupa. Compartido entre todos sus leads.';

commit;

-- ---------------------------------------------------------------- la vista

/*
 * Las tres columnas se suman a `vw_pipeline`, que es de donde leen las
 * pantallas Y el recibo del link de registro. Sin este paso el correlativo se
 * guardaría en la base y no aparecería en ningún lado: `leerRecibo` consulta la
 * vista, no la tabla.
 *
 * La vista se rehace entera porque `create or replace view` no admite tocar la
 * lista de columnas. Es el mismo procedimiento de
 * `20261008120000_horario_del_diplomado.sql`, con la misma lista de columnas
 * más las tres nuevas.
 *
 * Las opcionales se leen de la base en vez de escribirse a mano: este archivo
 * puede correrse sobre una base a la que le falte alguna migración intermedia,
 * y una lista fija fallaría ahí en vez de hacer lo suyo. `horario` entró a esa
 * lista —antes estaba fija— por lo mismo.
 */
do $$
declare
  hay text := '';
  col text;
begin
  foreach col in array array[
    'motivo_perdida_id', 'reserva', 'reserva_en', 'importacion_id', 'horario'
  ] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'oportunidades'
         and column_name = col
    ) then
      hay := hay || format(', o.%I', col);
    end if;
  end loop;

  -- El horario vigente del programa viaja al lado del cerrado: la ficha lo usa
  -- para ofrecerlo con un clic. Vive en otra tabla, así que se pregunta aparte.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'productos'
       and column_name = 'horario'
  ) then
    hay := hay || ', p.horario as horario_programa';
  end if;

  drop view if exists public.vw_pipeline;

  execute format($vista$
    create view public.vw_pipeline as
    select o.id, o.codigo, o.fecha_registro, o.fecha_cierre,
           date_trunc('month', o.fecha_registro)::date as mes,
           o.cliente_id, c.nombre as cliente, c.telefono, c.correo,
           o.vendedor_id,   v.nombre  as vendedor,
           o.producto_id,   p.nombre  as producto, p.categoria,
           o.territorio_id, t.nombre  as territorio,
           o.canal_id,      ca.nombre as canal,
           o.etapa_id,      e.nombre  as etapa, e.orden as etapa_orden,
           o.estado_id,     s.nombre  as estado, s.es_final,
           mp.nombre as motivo_perdida,
           o.valor_oportunidad, o.venta_cerrada,
           o.descuento_promocion,
           o.created_at%s,
           c.edad,
           c.responsable_nombre,
           c.responsable_telefono,
           c.responsable_correo,
           c.pais,
           c.fecha_nacimiento,
           o.correlativo,
           c.empresa,
           c.cargo
    from public.oportunidades o
    join public.clientes c   on c.id = o.cliente_id
    left join public.vendedores  v  on v.id  = o.vendedor_id
    left join public.productos   p  on p.id  = o.producto_id
    left join public.territorios t  on t.id  = o.territorio_id
    left join public.canales     ca on ca.id = o.canal_id
    left join public.etapas      e  on e.id  = o.etapa_id
    left join public.estados     s  on s.id  = o.estado_id
    left join public.motivos_perdida mp on mp.id = o.motivo_perdida_id
  $vista$, hay);

  /*
   * Sin esto la vista leería con los permisos de quien la creó, y cualquiera
   * vería todos los leads: la vista es el único camino por el que las pantallas
   * miran el pipeline, así que acá se decide si las políticas de la base valen
   * o no.
   */
  execute 'alter view public.vw_pipeline set (security_invoker = true)';
end $$;

commit;

-- ------------------------------------------------------------- cómo quedó

select
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'oportunidades'
       and column_name = 'correlativo'
  ) then '✓ el lead ya guarda su correlativo' else '· falta' end as correlativo,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'clientes'
       and column_name = 'empresa'
  ) then '✓ empresa y cargo en el cliente' else '· falta' end    as empresa_y_cargo,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'vw_pipeline'
       and column_name = 'correlativo'
  ) then '✓ el recibo lo puede leer' else '· falta' end          as vista,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'vw_pipeline'
       and column_name = 'horario'
  ) then '✓ y el horario sigue estando' else '· OJO: se perdió' end as horario_sigue;
