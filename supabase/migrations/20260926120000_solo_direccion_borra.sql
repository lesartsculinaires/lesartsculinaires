begin;

-- Borrar un lead, sólo dirección. Y borrar un contacto, también.
--
-- ------------------------------------------------------------------------
-- LO QUE FALTABA
-- ------------------------------------------------------------------------
--
-- La regla ya estaba puesta sobre `oportunidades`: borrar un lead pide
-- `es_admin()`, y una asesora que lo intenta no borra nada. Eso funciona.
--
-- Lo que quedaba abierto era el camino de al lado. `clientes` tenía una sola
-- política, `auth_all_clientes`, para TODAS las operaciones y con la condición
-- `true`: cualquiera con sesión podía borrar un contacto. Y `oportunidades`
-- apunta a `clientes` con `on delete cascade`, así que borrar el contacto se
-- lleva puestos todos sus leads —con su bitácora, sus adjuntos y sus pagos—
-- sin que la política de `oportunidades` tenga nada que decir: una cascada no
-- pasa por RLS.
--
-- Comprobado en el banco antes de escribir esto: una asesora no puede borrar
-- un lead de $5.000, pero sí podía borrar a su dueño y llevárselo igual.
--
-- ------------------------------------------------------------------------
-- POR QUÉ CUATRO POLÍTICAS EN VEZ DE UNA
-- ------------------------------------------------------------------------
--
-- Porque `for all` mete las cuatro operaciones en la misma bolsa, y no son lo
-- mismo: ver, crear y corregir un contacto es el trabajo diario de cualquier
-- asesora, y borrarlo no se deshace. Separarlas deja decir eso.
--
-- Ver, crear y editar quedan como estaban —cualquiera con sesión— así que
-- nadie va a notar el cambio salvo quien intente borrar.
--
-- ------------------------------------------------------------------------
-- LO QUE SIGUE PUDIENDO UNA ASESORA
-- ------------------------------------------------------------------------
--
-- Todo lo demás. Marcar un lead como perdido, archivar la conversación,
-- cambiarle la etapa, corregir el teléfono. Lo que ya no puede es hacer
-- desaparecer el registro, que es distinto de cerrarlo.
--
-- El botón «No era lead» de la bandeja también borraba, así que a partir de
-- ahora, en manos de una asesora, archiva la conversación y avisa que el lead
-- lo tiene que borrar dirección. Eso está del lado de la aplicación.
--
-- Se puede correr con gente trabajando, y dos veces.

drop policy if exists auth_all_clientes on public.clientes;
drop policy if exists clientes_ver      on public.clientes;
drop policy if exists clientes_crear    on public.clientes;
drop policy if exists clientes_editar   on public.clientes;
drop policy if exists clientes_borrar   on public.clientes;

-- Ver: todo el equipo. Qué oportunidades ve cada quien lo decide la política
-- de `oportunidades`; una ficha sin leads visibles no se alcanza desde ninguna
-- pantalla, así que filtrar acá además sería repetir la regla en dos lugares.
create policy clientes_ver on public.clientes
  for select to authenticated using (true);

-- Crear: todo el equipo. Dar de alta un contacto es el trabajo.
create policy clientes_crear on public.clientes
  for insert to authenticated with check (true);

-- Editar: todo el equipo. Corregir un teléfono mal tipeado no puede depender
-- de que esté la dirección.
create policy clientes_editar on public.clientes
  for update to authenticated using (true) with check (true);

-- Borrar: sólo dirección. Es la línea que cierra la cascada.
create policy clientes_borrar on public.clientes
  for delete to authenticated using (public.es_admin());

commit;

-- Cómo quedó: quién puede hacer qué sobre las dos tablas.
select
  tablename                        as tabla,
  cmd                              as operacion,
  case
    when qual = 'es_admin()' then 'sólo dirección'
    when qual = 'true'       then 'todo el equipo'
    else coalesce(qual, 'todo el equipo')
  end                              as quien
  from pg_policies
 where schemaname = 'public'
   and tablename in ('clientes', 'oportunidades')
 order by tablename, case cmd when 'SELECT' then 1 when 'INSERT' then 2
                              when 'UPDATE' then 3 else 4 end;
