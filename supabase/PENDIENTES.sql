-- Migraciones pendientes de Les Arts Culinaires, todas juntas.
--
-- Generado por scripts/armar-pendientes.mjs. No editar a mano: los
-- originales están en supabase/migrations/ y este archivo sale de ellos.
--
-- Va todo en una sola transacción: si algo falla no queda nada a medias.
-- Las cinco se pueden correr dos veces sin romper nada, así que si hay que
-- arreglar algo y volver a pegarlo, se puede.
--
-- Contiene, en orden:
--   1. 20260824120000_reserva.sql
--   2. 20260825120000_actividad_enlaces.sql
--   3. 20260826120000_cursos_realizados.sql
--   4. 20260827120000_catalogo_programas.sql
--   5. 20260828120000_catalogo_vendedores.sql

begin;

-- --------------------------------------------------------------------------
-- 20260824120000_reserva.sql
-- --------------------------------------------------------------------------

-- Reserva: lo que el cliente dejó para apartar el cupo.
--
-- QUÉ PASA CON LAS MÉTRICAS, que es lo que se preguntó.
--
-- Todo el dinero que muestra el CRM sale hoy de dos columnas:
--
--   valor_oportunidad  → el pipeline abierto (Dashboard, Clientes, Equipos,
--                        Programas) y el orden de las barras por grupo.
--   venta_cerrada      → el total cerrado y el cerrado del mes.
--
-- `reserva` NO entra en ninguna de las dos, y no es un olvido. La reserva es
-- una parte del valor que ya se pagó, no plata aparte: en una inscripción de
-- $495 con $100 de reserva, el negocio sigue valiendo $495. Sumarla a lo
-- cerrado contaría dos veces los mismos $100 el día que la venta se cierre por
-- el total.
--
-- Y hay algo que conviene decir al revés: esta columna no agrega un riesgo,
-- saca uno que ya existía. Sin un lugar donde anotar el anticipo, lo que hace
-- el asesor es escribirlo en «Venta cerrada» —es la única casilla de dinero
-- recibido que hay—, y eso sí ensucia las métricas por partida doble: infla el
-- cerrado mientras la venta sigue abierta, y si después se cierra por $495 hay
-- que elegir entre perder el registro del anticipo o dejar el cerrado en $100.
--
-- Sólo agrega una columna opcional y rearma una vista. Se puede correr con
-- gente trabajando.

alter table public.oportunidades
  add column if not exists reserva numeric(12,2);

comment on column public.oportunidades.reserva is
  'Anticipo con el que el cliente apartó el cupo. Es parte de valor_oportunidad, '
  'no dinero adicional: no se suma al pipeline ni al total cerrado.';

-- Un negativo acá no es un anticipo, es un error de tecleo. No se pone tope
-- superior contra `valor_oportunidad` a propósito: los dos campos se llenan en
-- momentos distintos, y una restricción entre ellos haría fallar el guardado
-- de la reserva sólo porque el valor todavía está vacío. Cuando la reserva
-- supera al valor, la ficha lo avisa en pantalla, que es donde alguien puede
-- decidir cuál de los dos está mal.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oportunidades_reserva_valida') then
    alter table public.oportunidades
      add constraint oportunidades_reserva_valida check (reserva is null or reserva >= 0);
  end if;
end $$;

