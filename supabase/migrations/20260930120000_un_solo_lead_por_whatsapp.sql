begin;

-- Un solo lead por persona, decidido en la base y no en el servidor.
--
-- ------------------------------------------------------------------------
-- QUÉ ESTÁ PASANDO
-- ------------------------------------------------------------------------
--
-- El webhook de WhatsApp ya sabe no duplicar. El problema es CUÁNDO lo sabe.
-- Hoy pregunta y después escribe, en dos pasos separados:
--
--     1. ¿este cliente ya tiene algún lead?      →  no
--     2. entonces le abro uno y le sorteo asesor
--
-- Entre el paso 1 y el paso 2 no hay nada que impida que otro mensaje de la
-- MISMA persona esté haciendo exactamente lo mismo. Y eso no es raro: quien
-- escribe manda «Hola», «buenas tardes», «quiero información» en tres globos
-- seguidos. Meta los entrega en llamadas separadas, Netlify levanta una
-- función por llamada, y las tres corren a la vez en máquinas distintas.
--
-- Las tres preguntan «¿ya tiene lead?» antes de que ninguna haya escrito. Las
-- tres reciben «no». Las tres abren uno. Y como cada una sortea por su cuenta,
-- cada lead cae en un asesor distinto: es exactamente lo que se ve en la
-- pantalla —el mismo nombre, el mismo teléfono, el mismo día, dos vendedoras
-- distintas—.
--
-- No hay forma de arreglar esto en el servidor de la aplicación. Se puede
-- hacer la ventana más chica, pero mientras preguntar y escribir sean dos
-- viajes separados a la base, siempre va a haber un hueco entre los dos. La
-- única que puede decidir sin hueco es la base, porque es la única que ve las
-- tres llamadas.
--
-- ------------------------------------------------------------------------
-- EL SEGUNDO AGUJERO: EL TELÉFONO CON GUIONES
-- ------------------------------------------------------------------------
--
-- Buscar la ficha existente se hacía comparando el texto crudo del teléfono
-- contra los últimos ocho dígitos del número de WhatsApp. Pero en la base los
-- teléfonos están escritos de todas las formas —«7797-2598», «+503 7797
-- 2598», «50377972598»— porque unos se cargaron a mano, otros vinieron de una
-- planilla y otros los puso el propio webhook.
--
-- Contra «7797-2598» esa comparación NO encuentra nada: el guión está en el
-- medio de los ocho dígitos. Así que a un cliente cargado a mano que después
-- escribe por WhatsApp se le abría una ficha nueva, con su lead nuevo y su
-- asesor nuevo, al lado de la que ya tenía.
--
-- Acá se compara como compara el resto del CRM: sacando todo lo que no es
-- dígito primero.
--
-- ------------------------------------------------------------------------
-- CÓMO SE ARREGLA
-- ------------------------------------------------------------------------
--
-- Las dos decisiones —qué ficha es y si le abro lead— pasan a ser una sola
-- llamada cada una, adentro de la base, con candado.
--
-- El candado es `pg_advisory_xact_lock`: la primera llamada lo toma, las otras
-- esperan ahí mismo, y cuando les toca entrar la pregunta ya tiene otra
-- respuesta —«sí, ya tiene lead»— así que no abren nada. Se suelta solo al
-- terminar la transacción, incluso si algo falla; no hay forma de quedárselo.
--
-- Es el mismo mecanismo que ya usa `numerar_oportunidad` para que dos altas
-- simultáneas no se peleen el mismo código. Esto es el hermano del problema:
-- ahí se peleaban el número, acá se pisan el lead.
--
-- Se puede correr con gente trabajando, y dos veces. No toca ningún dato: sólo
-- agrega dos funciones y un índice.

-- ------------------------------------------------- buscar por los dígitos

/*
 * Sin este índice la búsqueda del teléfono recorre la tabla entera.
 *
 * El índice de `telefono` que ya está no sirve para esto: indexa el texto tal
 * cual, y acá se busca por el resultado de limpiarlo. Postgres sólo puede usar
 * un índice si está armado sobre exactamente la misma expresión.
 */
create index if not exists ix_clientes_telefono_digitos
  on public.clientes ((right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 8)))
  where telefono is not null;

-- --------------------------------------------------------- la ficha correcta

/*
 * La ficha de quien escribe por WhatsApp: la que ya está, o una nueva.
 *
 * Devuelve el id y nada más. Si el número no tiene ocho dígitos devuelve nulo
 * —no es un teléfono— y quien llama sigue sin ficha, que es lo que hacía
 * antes: el mensaje se guarda igual y alguien lo resuelve desde la bandeja.
 *
 * Ocho dígitos y no nueve porque el número local salvadoreño tiene ocho y el
 * código de país puede venir o no. Menos de ocho empezaría a juntar gente
 * distinta, que es peor que duplicar.
 *
 * Cuando hay más de una ficha con ese número se queda con la más vieja: es la
 * que tiene la historia —las notas, los cursos, los adjuntos—.
 */
