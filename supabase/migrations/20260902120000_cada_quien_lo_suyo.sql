begin;

-- Cada asesor ve lo suyo; dirección y quien tenga el permiso, todo.
--
-- Esto es lo que el esquema original dejó anotado para más adelante: «endurecer
-- después (ej. que cada vendedor vea solo sus oportunidades)». Es el momento.
--
-- ------------------------------------------------------------------------
-- EL PROBLEMA DE FONDO, QUE HAY QUE RESOLVER PRIMERO
-- ------------------------------------------------------------------------
--
-- `usuarios` son las cuentas que entran al CRM. `vendedores` es el catálogo al
-- que se le asignan oportunidades. Hasta ahora eran dos tablas sin ninguna
-- columna que las una: la base no tenía manera de saber que quien entró con la
-- cuenta de Alexandra es el vendedor #1, y sin eso no se puede filtrar nada.
--
-- Así que lo primero es el enlace. Se rellena solo comparando correos, que es
-- como están cargados hoy, y queda editable para arreglar los que no coincidan.
--
-- ------------------------------------------------------------------------
-- QUIÉN VE TODO
-- ------------------------------------------------------------------------
--
-- Dos caminos, y son distintos a propósito:
--
--   es_admin   puede todo: crear usuarios, programas, vendedores, y ver todo.
--   ve_todo    ve todas las oportunidades, y nada más. Es para coordinación
--              —alguien que supervisa al equipo— sin darle además la llave de
--              la administración del sistema.
--
-- Se pidió que Katya vea todo. Con un permiso aparte se le puede dar eso sin
-- convertirla en administradora del CRM, que es bastante más de lo que se pidió.
--
-- ------------------------------------------------------------------------
-- QUÉ SE RESTRINGE Y QUÉ NO
-- ------------------------------------------------------------------------
--
-- Se restringe `oportunidades` y todo lo que cuelga de ella. Como `vw_pipeline`
-- es `security_invoker`, cada pantalla que la lee —Pipeline, Clientes,
-- Dashboard, Equipos— queda filtrada sola, sin tocar una línea de la aplicación.
--
-- NO se restringe `clientes`, y esto es una decisión, no un olvido: el aviso de
-- duplicados compara contra todos los contactos cargados. Si un asesor no
-- pudiera leer los de los demás, el CRM dejaría de avisarle que ese teléfono ya
-- es de alguien y dos asesores terminarían trabajando a la misma persona sin
-- enterarse —que es justo lo que este cambio quiere evitar—. La ficha de un
-- cliente ajeno no se llega a abrir igual, porque para abrirla hace falta su
-- oportunidad, y esa sí está filtrada.
--
-- LAS QUE NO TIENEN DUEÑO LAS VE TODO EL MUNDO. Un lead sin vendedor asignado
-- no es de nadie y alguien tiene que levantarlo; esconderlo lo dejaría muerto
-- en la base sin que nadie sepa que está.

-- ------------------------------------------------------------------- enlace

alter table public.vendedores
  add column if not exists usuario_id uuid references auth.users(id) on delete set null;

-- Un usuario es un vendedor, no varios: si dos fichas apuntaran a la misma
-- cuenta, «lo mío» dejaría de tener una respuesta.
create unique index if not exists ux_vendedores_usuario
  on public.vendedores (usuario_id) where usuario_id is not null;

comment on column public.vendedores.usuario_id is
  'La cuenta con la que esta persona entra al CRM. Sin esto no se puede saber qué oportunidades son suyas.';

-- Se rellena por correo, que es lo único que hoy comparten las dos tablas.
-- Sólo donde hay una coincidencia exacta y no ambigua.
update public.vendedores v
   set usuario_id = u.id
  from public.usuarios u
 where v.usuario_id is null
   and v.correo is not null
   and lower(trim(v.correo)) = lower(trim(u.correo))
   and not exists (
     select 1 from public.vendedores otro
      where otro.usuario_id = u.id and otro.id <> v.id
   );

-- --------------------------------------------------------------- permiso

alter table public.roles
  add column if not exists ve_todo boolean not null default false;

comment on column public.roles.ve_todo is
  'Ve todas las oportunidades, no sólo las suyas. Los roles administradores ya lo tienen por ser admin.';

-- --------------------------------------------------------------- funciones

-- SECURITY DEFINER por lo mismo que `es_admin()`: estas funciones se usan
-- dentro de políticas que filtran tablas que ellas mismas tendrían que leer, y
-- eso entra en recursión. Al correr como su creador saltan el RLS y cortan el
-- ciclo.

create or replace function public.ve_todo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.es_admin or r.ve_todo
      from public.usuarios u
      join public.roles r on r.id = u.rol_id
     where u.id = (select auth.uid()) and u.activo
  ), false);
$$;

revoke execute on function public.ve_todo() from anon;

/**
 * Qué vendedor es quien está usando el CRM.
 *
 * Null cuando la cuenta no está enlazada con ninguna ficha de vendedor. Eso no
 * es un error: dirección entra al CRM y no atiende a nadie. Para alguien de
 * ventas sin enlazar sí lo es, y se nota enseguida —no le aparece ninguna
 * oportunidad—, que es preferible a mostrarle las de todos por las dudas.
 */
create or replace function public.mi_vendedor_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select v.id from public.vendedores v where v.usuario_id = (select auth.uid());
$$;

revoke execute on function public.mi_vendedor_id() from anon;

