begin;

-- Territorio «Extranjero», y en qué país.
--
-- ------------------------------------------------------------------------
-- POR QUÉ NO ALCANZA CON AGREGAR UN TERRITORIO MÁS
-- ------------------------------------------------------------------------
--
-- Los territorios son una lista cerrada —San Salvador, Santa Ana…— y eso está
-- bien para el país: son catorce y no cambian. Afuera son doscientos, y la
-- escuela recibe de un puñado que además va cambiando.
--
-- Meterlos en el catálogo tendría dos costos. Uno, la lista de territorios
-- pasaría a tener doscientas entradas para que se usen cinco, y elegir «San
-- Miguel» se volvería buscar entre países. Dos, cada país nuevo obligaría a
-- que alguien lo agregue al catálogo antes de poder cargar el lead, y quien
-- está atendiendo no siempre puede.
--
-- Así que el catálogo suma UNA entrada, «Extranjero», y el país se escribe. La
-- lista de territorios queda como está y los cortes por zona siguen dando lo
-- mismo, con los de afuera juntos en una sola línea, que es como se los mira.
--
-- ------------------------------------------------------------------------
-- EL PAÍS ES DE LA PERSONA, NO DEL LEAD
-- ------------------------------------------------------------------------
--
-- Por eso la columna va en `clientes` y no en `oportunidades`. Alguien que
-- vive en Guatemala vive en Guatemala para todos sus leads; si estuviera en la
-- oportunidad habría que escribirlo de nuevo en cada una, y bastaría con
-- olvidarse una vez para que la misma persona figure de dos lugares.
--
-- Se puede correr con gente trabajando, y dos veces.

alter table public.clientes
  add column if not exists pais text;

comment on column public.clientes.pais is
  'País, cuando el territorio es «Extranjero». Se escribe; no sale de un catálogo.';

/*
 * La entrada del catálogo.
 *
 * Se busca antes de crearla, sin distinguir mayúsculas ni espacios de más:
 * si alguien ya cargó «extranjero» a mano, agregar «Extranjero» dejaría dos
 * entradas para lo mismo y los cortes por zona lo contarían partido en dos.
 *
 * No hace falta comparar sin tildes porque la palabra no lleva ninguna.
 */
insert into public.territorios (nombre)
select 'Extranjero'
 where not exists (
   select 1 from public.territorios where lower(btrim(nombre)) = 'extranjero'
 );

-- --------------------------------------------------------------- la vista

/*
 * `pais` se suma a `vw_pipeline`, que es de donde leen las pantallas.
 *
 * La vista se rehace en vez de reemplazarse: `create or replace view` no
 * admite tocar la lista de columnas, ni siquiera para agregar al final.
 *
 * Se arma leyendo las columnas que existen ahora en vez de escribirlas a mano.
 * Este archivo puede correrse sobre una base a la que le falte alguna
 * migración intermedia —el motivo de pérdida, la reserva—, y una lista fija
 * fallaría ahí en vez de hacer lo suyo.
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
           c.pais
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

  -- Como siempre: la vista mira con los permisos de quien pregunta.
  execute 'alter view public.vw_pipeline set (security_invoker = true)';
end $$;

commit;

-- ------------------------------------------------------------ cómo quedó

select
  (select count(*) from public.territorios)                       as territorios,
  case when exists (
    select 1 from public.territorios where lower(btrim(nombre)) = 'extranjero'
  ) then '✓ está «Extranjero» en la lista' else '· falta' end     as extranjero,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'clientes' and column_name = 'pais'
  ) then '✓ se puede escribir el país' else '· falta' end         as pais,
  (select count(*) from public.clientes where pais is not null)   as fichas_con_pais;
