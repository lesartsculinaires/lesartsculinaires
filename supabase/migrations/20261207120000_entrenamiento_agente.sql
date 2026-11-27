-- ============================================================================
-- Entrenamiento de Mathieu desde el CRM, y su métrica
-- ============================================================================
--
-- Pedido el 27/11/2026 (LAC). Un chat fijo en el Inbox, «Entrenamiento
-- Mathieu», donde Raquel y Alexandra eligen un lead que Mathieu contestó, marcan
-- el mensaje que no les gustó y escriben cómo quieren que conteste. Se aplica
-- AL MOMENTO —ellas dos están a cargo, sin aprobación de nadie—: el ejemplo
-- entra a `agente_casos`, que es lo que Mathieu consulta antes de responder.
-- Si un cambio salió mal se desactiva desde el mismo chat.
--
-- Lo ven ellas dos y los administradores. Nadie más.
--
-- Además, la métrica para el Dashboard y el sitio de Dirección: cuántos
-- mensajes contestó Mathieu, en cuántos chats, cuántas alertas dejó, y los
-- cambios de respuesta que se le hicieron para entrenarlo.
--
-- Piezas:
--   · agente_entrenadores — quién entrena, por persona y no por rol: Raquel
--     comparte rol con Eduardo y el pedido fue sólo para ellas dos.
--   · agente_ejemplos — cada cambio, con el mensaje de Mathieu copiado tal
--     cual (si el chat se borra, el ejemplo sigue diciendo lo mismo), lo que
--     había escrito el cliente antes, y la respuesta que queremos.
--   · funciones con SECURITY DEFINER para todo: las tablas no se abren a las
--     sesiones.
--
-- `agente_casos` ya existe en producción (la creó el agente, fuera de este
-- repositorio). El `create table if not exists` de abajo es su forma exacta,
-- copiada de la base el 27/11/2026, para que el banco de pruebas la tenga: en
-- producción no hace nada.

create table if not exists public.agente_casos (
  id                    bigserial primary key,
  escenario             integer not null,
  escenario_nombre      text not null,
  titulo                text not null,
  cliente_ejemplo       text not null,
  respuesta_real        text,
  resultado             text,
  respuesta_recomendada text not null,
  accion                text,
  pasar_a_persona       boolean not null default false,
  estado_crm            text,
  fuente                text,
  aprobado_gerencia     boolean not null default false,
  activo                boolean not null default true,
  orden                 integer not null default 100,
  actualizado_en        timestamptz not null default now()
);
alter table public.agente_casos enable row level security;

create table if not exists public.agente_entrenadores (
  usuario_id  uuid primary key references public.usuarios(id) on delete cascade,
  agregado_en timestamptz not null default now()
);
alter table public.agente_entrenadores enable row level security;
revoke all on public.agente_entrenadores from anon, authenticated;

create table if not exists public.agente_ejemplos (
  id                bigint generated always as identity primary key,
  conversacion_id   bigint references public.conversaciones(id) on delete set null,
  mensaje_ids       bigint[] not null default '{}',
  texto_agente      text not null,
  texto_cliente     text,
  respuesta_deseada text not null,
  situacion         text not null,
  escenario         integer,
  estado            text not null default 'activo' check (estado in ('activo', 'desactivado')),
  creado_por        uuid references public.usuarios(id) on delete set null,
  creado_en         timestamptz not null default now(),
  cambiado_por      uuid references public.usuarios(id) on delete set null,
  cambiado_en       timestamptz,
  caso_id           bigint
);
alter table public.agente_ejemplos enable row level security;
revoke all on public.agente_ejemplos from anon, authenticated;
create index if not exists agente_ejemplos_creado_idx on public.agente_ejemplos (creado_en desc);

-- Raquel y Alexandra, por correo. Si alguna no existe en esta base, no pasa nada.
insert into public.agente_entrenadores (usuario_id)
select u.id from public.usuarios u
 where lower(u.correo) in ('raquel@lesarts.com', 'alexandra@lesarts.com')
on conflict do nothing;


-- ¿Puede entrenar quien pregunta? Administradores, o quien esté en la lista.
create or replace function public.puede_entrenar_agente()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_admin() or exists (
    select 1 from public.agente_entrenadores e
      join public.usuarios u on u.id = e.usuario_id
     where e.usuario_id = (select auth.uid()) and u.activo
  );
$$;
revoke execute on function public.puede_entrenar_agente() from public, anon;
grant  execute on function public.puede_entrenar_agente() to authenticated;