/** ¿Esta oportunidad la puede ver quien está mirando? */
create or replace function public.puede_ver_oportunidad(p_oportunidad bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.ve_todo() or exists (
    select 1 from public.oportunidades o
     where o.id = p_oportunidad
       and (o.vendedor_id is null or o.vendedor_id = public.mi_vendedor_id())
  );
$$;

revoke execute on function public.puede_ver_oportunidad(bigint) from anon;

-- ------------------------------------------------------------- políticas

-- La regla, en una línea: ve todo quien tiene el permiso; el resto ve lo suyo
-- y lo que no es de nadie.
drop policy if exists auth_all_oportunidades on public.oportunidades;

drop policy if exists oportunidades_ver on public.oportunidades;
create policy oportunidades_ver on public.oportunidades
  for select to authenticated
  using (
    public.ve_todo()
    or vendedor_id is null
    or vendedor_id = public.mi_vendedor_id()
  );

-- Crear: cualquiera del equipo. Un asesor da de alta leads todo el día, y el
-- que crea es normalmente el que va a atender.
drop policy if exists oportunidades_crear on public.oportunidades;
create policy oportunidades_crear on public.oportunidades
  for insert to authenticated with check (true);

-- Cambiar: lo que se puede ver.
--
-- OJO CON UNA CONSECUENCIA QUE NO SE ELIGIÓ SINO QUE VIENE DE POSTGRES.
-- Al hacer un `update`, Postgres aplica la política de lectura también a la
-- fila RESULTANTE. Eso quiere decir que un asesor no puede dejar una
-- oportunidad en un estado donde él ya no la vería: puede tomar una que no
-- tiene dueño —queda suya, la sigue viendo— pero NO puede pasársela a otro
-- asesor, porque el resultado sería invisible para él.
--
-- Se deja así en vez de rodearlo. Repartir el trabajo entre el equipo es una
-- decisión de coordinación, no algo que cada quien haga con lo suyo, y con
-- `ve_todo` esas personas sí pueden pasar cualquier oportunidad a cualquiera.
-- Si más adelante hace falta que un asesor entregue un lead, el camino no es
-- abrir la política sino una función que compruebe y lo haga por él.
drop policy if exists oportunidades_editar on public.oportunidades;
create policy oportunidades_editar on public.oportunidades
  for update to authenticated
  using (
    public.ve_todo()
    or vendedor_id is null
    or vendedor_id = public.mi_vendedor_id()
  )
  with check (true);

-- Borrar: sólo dirección. Una oportunidad borrada se lleva sus notas, sus
-- adjuntos y sus eventos por delante.
drop policy if exists oportunidades_borrar on public.oportunidades;
create policy oportunidades_borrar on public.oportunidades
  for delete to authenticated using (public.es_admin());

-- ---------------------------------------------- lo que cuelga de una ficha

-- Las notas siguen a su oportunidad: si no se puede ver la ficha, tampoco lo
-- que se escribió en ella.
drop policy if exists auth_all_oportunidad_notas on public.oportunidad_notas;
drop policy if exists oportunidad_notas_ver on public.oportunidad_notas;
create policy oportunidad_notas_ver on public.oportunidad_notas
  for select to authenticated
  using (public.puede_ver_oportunidad(oportunidad_id));

drop policy if exists oportunidad_notas_escribir on public.oportunidad_notas;
create policy oportunidad_notas_escribir on public.oportunidad_notas
  for insert to authenticated
  with check (public.puede_ver_oportunidad(oportunidad_id));

drop policy if exists oportunidad_notas_borrar on public.oportunidad_notas;
create policy oportunidad_notas_borrar on public.oportunidad_notas
  for delete to authenticated
  using (public.es_admin() or autor_id = (select auth.uid()));

-- Los adjuntos, igual. Acá hay documentos de identidad y comprobantes
-- bancarios: es lo más sensible que guarda el CRM.
do $$
begin
  if to_regclass('public.adjuntos') is not null then
    execute 'drop policy if exists adjuntos_leer on public.adjuntos';
    execute 'create policy adjuntos_leer on public.adjuntos
      for select to authenticated
      using (public.puede_ver_oportunidad(oportunidad_id))';

    execute 'drop policy if exists adjuntos_subir on public.adjuntos';
    execute 'create policy adjuntos_subir on public.adjuntos
      for insert to authenticated
      with check (subido_por = (select auth.uid())
                  and public.puede_ver_oportunidad(oportunidad_id))';
  end if;
end $$;

-- Los eventos del calendario son del vendedor que los atiende.
drop policy if exists auth_all_eventos on public.eventos;
drop policy if exists eventos_ver on public.eventos;
create policy eventos_ver on public.eventos
  for select to authenticated
  using (
    public.ve_todo()
    or vendedor_id is null
    or vendedor_id = public.mi_vendedor_id()
    or public.puede_ver_oportunidad(oportunidad_id)
  );

drop policy if exists eventos_escribir on public.eventos;
create policy eventos_escribir on public.eventos
  for all to authenticated
  using (
    public.ve_todo()
    or vendedor_id is null
    or vendedor_id = public.mi_vendedor_id()
    or public.puede_ver_oportunidad(oportunidad_id)
  )
  with check (true);

-- La bandeja: cada quien atiende sus conversaciones. Las que no tienen dueño
-- las ve todo el mundo, que es de donde se las levanta.
do $$
begin
  if to_regclass('public.conversaciones') is not null then
    execute 'drop policy if exists conversaciones_ver on public.conversaciones';
    execute 'create policy conversaciones_ver on public.conversaciones
      for select to authenticated
      using (public.ve_todo()
             or vendedor_id is null
             or vendedor_id = public.mi_vendedor_id())';

    execute 'drop policy if exists mensajes_ver on public.mensajes';
    execute 'create policy mensajes_ver on public.mensajes
      for select to authenticated
      using (exists (
        select 1 from public.conversaciones c
         where c.id = mensajes.conversacion_id
           and (public.ve_todo()
                or c.vendedor_id is null
                or c.vendedor_id = public.mi_vendedor_id())))';
  end if;
end $$;

commit;