create or replace function public.cliente_de_whatsapp(
  p_telefono text,
  p_nombre   text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  digitos    text;
  clave      text;
  id_cliente bigint;
begin
  digitos := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  if length(digitos) < 8 then
    return null;
  end if;

  clave := right(digitos, 8);

  -- Desde acá y hasta el final de la transacción, ningún otro mensaje de este
  -- mismo número puede estar haciendo lo mismo.
  perform pg_advisory_xact_lock(hashtext('cliente_de_whatsapp:' || clave));

  select c.id
    into id_cliente
    from public.clientes c
   where right(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), 8) = clave
   order by c.id
   limit 1;

  if id_cliente is not null then
    return id_cliente;
  end if;

  -- Sin nombre de perfil queda el teléfono, que es mejor que «Sin nombre»: al
  -- menos se puede buscar y reconocer en la lista.
  insert into public.clientes (nombre, telefono)
  values (
    coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), p_telefono),
    nullif(p_telefono, '')
  )
  returning clientes.id into id_cliente;

  return id_cliente;
end $$;

comment on function public.cliente_de_whatsapp(text, text) is
  'La ficha del número que escribió por WhatsApp: la que ya existe, o una nueva. Con candado.';

revoke execute on function public.cliente_de_whatsapp(text, text) from anon;
grant  execute on function public.cliente_de_whatsapp(text, text) to service_role;

-- ------------------------------------------------------------ abrir el lead

/*
 * Abrirle lead a quien escribió, si es que no tiene.
 *
 * Devuelve siempre una fila, tenga o no que crear algo, y `se_creo` dice cuál
 * de las dos cosas pasó. `id_vendedor` viene lleno en los dos casos —el que se
 * sorteó, o el que ya tenía el lead que estaba— porque quien llama lo necesita
 * igual: la conversación de la bandeja tiene que quedar del mismo asesor que
 * el lead, y si no lo dijera habría que ir a buscarlo en otro viaje.
 *
 * Cuando ya hay leads se elige el de dueño más reciente y no simplemente el
 * último: un lead sin asignar no sirve para saber a quién le toca el hilo.
 *
 * El código del lead lo pone `numerar_oportunidad`, que es el disparador que
 * ya está. Por eso se inserta con el código en nulo: proponerle uno desde acá
 * sería volver a tener dos lugares que numeran.
 */
create or replace function public.abrir_lead_de_whatsapp(
  p_cliente  bigint,
  p_vendedor bigint,
  p_canal    bigint,
  p_etapa    bigint,
  p_fecha    date
)
returns table (
  id_lead     bigint,
  codigo_lead text,
  id_vendedor bigint,
  se_creo     boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       bigint;
  v_codigo   text;
  v_vendedor bigint;
  v_creo     boolean := false;
begin
  if p_cliente is null then
    return;
  end if;

  -- El candado es por cliente: dos personas distintas escribiendo a la vez no
  -- se hacen esperar entre ellas, sólo los mensajes de la misma.
  perform pg_advisory_xact_lock(hashtext('lead_de_whatsapp:' || p_cliente::text));

  select o.id, o.codigo, o.vendedor_id
    into v_id, v_codigo, v_vendedor
    from public.oportunidades o
   where o.cliente_id = p_cliente
   order by (o.vendedor_id is null), o.id desc
   limit 1;

  if v_id is null then
    insert into public.oportunidades
      (codigo, cliente_id, vendedor_id, canal_id, etapa_id, fecha_registro)
    values
      (null, p_cliente, p_vendedor, p_canal, p_etapa, coalesce(p_fecha, current_date))
    returning oportunidades.id, oportunidades.codigo, oportunidades.vendedor_id
      into v_id, v_codigo, v_vendedor;

    v_creo := true;
  end if;

  id_lead     := v_id;
  codigo_lead := v_codigo;
  id_vendedor := v_vendedor;
  se_creo     := v_creo;
  return next;
end $$;

comment on function public.abrir_lead_de_whatsapp(bigint, bigint, bigint, bigint, date) is
  'Le abre lead a quien escribió por WhatsApp sólo si no tiene ninguno. Con candado.';

revoke execute on function public.abrir_lead_de_whatsapp(bigint, bigint, bigint, bigint, date) from anon;
grant  execute on function public.abrir_lead_de_whatsapp(bigint, bigint, bigint, bigint, date) to service_role;

commit;

-- ------------------------------------------------------------------------
-- QUÉ DUPLICADOS QUEDARON DE ANTES
-- ------------------------------------------------------------------------
--
-- Esto no los arregla: los cuenta. Arreglarlos es fusionar, y fusionar mueve
-- notas y adjuntos de una ficha a otra, así que no se hace sin que alguien
-- mire primero. Para eso está LEADS-DUPLICADOS.sql, que los lista uno por uno.

select
  (select count(*) from (
     select 1
       from public.clientes c
      where length(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g')) >= 8
      group by right(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), 8)
     having count(*) > 1
   ) t)                                                    as numeros_con_dos_fichas,
  (select count(*) from (
     select 1
       from public.oportunidades o
       join public.etapas e on e.id = o.etapa_id
      where e.nombre ilike 'prospectos'
      group by o.cliente_id
     having count(*) > 1
   ) t)                                                    as fichas_con_dos_leads_sin_avanzar,
  '✓ de acá en adelante no se duplican'                    as desde_ahora;
