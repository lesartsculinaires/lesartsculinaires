begin;

-- Las fichas de pauta que entraron ANTES de que el CRM supiera leerlas.
--
-- ============================================================================
-- QUÉ ARREGLA
-- ============================================================================
--
-- Desde ahora, cuando alguien completa el formulario de un anuncio, el CRM lee
-- el mensaje y llena la ficha solo. Los que entraron antes quedaron con el
-- mensaje en el hilo y la ficha vacía.
--
-- Esto los recorre y les aplica las MISMAS reglas.
--
-- ============================================================================
-- POR QUÉ ESTO ESTÁ ESCRITO DOS VECES, Y QUÉ SE HIZO AL RESPECTO
-- ============================================================================
--
-- El lector de verdad vive en la aplicación —`src/lib/crm/formularioDeAnuncio.ts`—
-- porque corre cuando entra cada mensaje. Esto es una segunda implementación de
-- las mismas reglas, y dos implementaciones de una regla es exactamente la
-- clase de cosa que se desincroniza.
--
-- Se acepta porque esto CORRE UNA VEZ: no hay futuro en el que puedan
-- discrepar, sólo este momento. Y para este momento se comprobó que coinciden:
-- `supabase/pruebas/banco/prueba-formulario-viejo.mjs` mete el formulario real
-- de la escuela por los dos caminos —el de la aplicación y éste— y exige que
-- dejen la ficha igual.
--
-- Si algún día hay que volver a correrlo, vale más rehacer la comprobación que
-- confiar en que el archivo siguió al día.
--
-- ============================================================================
-- LAS MISMAS TRES REGLAS
-- ============================================================================
--
--   SÓLO RELLENA HUECOS   Nunca pisa un dato que ya está. Un formulario con un
--                         dedazo no puede borrar lo que alguien corrigió a
--                         mano: un hueco se ve, uno pisado no.
--
--   EL PRIMERO GANA       Si alguien completó la pauta dos veces, vale el
--                         formulario más viejo, que es el que la ficha habría
--                         tomado cuando entró.
--
--   NO ADIVINA            Un programa se elige sólo si hay UN candidato en el
--                         catálogo. Con dos, el campo queda para la asesora.
--
-- Se puede correr con gente trabajando, y dos veces: la segunda no cambia nada
-- porque ya no queda ningún hueco que llenar.

-- ---------------------------------------------------------------------------
-- 1. Las herramientas
-- ---------------------------------------------------------------------------

-- Sin tildes, sin mayúsculas y sin espacios de más: para comparar etiquetas.
create or replace function pg_temp.plano(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
    '\s+', ' ', 'g'));
$$;

/*
 * A qué campo corresponde una etiqueta.
 *
 * El ORDEN importa y por eso es una lista: «Curso Corto de tu interés»
 * contiene «curso» y también «interes». Gana la primera que coincida, así que
 * las más específicas van arriba —igual que en la aplicación—.
 */
create or replace function pg_temp.que_campo(p_etiqueta text) returns text
language plpgsql immutable as $$
declare
  e     text := pg_temp.plano(p_etiqueta);
  fila  record;
begin
  if e = '' then return null; end if;

  -- Primero el que coincide entero, después el que aparece adentro.
  for fila in
    select * from (values
      (1, 'correo',       array['email','e-mail','correo','correo electronico','mail']),
      (2, 'nombre',       array['full name','nombre completo','nombre y apellido','nombre','name']),
      (3, 'telefono',     array['phone number','telefono','numero de telefono','numero de celular','celular','whatsapp','phone','numero']),
      (4, 'programa',     array['curso corto de tu interes','curso de tu interes','curso de interes','programa de interes','diplomado de tu interes','que diplomado te interesa','que curso te interesa','programa','diplomado','curso','interes']),
      (5, 'departamento', array['province','provincia','departamento','state','estado','region']),
      (6, 'ciudad',       array['city','ciudad','municipio','localidad']),
      (7, 'empresa',      array['company','empresa','negocio','organizacion']),
      (8, 'cargo',        array['job title','cargo','puesto','ocupacion','profesion'])
    ) as t(orden, campo, dicen)
    order by t.orden
  loop
    if e = any(fila.dicen) then return fila.campo; end if;
  end loop;

  for fila in
    select * from (values
      (1, 'correo',       array['email','e-mail','correo','correo electronico','mail']),
      (2, 'nombre',       array['full name','nombre completo','nombre y apellido','nombre','name']),
      (3, 'telefono',     array['phone number','telefono','numero de telefono','numero de celular','celular','whatsapp','phone','numero']),
      (4, 'programa',     array['curso corto de tu interes','curso de tu interes','curso de interes','programa de interes','diplomado de tu interes','que diplomado te interesa','que curso te interesa','programa','diplomado','curso','interes']),
      (5, 'departamento', array['province','provincia','departamento','state','estado','region']),
      (6, 'ciudad',       array['city','ciudad','municipio','localidad']),
      (7, 'empresa',      array['company','empresa','negocio','organizacion']),
      (8, 'cargo',        array['job title','cargo','puesto','ocupacion','profesion'])
    ) as t(orden, campo, dicen)
    order by t.orden
  loop
    if exists (select 1 from unnest(fila.dicen) d where position(d in e) > 0) then
      return fila.campo;
    end if;
  end loop;

  return null;