-- Para la fila fija del Inbox: si se ve, y lo que dice.
create or replace function public.agente_entrenamiento_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_entrenar_agente() then
    return jsonb_build_object('puede', false);
  end if;
  return jsonb_build_object(
    'puede', true,
    'admin', public.es_admin(),
    'activos', (select count(*) from public.agente_ejemplos where estado = 'activo'),
    'hoy', (select count(*) from public.agente_ejemplos
             where (creado_en at time zone 'America/El_Salvador')::date = (now() at time zone 'America/El_Salvador')::date),
    'ultimo', (select jsonb_build_object('situacion', e.situacion, 'quien', u.nombre, 'en', e.creado_en)
                 from public.agente_ejemplos e left join public.usuarios u on u.id = e.creado_por
                order by e.creado_en desc limit 1)
  );
end $$;
revoke execute on function public.agente_entrenamiento_resumen() from public, anon;
grant  execute on function public.agente_entrenamiento_resumen() to authenticated;

-- Los chats donde contestó Mathieu en los últimos días, con cuántos mensajes suyos.
create or replace function public.agente_entrenamiento_chats(p_dias integer default 7)
returns table (conversacion_id bigint, nombre text, canal text, mensajes_agente integer,
               ultimo timestamptz, con_alerta boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_entrenar_agente() then
    raise exception 'Sin permiso para entrenar al agente.' using errcode = '42501';
  end if;
  return query
    select c.id,
           coalesce(nullif(cl.nombre, ''), nullif(c.nombre_perfil, ''), c.telefono, 'Sin nombre'),
           c.canal,
           count(*) filter (where m.direccion = 'saliente' and not m.privado)::integer,
           max(m.creado_en) filter (where m.direccion = 'saliente' and not m.privado),
           bool_or(m.privado and coalesce(m.origen->>'tipo', '') like 'alerta%')
      from public.mensajes m
      join public.conversaciones c on c.id = m.conversacion_id
      left join public.clientes cl on cl.id = c.cliente_id
     where m.origen ? 'agente_ia'
       and m.creado_en > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 60)))
     group by c.id, cl.nombre, c.nombre_perfil, c.telefono, c.canal
    having count(*) filter (where m.direccion = 'saliente' and not m.privado) > 0
     order by 5 desc
     limit 200;
end $$;
revoke execute on function public.agente_entrenamiento_chats(integer) from public, anon;
grant  execute on function public.agente_entrenamiento_chats(integer) to authenticated;

