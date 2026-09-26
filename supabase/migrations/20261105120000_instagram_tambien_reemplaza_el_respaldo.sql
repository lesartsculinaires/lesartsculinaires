begin;

-- Instagram también tiene que reemplazar «Contacto de Instagram».
--
-- ============================================================================
-- LO QUE REPORTÓ LA ESCUELA
-- ============================================================================
--
-- «Veía que caían mensajes pero no se visualizaban los nombres.»
--
-- Los mensajes entran bien. Lo que no se arregla nunca es la FICHA: quedan
-- clientes llamados «Contacto de Instagram» para siempre, incluso cuando el
-- hilo de al lado ya tiene el nombre de verdad.
--
-- ============================================================================
-- POR QUÉ PASA, MEDIDO
-- ============================================================================
--
-- Hay dos funciones que resuelven de quién es un identificador de Meta, y no
-- hacen lo mismo:
--
--   cliente_de_canal        La nueva, de 20261029120000_nombre_de_respaldo.sql.
--   (Messenger)             Cuando llega un nombre de verdad, reemplaza el
--                           hueco, el @usuario Y el nombre de respaldo.
--
--   cliente_de_instagram    La vieja, de 20261024120000_instagram.sql. Sólo
--   (Instagram)             reemplaza el hueco y el @usuario. El respaldo NO
--                           está en su lista, así que «Contacto de Instagram»
--                           se queda pegado aunque después llegue el nombre.
--
-- La migración del respaldo arregló el camino de Messenger y dejó el de
-- Instagram como estaba. Por eso el síntoma se ve en un canal y no en el otro.
--
-- ============================================================================
-- CÓMO SE ARREGLA, Y POR QUÉ ASÍ
-- ============================================================================
--
-- `cliente_de_instagram` pasa a delegar en `cliente_de_canal`. No se le copia
-- la regla: se la llama.
--
-- Copiarla sería volver a tener dos versiones de la misma decisión —cuándo se
-- puede pisar el nombre de una ficha y cuándo no— y esa duplicación es
-- exactamente lo que causó este error. La próxima vez que la regla cambie,
-- cambia en un solo lugar.
--
-- La firma no se toca: el webhook de Instagram y el botón de «buscar los
-- nombres que faltan» la llaman con tres argumentos, y siguen funcionando sin
-- desplegar nada.
--
-- Se puede correr con gente trabajando, y dos veces.

create or replace function public.cliente_de_instagram(
  p_igsid   text,
  p_usuario text,
  p_nombre  text
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  -- «Instagram» con mayúscula: es como se llama en el catálogo `canales`, y
  -- `cliente_de_canal` lo busca sin distinguir mayúsculas de todos modos.
  select public.cliente_de_canal('Instagram', p_igsid, p_usuario, p_nombre);
$$;

revoke execute on function public.cliente_de_instagram(text, text, text) from anon;
grant  execute on function public.cliente_de_instagram(text, text, text) to authenticated;

commit;

-- ============================================================================
-- Y LAS FICHAS QUE YA QUEDARON PEGADAS
-- ============================================================================
--
-- Lo de arriba arregla de acá en adelante. Esto arregla lo de atrás: las fichas
-- que se llaman «Contacto de Instagram» y cuyo HILO ya tiene el nombre bueno.
-- El dato está, sólo que nunca bajó de la conversación a la ficha.
--
-- No se toca ninguna ficha que alguien haya renombrado a mano: la condición es
-- que el nombre sea exactamente el de respaldo, ni parecido.

update public.clientes cl
   set nombre = btrim(c.nombre_perfil)
  from public.conversaciones c
 where c.cliente_id = cl.id
   and c.canal = 'instagram'
   and btrim(cl.nombre) = 'Contacto de Instagram'
   and nullif(btrim(coalesce(c.nombre_perfil, '')), '') is not null
   -- El @usuario no es un nombre: si es lo único que hay, la ficha se queda
   -- como está y el botón de la bandeja lo volverá a intentar.
   and btrim(c.nombre_perfil) not like '@%'
   and btrim(c.nombre_perfil) <> 'Contacto de Instagram';

-- ------------------------------------------------------------- cómo quedó

select
  (select count(*) from public.clientes
    where btrim(nombre) = 'Contacto de Instagram')              as fichas_sin_nombre,
  (select count(*) from public.conversaciones
    where canal = 'instagram')                                  as hilos_de_instagram,
  (select count(*) from public.conversaciones
    where canal = 'instagram' and nombre_perfil is null)         as hilos_sin_nombre,
  (select count(*) from public.mensajes m
     join public.conversaciones c on c.id = m.conversacion_id
    where c.canal = 'instagram')                                as mensajes_de_instagram;
