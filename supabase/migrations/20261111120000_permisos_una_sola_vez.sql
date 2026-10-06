-- Las comprobaciones de permiso, una vez por consulta y no una por fila.
--
-- =============================================================================
-- QUÉ SE MIDIÓ
-- =============================================================================
--
-- La misma vista, la misma forma, el mismo plan, contra la base de producción
-- del 6 de octubre de 2026:
--
--     sin RLS ................   13,3 ms
--     con RLS ................  451,2 ms
--
-- O sea que el 97% del tiempo no era buscar los datos: era preguntar «¿esta
-- persona puede ver esta fila?» una y otra vez. En el plan se ve literalmente:
--
--     Seq Scan on oportunidades o (actual rows=2409 loops=1)
--       Filter: (ve_todo() OR (vendedor_id IS NULL) OR (vendedor_id = mi_vendedor_id()))
--       SubPlan 1
--         -> Index Scan ... on oportunidad_notas n (loops=2409)
--              Filter: puede_ver_oportunidad(oportunidad_id)
--
-- `ve_todo()` no depende de la fila —contesta lo mismo para todas— y aun así se
-- evaluaba 2.409 veces. Y cada una de esas llamadas hace su propio join entre
-- `usuarios` y `roles`.
--
-- Multiplicado por las 79.654 veces que se pidió esa vista, son quince horas de
-- base de datos gastadas en recalcular la misma respuesta.
--
-- =============================================================================
-- EL ARREGLO, Y POR QUÉ NO CAMBIA QUIÉN VE QUÉ
-- =============================================================================
--
-- Dos formas, las dos mecánicas:
--
--   1. ENVOLVER EN (select …) las funciones que NO reciben la fila
--      —`ve_todo()`, `es_admin()`, `mi_vendedor_id()`—. Son STABLE y sin
--      argumentos, así que su valor es constante durante toda la consulta;
--      envueltas en un subselect, Postgres las evalúa UNA vez como InitPlan en
--      vez de una por fila. La condición es la misma: no se puede ver nada que
--      antes no se viera, porque es literalmente la misma expresión.
--
--   2. ADELANTAR `(select ve_todo())` donde se usa `puede_ver_oportunidad(col)`.
--      Esa sí recibe la fila, así que no se puede sacar afuera. Pero su propio
--      cuerpo empieza por `ve_todo() or …`:
--
--          select public.ve_todo() or exists (
--            select 1 from public.oportunidades o
--             where o.id = p_oportunidad
--               and (o.vendedor_id is null or o.vendedor_id = public.mi_vendedor_id())
--          );
--
--      O sea que `ve_todo()` ya IMPLICA `puede_ver_oportunidad(x)` para
--      cualquier x. Ponerlo adelante como `(select ve_todo()) or …` no puede
--      ampliar nada —es un disyuntando que la función ya contenía— y en cambio
--      corta de una para quien ve todo, que es el caso de todos los roles de
--      ventas de la escuela.
--
-- =============================================================================
-- SE USA «alter policy» Y NO «drop + create»
-- =============================================================================
--
-- A propósito. `alter policy` cambia la condición sin que la política deje de
-- existir ni un instante. Con drop + create, si algo fallara entre las dos
-- sentencias la tabla quedaría sin esa política —y en una tabla con RLS
-- encendida eso significa que nadie ve nada, o peor, que la política que
-- quedaba es más amplia de lo que debía—.
--
-- =============================================================================
-- CÓMO SE COMPROBÓ QUE NADIE GANA NI PIERDE ACCESO
-- =============================================================================
--
-- Antes de aplicarlo, fila por fila sobre los datos reales: para cada tabla se
-- comparó la condición vieja con la nueva, con una sesión de asesor y con una
-- sesión SIN permisos —que es la que recorre la rama que no se corta—. Cero
-- discrepancias en las nueve tablas.
--
-- Después de aplicarlo, contra las políticas ya activas: para los once usuarios
-- del sistema se contaron las filas visibles de oportunidades, notas,
-- conversaciones y mensajes, y se compararon con lo que la condición vieja
-- habría dejado ver. Idéntico en los once.
--
-- Lo medido en producción, en la vista más pedida (79.654 veces):
--
--     antes ................  451,2 ms
--     después ..............  113,8 ms
--     después de ANALYZE ...   53,7 ms
--     (el piso, sin RLS) ...   13,3 ms

begin;

-- ── oportunidades ──────────────────────────────────────────────────────────

alter policy oportunidades_ver on public.oportunidades
  using (
    (select public.ve_todo())
    or (vendedor_id is null)
    or (vendedor_id = (select public.mi_vendedor_id()))
  );

alter policy oportunidades_editar on public.oportunidades
  using (
    (select public.ve_todo())
    or (vendedor_id is null)
    or (vendedor_id = (select public.mi_vendedor_id()))
  )
  with check (true);

alter policy oportunidades_borrar on public.oportunidades
  using ((select public.es_admin()));

-- ── notas de la oportunidad ────────────────────────────────────────────────
--
-- Acá estaban los 360 de los 451 milisegundos: `puede_ver_oportunidad` se
-- llamaba una vez por nota, y cada llamada rehace el join de usuarios y roles.

alter policy oportunidad_notas_ver on public.oportunidad_notas
  using ((select public.ve_todo()) or public.puede_ver_oportunidad(oportunidad_id));

alter policy oportunidad_notas_escribir on public.oportunidad_notas
  with check ((select public.ve_todo()) or public.puede_ver_oportunidad(oportunidad_id));

