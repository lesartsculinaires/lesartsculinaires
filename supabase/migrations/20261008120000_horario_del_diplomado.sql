begin;

-- ============================================================================
-- El horario con el que se cerró, en la ficha y en el link de registro
-- ============================================================================
--
-- Lo que pidió la escuela: «agregar un campo de Horarios del diplomado cerrado
-- para que aparezca cuando se manda el link de registro».
--
-- Y la parte difícil, dicha por ellos: «el horario es por programa, pero esto
-- varía en relación a que se está cambiando el horario constantemente en cada
-- año».
--
-- ----------------------------------------------------------------------------
-- POR QUÉ SON DOS COLUMNAS Y NO UNA
-- ----------------------------------------------------------------------------
--
-- Porque son dos cosas distintas que se parecen mucho, y confundirlas es
-- exactamente lo que rompe esto.
--
--   productos.horario      El horario VIGENTE del programa. Lo pone dirección
--                          una vez y sirve de borrador para todo el equipo.
--                          Cambia cada año, y cuando cambia tiene que cambiar
--                          para los leads nuevos.
--
--   oportunidades.horario  El horario CERRADO con este alumno. Lo escribe
--                          ventas al cerrar, arrancando del anterior. Una vez
--                          escrito, no lo mueve nadie más.
--
-- Con una sola columna en `productos`, el recibo leería el horario vigente en
-- el momento de abrirlo. Entonces una inscripción cerrada en marzo empezaría a
-- decir el horario del año siguiente en cuanto dirección lo actualice, y
-- académica inscribiría a esa persona en los días equivocados sin que nadie
-- hubiera tocado su ficha. El horario que se le prometió a alguien es un hecho
-- del pasado: se congela con el lead.
--
-- Con una sola columna en `oportunidades`, ventas tendría que escribir el
-- mismo horario a mano en cada lead, trescientas veces, con una errata cada
-- tanto.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ ES TEXTO LIBRE Y NO DÍAS Y HORAS APARTE
-- ----------------------------------------------------------------------------
--
-- Porque lo que se le dice al alumno no entra en un formulario: «Sábados de
-- 8:00 a 12:00, del 15/02 al 20/06», «Martes y jueves 6:00 pm, inicia cuando
-- se llene el grupo», «Domingos, sujeto a cupo». Partirlo en campos obligaría
-- a inventar un caso para cada excepción, y las excepciones son la mitad.
--
-- Sale impreso tal cual en el recibo, así que lo que escriba ventas es
-- exactamente lo que va a leer académica.
--
-- Se puede correr con gente trabajando, y dos veces.

alter table public.productos
  add column if not exists horario text;

alter table public.oportunidades
  add column if not exists horario text;

comment on column public.productos.horario is
  'Horario vigente del programa. Borrador para los leads nuevos; cambia cada año.';
comment on column public.oportunidades.horario is
  'Horario cerrado con este alumno. Se congela acá: sale así en el link de registro.';

commit;

-- ---------------------------------------------------------------- la vista

/*
 * `horario` se suma a `vw_pipeline`, que es de donde leen las pantallas y el
 * recibo. La vista se rehace porque `create or replace view` no admite tocar
 * la lista de columnas.
 *
 * Van los dos: el del lead —lo que vale— y el del programa, que la ficha usa
 * para ofrecerlo con un clic en vez de hacer que ventas lo teclee.
 *
 * Las columnas opcionales se leen de la base en vez de escribirse a mano: este
 * archivo puede correrse sobre una base a la que le falte alguna migración
 * intermedia, y una lista fija fallaría ahí en vez de hacer lo suyo.
 */
do $$
declare
  hay text := '';
  col text;
begin
  foreach col in array array[
    'motivo_perdida_id', 'reserva', 'reserva_en', 'importacion_id'
  ] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'oportunidades'
         and column_name = col
    ) then
      hay := hay || format(', o.%I', col);
    end if;
  end loop;

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
           o.horario,
           p.horario as horario_programa
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

  execute 'alter view public.vw_pipeline set (security_invoker = true)';
end $$;

commit;

-- ------------------------------------------------------------- cómo quedó

select
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'oportunidades'
       and column_name = 'horario'
  ) then '✓ el lead ya guarda su horario' else '· falta' end as en_el_lead,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'productos'
       and column_name = 'horario'
  ) then '✓ y el programa el suyo' else '· falta' end        as en_el_programa,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'vw_pipeline'
       and column_name = 'horario'
  ) then '✓ y las pantallas lo leen' else '· falta' end      as vista,
  (select count(*) from public.productos)                    as programas_a_cargar;
