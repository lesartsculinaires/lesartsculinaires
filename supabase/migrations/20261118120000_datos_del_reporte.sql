-- ============================================================================
-- Los datos de los reportes del día y del mes, en una sola consulta
-- ============================================================================
--
-- Lo pidió la escuela el 14 de octubre de 2026: un botón en el Dashboard que
-- arme el reporte del día —todo lo que pasó en el CRM, los cursos, las
-- etiquetas y por qué se perdió cada lead— y otro con el del mes, legibles
-- para marketing y medibles para todas las áreas.
--
-- Una sola llamada en vez de seis para no cargar la base: el reporte del mes
-- recorre más de mil leads, y la base ya mostró que se satura con ráfagas.
--
-- Corre como quien lo pide (SECURITY INVOKER): cada persona ve en el reporte
-- exactamente lo que ya ve en el CRM, ni un lead más.

-- El nombre con el que se reconoce a cada integrante en el reporte: el de su
-- ficha de vendedor si la tiene, si no el de su cuenta. Es SECURITY DEFINER
-- porque la política de `usuarios` sólo deja ver la cuenta propia a quien no
-- es administrador, y un reporte que dijera «otro integrante» en vez de
-- «Raquel» no se podría leer. Devuelve sólo el nombre.
create or replace function public.nombre_del_integrante(p_usuario uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select v.nombre from public.vendedores v where v.usuario_id = p_usuario limit 1),
    (select coalesce(u.nombre, u.correo) from public.usuarios u where u.id = p_usuario)
  );
$$;

revoke all on function public.nombre_del_integrante(uuid) from public;
revoke all on function public.nombre_del_integrante(uuid) from anon;
grant execute on function public.nombre_del_integrante(uuid) to authenticated;

-- p_desde incluido, p_hasta excluido, en fechas de El Salvador.
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
        'nota', case when l.estado = 'Perdido' then (
          select n.nota from public.oportunidad_notas n
           where n.oportunidad_id = l.id
           order by n.created_at desc
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

-- ---------------------------------------------------------------------------
-- El filtro por día del Inbox: qué conversaciones se contestaron un día, y
-- quién las contestó. Pedido el mismo 14 de octubre, para que ventas vea qué
-- respondió cada una en una fecha. Corre como quien lo pide: cada asesora ve
-- las conversaciones que ya puede ver.
-- ---------------------------------------------------------------------------
create or replace function public.contestadas_del_dia(p_dia date)
returns table (conversacion_id bigint, vendedor_id bigint, quien text, mensajes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.conversacion_id,
         (select v.id from public.vendedores v where v.usuario_id = m.enviado_por limit 1),
         coalesce(public.nombre_del_integrante(m.enviado_por), 'Automático'),
         count(*)
    from public.mensajes m
   where m.direccion = 'saliente'
     and not coalesce(m.privado, false)
     and m.creado_en >= (p_dia::timestamp at time zone 'America/El_Salvador')
     and m.creado_en <  ((p_dia + 1)::timestamp at time zone 'America/El_Salvador')
   group by m.conversacion_id, m.enviado_por;
$$;

revoke all on function public.contestadas_del_dia(date) from public;
revoke all on function public.contestadas_del_dia(date) from anon;
grant execute on function public.contestadas_del_dia(date) to authenticated;

-- Hoy son seis mil mensajes y se recorren en un instante; el índice es para
-- cuando sean cien mil. Sólo los salientes, que son los que se buscan por día.
create index if not exists ix_mensajes_salientes_por_fecha
  on public.mensajes (creado_en)
  where direccion = 'saliente';