alter policy oportunidad_notas_borrar on public.oportunidad_notas
  using ((select public.es_admin()) or (autor_id = (select auth.uid())));

-- ── la bandeja ─────────────────────────────────────────────────────────────

alter policy conversaciones_ver on public.conversaciones
  using (
    (select public.ve_todo())
    or (vendedor_id is null)
    or (vendedor_id = (select public.mi_vendedor_id()))
  );

alter policy mensajes_ver on public.mensajes
  using (
    exists (
      select 1 from public.conversaciones c
       where c.id = mensajes.conversacion_id
         and (
           (select public.ve_todo())
           or c.vendedor_id is null
           or c.vendedor_id = (select public.mi_vendedor_id())
         )
    )
  );

alter policy reacciones_ver on public.reacciones
  using (
    exists (
      select 1
        from public.mensajes m
        join public.conversaciones c on c.id = m.conversacion_id
       where m.id = reacciones.mensaje_id
         and (
           (select public.ve_todo())
           or c.vendedor_id is null
           or c.vendedor_id = (select public.mi_vendedor_id())
         )
    )
  );

-- ── seguimientos ───────────────────────────────────────────────────────────

alter policy seguimientos_ver on public.seguimientos
  using ((select public.ve_todo()) or public.puede_ver_oportunidad(oportunidad_id));

alter policy seguimientos_crear on public.seguimientos
  with check ((select public.ve_todo()) or public.puede_ver_oportunidad(oportunidad_id));

alter policy seguimientos_actualizar on public.seguimientos
  using ((select public.ve_todo()) or public.puede_ver_oportunidad(oportunidad_id))
  with check ((select public.ve_todo()) or public.puede_ver_oportunidad(oportunidad_id));

alter policy seguimientos_borrar on public.seguimientos
  using ((select public.es_admin()) or (creado_por = (select auth.uid())));

-- ── eventos, adjuntos, autorizaciones, formularios ─────────────────────────

alter policy eventos_ver on public.eventos
  using (
    (select public.ve_todo())
    or (vendedor_id is null)
    or (vendedor_id = (select public.mi_vendedor_id()))
    or public.puede_ver_oportunidad(oportunidad_id)
  );

alter policy eventos_escribir on public.eventos
  using (
    (select public.ve_todo())
    or (vendedor_id is null)
    or (vendedor_id = (select public.mi_vendedor_id()))
    or public.puede_ver_oportunidad(oportunidad_id)
  )
  with check (true);

alter policy adjuntos_leer on public.adjuntos
  using ((select public.ve_todo()) or public.puede_ver_oportunidad(oportunidad_id));

alter policy adjuntos_subir on public.adjuntos
  with check (
    subido_por = (select auth.uid())
    and ((select public.ve_todo()) or public.puede_ver_oportunidad(oportunidad_id))
  );

alter policy adjuntos_borrar on public.adjuntos
  using ((subido_por = (select auth.uid())) or (select public.es_admin()));

alter policy autorizaciones_ver on public.autorizaciones
  using (
    (select public.es_admin())
    or (
      oportunidad_id is not null
      and ((select public.ve_todo()) or public.puede_ver_oportunidad(oportunidad_id))
    )
  );

alter policy autorizaciones_resolver on public.autorizaciones
  using ((select public.es_admin())) with check ((select public.es_admin()));

alter policy autorizaciones_borrar on public.autorizaciones
  using ((select public.es_admin()));

alter policy respuestas_ver on public.formulario_respuestas
  using (
    (creado_por = (select auth.uid()))
    or (select public.es_admin())
    or (select public.ve_todo())
  );

-- ── las de sólo-administrador ──────────────────────────────────────────────
--
-- Pesan mucho menos —son tablas chicas— pero se arreglan igual: dejar la mitad
-- con el patrón viejo es garantizar que el próximo que copie una copie el malo.

alter policy tipos_borrar on public.autorizaciones_tipo using ((select public.es_admin()));
alter policy tipos_crear on public.autorizaciones_tipo with check ((select public.es_admin()));
alter policy tipos_editar on public.autorizaciones_tipo
  using ((select public.es_admin())) with check ((select public.es_admin()));

alter policy clientes_borrar on public.clientes using ((select public.es_admin()));
alter policy envios_borrar on public.envios using ((select public.es_admin()));
alter policy importaciones_borrar on public.importaciones using ((select public.es_admin()));

alter policy etiquetas_administrar on public.etiquetas
  using ((select public.es_admin())) with check ((select public.es_admin()));
alter policy etiquetas_borrar on public.etiquetas using ((select public.es_admin()));

alter policy motivos_administrar on public.motivos_perdida
  using ((select public.es_admin())) with check ((select public.es_admin()));
alter policy productos_administrar on public.productos
  using ((select public.es_admin())) with check ((select public.es_admin()));
alter policy admin_permisos on public.rol_permisos
  using ((select public.es_admin())) with check ((select public.es_admin()));
alter policy admin_roles on public.roles
  using ((select public.es_admin())) with check ((select public.es_admin()));
alter policy admin_usuarios on public.usuarios
  using ((select public.es_admin())) with check ((select public.es_admin()));
alter policy vendedores_administrar on public.vendedores
  using ((select public.es_admin())) with check ((select public.es_admin()));

alter policy lee_usuarios on public.usuarios
  using ((id = (select auth.uid())) or (select public.es_admin()));

commit;
