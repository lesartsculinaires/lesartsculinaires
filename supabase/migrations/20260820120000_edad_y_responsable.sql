begin;

-- Edad del cliente y, si es menor, quién responde por él.
--
-- La escuela inscribe menores de edad, y para eso hace falta un adulto con
-- nombre y forma de contacto. Hoy eso se anota en la nota de seguimiento
-- cuando alguien se acuerda, así que no se puede buscar ni saber a quién
-- llamar sin leer la bitácora entera.
--
-- Sólo agrega columnas opcionales y vuelve a armar una vista. No borra datos y
-- se puede correr con gente trabajando.

-- ------------------------------------------------------------------ clientes
alter table public.clientes
  -- La edad se guarda como número y no como fecha de nacimiento porque es lo
  -- que se pregunta al inscribir. Tiene un costo: no se actualiza sola, así
  -- que quien se cargó con 16 va a seguir diciendo 16 el año que viene. Para
  -- lo que decide esta columna —si hace falta un responsable— errar por el
  -- lado de pedirlo de más es el lado correcto.
  add column if not exists edad                 smallint,
  add column if not exists responsable_nombre   text,
  add column if not exists responsable_telefono text,
  add column if not exists responsable_correo   text;

comment on column public.clientes.edad is
  'Edad declarada al inscribirse. Por debajo de 17 el CRM pide los datos de un responsable.';
comment on column public.clientes.responsable_nombre is
  'Nombre y apellido del adulto responsable. Sólo aplica a menores de 17.';

-- Una edad imposible casi siempre es un año de nacimiento escrito en la
-- casilla equivocada («1998»), y entra sin protestar si nadie mira. El tope de
-- 120 no rechaza a nadie de verdad y ataja ese error.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_edad_valida') then
    alter table public.clientes
      add constraint clientes_edad_valida
      check (edad is null or (edad >= 0 and edad <= 120));
  end if;
end $$;

-- Para poder listar los menores sin responsable cargado: son pocos y la
-- consulta los busca seguido, así que el índice sólo cubre esas filas.
create index if not exists ix_clientes_menores_sin_responsable
  on public.clientes (edad)
  where edad is not null and edad < 17 and responsable_nombre is null;

-- --------------------------------------------------------------- vw_pipeline
--
-- La vista es de donde leen todas las pantallas, así que las columnas nuevas
-- tienen que pasar por acá o la ficha no las vería. Se tira y se vuelve a
-- crear: `create or replace view` no admite cambiar la lista de columnas.
--
-- Se arma en tiempo de ejecución en vez de escribirla fija, porque no todas
-- las bases tienen las mismas columnas: `importacion_id` la agrega la
-- migración de Bases, que puede no haberse corrido. Escrita fija, este archivo
-- falla con «column o.importacion_id does not exist» en una base al día en
-- todo lo demás, y obliga a correr otra migración sólo para poder correr esta.
-- Preguntando, funciona en las dos.
do $$
declare
  columnas_opcionales text := '';
  hay_importaciones   boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oportunidades'
      and column_name = 'importacion_id'
  ) into hay_importaciones;

  if hay_importaciones then
    columnas_opcionales := ', o.importacion_id';
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
           o.valor_oportunidad, o.venta_cerrada, o.descuento_promocion,
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
  $vista$, columnas_opcionales);

  -- Sigue respetando los permisos de quien consulta, como antes.
  execute 'alter view public.vw_pipeline set (security_invoker = true)';
end $$;

commit;
