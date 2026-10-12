-- ============================================================================
-- El embudo se arma una vez y se comparte, en vez de armarse en cada carga.
-- ============================================================================
--
-- EL PROBLEMA, MEDIDO
--
-- El 12 de octubre de 2026 el CRM se cayó tres veces en la mañana (09:00, 09:21
-- y 09:33) con poca gente conectada: entre 100 y 450 consultas por minuto, la
-- tercera parte que el sábado. Las tres veces empezaron igual: cinco o seis
-- cargas completas de la portada dentro de los mismos veinte segundos. Con eso
-- la base —el tamaño Micro de Supabase, procesador compartido— pasó de
-- contestar en 0,07 s a 17 s, y tardó hasta ocho minutos en recuperarse.
--
-- Cada carga completa pedía el embudo entero —2592 leads, 2,3 MB— en trece
-- consultas: tres tandas de `vw_pipeline`, tres de `vw_ultimo_toque`, las de
-- programas y etiquetas y sus conteos. Y lo armaba de cero cada vez, aunque la
-- carga anterior, de hace dos segundos, hubiera traído exactamente lo mismo.
--
-- LO QUE HACE ESTO
--
-- `embudo_compartido()` devuelve el embudo ya armado, en una sola consulta,
-- mientras nada haya cambiado. Para saber si algo cambió calcula una HUELLA de
-- todo lo que el embudo muestra —cuesta milisegundos— y la compara con la del
-- embudo guardado. Si coinciden, lo devuelve tal cual. Si no, lo arma una vez,
-- lo guarda con la huella nueva y lo devuelve; las cargas que lleguen mientras
-- tanto esperan a ése en vez de armar cada una el suyo.
--
-- O sea: cinco cargas juntas cuestan un armado y cuatro lecturas, no cinco
-- armados.
--
-- A QUIÉN SE LE COMPARTE, Y POR QUÉ ES SEGURO
--
-- Sólo a quien VE TODO (`ve_todo()`: administradores y roles con esa casilla).
-- Para esas personas el RLS de cada tabla del embudo deja ver todas las filas
-- —verificado política por política: `oportunidades` y `oportunidad_notas`
-- abren con `ve_todo()`, `oportunidad_etiquetas` con «la oportunidad se ve», y
-- el resto con `true`—, así que el embudo armado sin RLS es exactamente el que
-- cada una vería con el suyo. A quien no ve todo se le devuelve NULL y la
-- aplicación le arma el embudo como siempre, con su RLS.
--
-- Por eso el armado vive adentro de la base y no lo manda la aplicación: si
-- cualquiera pudiera guardar un embudo, podría guardar uno falso para todos.
--
-- QUÉ ENTRA EN LA HUELLA
--
-- Todo lo que el embudo muestra: las oportunidades y los clientes completos,
-- los programas y las etiquetas de cada lead, la fecha de las notas y la
-- actividad (de ahí sale el último toque) y los catálogos cuyos nombres se ven
-- en cada fila. Si algo de eso cambia —por la aplicación, por un webhook o a
-- mano en la base— la huella cambia y el embudo se vuelve a armar.

create table if not exists public.embudo_guardado (
  alcance    text primary key check (alcance = 'todo'),
  huella     text not null,
  datos      json not null,
  armado_en  timestamptz not null default now(),
  -- Cuántas veces se armó. Sirve para comprobar que las cargas comparten.
  armados    bigint not null default 1
);

comment on table public.embudo_guardado is
  'El embudo ya armado para quien ve todo, con la huella de los datos con que se armo.';

-- Nadie lo lee ni lo escribe directo: sólo por `embudo_compartido()`.
alter table public.embudo_guardado enable row level security;
revoke all on public.embudo_guardado from anon;
revoke all on public.embudo_guardado from authenticated;

