begin;

-- ============================================================================
-- Que todo el equipo vea lo que hace todo el equipo
-- ============================================================================
--
-- Lo que pidió la escuela: «quiero que salgan todas las notificaciones de
-- todos los roles y usuarios para que todos estén enterados de cada acción que
-- se hace en el CRM».
--
-- ----------------------------------------------------------------------------
-- POR QUÉ EL MÓDULO SE VEÍA VACÍO
-- ----------------------------------------------------------------------------
--
-- La política decía:
--
--     using (actor_id = auth.uid() or public.es_admin())
--
-- O sea: cada quien veía SÓLO lo que había hecho ella misma, y dirección veía
-- todo. Para una asesora, «Notificaciones» era el registro de sus propios
-- movimientos —algo que ya sabe— y nunca decía nada del equipo.
--
-- Y había una consecuencia peor, que explica por qué el globito no aparecía
-- nunca: el contador de «sin ver» excluye a propósito lo que hizo uno mismo
-- —nadie necesita un aviso rojo de lo que acaba de hacer—. Con la política
-- vieja, las dos condiciones se anulaban:
--
--     lo que puedo ver   = lo que hice yo
--     lo que se cuenta   = lo que NO hice yo
--     -------------------------------------
--     resultado          = 0, siempre, para todo el que no sea dirección
--
-- No era que faltara dibujar el globito: era que el número era cero por
-- construcción. Cualquier globito que se hubiera agregado habría estado
-- apagado igual.
--
-- ----------------------------------------------------------------------------
-- QUÉ SE ABRE, Y QUÉ NO
-- ----------------------------------------------------------------------------
--
-- Se abre la LECTURA del registro: quién hizo qué y cuándo. Eso es lo que la
-- escuela pidió y es lo que hace que un equipo se entere de lo que pasa.
--
-- NO se abre nada más, y conviene dejarlo dicho:
--
--   No se puede escribir.   No hay política de insert, update ni delete, y
--                           sigue sin haberla. Las filas las pone el
--                           disparador, que corre como `security definer`. Un
--                           registro que se puede editar no sirve para
--                           controlar nada.
--
--   No se abren los leads.  El nombre del cliente y el código no salen de esta
--                           tabla: la pantalla los busca en `vw_pipeline`, que
--                           es `security_invoker` y sigue filtrando por
--                           vendedor. Así que una asesora se entera de que
--                           «Katya editó un lead» sin ver de quién es el lead.
--                           El aislamiento del pipeline que se pidió antes
--                           queda intacto.
--
-- Es un cambio de visibilidad hacia adentro del equipo, pedido por la
-- dirección de la escuela. Se puede volver atrás con una sola sentencia: está
-- escrita al pie de este archivo, comentada.
--
-- Se puede correr con gente trabajando, y dos veces.

drop policy if exists actividad_leer on public.actividad;

create policy actividad_leer on public.actividad
  for select to authenticated
  using (true);

comment on table public.actividad is
  'Qué hizo cada quien. Lo lee todo el equipo; lo escribe sólo el disparador.';

-- ------------------------------------------------- y quién hizo cada cosa
--
-- Abrir el registro sin esto deja un feed que dice «Una integración editó un
-- lead» para todo lo que hace el equipo: los nombres salen de `usuarios`, cuya
-- política deja ver sólo la fila propia. Es peor que no mostrar nada, porque
-- además miente: dice que fue un robot cuando fue una persona.
--
-- POR QUÉ UNA FUNCIÓN Y NO ABRIR LA TABLA
--
-- Porque `usuarios` tiene el correo y el rol de cada quien, y para poner un
-- nombre en un aviso no hace falta ninguna de las dos cosas. Esto devuelve
-- `id` y `nombre`, nada más. Abrir la tabla entera habría sido repartir los
-- correos del equipo para arreglar una etiqueta.
--
-- Sin nombre cargado devuelve la parte del correo anterior a la arroba: peor
-- que un nombre, mucho mejor que un identificador que no le dice nada a nadie
-- —y sin repartir la dirección completa—.

create or replace function public.nombres_del_equipo(p_ids uuid[])
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         coalesce(nullif(btrim(u.nombre), ''), split_part(u.correo, '@', 1), '')
    from public.usuarios u
   where u.id = any(p_ids)
$$;

comment on function public.nombres_del_equipo(uuid[]) is
  'Nombre de cada persona del equipo, para poner en los avisos. Sólo id y nombre.';

revoke execute on function public.nombres_del_equipo(uuid[]) from anon;
grant  execute on function public.nombres_del_equipo(uuid[]) to authenticated;

commit;

/*
 * PARA VOLVER ATRÁS, si algún día se quiere que cada quien vea sólo lo suyo:
 *
 *   drop policy if exists actividad_leer on public.actividad;
 *   create policy actividad_leer on public.actividad
 *     for select to authenticated
 *     using (actor_id = (select auth.uid()) or public.es_admin());
 */

-- ------------------------------------------------------------- cómo quedó

select
  case when exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'actividad'
       and policyname = 'actividad_leer'
       and qual = 'true'
  ) then '✓ todo el equipo ve la actividad' else '· falta' end as lectura,
  case when not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'actividad'
       and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ) then '✓ y nadie la puede escribir a mano' else '⚠ REVISAR' end as escritura,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'nombres_del_equipo'
  ) then '✓ y se sabe quién hizo cada cosa' else '· falta' end     as nombres,
  (select count(*) from public.actividad)                          as movimientos,
  (select count(*) from public.actividad
    where creado_en > now() - interval '7 days')                   as en_la_semana;
