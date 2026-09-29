begin;

-- Las fichas de pauta que entraron ANTES de que el CRM supiera leerlas.
--
-- ============================================================================
-- ESTE ARCHIVO SE PEGA EN EL EDITOR SQL DEL PANEL, Y ESO MANDA
-- ============================================================================
--
-- Las dos primeras versiones usaban funciones en plpgsql y el editor las
-- rechazó las dos veces, con el mismo error y cortando en lugares distintos:
--
--     ERROR: 42601: unterminated dollar-quoted string
--
-- Postgres nunca tuvo problema: el archivo corría bien con psql. El editor del
-- panel parte el texto en sentencias con un analizador propio que no sigue los
-- bloques, así que corta un cuerpo por la mitad y manda medio bloque. Se
-- probaron las dos defensas habituales —etiquetar los bloques, sacar los
-- caracteres que lo confunden— y siguió cortando en otro lado.
--
-- Así que no hay bloques. Esto es SQL plano de principio a fin: tablas
-- temporales encadenadas, sin una sola función y sin un solo bloque. No hay
-- nada que pueda quedar sin cerrar.
--
-- Se lee más largo, y lo vale: el camino de verdad pasa por ese editor, y lo
-- que él no acepta no sirve aunque psql lo corra.
--
-- ============================================================================
-- QUÉ ARREGLA
-- ============================================================================
--
-- Desde ahora, cuando alguien completa el formulario de un anuncio, el CRM lee
-- el mensaje y llena la ficha solo. Los que entraron antes quedaron con el
-- mensaje en el hilo y la ficha vacía. Esto los recorre y les aplica las
-- MISMAS reglas.
--
-- El lector de verdad vive en la aplicación —src/lib/crm/formularioDeAnuncio.ts—
-- porque corre con cada mensaje. Esto es una segunda implementación, y dos
-- implementaciones de una regla se desincronizan. Se acepta porque esto corre
-- UNA VEZ, y para este momento se comprobó que coinciden: la prueba
-- supabase/pruebas/banco/prueba-formulario-viejo.mjs mete el formulario real de
-- la escuela por los dos caminos y exige que dejen la ficha idéntica.
--
-- ============================================================================
-- LAS TRES REGLAS
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
-- 1. Partir cada mensaje en renglones, y cada renglón en etiqueta y valor
-- ---------------------------------------------------------------------------

create temporary table pg_temp.renglones on commit drop as
select m.id                                   as mensaje_id,
       c.cliente_id,
       m.creado_en,
       r.n                                    as orden,
       -- La etiqueta, limpia: sin la negrita que mandan algunas pautas, sin
       -- tildes y sin mayúsculas. Es lo único que se compara.
       lower(translate(
         btrim(translate(split_part(r.linea, ':', 1), '*_~', '')),
         'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'))  as etiqueta,
       -- El valor va TAL CUAL, con sus tildes y sus mayúsculas: es lo que se
       -- va a guardar en la ficha.
       --
       -- Y se corta en el PRIMER dos puntos, no en todos: un valor puede tener
       -- los suyos —una hora, una dirección web— y partir por todos dejaría el
       -- resto tirado.
       btrim(substr(r.linea, position(':' in r.linea) + 1))    as valor
  from public.mensajes m
  join public.conversaciones c on c.id = m.conversacion_id
  cross join lateral regexp_split_to_table(m.texto, '\r?\n')
    with ordinality as r(linea, n)
 where m.direccion = 'entrante'
   and c.cliente_id is not null
   and m.texto is not null
   and position(':' in r.linea) > 0;

-- ---------------------------------------------------------------------------
-- 2. A qué campo corresponde cada etiqueta
-- ---------------------------------------------------------------------------
--
-- EL ORDEN DE ESTE «case» ES LA REGLA. Se evalúa de arriba abajo y gana el
-- primero que coincida, así que las etiquetas más específicas van primero:
-- «Curso Corto de tu interés» contiene «curso» y también «interes», y tiene
-- que caer en programa.
--
-- Primero las que coinciden ENTERAS, después las que aparecen adentro. Es lo
-- que hace que «¿Cuál es tu nombre completo?» se reconozca sin tener que
-- anotar cada frase que se le ocurra a quien arma la pauta.

