begin;

-- Las ocho fichas que se quedaron llamándose «Contacto de Instagram».
--
-- ============================================================================
-- LO QUE MOSTRARON LOS NÚMEROS, Y POR QUÉ LA MIGRACIÓN ANTERIOR NO ALCANZÓ
-- ============================================================================
--
-- Después de correr 20261105120000, el diagnóstico devolvió esto:
--
--     fichas_sin_nombre       8
--     hilos_de_instagram      1
--     hilos_sin_nombre        0
--     mensajes_de_instagram   2
--
-- Ocho fichas llamadas «Contacto de Instagram» y UN SOLO hilo de Instagram. O
-- sea que siete de esas ocho no cuelgan de un hilo de Instagram, y el arreglo
-- hacia atrás de la migración anterior —que filtraba `canal = 'instagram'`— no
-- las podía tocar.
--
-- ============================================================================
-- DÓNDE ESTÁN, ENTONCES
-- ============================================================================
--
-- En Messenger. Es la cola de un problema ya arreglado: las dos suscripciones
-- de Meta apuntaban a la misma dirección, así que durante un tiempo TODO lo de
-- Messenger se guardó como Instagram. Las fichas de esa gente se abrieron con
-- el nombre de respaldo de Instagram.
--
-- Después, `20261029130000_messenger_mal_etiquetado.sql` movió los hilos a su
-- canal de verdad y `20261102120000_unir_chats_partidos.sql` reunió los que
-- habían quedado partidos en dos. Las dos arreglaron `conversaciones`. Ninguna
-- tocó `clientes`, así que el nombre de respaldo equivocado se quedó ahí.
--
-- ============================================================================
-- QUÉ HACE ESTE ARCHIVO
-- ============================================================================
--
-- Baja a la ficha el nombre que el hilo ya tiene, venga del canal que venga.
-- No le pregunta nada a Meta: el dato está, sólo que nunca cruzó de una tabla
-- a la otra.
--
-- Lo que NO toca, y es la mitad del cuidado:
--
--   UN NOMBRE ESCRITO A MANO   La condición es que la ficha se llame
--                              exactamente «Contacto de Instagram» o «Contacto
--                              de Messenger». Una que alguien llamó «Contacto
--                              de la feria de septiembre» no entra.
--
--   UN @USUARIO                No es un nombre. Si es lo único que hay en el
--                              hilo, la ficha se queda como está y el botón de
--                              la bandeja lo volverá a intentar.
--
--   LAS QUE NO TIENEN DE DÓNDE  Si el hilo tampoco tiene nombre, no hay nada
--                              que copiar. Ésas esperan a que Meta apruebe el
--                              Acceso Avanzado.
--
-- Se puede correr con gente trabajando, y dos veces.

-- ---------------------------------------------------------------------------
-- 1. Antes: dónde está cada una.
-- ---------------------------------------------------------------------------

do $$
declare
  fila record;
begin
  raise notice '--- fichas con nombre de respaldo, por canal del hilo ---';
  for fila in
    select coalesce(c.canal, '(sin hilo)') as canal,
           count(*)                        as fichas,
           count(*) filter (
             where nullif(btrim(coalesce(c.nombre_perfil, '')), '') is not null
               and btrim(c.nombre_perfil) not like '@%'
           )                               as con_nombre_en_el_hilo
      from public.clientes cl
      left join public.conversaciones c on c.cliente_id = cl.id
     where btrim(cl.nombre) in ('Contacto de Instagram', 'Contacto de Messenger')
     group by 1
  loop
    raise notice '% → % fichas, % se pueden arreglar ahora',
      fila.canal, fila.fichas, fila.con_nombre_en_el_hilo;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. El arreglo, sin mirar el canal.
-- ---------------------------------------------------------------------------
--
-- `distinct on` porque una persona puede tener más de un hilo —pasó con los
-- que estaban partidos entre Instagram y Messenger—. Se toma el del mensaje
-- más reciente, que es el que tiene el nombre resuelto.

with mejor as (
  select distinct on (c.cliente_id)
         c.cliente_id,
         btrim(c.nombre_perfil) as nombre
    from public.conversaciones c
   where c.cliente_id is not null
     and nullif(btrim(coalesce(c.nombre_perfil, '')), '') is not null
     and btrim(c.nombre_perfil) not like '@%'
     and btrim(c.nombre_perfil) not in ('Contacto de Instagram', 'Contacto de Messenger')
   order by c.cliente_id, c.ultimo_mensaje_en desc nulls last
)
update public.clientes cl
   set nombre = mejor.nombre
  from mejor
 where mejor.cliente_id = cl.id
   and btrim(cl.nombre) in ('Contacto de Instagram', 'Contacto de Messenger');

commit;

-- ---------------------------------------------------------------------------
-- 3. Después: qué quedó, y por qué.
-- ---------------------------------------------------------------------------

select
  (select count(*) from public.clientes
    where btrim(nombre) in ('Contacto de Instagram', 'Contacto de Messenger'))
                                                          as fichas_que_siguen_sin_nombre,
  (select count(*) from public.conversaciones c
     join public.clientes cl on cl.id = c.cliente_id
    where btrim(cl.nombre) in ('Contacto de Instagram', 'Contacto de Messenger')
      and nullif(btrim(coalesce(c.nombre_perfil, '')), '') is null)
                                                          as porque_el_hilo_tampoco_lo_tiene,
  (select count(*) from public.clientes cl
    where btrim(cl.nombre) in ('Contacto de Instagram', 'Contacto de Messenger')
      and not exists (select 1 from public.conversaciones c where c.cliente_id = cl.id))
                                                          as porque_no_tienen_hilo;
