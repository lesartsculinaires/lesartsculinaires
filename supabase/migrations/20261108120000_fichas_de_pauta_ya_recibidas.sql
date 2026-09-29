-- Las fichas de pauta que entraron ANTES de que el CRM supiera leerlas.
--
-- ============================================================================
-- ESTO ES UNA SOLA SENTENCIA, Y ESA ES LA DECISIÓN DE DISEÑO
-- ============================================================================
--
-- Hicieron falta tres intentos para entenderlo. El editor SQL del panel parte
-- el texto en sentencias con un analizador propio y lo parte mal:
--
--   CON FUNCIONES         «unterminated dollar-quoted string». Cortaba un
--                         cuerpo por la mitad. Etiquetar los bloques y sacar
--                         los caracteres raros no alcanzó: cortaba en otro lado.
--   CON TABLAS TEMPORALES «syntax error at end of input, LINE 0», o sea un
--                         pedazo vacío. Y además disparaba el aviso de RLS.
--
-- Postgres nunca tuvo problema con ninguna de las dos: las tres versiones
-- corrían bien con psql. El que decide es el editor.
--
-- Así que acá no hay nada que partir. Un solo «with», un solo punto y coma, el
-- último. Sin funciones, sin tablas, sin transacción explícita —una sentencia
-- ya es atómica— y sin un solo signo de dólar.
--
-- Las tres partes que escriben van adentro del mismo «with». Postgres las
-- ejecuta siempre, estén o no nombradas al final, y todas ven la misma foto de
-- la base: o entra todo, o no entra nada.
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
--                         mano, porque un hueco se ve y uno pisado no.
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

