-- CRM unificado, crm-peñagroup (12/11/2026).
--
-- La misma migración en LAC y en HC: cada marca sigue con su base, y en cada
-- una vive lo suyo.
--
-- 1. «Ver ambas marcas», por rol: quién ve la vista de Dirección con LAC y HC
--    lado a lado (solo lectura). Los administradores la ven siempre.
--
-- 2. Las sesiones por dispositivo. Cada rol ya dice cuántas puede tener
--    abiertas cada persona en computadora, celular y tablet
--    (20261201120000_dispositivos_por_rol). Al entrar a crm-peñagroup se anota
--    la sesión, y si con ella se pasa el límite de ese tipo se cierra la más
--    vieja: esa pantalla se entera en su próxima comprobación (al volver a la
--    pestaña o al minuto) y vuelve al inicio de sesión con el motivo.
--
--    Sólo lo usa crm-peñagroup: los sitios de una sola marca no anotan nada.
--    Todo es aditivo; no se toca ningún dato existente.

begin;

-- ---------------------------------------------------------------------------
-- 1. Ver ambas marcas
-- ---------------------------------------------------------------------------

alter table public.roles
  add column if not exists ve_ambas_marcas boolean not null default false;

comment on column public.roles.ve_ambas_marcas is
  'Ve «Ambas marcas» en crm-peñagroup: la vista de Dirección, de solo lectura. Los administradores la ven siempre.';

-- ---------------------------------------------------------------------------
-- 2. Sesiones por dispositivo
-- ---------------------------------------------------------------------------

create table if not exists public.sesiones_crm (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users (id) on delete cascade,
  tipo          text not null check (tipo in ('computadora', 'celular', 'tablet')),
  -- Una descripción corta para reconocerla en la lista: «Chrome · Windows».
  agente        text check (agente is null or length(agente) <= 120),
  creada_en     timestamptz not null default clock_timestamp(),
  vista_en      timestamptz not null default now(),
  cerrada_en    timestamptz,
  -- 'otro_dispositivo' | 'salio' | 'administrador'
  motivo_cierre text
);

comment on table public.sesiones_crm is
  'Las sesiones de crm-peñagroup por dispositivo, para cumplir el límite de cada rol.';

create index if not exists sesiones_crm_abiertas
  on public.sesiones_crm (usuario_id, tipo, creada_en desc)
  where cerrada_en is null;

alter table public.sesiones_crm enable row level security;

-- Cada quien ve las suyas; administración, todas. Nadie escribe directo: todo
-- pasa por las funciones de abajo.
drop policy if exists sesiones_crm_ver on public.sesiones_crm;
create policy sesiones_crm_ver on public.sesiones_crm
  for select to authenticated
  using (usuario_id = (select auth.uid()) or public.es_admin());

grant select on public.sesiones_crm to authenticated;
revoke insert, update, delete on public.sesiones_crm from anon, authenticated;

/*
 * Anota una sesión nueva y cierra las que sobren de ese tipo.
 *
 * Si el rol no permite ese tipo (por ejemplo, tablet en un rol que tiene 0),
 * la sesión se cuenta como de computadora en vez de dejar a la persona
 * afuera: un iPad sin teclado también es «la computadora» de quien no es de
 * ventas.
 */
create or replace function public.registrar_sesion_crm(p_tipo text, p_agente text default null)
returns table (id uuid, tipo text, cerradas integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tipo   text := p_tipo;
  v_limite integer;
  v_id     uuid;
  v_cerr   integer;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión' using errcode = '28000';
  end if;
  if v_tipo not in ('computadora', 'celular', 'tablet') then
    raise exception 'Tipo de dispositivo desconocido: %', v_tipo using errcode = '22023';
  end if;

  select case v_tipo
           when 'computadora' then r.disp_computadora
           when 'celular'     then r.disp_celular
           else r.disp_tablet
         end
    into v_limite
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
   where u.id = v_uid;

  -- Sin rol cargado: una por tipo, como la mayoría de las áreas.
  v_limite := coalesce(v_limite, case when v_tipo = 'tablet' then 0 else 1 end);

  if v_limite < 1 then
    v_tipo := 'computadora';
    select coalesce((
      select r.disp_computadora from public.usuarios u join public.roles r on r.id = u.rol_id
       where u.id = v_uid), 1)
      into v_limite;
    v_limite := greatest(v_limite, 1);
  end if;

  insert into public.sesiones_crm (usuario_id, tipo, agente)
  values (v_uid, v_tipo, left(p_agente, 120))
  returning sesiones_crm.id into v_id;

  with sobran as (
    select s.id
      from public.sesiones_crm s
     where s.usuario_id = v_uid
       and s.tipo = v_tipo
       and s.cerrada_en is null
     order by s.creada_en desc
    offset v_limite
  )
  update public.sesiones_crm s
     set cerrada_en = now(), motivo_cierre = 'otro_dispositivo'
    from sobran
   where s.id = sobran.id;
  get diagnostics v_cerr = row_count;

  return query select v_id, v_tipo, v_cerr;
end;
$$;

/*
 * ¿Sigue abierta esta sesión? La pantalla pregunta al volver a la pestaña y
 * cada minuto. De paso anota que se vio, para la lista de administración.
 * Devuelve 'abierta', o el motivo del cierre, o 'desconocida'.
 */
create or replace function public.estado_sesion_crm(p_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cerrada timestamptz;
  v_motivo  text;
begin
  select s.cerrada_en, s.motivo_cierre
    into v_cerrada, v_motivo
    from public.sesiones_crm s
   where s.id = p_id and s.usuario_id = (select auth.uid());
  if not found then
    return 'desconocida';
  end if;
  if v_cerrada is not null then
    return coalesce(v_motivo, 'cerrada');
  end if;
  update public.sesiones_crm
     set vista_en = now()
   where id = p_id and vista_en < now() - interval '30 seconds';
  return 'abierta';
end;
$$;

/*
 * Cierra una sesión: la propia (al salir) o, para administración, la de
 * cualquiera (desde Usuarios y Roles).
 */
create or replace function public.cerrar_sesion_crm(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_duenio uuid;
  v_uid    uuid := (select auth.uid());
begin
  select s.usuario_id into v_duenio from public.sesiones_crm s where s.id = p_id;
  if v_duenio is null then
    return false;
  end if;
  if v_duenio <> v_uid and not public.es_admin() then
    raise exception 'Sólo administración puede cerrar la sesión de otra persona' using errcode = '42501';
  end if;
  update public.sesiones_crm
     set cerrada_en = now(),
         motivo_cierre = case when v_duenio = v_uid then 'salio' else 'administrador' end
   where id = p_id and cerrada_en is null;
  return found;
end;
$$;

revoke execute on function public.registrar_sesion_crm(text, text) from public, anon;
revoke execute on function public.estado_sesion_crm(uuid) from public, anon;
revoke execute on function public.cerrar_sesion_crm(uuid) from public, anon;
grant execute on function public.registrar_sesion_crm(text, text) to authenticated;
grant execute on function public.estado_sesion_crm(uuid) to authenticated;
grant execute on function public.cerrar_sesion_crm(uuid) to authenticated;

commit;
