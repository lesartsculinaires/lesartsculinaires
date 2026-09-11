-- ============================================================================
-- VER EL JSON DE UN MENSAJE, ENTERO Y SIN QUE SE CORTE
-- ============================================================================
--
-- Correr en Supabase → SQL Editor. No cambia nada: sólo lee.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ HACE FALTA ESTO
-- ----------------------------------------------------------------------------
--
-- El SQL Editor de Supabase corta las columnas anchas: muestra el principio y
-- el resto queda fuera de la pantalla. Con un JSON largo eso deja la duda de si
-- lo que buscabas estaba justo en el pedazo que no se ve.
--
-- La solución no es agrandar la columna sino dar vuelta el problema: en vez de
-- UNA fila con un texto larguísimo, MUCHAS filas cortas, una por cada dato que
-- hay adentro del JSON. Así no hay nada que cortar.
--
-- La consulta 2 es la que contesta de verdad: recorre el JSON hasta el fondo
-- —adentro de los objetos y de los arreglos— y lista cada valor suelto con el
-- camino donde está. Si el contenido de un mensaje estuviera escondido en algún
-- rincón, aparece ahí.

-- ----------------------------------------------------------------------------
-- 1. LO DE PRIMER NIVEL, UNA FILA POR CLAVE
-- ----------------------------------------------------------------------------
--
-- Cambiá la fecha por la del mensaje que quieras mirar, o sacá el `where` de
-- `creado_en` para ver el último que haya entrado.

select
  m.creado_en,
  e.key   as clave,
  e.value as valor
from public.mensajes m
cross join lateral jsonb_each(m.payload) as e(key, value)
where m.tipo in ('unsupported', 'unknown')
order by m.creado_en desc, e.key
limit 40;

-- ----------------------------------------------------------------------------
-- 2. HASTA EL FONDO: CADA DATO SUELTO, CON SU CAMINO
-- ----------------------------------------------------------------------------
--
-- Ésta es la definitiva. Entra en los objetos y en los arreglos hasta llegar a
-- los valores sueltos, así que lista TODO lo que el JSON contiene, sin importar
-- cuán adentro esté.
--
-- Si acá no aparece ningún renglón con el texto del mensaje, no existe: no está
-- escondido en un campo que no miramos, simplemente no vino.

-- `recursive` va al principio de todo el `with`, aunque el primer bloque no lo
-- sea: en Postgres la palabra marca la lista entera, no un bloque suelto.
with recursive el_mensaje as (
  select id, creado_en, payload
  from public.mensajes
  where tipo in ('unsupported', 'unknown')
  order by creado_en desc
  limit 1
),
andar (camino, valor) as (
  select e.key::text, e.value
    from el_mensaje, jsonb_each(el_mensaje.payload) as e(key, value)
  union all
  /*
   * El `case` adentro de cada función no es adorno.
   *
   * Poner la condición en el `on` del join no alcanza: Postgres igual llama a
   * `jsonb_each` sobre cada fila, y revienta con «cannot call jsonb_each on a
   * non-object» en cuanto le toca un arreglo. Pasándole un objeto vacío cuando
   * no corresponde, la función se llama siempre pero no devuelve nada, que es
   * justo lo que hace falta.
   */
  select
    a.camino || '.' || coalesce(o.key, (arr.indice - 1)::text),
    coalesce(o.value, arr.elemento)
  from andar a
  left join lateral jsonb_each(
         case when jsonb_typeof(a.valor) = 'object' then a.valor else '{}'::jsonb end
       ) as o(key, value) on true
  left join lateral jsonb_array_elements(
         case when jsonb_typeof(a.valor) = 'array' then a.valor else '[]'::jsonb end
       ) with ordinality as arr(elemento, indice) on true
  where jsonb_typeof(a.valor) in ('object', 'array')
    and (o.key is not null or arr.elemento is not null)
)
select camino, valor
from andar
where jsonb_typeof(valor) not in ('object', 'array')
order by camino;

-- ----------------------------------------------------------------------------
-- 3. Y SI PREFERÍS EL JSON TAL CUAL, BIEN FORMATEADO
-- ----------------------------------------------------------------------------
--
-- Sale con saltos de línea y sangría. En el SQL Editor, HACÉ CLIC EN LA CELDA:
-- se abre un panel al costado con el contenido completo, sin cortar.
--
-- También se puede bajar como archivo con el botón «Download CSV» que está
-- arriba a la derecha de los resultados.

select
  m.creado_en,
  m.tipo,
  jsonb_pretty(m.payload) as json_completo
from public.mensajes m
where m.tipo in ('unsupported', 'unknown')
order by m.creado_en desc
limit 5;