with renglones as (
  -- Cada mensaje partido en renglones, y cada renglón en etiqueta y valor.
  select m.id         as mensaje_id,
         c.cliente_id as cliente_id,
         m.creado_en  as creado_en,
         r.n          as orden,
         -- La etiqueta, limpia: sin la negrita que mandan algunas pautas, sin
         -- tildes y sin mayúsculas. Es lo único que se compara.
         lower(translate(
           btrim(translate(split_part(r.linea, ':', 1), '*_~', '')),
           'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as etiqueta,
         -- El valor va TAL CUAL, con sus tildes y mayúsculas, porque es lo que
         -- se guarda en la ficha. Y se corta en el PRIMER dos puntos: un valor
         -- puede tener los suyos —una hora, una dirección web— y partir por
         -- todos dejaría el resto tirado.
         btrim(substr(r.linea, position(':' in r.linea) + 1)) as valor
    from public.mensajes m
    join public.conversaciones c on c.id = m.conversacion_id
    cross join lateral regexp_split_to_table(m.texto, '\r?\n')
      with ordinality as r(linea, n)
   where m.direccion = 'entrante'
     and c.cliente_id is not null
     and m.texto is not null
     and position(':' in r.linea) > 0
),
campos as (
  -- A qué campo corresponde cada etiqueta.
  --
  -- EL ORDEN DE ESTE «case» ES LA REGLA. Se evalúa de arriba abajo y gana el
  -- primero que coincida, así que las más específicas van primero: «Curso
  -- Corto de tu interés» contiene «curso» y también «interes», y tiene que
  -- caer en programa.
  --
  -- Primero las que coinciden ENTERAS, después las que aparecen adentro. Eso
  -- último es lo que hace que «¿Cuál es tu nombre completo?» se reconozca sin
  -- anotar cada frase que se le ocurra a quien arma la pauta.
  select mensaje_id, cliente_id, creado_en, orden, valor,
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
                             'que curso te interesa', 'programa', 'diplomado',
                             'curso', 'interes')
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
    from renglones
   where valor <> ''
),
uno_por_campo as (
  -- Si la etiqueta se repite dentro de un mensaje, gana la de más arriba: un
  -- formulario con dos «Nombre» es raro, y si pasa, el primero es el que la
  -- persona llenó.
  select distinct on (mensaje_id, campo)
         mensaje_id, cliente_id, creado_en, campo, valor
    from campos
   where campo is not null
   order by mensaje_id, campo, orden
),
formularios as (
  -- Hacen falta DOS campos reconocidos para creer que esto es un formulario.
  -- Con uno solo se confundiría un mensaje común: «Programa: el del sábado» es
  -- una frase que alguien escribe de verdad.
  select mensaje_id, cliente_id, creado_en,
         max(valor) filter (where campo = 'nombre')       as nombre,
         max(valor) filter (where campo = 'correo')       as correo,
         max(valor) filter (where campo = 'telefono')     as telefono,
         max(valor) filter (where campo = 'programa')     as programa,
         max(valor) filter (where campo = 'departamento') as departamento,
         max(valor) filter (where campo = 'ciudad')       as ciudad,
         max(valor) filter (where campo = 'empresa')      as empresa,
         max(valor) filter (where campo = 'cargo')        as cargo
    from uno_por_campo
   group by mensaje_id, cliente_id, creado_en
  having count(*) >= 2
),
de_pauta as (
  -- El más viejo de cada persona: es el que la ficha habría tomado al entrar.
  select distinct on (cliente_id) *
    from formularios
   order by cliente_id, creado_en asc, mensaje_id asc
),
cat_prod as (
  select id, lower(translate(nombre, 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as plano
    from public.productos
),
cat_terr as (
  select id, lower(translate(nombre, 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as plano
    from public.territorios
),
buscado as (
  select cliente_id,
         lower(translate(coalesce(programa, ''),     'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as programa,
         lower(translate(coalesce(ciudad, ''),       'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as ciudad,
         lower(translate(coalesce(departamento, ''), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')) as departamento
    from de_pauta
),
prog_exacto as (
  select b.cliente_id, min(p.id) as producto_id, count(*) as cuantos
    from buscado b
    join cat_prod p on p.plano = b.programa
   where b.programa <> ''
   group by b.cliente_id
),
prog_parecido as (
  -- Menos de cuatro letras sólo busca por nombre exacto: «Noe» aparece dentro
  -- de demasiadas cosas.
  select b.cliente_id, min(p.id) as producto_id, count(*) as cuantos
    from buscado b
    join cat_prod p
      on length(p.plano) >= 4
     and (position(b.programa in p.plano) > 0 or position(p.plano in b.programa) > 0)
   where length(b.programa) >= 4
     and not exists (select 1 from prog_exacto e where e.cliente_id = b.cliente_id)
   group by b.cliente_id
),
terr_ciudad as (
  select b.cliente_id, min(t.id) as territorio_id, count(*) as cuantos
    from buscado b
    join cat_terr t on t.plano = b.ciudad
   where b.ciudad <> ''
   group by b.cliente_id
),
terr_depto as (
  select b.cliente_id, min(t.id) as territorio_id, count(*) as cuantos
    from buscado b
    join cat_terr t on t.plano = b.departamento
   where b.departamento <> ''
   group by b.cliente_id
),
elegido as (
  -- EL «cuantos = 1» ES LA REGLA MÁS IMPORTANTE DEL ARCHIVO.
  --
  -- Con dos candidatos no elige ninguno. «Curso corto» no puede decidir entre
  -- dos cursos, así que no decide. Adivinar mal pone en la ficha un programa
  -- que la persona no pidió, y a un campo que se llenó solo nadie lo revisa.
  -- De ahí pasa a los reportes.
  --
  -- No adivinar no cuesta nada: el campo queda como estaba y la asesora lo
  -- elige mirando el hilo, que es exactamente lo que hacía antes.
  select b.cliente_id,
         coalesce(
           (select e.producto_id from prog_exacto   e where e.cliente_id = b.cliente_id and e.cuantos = 1),
           (select p.producto_id from prog_parecido p where p.cliente_id = b.cliente_id and p.cuantos = 1)
         ) as producto_id,
         -- La ciudad primero: algunas pautas mandan bien la ciudad y mal el
         -- departamento. Gana el que el catálogo reconozca.
         coalesce(
           (select c.territorio_id from terr_ciudad c where c.cliente_id = b.cliente_id and c.cuantos = 1),
           (select t.territorio_id from terr_depto  t where t.cliente_id = b.cliente_id and t.cuantos = 1)
         ) as territorio_id
    from buscado b
),
la_ultima as (
  -- La oportunidad MÁS NUEVA de cada persona: alguien que ya cursó un
  -- diplomado y ahora pregunta por otro tiene dos, y lo que llegó es de la de
  -- ahora.
  select distinct on (o.cliente_id) o.id, o.cliente_id
    from public.oportunidades o
    join de_pauta d on d.cliente_id = o.cliente_id
   order by o.cliente_id, o.id desc
),
upd_cliente as (
  update public.clientes cl
     set nombre = coalesce(
           -- El nombre se reemplaza también cuando lo que hay es el TELÉFONO:
           -- eso no es un nombre, es lo que puso el CRM por no tener nada
           -- mejor. Un nombre de perfil SÍ se respeta aunque sea un apodo: lo
           -- eligió esa persona, y pisarlo sería que el CRM decida cómo se
           -- llama alguien.
           case when nullif(btrim(coalesce(cl.nombre, '')), '') is null
                  or btrim(cl.nombre) = coalesce(cl.telefono, '')
                then d.nombre end,
           cl.nombre),
         correo   = coalesce(nullif(btrim(coalesce(cl.correo, '')), ''),  d.correo),
         empresa  = coalesce(nullif(btrim(coalesce(cl.empresa, '')), ''), d.empresa),
         cargo    = coalesce(nullif(btrim(coalesce(cl.cargo, '')), ''),   d.cargo),
         -- El teléfono del formulario NUNCA reemplaza al del hilo: el del hilo
         -- lo confirmó Meta, el del formulario lo escribió alguien a mano.
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
    from de_pauta d
   where d.cliente_id = cl.id
  returning cl.id
),
upd_oportunidad as (
  update public.oportunidades o
     set producto_id   = coalesce(o.producto_id, e.producto_id),
         territorio_id = coalesce(o.territorio_id, e.territorio_id)
    from elegido e
    join la_ultima u on u.cliente_id = e.cliente_id
   where o.id = u.id
  returning o.id, o.producto_id
),
ins_programa as (
  -- Y el programa queda también entre «por los que preguntó».
  insert into public.oportunidad_programas (oportunidad_id, producto_id)
  select id, producto_id from upd_oportunidad where producto_id is not null
  on conflict (oportunidad_id, producto_id) do nothing
  returning 1
)
select (select count(*) from de_pauta)          as formularios_encontrados,
       (select count(*) from upd_cliente)       as fichas_revisadas,
       (select count(*) from upd_oportunidad)   as oportunidades_revisadas,
       (select count(*) from ins_programa)      as intereses_anotados;
