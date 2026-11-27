-- ============================================================================
-- Entrenamiento de Mathieu desde el CRM
-- ============================================================================
--
-- Pedido el 27/11/2026 (LAC). Un chat fijo en el Inbox, «Entrenamiento
-- Mathieu», donde Raquel y Alexandra eligen un lead que Mathieu contestó, marcan
-- el mensaje que no les gustó y escriben cómo quieren que conteste. Dirección
-- (los administradores) lo aprueba, y al aprobarlo pasa a `agente_casos`, que
-- es lo que Mathieu ya consulta antes de responder.
--
-- Piezas:
--   · agente_entrenadores — quién puede entrenar, por persona y no por rol:
--     Raquel comparte rol con Eduardo y el pedido fue sólo para ellas dos.
--     Los administradores pueden siempre (y son quienes aprueban).
--   · agente_ejemplos — cada ejemplo enviado, con el mensaje de Mathieu copiado
--     tal cual (no un enlace: si el chat se borra, el ejemplo sigue diciendo lo
--     mismo), lo que había escrito el cliente antes, y la respuesta deseada.
--   · funciones con SECURITY DEFINER para todo: las tablas no se abren a las
--     sesiones. Así quien entrena ve los chats donde contestó Mathieu aunque no
--     sean suyos, pero sólo lo que hace falta para elegir el mensaje.
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
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'aprobado', 'devuelto', 'descartado')),
  creado_por        uuid references public.usuarios(id) on delete set null,
  creado_en         timestamptz not null default now(),
  revisado_por      uuid references public.usuarios(id) on delete set null,
  revisado_en       timestamptz,
  nota_revision     text,
  caso_id           bigint
);
alter table public.agente_ejemplos enable row level security;
revoke all on public.agente_ejemplos from anon, authenticated;
create index if not exists agente_ejemplos_estado_idx on public.agente_ejemplos (estado, creado_en desc);

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