create temporary table pg_temp.campos on commit drop as
select mensaje_id,
       cliente_id,
       creado_en,
       orden,
       valor,
       case
         when etiqueta in ('email', 'e-mail', 'correo', 'correo electronico', 'mail')
           then 'correo'
         when etiqueta in ('full name', 'nombre completo', 'nombre y apellido', 'nombre', 'name')
           then 'nombre'
         when etiqueta in ('phone number', 'telefono', 'numero de telefono',
                           'numero de celular', 'celular', 'whatsapp', 'phone', 'numero')
           then 'telefono'
         when etiqueta in ('curso corto de tu interes', 'curso de tu interes',
                           'curso de interes', 'programa de interes',
                           'diplomado de tu interes', 'que diplomado te interesa',
                           'que curso te interesa', 'programa', 'diplomado', 'curso', 'interes')
           then 'programa'
         when etiqueta in ('province', 'provincia', 'departamento', 'state', 'estado', 'region')
           then 'departamento'
         when etiqueta in ('city', 'ciudad', 'municipio', 'localidad')
           then 'ciudad'
         when etiqueta in ('company', 'empresa', 'negocio', 'organizacion')
           then 'empresa'
         when etiqueta in ('job title', 'cargo', 'puesto', 'ocupacion', 'profesion')
           then 'cargo'

         when etiqueta like '%email%' or etiqueta like '%e-mail%'
           or etiqueta like '%correo%' or etiqueta like '%mail%'
           then 'correo'
         when etiqueta like '%full name%' or etiqueta like '%nombre completo%'
           or etiqueta like '%nombre y apellido%' or etiqueta like '%nombre%'
           or etiqueta like '%name%'
           then 'nombre'
         when etiqueta like '%phone number%' or etiqueta like '%telefono%'
           or etiqueta like '%numero de telefono%' or etiqueta like '%numero de celular%'
           or etiqueta like '%celular%' or etiqueta like '%whatsapp%'
           or etiqueta like '%phone%' or etiqueta like '%numero%'
           then 'telefono'
         when etiqueta like '%curso corto de tu interes%' or etiqueta like '%curso de tu interes%'
           or etiqueta like '%curso de interes%' or etiqueta like '%programa de interes%'
           or etiqueta like '%diplomado de tu interes%' or etiqueta like '%que diplomado te interesa%'
           or etiqueta like '%que curso te interesa%' or etiqueta like '%programa%'
           or etiqueta like '%diplomado%' or etiqueta like '%curso%' or etiqueta like '%interes%'
           then 'programa'
         when etiqueta like '%province%' or etiqueta like '%provincia%'
           or etiqueta like '%departamento%' or etiqueta like '%state%'
           or etiqueta like '%estado%' or etiqueta like '%region%'
           then 'departamento'
         when etiqueta like '%city%' or etiqueta like '%ciudad%'
           or etiqueta like '%municipio%' or etiqueta like '%localidad%'
           then 'ciudad'
         when etiqueta like '%company%' or etiqueta like '%empresa%'
           or etiqueta like '%negocio%' or etiqueta like '%organizacion%'
           then 'empresa'
         when etiqueta like '%job title%' or etiqueta like '%cargo%'
           or etiqueta like '%puesto%' or etiqueta like '%ocupacion%'
           or etiqueta like '%profesion%'
           then 'cargo'
       end as campo
  from pg_temp.renglones
 where valor <> '';

delete from pg_temp.campos where campo is null;