-- --------------------------------------------------------------- vw_pipeline
--
-- La vista se arma en tiempo de ejecución preguntando qué columnas existen:
-- `importacion_id` la agrega la migración de Bases, que puede no haberse
-- corrido, y escribirla fija haría fallar este archivo en una base al día en
-- todo lo demás.
do $$
declare
  opcionales text := '';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'oportunidades'
      and column_name = 'importacion_id'
  ) then
    opcionales := ', o.importacion_id';
  else
    raise notice 'esta base todavía no tiene importacion_id; la vista se arma sin esa columna';
  end if;

  drop view if exists public.vw_pipeline;

  execute format($vista$
    create view public.vw_pipeline as
    select o.id, o.codigo, o.fecha_registro, o.fecha_cierre,
           date_trunc('month', o.fecha_registro)::date as mes,
           o.cliente_id, c.nombre as cliente, c.telefono, c.correo,
           o.vendedor_id,   v.nombre  as vendedor,
           o.producto_id,   p.nombre  as producto, p.categoria,
           o.territorio_id, t.nombre  as territorio,
           o.canal_id,      ca.nombre as canal,
           o.etapa_id,      e.nombre  as etapa, e.orden as etapa_orden,
           o.estado_id,     s.nombre  as estado, s.es_final,
           o.valor_oportunidad, o.venta_cerrada, o.reserva, o.descuento_promocion,
           o.created_at%s,
           c.edad,
           c.responsable_nombre,
           c.responsable_telefono,
           c.responsable_correo
    from public.oportunidades o
    join public.clientes c   on c.id = o.cliente_id
    left join public.vendedores  v  on v.id  = o.vendedor_id
    left join public.productos   p  on p.id  = o.producto_id
    left join public.territorios t  on t.id  = o.territorio_id
    left join public.canales     ca on ca.id = o.canal_id
    left join public.etapas      e  on e.id  = o.etapa_id
    left join public.estados     s  on s.id  = o.estado_id
  $vista$, opcionales);

  execute 'alter view public.vw_pipeline set (security_invoker = true)';
end $$;

-- Las vistas de KPI (`vw_kpi_vendedor`, `vw_embudo`) NO se tocan: siguen
-- sumando valor y venta cerrada, que es lo correcto. La reserva no es un
-- ingreso nuevo que haya que agregarles.

-- Que el cambio de reserva quede en el registro de actividad, como el resto de
-- los montos. La guarda es porque el trigger puede no existir todavía.
do $$
begin
  if exists (
    select 1 from pg_trigger where tgname = 'trg_actividad_oportunidades'
  ) then
    drop trigger trg_actividad_oportunidades on public.oportunidades;
    create trigger trg_actividad_oportunidades
      after insert or update or delete on public.oportunidades
      for each row execute function public.registrar_actividad(
        '{etapa_id,estado_id,vendedor_id,producto_id,territorio_id,canal_id,valor_oportunidad,venta_cerrada,reserva,fecha_cierre,descuento_promocion}',
        'oportunidad'
      );
  else
    raise notice 'todavía no está el registro de actividad; se omite su trigger';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 20260825120000_actividad_enlaces.sql
-- --------------------------------------------------------------------------

-- Los links de registro también dejan rastro.
--
-- Crear y modificar leads ya se registraba: los triggers de `oportunidades` y
-- `clientes` están desde la migración de actividad. Lo que faltaba era el link
-- que se le manda al área académica, que hasta ahora se generaba sin que
-- quedara anotado en ningún lado.
--
-- «Generó», no «envió»: el CRM copia el enlace al portapapeles y quien lo manda
-- es la persona, por WhatsApp o por donde sea. Decir «envió» sería afirmar algo
-- que el sistema no vio. La hora que queda es la de la generación, que en la
-- práctica es la misma en que se pega en el chat.
--
-- Sólo agrega un trigger. Se puede correr con gente trabajando.

do $$
begin
  if to_regclass('public.enlaces_pago') is null then
    raise notice 'todavía no existe enlaces_pago; corré antes 20260822120000_enlaces_pago.sql';
    return;
  end if;

  if not exists (select 1 from pg_proc where proname = 'registrar_actividad') then
    raise notice 'todavía no existe el registro de actividad; corré antes 20260823120000_actividad.sql';
    return;
  end if;

  execute 'drop trigger if exists trg_actividad_enlaces on public.enlaces_pago';

  -- Se vigila `revocado` y nada más. La tabla también guarda cuántas veces se
  -- abrió el enlace, y esa columna cambia cada vez que alguien de académica lo
  -- mira: vigilarla llenaría el panel de una línea por apertura y taparía todo
  -- lo demás. Que lo abrieron se ve en la ficha, no hace falta un aviso.
  execute 'create trigger trg_actividad_enlaces
    after insert or update on public.enlaces_pago
    for each row execute function public.registrar_actividad(''{revocado}'', ''enlace'')';

  raise notice 'listo: los links de registro quedan en el registro de actividad';
end $$;

-- --------------------------------------------------------------------------
-- 20260826120000_cursos_realizados.sql
-- --------------------------------------------------------------------------

