-- Unir dos leads que son la misma persona.
--
-- ------------------------------------------------------------------------
-- CÓMO SE USA
-- ------------------------------------------------------------------------
--
-- Viene con los códigos de katy G puestos. Para otro caso, cambiá las dos
-- líneas de abajo que dicen «CRM-…» y nada más.
--
-- Corré el archivo entero de una vez. Está partido en tres actos y hace lo
-- correcto solo según lo que encuentre:
--
--   1. MUESTRA lo que hay ahora, antes de tocar nada.
--   2. UNE: primero las fichas, si resultan ser dos personas distintas en la
--      base; después los leads.
--   3. MUESTRA cómo quedó.
--
-- Si los dos códigos resultan ser de personas de verdad distintas, se planta
-- y no hace nada: eso es un error de tipeo y no algo para resolver adivinando.
--
-- ------------------------------------------------------------------------
-- QUÉ SE CONSERVA
-- ------------------------------------------------------------------------
--
-- El lead que va más adelante en el tablero, que es el que tiene el progreso
-- real. El otro le entrega todo: notas, adjuntos, eventos, links de pago,
-- recordatorios, seguimientos, y su canal, que es lo que se quería salvar.
--
-- La fecha de registro que queda es la más vieja: la persona llegó ese día,
-- no el día en que se abrió el lead repetido.
--
-- Queda una nota en la bitácora diciendo qué se unió. Esto no se deshace con
-- un botón.
--
-- ------------------------------------------------------------------------
-- ANTES DE CORRERLO
-- ------------------------------------------------------------------------
--
-- Tienen que estar aplicadas 20260922120000_canales_del_contacto,
-- 20260923120000_fusionar_contactos y 20260924120000_fusionar_oportunidades.

\set uno 'CRM-0571'
\set dos 'CRM-0576'

-- ------------------------------------------------------------- 1. cómo está

\echo ''
\echo '── ANTES ──'

select
  o.codigo,
  o.cliente_id,
  c.nombre                              as ficha,
  c.telefono,
  coalesce(ca.nombre, '—')              as canal,
  coalesce(e.nombre, '—')               as etapa,
  e.orden                               as avance,
  o.fecha_registro,
  (select count(*) from public.oportunidad_notas n where n.oportunidad_id = o.id) as notas
  from public.oportunidades o
  join public.clientes c on c.id = o.cliente_id
  left join public.canales ca on ca.id = o.canal_id
  left join public.etapas  e  on e.id  = o.etapa_id
 where o.codigo in (:'uno', :'dos')
 order by e.orden nulls first;

-- ------------------------------------------------------------------ 2. unir

do $$
declare
  a          record;
  b          record;
  conservar  bigint;
  absorber   bigint;
begin
  select o.id, o.cliente_id, o.codigo, coalesce(e.orden, -1) as avance
    into a
    from public.oportunidades o
    left join public.etapas e on e.id = o.etapa_id
   where o.codigo = 'CRM-0571';

  select o.id, o.cliente_id, o.codigo, coalesce(e.orden, -1) as avance
    into b
    from public.oportunidades o
    left join public.etapas e on e.id = o.etapa_id
   where o.codigo = 'CRM-0576';

  -- Faltar uno de los dos significa dos cosas muy distintas, y confundirlas
  -- manda a buscar un error de tipeo donde no lo hay: si el otro sí está, es
  -- que este archivo ya se corrió y el trabajo está hecho.
  if a.id is null and b.id is null then
    raise exception
      'No encontré ninguno de los dos códigos. Revisá que estén bien escritos.';
  end if;

  if a.id is null or b.id is null then
    raise notice 'Ya estaba unificado: sólo queda %. No hay nada que hacer.',
      coalesce(a.codigo, b.codigo);
    return;
  end if;

  -- Si están en dos fichas distintas, primero se unen las fichas. Se conserva
  -- la de id más bajo: es la más vieja y la que tiene más historia colgando.
  if a.cliente_id is distinct from b.cliente_id then
    declare
      queda  bigint := least(a.cliente_id, b.cliente_id);
      se_va  bigint := greatest(a.cliente_id, b.cliente_id);
      n1     text;
      n2     text;
    begin
      select nombre into n1 from public.clientes where id = queda;
      select nombre into n2 from public.clientes where id = se_va;
      raise notice 'Eran dos fichas: «%» y «%». Se unen en la %.', n1, n2, queda;
      perform public.fusionar_contactos(queda, array[se_va]);
    end;
  else
    raise notice 'Ya eran una sola ficha. Sólo hay que unir los leads.';
  end if;

  -- Y ahora los leads. Se conserva el que va más adelante en el tablero.
  if a.avance >= b.avance then
    conservar := a.id; absorber := b.id;
  else
    conservar := b.id; absorber := a.id;
  end if;

  raise notice 'Se conserva el lead %, absorbe al otro.',
    (select codigo from public.oportunidades where id = conservar);

  perform public.fusionar_oportunidades(conservar, array[absorber]);
end $$;

-- ------------------------------------------------------------- 3. cómo quedó

\echo ''
\echo '── DESPUÉS ──'

select
  o.codigo,
  c.nombre                              as ficha,
  c.telefono,
  coalesce(e.nombre, '—')               as etapa,
  o.fecha_registro,
  (select count(*) from public.oportunidad_notas n where n.oportunidad_id = o.id) as notas
  from public.oportunidades o
  join public.clientes c on c.id = o.cliente_id
  left join public.etapas e on e.id = o.etapa_id
 where o.codigo in (:'uno', :'dos');

\echo ''
\echo '── POR DÓNDE LLEGÓ (esto es lo que se quería salvar) ──'

select
  ca.nombre                                                          as canal,
  to_char(cc.primera_vez at time zone 'America/El_Salvador',
          'DD/MM/YY HH24:MI')                                        as primera_vez,
  to_char(cc.ultima_vez  at time zone 'America/El_Salvador',
          'DD/MM/YY HH24:MI')                                        as ultima_vez
  from public.contactos_canal cc
  join public.canales ca on ca.id = cc.canal_id
 where cc.cliente_id = (
   select cliente_id from public.oportunidades where codigo in (:'uno', :'dos') limit 1)
 order by cc.primera_vez;