-- ---------------------------------------------------------------------------
-- 3. Un formulario por mensaje, y el más viejo de cada persona
-- ---------------------------------------------------------------------------
--
-- Hacen falta DOS campos reconocidos para creer que esto es un formulario. Con
-- uno solo se confundiría un mensaje común: «Programa: el del sábado» es una
-- frase que alguien escribe de verdad.
--
-- Y dentro de un mensaje, si la etiqueta se repite gana la de más arriba: un
-- formulario con dos «Nombre» es raro, y si pasa, el primero es el que la
-- persona llenó.

create temporary table pg_temp.uno_por_campo on commit drop as
select distinct on (mensaje_id, campo)
       mensaje_id, cliente_id, creado_en, campo, valor
  from pg_temp.campos
 order by mensaje_id, campo, orden;

create temporary table pg_temp.formularios on commit drop as
select mensaje_id,
       cliente_id,
       creado_en,
       max(valor) filter (where campo = 'nombre')       as nombre,
       max(valor) filter (where campo = 'correo')       as correo,
       max(valor) filter (where campo = 'telefono')     as telefono,
       max(valor) filter (where campo = 'programa')     as programa,
       max(valor) filter (where campo = 'departamento') as departamento,
       max(valor) filter (where campo = 'ciudad')       as ciudad,
       max(valor) filter (where campo = 'empresa')      as empresa,
       max(valor) filter (where campo = 'cargo')        as cargo
  from pg_temp.uno_por_campo
 group by mensaje_id, cliente_id, creado_en
having count(*) >= 2;

-- El más viejo de cada persona: es el que la ficha habría tomado al entrar.
create temporary table pg_temp.de_pauta on commit drop as
select distinct on (cliente_id) *
  from pg_temp.formularios
 order by cliente_id, creado_en asc, mensaje_id asc;

-- ---------------------------------------------------------------------------
-- 4. Antes: cuántos hay
-- ---------------------------------------------------------------------------

select count(*) as formularios_encontrados_en_el_historial from pg_temp.de_pauta;

-- ---------------------------------------------------------------------------
-- 5. La ficha
-- ---------------------------------------------------------------------------

update public.clientes cl
   set nombre = coalesce(
         -- El nombre se reemplaza también cuando lo que hay es el TELÉFONO:
         -- eso no es un nombre, es lo que puso el CRM por no tener nada mejor.
         -- Un nombre de perfil SÍ se respeta aunque sea un apodo: lo eligió
         -- esa persona, y pisarlo sería que el CRM decida cómo se llama.
         case when nullif(btrim(coalesce(cl.nombre, '')), '') is null
                or btrim(cl.nombre) = coalesce(cl.telefono, '')
              then d.nombre end,
         cl.nombre),
       correo   = coalesce(nullif(btrim(coalesce(cl.correo, '')), ''),  d.correo),
       empresa  = coalesce(nullif(btrim(coalesce(cl.empresa, '')), ''), d.empresa),
       cargo    = coalesce(nullif(btrim(coalesce(cl.cargo, '')), ''),   d.cargo),
       -- El teléfono del formulario NUNCA reemplaza al del hilo: el del hilo lo
       -- confirmó Meta, el del formulario lo escribió alguien a mano.
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

-- ---------------------------------------------------------------------------
-- 6. El programa y el territorio, sin adivinar
-- ---------------------------------------------------------------------------

