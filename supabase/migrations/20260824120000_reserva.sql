begin;

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

commit;