-- Para la fila fija del Inbox: si se ve, y el número que lleva.
create or replace function public.agente_entrenamiento_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.es_admin();
begin
  if not public.puede_entrenar_agente() then
    return jsonb_build_object('puede', false);
  end if;
  return jsonb_build_object(
    'puede', true,
    'admin', v_admin,
    'por_aprobar', (select count(*) from public.agente_ejemplos where estado = 'pendiente'),
    'mios_pendientes', (select count(*) from public.agente_ejemplos where estado = 'pendiente' and creado_por = (select auth.uid())),
    'mios_devueltos', (select count(*) from public.agente_ejemplos where estado = 'devuelto' and creado_por = (select auth.uid())
                         and revisado_en > now() - interval '14 days'),
    'ultimo', (select jsonb_build_object('estado', e.estado, 'situacion', e.situacion, 'quien', u.nombre, 'en', e.creado_en)
                 from public.agente_ejemplos e left join public.usuarios u on u.id = e.creado_por
                where v_admin or e.creado_por = (select auth.uid())
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

-- Los escenarios que ya usa Mathieu, para elegir uno al enviar o aprobar.
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

-- Enviar un ejemplo. Los textos se copian ACÁ, de la base, y no de lo que
-- manda la pantalla: lo que se aprueba es exactamente lo que dijo Mathieu.
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

  insert into public.agente_ejemplos (conversacion_id, mensaje_ids, texto_agente, texto_cliente,
                                      respuesta_deseada, situacion, escenario, creado_por)
  values (p_conversacion, p_mensajes, v_agente, v_cliente, btrim(p_respuesta), btrim(p_situacion),
          p_escenario, (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.agente_ejemplo_enviar(bigint, bigint[], text, text, integer) from public, anon;
grant  execute on function public.agente_ejemplo_enviar(bigint, bigint[], text, text, integer) to authenticated;

-- La lista: los administradores ven todos; quien entrena, los suyos.
create or replace function public.agente_ejemplos_lista()
returns table (id bigint, conversacion_id bigint, cliente text, texto_agente text, texto_cliente text,
               respuesta_deseada text, situacion text, escenario integer, estado text,
               creado_por_nombre text, creado_en timestamptz, revisado_por_nombre text,
               revisado_en timestamptz, nota_revision text, mio boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.es_admin();
begin
  if not public.puede_entrenar_agente() then
    raise exception 'Sin permiso para entrenar al agente.' using errcode = '42501';
  end if;
  return query
    select e.id, e.conversacion_id,
           coalesce(nullif(cl.nombre, ''), nullif(c.nombre_perfil, ''), c.telefono),
           e.texto_agente, e.texto_cliente, e.respuesta_deseada, e.situacion, e.escenario, e.estado,
           uc.nombre, e.creado_en, ur.nombre, e.revisado_en, e.nota_revision,
           e.creado_por = (select auth.uid())
      from public.agente_ejemplos e
      left join public.conversaciones c on c.id = e.conversacion_id
      left join public.clientes cl on cl.id = c.cliente_id
      left join public.usuarios uc on uc.id = e.creado_por
      left join public.usuarios ur on ur.id = e.revisado_por
     where v_admin or e.creado_por = (select auth.uid())
     order by (e.estado = 'pendiente') desc, e.creado_en desc
     limit 300;
end $$;
revoke execute on function public.agente_ejemplos_lista() from public, anon;
grant  execute on function public.agente_ejemplos_lista() to authenticated;

-- Revisar: sólo administradores. Al aprobar, el ejemplo entra a agente_casos
-- (aprobado y activo) y Mathieu lo usa desde el siguiente mensaje.
create or replace function public.agente_ejemplo_revisar(
  p_id        bigint,
  p_accion    text,
  p_respuesta text default null,
  p_situacion text default null,
  p_escenario integer default null,
  p_nota      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e        public.agente_ejemplos%rowtype;
  v_esc    integer;
  v_nombre text;
  v_quien  text;
  v_caso   bigint;
begin
  if not public.es_admin() then
    raise exception 'Sólo Dirección puede aprobar los ejemplos.' using errcode = '42501';
  end if;
  if p_accion not in ('aprobar', 'devolver', 'descartar') then
    raise exception 'Acción no válida.' using errcode = '22023';
  end if;

  select * into e from public.agente_ejemplos where id = p_id for update;
  if not found then
    raise exception 'Ese ejemplo ya no existe.' using errcode = '22023';
  end if;
  if e.estado not in ('pendiente', 'devuelto') then
    raise exception 'Ese ejemplo ya fue revisado.' using errcode = '22023';
  end if;

  if p_accion = 'devolver' and coalesce(btrim(p_nota), '') = '' then
    raise exception 'Escribe qué hay que cambiar para devolverlo.' using errcode = '22023';
  end if;

  if p_accion = 'aprobar' then
    e.respuesta_deseada := coalesce(nullif(btrim(p_respuesta), ''), e.respuesta_deseada);
    e.situacion := coalesce(nullif(btrim(p_situacion), ''), e.situacion);
    v_esc := coalesce(p_escenario, e.escenario, 11);
    select max(c.escenario_nombre) into v_nombre from public.agente_casos c where c.escenario = v_esc;
    select u.nombre into v_quien from public.usuarios u where u.id = e.creado_por;

    insert into public.agente_casos (escenario, escenario_nombre, titulo, cliente_ejemplo, respuesta_real,
                                     resultado, respuesta_recomendada, fuente, aprobado_gerencia, activo, orden)
    values (v_esc, coalesce(v_nombre, 'Otra situación / escenario libre'), e.situacion,
            coalesce(e.texto_cliente, '(sin mensaje del cliente)'), e.texto_agente,
            'Corregido desde el CRM: así NO, mejor como en la respuesta recomendada',
            e.respuesta_deseada,
            'Entrenamiento CRM · ' || coalesce(v_quien, 'equipo') || ' · ' || to_char(now() at time zone 'America/El_Salvador', 'DD/MM/YYYY'),
            true, true, 200)
    returning id into v_caso;

    update public.agente_ejemplos
       set estado = 'aprobado', respuesta_deseada = e.respuesta_deseada, situacion = e.situacion,
           escenario = v_esc, revisado_por = (select auth.uid()), revisado_en = now(),
           nota_revision = nullif(btrim(p_nota), ''), caso_id = v_caso
     where id = p_id;
  else
    update public.agente_ejemplos
       set estado = case p_accion when 'devolver' then 'devuelto' else 'descartado' end,
           revisado_por = (select auth.uid()), revisado_en = now(),
           nota_revision = nullif(btrim(p_nota), '')
     where id = p_id;
  end if;

  return jsonb_build_object('ok', true, 'caso_id', v_caso);
end $$;
revoke execute on function public.agente_ejemplo_revisar(bigint, text, text, text, integer, text) from public, anon;
grant  execute on function public.agente_ejemplo_revisar(bigint, text, text, text, integer, text) to authenticated;
