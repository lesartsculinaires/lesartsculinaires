-- El sitio de Dirección lee el Tablero de HC con una llave propia (10/11/2026).
--
-- El sitio aparte (repositorio `tablero-comercial`) junta LAC y HC para la
-- Dirección. Se entra con la cuenta de LAC, así que en HC no hay sesión.
--
-- ============================================================================
-- POR QUÉ UNA LLAVE PROPIA Y NO LA LLAVE DE SERVICIO
-- ============================================================================
--
-- La llave de servicio abre la base entera: clientes, chats, todo. El sitio
-- sólo necesita leer el Tablero. Con una llave propia, si el sitio quedara
-- expuesto, lo único que se podría leer son los números del Tablero.
--
-- La llave la genera quien instala el sitio, va como variable secreta en
-- Netlify (HC_TABLERO_LLAVE) y acá se guarda sólo su huella (SHA-256): ni
-- quien lea esta base puede sacar la llave de acá. Para cambiarla, se agrega
-- la huella nueva y se apaga la vieja (`activa = false`).
--
-- `tablero_del_sitio()` la comprueba y devuelve, en un solo JSON, lo mismo que
-- lee el módulo del CRM. Las tres funciones que cuentan lo del CRM se separan
-- en el cálculo (sin pregunta, cerrado para todos) y la función de siempre
-- (que pregunta el permiso y llama al cálculo): lo que cuentan no cambia.
--
-- Va igual en los dos CRM para que sigan siendo el mismo código. En LAC no
-- hay ninguna huella cargada, así que ahí `tablero_del_sitio()` no abre nada.

begin;

-- ------------------------------------------------------- las huellas de las llaves
create table if not exists public.tablero_llaves_del_sitio (
  id        bigint      generated always as identity primary key,
  huella    text        not null unique check (huella ~ '^[0-9a-f]{64}$'),
  nota      text,
  activa    boolean     not null default true,
  creada_en timestamptz not null default now()
);

comment on table public.tablero_llaves_del_sitio is
  'Huella SHA-256 (hex) de cada llave con la que el sitio de Dirección lee el Tablero. Nunca la llave.';

-- Sin políticas: nadie la lee ni la escribe por la API.
alter table public.tablero_llaves_del_sitio enable row level security;
revoke all on table public.tablero_llaves_del_sitio from anon, authenticated;

