-- Unir dos leads que son la misma persona.
--
-- ------------------------------------------------------------------------
-- CÓMO SE USA
-- ------------------------------------------------------------------------
--
-- Viene con los códigos de katy G puestos. Para otro caso, cambiá las dos
-- líneas marcadas «CAMBIAR ACÁ» y nada más.
--
-- Se pega entero en el editor de SQL de Supabase y se corre de una vez. Hace
-- lo correcto solo según lo que encuentre:
--
--   · si los dos códigos están en fichas distintas, primero une las fichas;
--   · después une los leads, conservando el que va más adelante en el tablero;
--   · y al final muestra una fila con lo que pasó y cómo quedó.
--
-- Todo va en una transacción: si algo falla, no queda a medias.
--
-- ------------------------------------------------------------------------
-- QUÉ SE CONSERVA
-- ------------------------------------------------------------------------
--
-- El lead más avanzado, que es el que tiene el progreso real. El otro le
-- entrega todo: notas, adjuntos, eventos, links de pago, recordatorios,
-- seguimientos, y su canal, que es lo que se quería salvar.
--
-- La fecha de registro que queda es la más vieja: la persona llegó ese día, no
-- el día en que se abrió el lead repetido.
--
-- Queda una nota en la bitácora diciendo qué se unió. Esto no se deshace con
-- un botón.
--
-- ------------------------------------------------------------------------
-- POR QUÉ TODO ADENTRO DE UN BLOQUE
-- ------------------------------------------------------------------------
--
-- Porque el editor de Supabase corre SQL y nada más. Los comandos de psql
-- —«\set», «\echo»— no existen ahí, y un archivo que los use ni siquiera
-- arranca. Todo lo que hay que decidir se decide adentro del bloque, y lo que
-- hay que mostrar sale por la consulta del final, que es la única cuyo
-- resultado muestra el editor.
--
-- ------------------------------------------------------------------------
-- ANTES DE CORRERLO
-- ------------------------------------------------------------------------
--
-- Tienen que estar aplicadas 20260922120000_canales_del_contacto,
-- 20260923120000_fusionar_contactos y 20260924120000_fusionar_oportunidades.

begin;

do $$
declare
  -- ------------------------------------------------------- CAMBIAR ACÁ
  cod_uno constant text := 'CRM-0571';
  cod_dos constant text := 'CRM-0576';
  -- --------------------------------------------------------------------

  a         record;
  b         record;
  conservar bigint;
  absorber  bigint;
  paso      text := '';
begin
  select o.id, o.cliente_id, o.codigo, coalesce(e.orden, -1) as avance
    into a
    from public.oportunidades o
    left join public.etapas e on e.id = o.etapa_id
   where o.codigo = cod_uno;

  select o.id, o.cliente_id, o.codigo, coalesce(e.orden, -1) as avance
    into b
    from public.oportunidades o
    left join public.etapas e on e.id = o.etapa_id
   where o.codigo = cod_dos;

  -- Faltar uno de los dos significa dos cosas muy distintas, y confundirlas
  -- manda a buscar un error de tipeo donde no lo hay: si el otro sí está, es
  -- que este archivo ya se corrió y el trabajo está hecho.
  if a.id is null and b.id is null then
    raise exception 'No encontré ninguno de los dos códigos (% y %). Revisá que estén bien escritos.',
      cod_uno, cod_dos;
  end if;

  if a.id is null or b.id is null then
    perform set_config('lac.unificar',
      format('Ya estaba unificado: sólo queda %s. No se hizo nada.', coalesce(a.codigo, b.codigo)),
      false);
    perform set_config('lac.lead', coalesce(a.id, b.id)::text, false);
    return;
  end if;

  -- Dos fichas distintas: primero se unen ellas. Se conserva la de id más
  -- bajo, que es la más vieja y la que tiene más historia colgando.
  if a.cliente_id is distinct from b.cliente_id then
    declare
      queda bigint := least(a.cliente_id, b.cliente_id);
      se_va bigint := greatest(a.cliente_id, b.cliente_id);
    begin
      paso := format('Eran dos fichas (%s y %s); se unieron en la %s. ',
                     (select nombre from public.clientes where id = queda),
                     (select nombre from public.clientes where id = se_va),
                     queda);
      perform public.fusionar_contactos(queda, array[se_va]);
    end;
  else
    paso := 'Ya eran una sola ficha. ';
  end if;

  -- Y ahora los leads. Se conserva el que va más adelante en el tablero.
  if a.avance >= b.avance then
    conservar := a.id; absorber := b.id;
  else
    conservar := b.id; absorber := a.id;
  end if;

  paso := paso || public.fusionar_oportunidades(conservar, array[absorber]);

  perform set_config('lac.unificar', paso, false);
  perform set_config('lac.lead', conservar::text, false);
end $$;

commit;

-- Lo que pasó y cómo quedó, en una fila.
--
-- Va por `current_setting` y no repitiendo los códigos acá: así los códigos se
-- escriben en un solo lugar del archivo y no hay forma de cambiar uno y
-- olvidarse del otro.
select
  current_setting('lac.unificar', true)                    as que_paso,
  o.codigo                                                 as lead_que_queda,
  c.nombre                                                 as ficha,
  c.telefono,
  coalesce(e.nombre, '—')                                  as etapa,
  o.fecha_registro                                         as llego_el,
  (select count(*) from public.oportunidad_notas n
    where n.oportunidad_id = o.id)                         as notas,
  (select string_agg(
            ca.nombre || ' (' || to_char(cc.primera_vez at time zone 'America/El_Salvador',
                                         'DD/MM/YY') || ')',
            ' → ' order by cc.primera_vez)
     from public.contactos_canal cc
     join public.canales ca on ca.id = cc.canal_id
    where cc.cliente_id = c.id)                            as por_donde_llego
  from public.oportunidades o
  join public.clientes c on c.id = o.cliente_id
  left join public.etapas e on e.id = o.etapa_id
 where o.id = current_setting('lac.lead', true)::bigint;
