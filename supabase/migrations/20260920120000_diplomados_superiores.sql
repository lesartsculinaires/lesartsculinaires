begin;

-- Los cinco diplomados pasan a llamarse «Diplomado Superior de …».
--
-- ------------------------------------------------------------------------
-- POR QUÉ ESTO NO DESPEGA NINGÚN LEAD
-- ------------------------------------------------------------------------
--
-- Las oportunidades guardan `producto_id`, no el nombre. Cambiarle el nombre
-- a la fila del catálogo lo cambia de una vez en Pipeline, en la ficha, en el
-- Dashboard, en los cortes por programa y en el historial de cursos, sin
-- tocar una sola oportunidad. Por eso esto es un `update` de cinco filas y no
-- una mudanza de datos.
--
-- Lo que sí queda desactualizado está afuera: n8n y los formularios de Meta
-- mandan el programa por nombre. Eso hay que cambiarlo del lado de ellos el
-- mismo día. El aviso está en el mensaje del commit y en la respuesta.
--
-- ------------------------------------------------------------------------
-- CÓMO ENCUENTRA CADA UNO, Y POR QUÉ NO POR NOMBRE EXACTO
-- ------------------------------------------------------------------------
--
-- Porque el nombre exacto es justamente lo que no se sabe. La base de la
-- escuela tiene «Diplomado de Pasteleria» sin tilde y «Diplomado Management
-- Gastronómico» sin «de»; escribir el nombre viejo a mano acá sería apostar a
-- que está igual, y si no está igual el archivo no hace nada y no se entera
-- nadie.
--
-- Así que busca por una palabra que sí identifica a cada uno —cocina,
-- pasteleria, mixologia, barismo, management— entre los que empiezan con
-- «Diplomado», comparando sin tildes y sin mayúsculas. Ese arranque es el que
-- deja afuera a «Curso corto Mixología 360» y a «Curso corto Pastelería
-- Saludable», que llevan la misma palabra y no son lo que se está renombrando.
--
-- Si una palabra encuentra a más de uno, NO renombra: avisa cuáles son y
-- sigue con los demás. Adivinar cuál de dos era el bueno es la única forma de
-- que esto rompa algo de verdad.
--
-- ------------------------------------------------------------------------
-- TAMBIÉN ARREGLA EL FORMULARIO DE FERIA
-- ------------------------------------------------------------------------
--
-- Las opciones del formulario guardan el id del programa, así que el lead cae
-- bien igual; lo que queda viejo es el texto que lee la persona en la feria.
-- Se actualiza sólo cuando ese texto era literalmente el nombre del catálogo.
-- Si alguien escribió una opción con nombre comercial propio —«Pastelería
-- Internacional» apuntando al diplomado— se respeta: eso se puso a propósito.
--
-- Se puede correr con gente trabajando, y dos veces: la segunda no encuentra
-- nada que cambiar.

-- Sin tildes y en minúsculas, para poder comparar. Vive sólo en esta sesión.
create or replace function pg_temp.plano(t text) returns text
language sql immutable as $$
  select lower(translate(coalesce(t, ''),
                         'áéíóúüñÁÉÍÓÚÜÑ',
                         'aeiouunAEIOUUN'));
$$;

do $$
declare
  fila     record;
  ids      bigint[];
  nombres  text[];
  viejo    text;
  ocupado  bigint;
  cambiados int := 0;
begin
  for fila in
    select * from (values
      ('cocina',     'Diplomado Superior de Cocina Internacional'),
      ('pasteleria', 'Diplomado Superior de Pastelería Internacional'),
      ('mixologia',  'Diplomado Superior de Mixología Internacional'),
      ('barismo',    'Diplomado Superior de Barismo y Extracción de Café'),
      ('management', 'Diplomado Superior de Management Gastronómico')
    ) as v(clave, nuevo)
  loop
    select array_agg(id order by id), array_agg(nombre order by id)
      into ids, nombres
      from public.productos
     where pg_temp.plano(nombre) like 'diplomado%'
       and pg_temp.plano(nombre) like '%' || fila.clave || '%';

    if ids is null then
      raise notice '— «%»: no hay ningún diplomado con esa palabra; no se toca nada', fila.clave;
      continue;
    end if;

    if array_length(ids, 1) > 1 then
      raise notice '⚠ «%» encuentra % programas (%). No se renombra ninguno: revisalo a mano',
        fila.clave, array_length(ids, 1), array_to_string(nombres, ' / ');
      continue;
    end if;

    viejo := nombres[1];

    if viejo = fila.nuevo then
      raise notice '= «%» ya se llama así', fila.nuevo;
      continue;
    end if;

    -- `productos.nombre` es único. Si el nombre destino ya lo tiene otra fila,
    -- el update fallaría con un error de índice que no dice qué pasó; mejor
    -- decirlo acá y seguir.
    select id into ocupado
      from public.productos
     where nombre = fila.nuevo and id <> ids[1];

    if ocupado is not null then
      raise notice '⚠ «%» ya existe en el programa %; «%» queda como está',
        fila.nuevo, ocupado, viejo;
      continue;
    end if;

    update public.productos set nombre = fila.nuevo where id = ids[1];
    cambiados := cambiados + 1;
    raise notice '✓ % → %', viejo, fila.nuevo;

    -- Y el texto de las opciones del formulario que decían el nombre viejo.
    update public.formulario_campos c
       set opciones = (
             select jsonb_agg(
                      case
                        when o ->> 'texto' = viejo
                         and (o ->> 'valor') ~ '^\d+$'
                         and (o ->> 'valor')::bigint = ids[1]
                        then jsonb_set(o, '{texto}', to_jsonb(fila.nuevo))
                        else o
                      end
                      order by orden)
               from jsonb_array_elements(c.opciones) with ordinality as t(o, orden))
     where c.mapea_a = 'producto_id'
       and c.opciones @> jsonb_build_array(jsonb_build_object('texto', viejo));
  end loop;

  raise notice '';
  raise notice 'Programas renombrados: %', cambiados;
end $$;

commit;

-- Cómo quedaron los diplomados, y si coinciden con lo pedido.
select
  case
    when p.nombre in (
      'Diplomado Superior de Cocina Internacional',
      'Diplomado Superior de Pastelería Internacional',
      'Diplomado Superior de Mixología Internacional',
      'Diplomado Superior de Barismo y Extracción de Café',
      'Diplomado Superior de Management Gastronómico',
      'Suprême Diplôme')
    then '✓' else '· revisar'
  end                                              as estado,
  p.nombre                                         as programa,
  count(o.id)                                      as leads
  from public.productos p
  left join public.oportunidades o on o.producto_id = p.id
 where p.categoria = 'Diplomado'
 group by p.id, p.nombre
 order by estado, p.nombre;