-- ------------------------------------------- el cálculo, separado del permiso
-- tablero_crm_semanal: el cálculo, sin la pregunta de permiso. Sólo lo llaman la
-- función pública (que pregunta) y `tablero_del_sitio` (que pide la llave).
create or replace function public.tablero_crm_semanal_calculo(p_desde date, p_hasta date)
returns table (semana date, campo text, valor numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with
  leads as (
    select o.id, o.cliente_id, o.created_at,
           date_trunc('week', coalesce(o.fecha_registro, (o.created_at at time zone 'America/El_Salvador')::date))::date as lunes,
           public.tablero_canal_del_lead(o.id) as canal
      from public.oportunidades o
     where o.importacion_id is null
       and coalesce(o.fecha_registro, (o.created_at at time zone 'America/El_Salvador')::date) between p_desde and p_hasta
  ),
  contacto as (
    select l.id, l.lunes, l.created_at,
           least(
             (select min(m.creado_en)
                from public.mensajes m
                join public.conversaciones c on c.id = m.conversacion_id
               where c.cliente_id = l.cliente_id
                 and m.direccion = 'saliente'
                 and m.creado_en >= l.created_at - interval '1 hour'
                 and not exists (select 1 from public.envio_destinatarios d where d.wa_id = m.wa_id)),
             (select min(n.created_at)
                from public.oportunidad_notas n
               where n.oportunidad_id = l.id and n.autor_id is not null and n.origen in ('comentario', 'inbox')),
             (select min(ll.creado_en)
                from public.llamadas ll
                join public.conversaciones c on c.id = ll.conversacion_id
               where c.cliente_id = l.cliente_id and ll.direccion = 'saliente'
                 and ll.creado_en >= l.created_at - interval '1 hour')
           ) as cuando
      from leads l
  ),
  ganados as (
    select date_trunc('week', o.fecha_cierre)::date as lunes,
           p.categoria,
           public.tablero_canal_del_lead(o.id) as canal,
           coalesce(o.venta_cerrada, o.valor_oportunidad, 0) as monto
      from public.oportunidades o
      join public.estados es on es.id = o.estado_id
      left join public.productos p on p.id = o.producto_id
     where es.nombre ilike 'ganad%'
       and o.fecha_cierre between p_desde and p_hasta
  ),
  citas as (
    select date_trunc('week', (e.inicia_en at time zone 'America/El_Salvador')::date)::date as lunes
      from public.eventos e
      join public.tipos_evento te on te.id = e.tipo_id
     where e.estado = 'Realizado'
       and (te.nombre ilike '%visita%' or te.nombre ilike '%clase%' or te.nombre ilike '%cita%')
       and (e.inicia_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
  ),
  respuestas as (
    select date_trunc('week', (d.respondio_en at time zone 'America/El_Salvador')::date)::date as lunes
      from public.envio_destinatarios d
     where d.respondio_en is not null
       and (d.respondio_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
  )
  select l.lunes, 'mk.leads_' || l.canal, count(*)::numeric from leads l
   where l.canal <> 'recontacto' group by 1, 2
  union all
  select r.lunes, 'mk.leads_recontacto', count(*)::numeric from respuestas r group by 1
  union all
  select c.lunes, 'ventas.contactados', count(*)::numeric from contacto c where c.cuando is not null group by 1
  union all
  select c.lunes, 'ventas.contactados_24h', count(*)::numeric from contacto c
   where c.cuando is not null and c.cuando <= c.created_at + interval '24 hours' group by 1
  union all
  select ci.lunes, 'ventas.citas', count(*)::numeric from citas ci group by 1
  union all
  select g.lunes, 'ventas.inscritos_' || g.canal, count(*)::numeric from ganados g
   where g.categoria = 'Diplomado' group by 1, 2
  union all
  select g.lunes, 'ventas.cursos_cortos', count(*)::numeric from ganados g
   where g.categoria = 'Curso corto' group by 1
  union all
  -- Referencias: el área escribe el monto; esto sólo se muestra al lado.
  select g.lunes, 'ventas.cobrado_nuevos', sum(g.monto) from ganados g
   where g.categoria = 'Diplomado' group by 1
  union all
  select g.lunes, 'ventas.cursos_cortos_monto', sum(g.monto) from ganados g
   where g.categoria = 'Curso corto' group by 1;
$$;

revoke execute on function public.tablero_crm_semanal_calculo(date, date) from public, anon, authenticated;

create or replace function public.tablero_crm_semanal(p_desde date, p_hasta date)
returns table (semana date, campo text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede('tablero', 'ver') then
    raise exception 'Sin permiso para ver el Tablero Comercial.' using errcode = '42501';
  end if;
  return query select * from public.tablero_crm_semanal_calculo(p_desde, p_hasta);
end $$;

-- tablero_crm_actividad: el cálculo, sin la pregunta de permiso. Sólo lo llaman la
-- función pública (que pregunta) y `tablero_del_sitio` (que pide la llave).
create or replace function public.tablero_crm_actividad_calculo(p_desde date, p_hasta date)
returns table (semana date, vendedor_id bigint, campo text, valor numeric)
language sql
stable
security definer
set search_path = ''
as $$
  -- Mensajes escritos por la persona. Los de un envío masivo no son seguimiento.
  select date_trunc('week', (m.creado_en at time zone 'America/El_Salvador')::date)::date,
         v.id, 'mensajes'::text, count(*)::numeric
    from public.mensajes m
    join public.vendedores v on v.usuario_id = m.enviado_por
   where m.direccion = 'saliente'
     and (m.creado_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
     and not exists (select 1 from public.envio_destinatarios d where d.wa_id = m.wa_id)
   group by 1, 2
  union all
  select date_trunc('week', (l.creado_en at time zone 'America/El_Salvador')::date)::date,
         l.vendedor_id, 'llamadas', count(*)::numeric
    from public.llamadas l
   where l.direccion = 'saliente' and l.vendedor_id is not null
     and (l.creado_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
   group by 1, 2
  union all
  select date_trunc('week', (e.created_at at time zone 'America/El_Salvador')::date)::date,
         e.vendedor_id, 'citas_agendadas', count(*)::numeric
    from public.eventos e
   where e.vendedor_id is not null and e.estado <> 'Cancelado'
     and (e.created_at at time zone 'America/El_Salvador')::date between p_desde and p_hasta
   group by 1, 2
  union all
  select date_trunc('week', (e.inicia_en at time zone 'America/El_Salvador')::date)::date,
         e.vendedor_id, 'citas_realizadas', count(*)::numeric
    from public.eventos e
   where e.vendedor_id is not null and e.estado = 'Realizado'
     and (e.inicia_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
   group by 1, 2
  union all
  select date_trunc('week', o.fecha_cierre)::date, o.vendedor_id, 'ventas_cerradas', count(*)::numeric
    from public.oportunidades o
    join public.estados es on es.id = o.estado_id
   where es.nombre ilike 'ganad%' and o.vendedor_id is not null
     and o.fecha_cierre between p_desde and p_hasta
   group by 1, 2;
$$;

revoke execute on function public.tablero_crm_actividad_calculo(date, date) from public, anon, authenticated;

create or replace function public.tablero_crm_actividad(p_desde date, p_hasta date)
returns table (semana date, vendedor_id bigint, campo text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede('tablero', 'ver') then
    raise exception 'Sin permiso para ver el Tablero Comercial.' using errcode = '42501';
  end if;
  return query select * from public.tablero_crm_actividad_calculo(p_desde, p_hasta);
end $$;

-- tablero_crm_ventas_persona: el cálculo, sin la pregunta de permiso. Sólo lo llaman la
-- función pública (que pregunta) y `tablero_del_sitio` (que pide la llave).
create or replace function public.tablero_crm_ventas_persona_calculo(p_mes date)
returns table (vendedor_id bigint, campo text, valor numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select o.vendedor_id,
         case p.categoria when 'Diplomado' then 'diplomados' else 'cursos_cortos' end,
         count(*)::numeric
    from public.oportunidades o
    join public.estados es on es.id = o.estado_id
    join public.productos p on p.id = o.producto_id
   where es.nombre ilike 'ganad%' and o.vendedor_id is not null
     and p.categoria in ('Diplomado', 'Curso corto')
     and o.fecha_cierre >= date_trunc('month', p_mes)::date
     and o.fecha_cierre <  (date_trunc('month', p_mes) + interval '1 month')::date
   group by 1, 2;
$$;

revoke execute on function public.tablero_crm_ventas_persona_calculo(date) from public, anon, authenticated;

create or replace function public.tablero_crm_ventas_persona(p_mes date)
returns table (vendedor_id bigint, campo text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede('tablero', 'ver') then
    raise exception 'Sin permiso para ver el Tablero Comercial.' using errcode = '42501';
  end if;
  return query select * from public.tablero_crm_ventas_persona_calculo(p_mes);
end $$;

-- ----------------------------------------------- lo que lee el sitio de Dirección
create or replace function public.tablero_del_sitio(p_llave text, p_desde date, p_hasta date, p_mes date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_llave is null or length(p_llave) < 40 or not exists (
       select 1 from public.tablero_llaves_del_sitio l
        where l.activa and l.huella = encode(sha256(convert_to(p_llave, 'UTF8')), 'hex')) then
    raise exception 'Llave del sitio no válida.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_mes is null or p_hasta < p_desde or p_hasta - p_desde > 450 then
    raise exception 'Rango de fechas no válido.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'semanal', coalesce((
      select jsonb_agg(jsonb_build_object('semana', s.semana, 'campo', s.campo, 'valor', s.valor) order by s.semana, s.campo)
        from public.tablero_semanal s where s.semana between p_desde and p_hasta), '[]'::jsonb),
    'crm_semanal', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.tablero_crm_semanal_calculo(p_desde, p_hasta) c), '[]'::jsonb),
    'metas', coalesce((
      select jsonb_agg(jsonb_build_object('mes', m.mes, 'clave', m.clave, 'valor', m.valor))
        from public.tablero_metas m), '[]'::jsonb),
    'grupos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'programa', g.programa, 'grupo', g.grupo, 'dias', g.dias, 'horario', g.horario,
               'duracion_meses', g.duracion_meses, 'inicio', g.inicio, 'matricula_1', g.matricula_1,
               'matricula_2', g.matricula_2, 'mensualidad', g.mensualidad, 'graduacion', g.graduacion,
               'mensualidad_preventa', g.mensualidad_preventa, 'cupo', g.cupo, 'reservas', g.reservas,
               'inscritos', g.inscritos) order by g.inicio, g.grupo)
        from public.tablero_grupos g where g.activo), '[]'::jsonb),
    'acciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'tipo', a.tipo, 'accion', a.accion, 'responsable', a.responsable, 'persona', a.persona,
               'fecha', a.fecha, 'estado', a.estado, 'costo', a.costo, 'leads_esperados', a.leads_esperados,
               'leads_obtenidos', a.leads_obtenidos, 'inscritos', a.inscritos, 'venta', a.venta) order by a.fecha, a.id)
        from public.tablero_acciones a where a.fecha is null or a.fecha >= p_desde), '[]'::jsonb),
    'actividad', coalesce((
      select jsonb_agg(jsonb_build_object('semana', x.semana, 'vendedor_id', x.vendedor_id, 'campo', x.campo, 'valor', x.valor))
        from public.tablero_actividad x where x.semana between p_desde and p_hasta), '[]'::jsonb),
    'crm_actividad', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.tablero_crm_actividad_calculo(p_desde, p_hasta) c), '[]'::jsonb),
    'ventas_persona', coalesce((
      select jsonb_agg(jsonb_build_object('vendedor_id', v.vendedor_id, 'campo', v.campo, 'valor', v.valor))
        from public.tablero_ventas_persona v where v.mes = p_mes), '[]'::jsonb),
    'crm_ventas_persona', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.tablero_crm_ventas_persona_calculo(p_mes) c), '[]'::jsonb),
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object('hoja', k.hoja, 'texto', k.texto, 'actualizado_en', k.actualizado_en))
        from public.tablero_comentarios k where k.mes = p_mes), '[]'::jsonb),
    'vendedores', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'nombre', v.nombre, 'activo', v.activo) order by v.nombre)
        from public.vendedores v), '[]'::jsonb)
  );
end $$;

comment on function public.tablero_del_sitio(text, date, date, date) is
  'Lo que lee el sitio de Dirección: el Tablero completo, sólo con una llave cuya huella esté en tablero_llaves_del_sitio.';

revoke execute on function public.tablero_del_sitio(text, date, date, date) from public;
grant  execute on function public.tablero_del_sitio(text, date, date, date) to anon, authenticated;

-- Una versión anterior de este archivo (nunca aplicada en producción) dejaba
-- pasar la llave de servicio con esta función. Ya no hace falta.
drop function if exists public.puede_ver_tablero();

commit;
