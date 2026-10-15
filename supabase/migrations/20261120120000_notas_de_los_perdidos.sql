-- ============================================================================
-- Los perdidos, con todo lo que se escribió sobre ellos
-- ============================================================================
--
-- Pedido el 15/10/2026: que en «Por qué se pierden», del reporte del día y del
-- mes, se vean las notas que dejaron las asesoras en cada lead perdido, y el
-- registro de quién lo pasó a Perdido y cuándo, para que quien lo lea entienda
-- el motivo con las palabras de quien habló con el cliente.
--
-- Antes iba sólo el último comentario. Ahora van los comentarios de la ficha y
-- las notas internas del Inbox de ese cliente (las 12 más recientes), y el
-- cambio a Perdido sacado del historial (actividad).
--
-- Sólo reemplaza la función; no toca datos.

create or replace function public.datos_del_reporte(p_desde date, p_hasta date)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with rango as (
    select (p_desde::timestamp at time zone 'America/El_Salvador') as ini,
           (p_hasta::timestamp at time zone 'America/El_Salvador') as fin
  ),
  leads as (
    select v.*
      from public.vw_pipeline v
     where (v.fecha_registro >= p_desde and v.fecha_registro < p_hasta)
        or (v.fecha_cierre   >= p_desde and v.fecha_cierre   < p_hasta)
  ),
  enviados as (
    select ms.enviado_por, ms.conversacion_id
      from public.mensajes ms, rango r
     where ms.direccion = 'saliente'
       and not coalesce(ms.privado, false)
       and ms.creado_en >= r.ini and ms.creado_en < r.fin
  ),
  movidas as (
    select a.actor_id, a.campos
      from public.actividad a, rango r
     where a.entidad = 'oportunidad'
       and a.actor_id is not null
       and a.creado_en >= r.ini and a.creado_en < r.fin
       and (a.campos ? 'etapa_id' or a.campos ? 'estado_id')
  ),
  notas as (
    select n.autor_id
      from public.oportunidad_notas n, rango r
     where n.created_at >= r.ini and n.created_at < r.fin
  )
  select json_build_object(
    'leads', coalesce((
      select json_agg(json_build_object(
        'id', l.id,
        'codigo', l.codigo,
        'cliente', l.cliente,
        'canal', l.canal,
        'producto', l.producto,
        'productoId', l.producto_id,
        'vendedor', l.vendedor,
        'territorio', l.territorio,
        'etapa', l.etapa,
        'estado', l.estado,
        'motivo', l.motivo_perdida,
        'registro', l.fecha_registro,
        'cierre', l.fecha_cierre,
        'valor', l.valor_oportunidad,
        'cerrada', l.venta_cerrada,
        'programas', (
          select coalesce(json_agg(p.producto_id order by p.producto_id), '[]'::json)
            from public.oportunidad_programas p
           where p.oportunidad_id = l.id
        ),
        'etiquetas', (
          select coalesce(json_agg(x.etiqueta_id order by x.etiqueta_id), '[]'::json)
            from (
              select e.etiqueta_id from public.oportunidad_etiquetas e where e.oportunidad_id = l.id
              union
              select ce.etiqueta_id
                from public.conversacion_etiquetas ce
                join public.conversaciones c on c.id = ce.conversacion_id
               where c.cliente_id = l.cliente_id
            ) x
        ),
        -- Todo lo que el equipo escribió sobre un perdido, para entender por
        -- qué se perdió: los comentarios de la ficha y las notas internas del
        -- Inbox de ese cliente. Lo automático (uniones, importaciones,
        -- adjuntos, cambios de monto, el agente de IA) se deja afuera. Las 12
        -- más recientes, en orden.
        'notas', case when l.estado = 'Perdido' then (
          select coalesce(json_agg(json_build_object(
                   'fecha', x.fecha, 'quien', x.quien, 'texto', x.texto, 'donde', x.donde
                 ) order by x.fecha), '[]'::json)
            from (
              select * from (
                select n.created_at as fecha,
                       coalesce(public.nombre_del_integrante(n.autor_id), 'Sin autor') as quien,
                       n.nota as texto,
                       'ficha'::text as donde
                  from public.oportunidad_notas n
                 where n.oportunidad_id = l.id
                   and coalesce(n.origen, 'comentario') in ('comentario', 'inbox')
                   and btrim(coalesce(n.nota, '')) <> ''
                union all
                select m.creado_en,
                       public.nombre_del_integrante(m.enviado_por),
                       m.texto,
                       'inbox'
                  from public.mensajes m
                  join public.conversaciones c on c.id = m.conversacion_id
                 where c.cliente_id = l.cliente_id
                   and m.privado
                   and m.enviado_por is not null
                   and btrim(coalesce(m.texto, '')) <> ''
              ) t
              order by t.fecha desc
              limit 12
            ) x
        ) end,

        -- El registro: quién lo pasó a Perdido y cuándo.
        'perdidoPor', case when l.estado = 'Perdido' then (
          select json_build_object(
                   'quien', coalesce(public.nombre_del_integrante(a.actor_id), 'Automático'),
                   'fecha', a.creado_en)
            from public.actividad a
           where a.oportunidad_id = l.id
             and (
               (a.campos -> 'estado_id' ->> 'despues')::bigint =
                 (select s.id from public.estados s where s.nombre = 'Perdido' limit 1)
               or (a.campos -> 'etapa_id' ->> 'despues')::bigint in
                 (select e.id from public.etapas e where e.nombre = 'Perdido')
             )
           order by a.creado_en desc
           limit 1
        ) end
      ) order by l.fecha_registro, l.id)
      from leads l
    ), '[]'::json),

    'mensajes', coalesce((
      select json_agg(json_build_object(
        'quien', m.quien, 'mensajes', m.mensajes, 'conversaciones', m.conversaciones
      ) order by m.mensajes desc)
      from (
        select coalesce(public.nombre_del_integrante(e.enviado_por), 'Automático') as quien,
               count(*) as mensajes,
               count(distinct e.conversacion_id) as conversaciones
          from enviados e
         group by 1
      ) m
    ), '[]'::json),

    'conversaciones', (select count(distinct e.conversacion_id) from enviados e),

    'movimientos', coalesce((
      select json_agg(json_build_object(
        'quien', x.quien, 'etapas', x.etapas, 'ganados', x.ganados, 'perdidos', x.perdidos
      ) order by x.etapas desc)
      from (
        select public.nombre_del_integrante(m.actor_id) as quien,
               count(*) filter (where m.campos ? 'etapa_id') as etapas,
               count(*) filter (where (m.campos -> 'estado_id' ->> 'despues')::bigint =
                 (select s.id from public.estados s where s.nombre = 'Ganado' limit 1)) as ganados,
               count(*) filter (where (m.campos -> 'estado_id' ->> 'despues')::bigint =
                 (select s.id from public.estados s where s.nombre = 'Perdido' limit 1)) as perdidos
          from movidas m
         group by 1
      ) x
    ), '[]'::json),

    'notas', coalesce((
      select json_agg(json_build_object('quien', x.quien, 'notas', x.notas) order by x.notas desc)
      from (
        select coalesce(public.nombre_del_integrante(n.autor_id), 'Automático') as quien, count(*) as notas
          from notas n
         group by 1
      ) x
    ), '[]'::json)
  );
$$;

revoke all on function public.datos_del_reporte(date, date) from public;
revoke all on function public.datos_del_reporte(date, date) from anon;
grant execute on function public.datos_del_reporte(date, date) to authenticated;