create temporary table pg_temp.cat_prod on commit drop as
select id, lower(translate(nombre, 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as plano
  from public.productos;

create temporary table pg_temp.cat_terr on commit drop as
select id, lower(translate(nombre, 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as plano
  from public.territorios;

create temporary table pg_temp.buscado on commit drop as
select cliente_id,
       lower(translate(coalesce(programa, ''),     'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as programa,
       lower(translate(coalesce(ciudad, ''),       'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as ciudad,
       lower(translate(coalesce(departamento, ''), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as departamento
  from pg_temp.de_pauta;

-- EL «cuantos = 1» ES LA REGLA MÁS IMPORTANTE DEL ARCHIVO.
--
-- Con dos candidatos no elige ninguno. «Curso corto» no puede decidir entre
-- dos cursos, así que no decide. Adivinar mal pone en la ficha un programa que
-- la persona no pidió, y a un campo que se llenó solo nadie lo revisa; de ahí
-- pasa a los reportes.
--
-- No adivinar no cuesta nada: el campo queda como estaba y la asesora lo elige
-- mirando el hilo, que es exactamente lo que hacía antes.

create temporary table pg_temp.prog_exacto on commit drop as
select b.cliente_id, min(p.id) as producto_id, count(*) as cuantos
  from pg_temp.buscado b
  join pg_temp.cat_prod p on p.plano = b.programa
 where b.programa <> ''
 group by b.cliente_id;

-- Menos de cuatro letras sólo busca por nombre exacto: «Noe» aparece dentro de
-- demasiadas cosas.
create temporary table pg_temp.prog_parecido on commit drop as
select b.cliente_id, min(p.id) as producto_id, count(*) as cuantos
  from pg_temp.buscado b
  join pg_temp.cat_prod p
    on length(p.plano) >= 4
   and (position(b.programa in p.plano) > 0 or position(p.plano in b.programa) > 0)
 where length(b.programa) >= 4
   and not exists (select 1 from pg_temp.prog_exacto e where e.cliente_id = b.cliente_id)
 group by b.cliente_id;

-- La ciudad primero: algunas pautas mandan bien la ciudad y mal el
-- departamento. Gana el que el catálogo reconozca.
create temporary table pg_temp.terr_ciudad on commit drop as
select b.cliente_id, min(t.id) as territorio_id, count(*) as cuantos
  from pg_temp.buscado b
  join pg_temp.cat_terr t on t.plano = b.ciudad
 where b.ciudad <> ''
 group by b.cliente_id;

create temporary table pg_temp.terr_depto on commit drop as
select b.cliente_id, min(t.id) as territorio_id, count(*) as cuantos
  from pg_temp.buscado b
  join pg_temp.cat_terr t on t.plano = b.departamento
 where b.departamento <> ''
 group by b.cliente_id;

create temporary table pg_temp.elegido on commit drop as
select b.cliente_id,
       coalesce(
         (select e.producto_id from pg_temp.prog_exacto   e where e.cliente_id = b.cliente_id and e.cuantos = 1),
         (select p.producto_id from pg_temp.prog_parecido p where p.cliente_id = b.cliente_id and p.cuantos = 1)
       ) as producto_id,
       coalesce(
         (select c.territorio_id from pg_temp.terr_ciudad c where c.cliente_id = b.cliente_id and c.cuantos = 1),
         (select t.territorio_id from pg_temp.terr_depto  t where t.cliente_id = b.cliente_id and t.cuantos = 1)
       ) as territorio_id
  from pg_temp.buscado b;

-- La oportunidad MÁS NUEVA de cada persona: alguien que ya cursó un diplomado
-- y ahora pregunta por otro tiene dos, y lo que llegó es de la de ahora.
create temporary table pg_temp.la_ultima on commit drop as
select distinct on (o.cliente_id) o.id, o.cliente_id
  from public.oportunidades o
  join pg_temp.de_pauta d on d.cliente_id = o.cliente_id
 order by o.cliente_id, o.id desc;

update public.oportunidades o
   set producto_id   = coalesce(o.producto_id, e.producto_id),
       territorio_id = coalesce(o.territorio_id, e.territorio_id)
  from pg_temp.elegido e
  join pg_temp.la_ultima u on u.cliente_id = e.cliente_id
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
-- 7. Cómo quedó
-- ---------------------------------------------------------------------------
--
-- «Sin correo todavía» no es un fallo: hay formularios que no lo traen, y
-- fichas que ya tenían uno escrito a mano y no se tocaron.

select
  (select count(*) from public.clientes where correo is not null) as fichas_con_correo,
  (select count(*) from public.oportunidades where producto_id is not null) as con_programa,
  (select count(*) from public.oportunidades where territorio_id is not null) as con_territorio;