end $$;

/*
 * Lee el mensaje y devuelve los campos, o nada si no parece un formulario.
 *
 * Hacen falta DOS datos reconocidos. Con uno solo se confundiría un mensaje
 * común: «Programa: el del sábado» es una frase que alguien escribe.
 */
create or replace function pg_temp.leer_formulario(p_texto text)
returns table(nombre text, correo text, telefono text, programa text,
              departamento text, ciudad text, empresa text, cargo text)
language plpgsql immutable as $$
declare
  renglon     text;
  corte       int;
  etiqueta    text;
  valor       text;
  campo       text;
  reconocidos int := 0;
begin
  nombre := null; correo := null; telefono := null; programa := null;
  departamento := null; ciudad := null; empresa := null; cargo := null;

  if coalesce(btrim(p_texto), '') = '' then return; end if;

  foreach renglon in array regexp_split_to_array(p_texto, E'\r?\n') loop
    -- El PRIMER dos puntos: un valor puede tener los suyos —una hora, una
    -- dirección web— y partir por todos dejaría el resto tirado.
    corte := position(':' in renglon);
    continue when corte = 0;

    -- Las pautas a veces mandan la etiqueta en negrita, con asteriscos.
    etiqueta := btrim(translate(substr(renglon, 1, corte - 1), '*_~`', ''));
    valor    := btrim(substr(renglon, corte + 1));
    continue when valor = '';

    campo := pg_temp.que_campo(etiqueta);
    continue when campo is null;

    -- El primero gana si la etiqueta se repite.
    if campo = 'nombre'       and nombre       is null then nombre := valor;       reconocidos := reconocidos + 1;
    elsif campo = 'correo'    and correo       is null then correo := valor;       reconocidos := reconocidos + 1;
    elsif campo = 'telefono'  and telefono     is null then telefono := valor;     reconocidos := reconocidos + 1;
    elsif campo = 'programa'  and programa     is null then programa := valor;     reconocidos := reconocidos + 1;
    elsif campo = 'departamento' and departamento is null then departamento := valor; reconocidos := reconocidos + 1;
    elsif campo = 'ciudad'    and ciudad       is null then ciudad := valor;       reconocidos := reconocidos + 1;
    elsif campo = 'empresa'   and empresa      is null then empresa := valor;      reconocidos := reconocidos + 1;
    elsif campo = 'cargo'     and cargo        is null then cargo := valor;        reconocidos := reconocidos + 1;
    end if;
  end loop;

  if reconocidos >= 2 then return next; end if;
end $$;

/*
 * El único del catálogo que corresponde, o nada.
 *
 * Deliberadamente cobarde: con dos candidatos no elige ninguno. Adivinar mal
 * pone en la ficha un programa que la persona no pidió, y a un campo que se
 * llenó solo nadie lo revisa. Un hueco, en cambio, se completa mirando el hilo.
 */
create or replace function pg_temp.cual_del_catalogo(p_busca text, p_tabla text)
returns bigint
language plpgsql as $$
declare
  q      text := pg_temp.plano(p_busca);
  ids    bigint[];