-- Los mensajes de un chat, para marcar los de Mathieu. Sin notas internas.
create or replace function public.agente_entrenamiento_mensajes(p_conversacion bigint)
returns table (id bigint, direccion text, tipo text, texto text, creado_en timestamptz, de_agente boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_entrenar_agente() then
    raise exception 'Sin permiso para entrenar al agente.' using errcode = '42501';
  end if;
  return query
    select x.id, x.direccion, x.tipo, x.texto, x.creado_en, x.de_agente from (
      select m.id, m.direccion, m.tipo, m.texto, m.creado_en, (m.origen ? 'agente_ia') as de_agente
        from public.mensajes m
       where m.conversacion_id = p_conversacion and not m.privado
       order by m.creado_en desc, m.id desc
       limit 120
    ) x
    order by x.creado_en, x.id;
end $$;
revoke execute on function public.agente_entrenamiento_mensajes(bigint) from public, anon;
grant  execute on function public.agente_entrenamiento_mensajes(bigint) to authenticated;

-- Los escenarios que ya usa Mathieu, para elegir uno al enviar.
create or replace function public.agente_escenarios()
returns table (escenario integer, nombre text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_entrenar_agente() then
    raise exception 'Sin permiso para entrenar al agente.' using errcode = '42501';
  end if;
  return query
    select c.escenario, max(c.escenario_nombre)
      from public.agente_casos c
     group by c.escenario
     order by c.escenario;
end $$;
revoke execute on function public.agente_escenarios() from public, anon;
grant  execute on function public.agente_escenarios() to authenticated;

-- Guardar un cambio: entra a agente_casos al momento, aprobado y activo. Los
-- textos se copian ACÁ, de la base, y no de lo que manda la pantalla: lo que se
-- guarda es exactamente lo que dijo Mathieu.
create or replace function public.agente_ejemplo_enviar(
  p_conversacion bigint,
  p_mensajes     bigint[],
  p_respuesta    text,
  p_situacion    text,
  p_escenario    integer default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agente  text;
  v_cliente text;
  v_primero timestamptz;
  v_n       integer;
  v_esc     integer := coalesce(p_escenario, 11);
  v_nombre  text;
  v_quien   text;
  v_caso    bigint;
  v_id      bigint;
begin
  if not public.puede_entrenar_agente() then
    raise exception 'Sin permiso para entrenar al agente.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_respuesta), '') = '' then
    raise exception 'Escribe cómo quieren que conteste.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_situacion), '') = '' then
    raise exception 'Escribe la situación en pocas palabras.' using errcode = '22023';
  end if;
  if p_mensajes is null or cardinality(p_mensajes) = 0 or cardinality(p_mensajes) > 10 then
    raise exception 'Marca entre 1 y 10 mensajes de Mathieu.' using errcode = '22023';
  end if;

  select count(*), string_agg(coalesce(m.texto, '[' || m.tipo || ']'), E'\n\n' order by m.creado_en, m.id), min(m.creado_en)
    into v_n, v_agente, v_primero
    from public.mensajes m
   where m.id = any (p_mensajes)
     and m.conversacion_id = p_conversacion
     and m.direccion = 'saliente' and not m.privado
     and m.origen ? 'agente_ia';
  if v_n <> cardinality(p_mensajes) then
    raise exception 'Sólo se pueden marcar mensajes de Mathieu de este chat.' using errcode = '22023';
  end if;

  select m.texto into v_cliente
    from public.mensajes m
   where m.conversacion_id = p_conversacion and m.direccion = 'entrante' and not m.privado
     and m.texto is not null and m.creado_en <= v_primero
   order by m.creado_en desc, m.id desc
   limit 1;

  select max(c.escenario_nombre) into v_nombre from public.agente_casos c where c.escenario = v_esc;
  select u.nombre into v_quien from public.usuarios u where u.id = (select auth.uid());

  insert into public.agente_casos (escenario, escenario_nombre, titulo, cliente_ejemplo, respuesta_real,
                                   resultado, respuesta_recomendada, fuente, aprobado_gerencia, activo, orden)
  values (v_esc, coalesce(v_nombre, 'Otra situación / escenario libre'), btrim(p_situacion),
          coalesce(v_cliente, '(sin mensaje del cliente)'), v_agente,
          'Corregido desde el CRM: así NO, mejor como en la respuesta recomendada',
          btrim(p_respuesta),
          'Entrenamiento CRM · ' || coalesce(v_quien, 'equipo') || ' · ' || to_char(now() at time zone 'America/El_Salvador', 'DD/MM/YYYY'),
          true, true, 200)
  returning id into v_caso;

  insert into public.agente_ejemplos (conversacion_id, mensaje_ids, texto_agente, texto_cliente,
                                      respuesta_deseada, situacion, escenario, creado_por, caso_id)
  values (p_conversacion, p_mensajes, v_agente, v_cliente, btrim(p_respuesta), btrim(p_situacion),
          v_esc, (select auth.uid()), v_caso)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.agente_ejemplo_enviar(bigint, bigint[], text, text, integer) from public, anon;
grant  execute on function public.agente_ejemplo_enviar(bigint, bigint[], text, text, integer) to authenticated;

-- Desactivar (o volver a activar) un cambio: Mathieu deja de usarlo.
create or replace function public.agente_ejemplo_activar(p_id bigint, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caso bigint;
begin
  if not public.puede_entrenar_agente() then
    raise exception 'Sin permiso para entrenar al agente.' using errcode = '42501';
  end if;
  update public.agente_ejemplos
     set estado = case when p_activo then 'activo' else 'desactivado' end,
         cambiado_por = (select auth.uid()), cambiado_en = now()
   where id = p_id
  returning caso_id into v_caso;
  if not found then
    raise exception 'Ese cambio ya no existe.' using errcode = '22023';
  end if;
  update public.agente_casos set activo = p_activo, actualizado_en = now() where id = v_caso;
end $$;
revoke execute on function public.agente_ejemplo_activar(bigint, boolean) from public, anon;
grant  execute on function public.agente_ejemplo_activar(bigint, boolean) to authenticated;

-- La lista de cambios: quienes entrenan ven todos (están a cargo juntas).
create or replace function public.agente_ejemplos_lista()
returns table (id bigint, conversacion_id bigint, cliente text, texto_agente text, texto_cliente text,
               respuesta_deseada text, situacion text, escenario integer, estado text,
               creado_por_nombre text, creado_en timestamptz, cambiado_por_nombre text,
               cambiado_en timestamptz, mio boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_entrenar_agente() then
    raise exception 'Sin permiso para entrenar al agente.' using errcode = '42501';
  end if;
  return query
    select e.id, e.conversacion_id,
           coalesce(nullif(cl.nombre, ''), nullif(c.nombre_perfil, ''), c.telefono),
           e.texto_agente, e.texto_cliente, e.respuesta_deseada, e.situacion, e.escenario, e.estado,
           uc.nombre, e.creado_en, ur.nombre, e.cambiado_en,
           e.creado_por = (select auth.uid())
      from public.agente_ejemplos e
      left join public.conversaciones c on c.id = e.conversacion_id
      left join public.clientes cl on cl.id = c.cliente_id
      left join public.usuarios uc on uc.id = e.creado_por
      left join public.usuarios ur on ur.id = e.cambiado_por
     order by e.creado_en desc
     limit 300;
end $$;
revoke execute on function public.agente_ejemplos_lista() from public, anon;
grant  execute on function public.agente_ejemplos_lista() to authenticated;


-- ============================================================================
-- La métrica de Mathieu (Dashboard y sitio de Dirección)
-- ============================================================================
--
-- Para el mes que se mira: mensajes que contestó Mathieu (salientes del agente,
-- no notas internas), chats donde contestó, alertas que dejó al equipo, y los
-- cambios de respuesta que se le hicieron; por semana (lunes a domingo, dentro
-- del mes), los seis meses hasta ese, y los últimos cambios con su texto.
-- Días y semanas en hora de El Salvador.

create or replace function public.agente_metricas_calculo(p_mes date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with lim as (
    select date_trunc('month', p_mes)::date as ini,
           (date_trunc('month', p_mes) + interval '1 month')::date as fin
  ),
  m as (
    select (x.creado_en at time zone 'America/El_Salvador')::date as dia, x.conversacion_id,
           (x.direccion = 'saliente' and not x.privado) as respuesta,
           (x.privado and coalesce(x.origen->>'tipo', '') like 'alerta%') as alerta
      from public.mensajes x
     where x.origen ? 'agente_ia'
       and x.creado_en >= ((select ini from lim) - interval '5 months')::timestamp at time zone 'America/El_Salvador'
       and x.creado_en <  (select fin from lim)::timestamp at time zone 'America/El_Salvador'
  ),
  e as (
    select (y.creado_en at time zone 'America/El_Salvador')::date as dia, y.*
      from public.agente_ejemplos y
     where y.creado_en < (select fin from lim)::timestamp at time zone 'America/El_Salvador'
  )
  select jsonb_build_object(
    'mes', (select ini from lim),
    'mensajes', (select count(*) from m where respuesta and dia >= (select ini from lim)),
    'chats', (select count(distinct conversacion_id) from m where respuesta and dia >= (select ini from lim)),
    'alertas', (select count(*) from m where alerta and dia >= (select ini from lim)),
    'cambios', (select count(*) from e where dia >= (select ini from lim)),
    'cambios_activos', (select count(*) from e where estado = 'activo'),
    'semanas', coalesce((
      select jsonb_agg(jsonb_build_object('lunes', s.lunes, 'mensajes', s.mensajes, 'chats', s.chats, 'cambios', s.cambios) order by s.lunes)
        from (
          select d.lunes,
                 (select count(*) from m where respuesta and m.dia >= greatest(d.lunes, (select ini from lim)) and m.dia < least(d.lunes + 7, (select fin from lim))) as mensajes,
                 (select count(distinct conversacion_id) from m where respuesta and m.dia >= greatest(d.lunes, (select ini from lim)) and m.dia < least(d.lunes + 7, (select fin from lim))) as chats,
                 (select count(*) from e where e.dia >= greatest(d.lunes, (select ini from lim)) and e.dia < least(d.lunes + 7, (select fin from lim))) as cambios
            from (select distinct (g::date - ((extract(isodow from g)::int) - 1)) as lunes
                    from generate_series((select ini from lim), (select fin from lim) - 1, interval '1 day') g) d
        ) s), '[]'::jsonb),
    'meses', coalesce((
      select jsonb_agg(jsonb_build_object('mes', k.mes,
               'mensajes', (select count(*) from m where respuesta and date_trunc('month', m.dia)::date = k.mes),
               'chats', (select count(distinct conversacion_id) from m where respuesta and date_trunc('month', m.dia)::date = k.mes),
               'cambios', (select count(*) from e where date_trunc('month', e.dia)::date = k.mes)) order by k.mes)
        from (select (date_trunc('month', (select ini from lim)) - make_interval(months => i))::date as mes
                from generate_series(0, 5) i) k), '[]'::jsonb),
    'ultimos', coalesce((
      select jsonb_agg(z order by z.en desc) from (
        select e.situacion, e.texto_agente, e.respuesta_deseada, e.estado, e.creado_en as en, u.nombre as quien
          from e left join public.usuarios u on u.id = e.creado_por
         order by e.creado_en desc limit 8) z), '[]'::jsonb)
  );
$$;
revoke execute on function public.agente_metricas_calculo(date) from public, anon, authenticated;

-- Lo ven quienes entrenan (y los administradores) y quien entra al sitio de
-- Dirección. Nadie más.
create or replace function public.agente_metricas(p_mes date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.puede_entrenar_agente() or public.puede_ver_sitio_de_direccion()) then
    raise exception 'Sin permiso para ver la métrica del agente.' using errcode = '42501';
  end if;
  if p_mes is null then
    raise exception 'Falta el mes.' using errcode = '22023';
  end if;
  return public.agente_metricas_calculo(p_mes);
end $$;
revoke execute on function public.agente_metricas(date) from public, anon;
grant  execute on function public.agente_metricas(date) to authenticated;