-- Cursos y diplomados que el cliente ya hizo.
--
-- POR QUÉ UNA TABLA Y NO COLUMNAS EN `clientes`
--
-- Una persona puede haber hecho tres cursos, o ninguno, y no se sabe de
-- antemano cuántos. Resuelto con columnas habría que inventar un tope
-- —`curso_1`, `curso_2`, `curso_3`— y el día que alguien haga el cuarto no
-- entra; además buscar «quiénes hicieron Pastelería» obligaría a mirar todas
-- las columnas una por una. Con filas no hay tope y la consulta es directa.
--
-- Cuelga del cliente y no de la oportunidad a propósito: lo que se quiere
-- saber es qué cursó esta persona, no qué se le vendió en un trato puntual. Si
-- tiene tres oportunidades abiertas, su historial es el mismo en las tres.
--
-- Sólo crea cosas nuevas. Se puede correr con gente trabajando.

create table if not exists public.cursos_realizados (
  id          bigint generated by default as identity primary key,
  cliente_id  bigint not null references public.clientes(id) on delete cascade,
  -- Del catálogo cuando el programa todavía se dicta.
  producto_id bigint references public.productos(id) on delete set null,
  -- Escrito a mano cuando no. Un curso de hace cinco años puede no estar más
  -- en el catálogo, y no poder anotarlo sería peor que anotarlo suelto.
  nombre      text,
  inicia_en   date,
  termina_en  date,
  creado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists ix_cursos_realizados_cliente
  on public.cursos_realizados (cliente_id, inicia_en desc);

-- Para poder preguntar quiénes hicieron un programa dado.
create index if not exists ix_cursos_realizados_producto
  on public.cursos_realizados (producto_id)
  where producto_id is not null;

do $$
begin
  -- Una fila sin curso no dice nada: o se eligió del catálogo o se escribió.
  if not exists (select 1 from pg_constraint where conname = 'cursos_realizados_con_curso') then
    alter table public.cursos_realizados
      add constraint cursos_realizados_con_curso
      check (producto_id is not null or nullif(btrim(nombre), '') is not null);
  end if;

  -- Terminar antes de empezar es un error de tecleo, casi siempre el año.
  -- Las dos fechas pueden faltar: de un curso viejo a veces sólo se sabe que
  -- lo hizo, y obligar a inventar fechas ensuciaría el dato de verdad.
  if not exists (select 1 from pg_constraint where conname = 'cursos_realizados_fechas') then
    alter table public.cursos_realizados
      add constraint cursos_realizados_fechas
      check (inicia_en is null or termina_en is null or termina_en >= inicia_en);
  end if;
end $$;

alter table public.cursos_realizados enable row level security;

-- Mismo criterio que `clientes`: el equipo con sesión ve y edita. Saber qué
-- cursó alguien es parte de atenderlo, y esconderlo entre asesores obligaría a
-- preguntar por WhatsApp lo que la ficha ya sabe.
drop policy if exists cursos_realizados_equipo on public.cursos_realizados;
create policy cursos_realizados_equipo on public.cursos_realizados
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------- actividad
--
-- Que agregar o quitar un curso quede en el registro, como el resto. La guarda
-- es porque el registro de actividad puede no estar corrido todavía.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_actividad') then
    execute 'drop trigger if exists trg_actividad_cursos on public.cursos_realizados';
    execute 'create trigger trg_actividad_cursos
      after insert or delete on public.cursos_realizados
      for each row execute function public.registrar_actividad(''{}'', ''curso'')';
  else
    raise notice 'todavía no está el registro de actividad; se omite su trigger';
  end if;
end $$;

-- ----------------------------------------------------------- cambios en vivo
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'cursos_realizados'
     )
  then
    alter publication supabase_realtime add table public.cursos_realizados;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 20260827120000_catalogo_programas.sql
-- --------------------------------------------------------------------------

-- Crear programas: quién puede, y que quede anotado.
--
-- POR QUÉ ESTO NO ES UN CAMPO MÁS
--
-- `productos` no es una tabla que use una pantalla: es el catálogo del que
-- cuelga medio CRM. Un programa nuevo aparece solo en la ficha del cliente, en
-- el alta, en el selector de cursos realizados, en el emparejado por nombre de
-- la importación de bases, en los catálogos que consume n8n y en los cortes
-- por programa del Dashboard. Un nombre mal escrito acá se propaga a todo eso,
-- y como `nombre` es único, el «Diplomado de Cocina» duplicado entra como
-- «Diplomado Cocina» y a partir de ahí los reportes cuentan dos programas
-- donde hay uno.
--
-- Por eso el alta pasa a ser cosa de dirección. Hasta ahora cualquiera con
-- sesión podía escribir el catálogo; el resto de las tablas se queda como
-- está, esto cambia sólo `productos`.
--
-- Sólo cambia una política y agrega un trigger. No toca datos.