begin
  if q = '' then return null; end if;

  execute format(
    'select array_agg(id) from %I where pg_temp.plano(nombre) = $1', p_tabla)
    into ids using q;
  if array_length(ids, 1) = 1 then return ids[1]; end if;
  if array_length(ids, 1) > 1 then return null; end if;

  -- Menos de cuatro letras sólo encuentra por nombre exacto: «Noe» aparece
  -- dentro de demasiadas cosas.
  if length(q) < 4 then return null; end if;

  execute format(
    'select array_agg(id) from %I
      where length(pg_temp.plano(nombre)) >= 4
        and (position($1 in pg_temp.plano(nombre)) > 0
          or position(pg_temp.plano(nombre) in $1) > 0)', p_tabla)
    into ids using q;

  return case when array_length(ids, 1) = 1 then ids[1] else null end;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Antes: cuántos hay
-- ---------------------------------------------------------------------------

do $$
declare
  cuantos int;
begin
  select count(*) into cuantos
    from public.mensajes m
   where m.direccion = 'entrante'
     and exists (select 1 from pg_temp.leer_formulario(m.texto));

  raise notice '--- formularios de pauta encontrados en el historial: % ---', cuantos;
end $$;

-- ---------------------------------------------------------------------------
-- 3. El arreglo
-- ---------------------------------------------------------------------------
--
-- `distinct on (c.cliente_id)` ordenado por el mensaje más VIEJO: si alguien
-- completó la pauta dos veces, vale el primero, que es el que la ficha habría
-- tomado cuando entró.

create temporary table pg_temp.de_pauta on commit drop as
select distinct on (c.cliente_id)
       c.cliente_id,
       f.*
  from public.mensajes m
  join public.conversaciones c on c.id = m.conversacion_id
  cross join lateral pg_temp.leer_formulario(m.texto) f
 where m.direccion = 'entrante'
   and c.cliente_id is not null
 order by c.cliente_id, m.creado_en asc, m.id asc;

-- ------------------------------------------------------------------ la ficha

update public.clientes cl
   set nombre = coalesce(
         -- El nombre se reemplaza también cuando lo que hay es el TELÉFONO:
         -- eso no es un nombre, es lo que puso el CRM por no tener nada mejor.
         case when nullif(btrim(coalesce(cl.nombre, '')), '') is null
                or btrim(cl.nombre) = coalesce(cl.telefono, '')
              then d.nombre end,
         cl.nombre),
       correo   = coalesce(nullif(btrim(coalesce(cl.correo, '')), ''),   d.correo),
       empresa  = coalesce(nullif(btrim(coalesce(cl.empresa, '')), ''),  d.empresa),
       cargo    = coalesce(nullif(btrim(coalesce(cl.cargo, '')), ''),    d.cargo),
       telefono = coalesce(
         nullif(btrim(coalesce(cl.telefono, '')), ''),
         -- Ocho dígitos son un número salvadoreño sin código de país. Con
         -- cualquier otro largo se deja como vino: adivinar un teléfono es
         -- escribirle a otra persona.
         case
           when length(regexp_replace(coalesce(d.telefono, ''), '\D', '', 'g')) = 8
             then '503' || regexp_replace(d.telefono, '\D', '', 'g')
           when length(regexp_replace(coalesce(d.telefono, ''), '\D', '', 'g')) between 8 and 15
             then regexp_replace(d.telefono, '\D', '', 'g')
         end)
  from pg_temp.de_pauta d
 where d.cliente_id = cl.id;

-- --------------------------------------------------------- la clasificación
--
-- La oportunidad MÁS NUEVA de cada persona: alguien que ya cursó un diplomado
-- y ahora pregunta por otro tiene dos, y lo que llegó es de la de ahora.

create temporary table pg_temp.la_ultima on commit drop as
select distinct on (o.cliente_id) o.id, o.cliente_id, o.producto_id, o.territorio_id
  from public.oportunidades o
  join pg_temp.de_pauta d on d.cliente_id = o.cliente_id
 order by o.cliente_id, o.id desc;

update public.oportunidades o
   set producto_id = coalesce(
         o.producto_id,
         pg_temp.cual_del_catalogo(d.programa, 'productos')),
       territorio_id = coalesce(
         o.territorio_id,
         -- La ciudad primero: algunas pautas mandan bien la ciudad y mal el
         -- departamento. Gana el que el catálogo reconozca.
         pg_temp.cual_del_catalogo(d.ciudad, 'territorios'),
         pg_temp.cual_del_catalogo(d.departamento, 'territorios'))
  from pg_temp.de_pauta d
  join pg_temp.la_ultima u on u.cliente_id = d.cliente_id
 where o.id = u.id;

-- Y el programa queda también entre «por los que preguntó».
insert into public.oportunidad_programas (oportunidad_id, producto_id)
select o.id, o.producto_id
  from public.oportunidades o
  join pg_temp.la_ultima u on u.id = o.id
 where o.producto_id is not null
on conflict (oportunidad_id, producto_id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- 4. Cómo quedó
-- ---------------------------------------------------------------------------
--
-- «Sin correo todavía» no es un fallo: hay formularios que no lo traen, y
-- fichas que ya tenían uno escrito a mano y no se tocaron.

select
  (select count(*) from public.clientes cl
     join public.conversaciones c on c.cliente_id = cl.id
    where cl.correo is not null)                       as fichas_con_correo,
  (select count(*) from public.oportunidades
    where producto_id is not null)                     as con_programa,
  (select count(*) from public.oportunidades
    where territorio_id is not null)                   as con_territorio;