-- ---------------------------------------------------------------- la huella
--
-- Por tabla, la cantidad de filas y la suma de un hash de cada fila entera: un
-- cambio en cualquier columna de cualquier fila la mueve. Para la actividad
-- alcanza con cuántas hay y la última, porque sólo se agregan; recorrer las
-- diecisiete mil en cada carga costaría más que lo que ahorra.
create or replace function public.huella_del_embudo()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(concat_ws('|',
    (select count(*) || ':' || coalesce(sum(hashtextextended(o::text, 0)::numeric), 0) from public.oportunidades o),
    (select count(*) || ':' || coalesce(sum(hashtextextended(c::text, 0)::numeric), 0) from public.clientes c),
    (select count(*) || ':' || coalesce(sum(hashtextextended(p::text, 0)::numeric), 0) from public.oportunidad_programas p),
    (select count(*) || ':' || coalesce(sum(hashtextextended(e::text, 0)::numeric), 0) from public.oportunidad_etiquetas e),
    (select count(*) || ':' || coalesce(sum(hashtextextended(n.oportunidad_id::text || '@' || n.created_at::text, 0)::numeric), 0) from public.oportunidad_notas n),
    (select count(*) || ':' || coalesce(max(a.id), 0) from public.actividad a),
    (select count(*) || ':' || coalesce(sum(hashtextextended(x::text, 0)::numeric), 0) from public.vendedores x),
    (select count(*) || ':' || coalesce(sum(hashtextextended(x::text, 0)::numeric), 0) from public.productos x),
    (select count(*) || ':' || coalesce(sum(hashtextextended(x::text, 0)::numeric), 0) from public.territorios x),
    (select count(*) || ':' || coalesce(sum(hashtextextended(x::text, 0)::numeric), 0) from public.canales x),
    (select count(*) || ':' || coalesce(sum(hashtextextended(x::text, 0)::numeric), 0) from public.etapas x),
    (select count(*) || ':' || coalesce(sum(hashtextextended(x::text, 0)::numeric), 0) from public.estados x),
    (select count(*) || ':' || coalesce(sum(hashtextextended(x::text, 0)::numeric), 0) from public.motivos_perdida x)
  ));
$$;

-- ----------------------------------------------------------------- el armado
--
-- Las mismas cuatro listas que pedía la aplicación, con el mismo orden y las
-- mismas columnas: `json_agg` de la fila de la vista es lo mismo que contesta
-- PostgREST a un `select=*`, así que del otro lado no cambia nada.
create or replace function public.armar_embudo()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'embudo', coalesce((
      select json_agg(v order by v.fecha_registro desc, v.id desc) from public.vw_pipeline v
    ), '[]'::json),
    'programas', coalesce((
      select json_agg(json_build_object('oportunidad_id', p.oportunidad_id, 'producto_id', p.producto_id)
                      order by p.oportunidad_id, p.producto_id)
        from public.oportunidad_programas p
    ), '[]'::json),
    'etiquetas', coalesce((
      select json_agg(json_build_object('oportunidad_id', e.oportunidad_id, 'etiqueta_id', e.etiqueta_id)
                      order by e.oportunidad_id, e.etiqueta_id)
        from public.oportunidad_etiquetas e
    ), '[]'::json),
    'toques', coalesce((
      select json_agg(json_build_object('oportunidad_id', t.oportunidad_id, 'ultimo_toque', t.ultimo_toque)
                      order by t.oportunidad_id)
        from public.vw_ultimo_toque t
    ), '[]'::json)
  );
$$;

-- ------------------------------------------------------- lo que se llama
create or replace function public.embudo_compartido()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h text;
  d json;
begin
  if not public.ve_todo() then
    return null;
  end if;

  h := public.huella_del_embudo();
  select g.datos into d from public.embudo_guardado g where g.alcance = 'todo' and g.huella = h;
  if d is not null then
    return d;
  end if;

  /*
   * Uno solo arma; los demás esperan a ése.
   *
   * Sin esto, las cinco cargas de las 09:00 habrían visto la misma huella
   * vieja y armado las cinco a la vez, que es justo lo que se quiere evitar.
   * Si la espera pasa de cuatro segundos, se devuelve NULL y la aplicación
   * arma el embudo por su cuenta, como antes: nunca peor que hoy.
   */
  begin
    perform set_config('lock_timeout', '4s', true);
    perform pg_advisory_xact_lock(hashtext('lac.embudo_compartido'));
  exception when lock_not_available then
    return null;
  end;

  -- Mientras se esperaba, otro pudo haberlo armado.
  h := public.huella_del_embudo();
  select g.datos into d from public.embudo_guardado g where g.alcance = 'todo' and g.huella = h;
  if d is not null then
    return d;
  end if;

  /*
   * La huella se calcula ANTES de armar. Si algo cambia en el medio, lo
   * guardado queda más nuevo que su huella y la próxima carga lo vuelve a
   * armar: trabajo de más, nunca un embudo viejo con huella nueva.
   */
  d := public.armar_embudo();
  insert into public.embudo_guardado as g (alcance, huella, datos, armado_en, armados)
  values ('todo', h, d, now(), 1)
  on conflict (alcance) do update
    set huella = excluded.huella,
        datos = excluded.datos,
        armado_en = excluded.armado_en,
        armados = g.armados + 1;
  return d;
end;
$$;

revoke all on function public.huella_del_embudo() from public;
revoke all on function public.huella_del_embudo() from anon;
revoke all on function public.huella_del_embudo() from authenticated;
revoke all on function public.armar_embudo() from public;
revoke all on function public.armar_embudo() from anon;
revoke all on function public.armar_embudo() from authenticated;
revoke all on function public.embudo_compartido() from public;
revoke all on function public.embudo_compartido() from anon;
grant execute on function public.embudo_compartido() to authenticated;