-- ------------------------------------------------------------------ permisos

drop policy if exists auth_all_productos on public.productos;

-- Leer, todo el equipo: sin el catálogo no se puede ni abrir una ficha.
drop policy if exists productos_leer on public.productos;
create policy productos_leer on public.productos
  for select to authenticated using (true);

-- Escribir, sólo dirección. La pantalla además esconde el botón, pero eso es
-- comodidad: lo que impide de verdad que se cuele un programa es esto.
drop policy if exists productos_administrar on public.productos;
create policy productos_administrar on public.productos
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ----------------------------------------------------------------- actividad
--
-- Crear o cambiar un programa mueve los reportes de todos, así que tiene que
-- quedar dicho quién lo hizo. La guarda es porque el registro de actividad
-- puede no estar corrido todavía.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_actividad') then
    execute 'drop trigger if exists trg_actividad_productos on public.productos';
    execute 'create trigger trg_actividad_productos
      after insert or update or delete on public.productos
      for each row execute function public.registrar_actividad(
        ''{nombre,categoria,precio,activo}'', ''programa'')';
  else
    raise notice 'todavía no está el registro de actividad; se omite su trigger';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 20260828120000_catalogo_vendedores.sql
-- --------------------------------------------------------------------------

-- Alta de vendedores: quién puede, y que quede anotado.
--
-- LO QUE HAY QUE TENER CLARO ANTES DE TOCAR ESTO
--
-- «Vendedor» y «usuario del CRM» son dos cosas distintas y viven en tablas
-- separadas, sin ninguna columna que las una:
--
--   `vendedores`  es el catálogo al que se le asignan oportunidades. Tiene
--                 nombre, correo y teléfono. No da acceso a nada.
--   `usuarios`    son las cuentas que entran al CRM, y son las que tienen rol
--                 y permisos. Se administran desde «Usuarios y Roles».
--
-- Crear un vendedor NO crea una cuenta, y crear una cuenta NO crea un
-- vendedor. Las dos cosas hacen falta para alguien que atiende y entra al
-- sistema, y olvidarse de una da los dos síntomas típicos: alguien que puede
-- entrar pero no aparece para asignarle leads, o alguien que recibe leads pero
-- no puede entrar a verlos.
--
-- De qué cuelga un vendedor, que es lo que se rompe si se lo borra: las
-- oportunidades (`vendedor_id`), los eventos del calendario, las
-- conversaciones de la bandeja y los cursos del historial. Todas esas
-- referencias son `on delete set null`, así que borrar un vendedor no borra
-- trabajo: lo deja sin asignar. Aun así lo correcto es desactivarlo —`activo`
-- en falso— y no borrarlo, para que su historial siga diciendo quién atendió.
--
-- Sólo cambia una política y agrega un trigger. No toca datos.

-- ------------------------------------------------------------------ permisos

drop policy if exists auth_all_vendedores on public.vendedores;

-- Leer, todo el equipo: sin esta lista no se puede asignar ni filtrar nada.
drop policy if exists vendedores_leer on public.vendedores;
create policy vendedores_leer on public.vendedores
  for select to authenticated using (true);

-- Escribir, sólo dirección. Un vendedor de más aparece en todos los
-- desplegables del CRM y en la API que reparte leads; quién entra a esa lista
-- es una decisión de dirección, no de quien está atendiendo.
drop policy if exists vendedores_administrar on public.vendedores;
create policy vendedores_administrar on public.vendedores
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ----------------------------------------------------------------- actividad
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_actividad') then
    execute 'drop trigger if exists trg_actividad_vendedores on public.vendedores';
    execute 'create trigger trg_actividad_vendedores
      after insert or update or delete on public.vendedores
      for each row execute function public.registrar_actividad(
        ''{nombre,correo,telefono,activo}'', ''vendedor'')';
  else
    raise notice 'todavía no está el registro de actividad; se omite su trigger';
  end if;
end $$;

commit;
