begin;

-- Unir fichas repetidas de la misma persona.
--
-- ------------------------------------------------------------------------
-- POR QUÉ HACE FALTA
-- ------------------------------------------------------------------------
--
-- Antes de que existiera el historial de canales, registrar que alguien
-- escribió por un segundo canal obligaba a abrir otro lead —y a veces otra
-- ficha—. De ahí salieron los duplicados que ya están: la misma persona dos
-- veces, con el mismo teléfono escrito de otra forma.
--
-- El alta ya avisa y ofrece unificar, así que de acá en adelante no deberían
-- aparecer más. Esto es para los que quedaron.
--
-- ------------------------------------------------------------------------
-- LO QUE HACE, EN ORDEN
-- ------------------------------------------------------------------------
--
-- 1. Mueve a la ficha que se conserva todo lo que cuelga de las otras: leads,
--    conversaciones, cursos realizados y respuestas de formulario. Las notas y
--    los adjuntos van solos, porque cuelgan del lead y no del cliente.
-- 2. Junta los canales, quedándose con la primera fecha más vieja y la última
--    más nueva de cada uno.
-- 3. Completa los huecos de la ficha que queda con lo que tengan las otras.
--    Nunca pisa un dato que ya está: el que está pudo corregirse a mano.
-- 4. Recién entonces borra las fichas absorbidas.
--
-- El orden es lo único que importa acá. `oportunidades` borra en cascada, así
-- que borrar primero y mover después se llevaría los leads puestos.
--
-- ------------------------------------------------------------------------
-- QUIÉN PUEDE
-- ------------------------------------------------------------------------
--
-- Sólo dirección. Fusionar no se deshace con un botón: si se unen dos
-- personas que resultaron ser distintas —dos hermanas con el teléfono de
-- casa— hay que separarlas a mano, dato por dato.
--
-- Antes de usarla, mirar `supabase/DUPLICADOS.sql`, que lista los repetidos
-- sin tocar nada.
--
-- Se puede correr con gente trabajando, y dos veces.

create or replace function public.fusionar_contactos(
  p_conservar bigint,
  p_absorber  bigint[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  absorbidas bigint[];
  fila       record;
  leads      int;
  hilos      int;
  cursos     int;
  respuestas int;
  resumen    text;
begin
  if not public.es_admin() then
    raise exception 'Sólo dirección puede fusionar contactos.';
  end if;

  if p_conservar is null or p_absorber is null then
    raise exception 'Hay que decir qué ficha se conserva y cuáles se absorben.';
  end if;

  -- Sacar de la lista la que se conserva y las que no existen. Sin esto, pedir
  -- fusionar una ficha consigo misma la borraría después de vaciarla.
  select array_agg(c.id) into absorbidas
    from public.clientes c
   where c.id = any(p_absorber) and c.id <> p_conservar;

  if absorbidas is null then
    return 'No había nada que fusionar.';
  end if;

  if not exists (select 1 from public.clientes where id = p_conservar) then
    raise exception 'La ficha que se quiere conservar (%) no existe.', p_conservar;
  end if;

  -- ------------------------------------------------------------- 1. mover

  update public.oportunidades set cliente_id = p_conservar
   where cliente_id = any(absorbidas);
  get diagnostics leads = row_count;

  update public.conversaciones set cliente_id = p_conservar
   where cliente_id = any(absorbidas);
  get diagnostics hilos = row_count;

  update public.cursos_realizados set cliente_id = p_conservar
   where cliente_id = any(absorbidas);
  get diagnostics cursos = row_count;

  update public.formulario_respuestas set cliente_id = p_conservar
   where cliente_id = any(absorbidas);
  get diagnostics respuestas = row_count;

  -- --------------------------------------------------------- 2. los canales

  -- Uno por uno y por la función, que es la que sabe quedarse con la primera
  -- fecha más vieja. Un `update` directo pisaría la fecha de entrada, que es
  -- justamente el dato que esto tiene que preservar.
  if to_regclass('public.contactos_canal') is not null then
    for fila in
      select canal_id, identificador, primera_vez, ultima_vez
        from public.contactos_canal
       where cliente_id = any(absorbidas)
    loop
      perform public.anotar_canal(p_conservar, fila.canal_id, fila.identificador, fila.primera_vez);
      perform public.anotar_canal(p_conservar, fila.canal_id, fila.identificador, fila.ultima_vez);
    end loop;

    delete from public.contactos_canal where cliente_id = any(absorbidas);
  end if;

  -- ------------------------------------------------- 3. completar los huecos

  -- Completar nunca borra: cada campo se llena sólo si está vacío, con el
  -- primer valor que aparezca entre las absorbidas.
  update public.clientes c
     set telefono             = coalesce(c.telefono,             o.telefono),
         telefono_secundario  = coalesce(c.telefono_secundario,  o.telefono_secundario),
         correo               = coalesce(c.correo,               o.correo),
         territorio_id        = coalesce(c.territorio_id,        o.territorio_id),
         edad                 = coalesce(c.edad,                 o.edad),
         responsable_nombre   = coalesce(c.responsable_nombre,   o.responsable_nombre),
         responsable_telefono = coalesce(c.responsable_telefono, o.responsable_telefono),
         responsable_correo   = coalesce(c.responsable_correo,   o.responsable_correo)
    from (
      select min(telefono)             as telefono,
             min(telefono_secundario)  as telefono_secundario,
             min(correo)               as correo,
             min(territorio_id)        as territorio_id,
             min(edad)                 as edad,
             min(responsable_nombre)   as responsable_nombre,
             min(responsable_telefono) as responsable_telefono,
             min(responsable_correo)   as responsable_correo
        from public.clientes where id = any(absorbidas)
    ) as o
   where c.id = p_conservar;

  -- ------------------------------------------------------------ 4. y borrar

  delete from public.clientes where id = any(absorbidas);

  resumen := format(
    'Se unieron %s fichas en la %s: %s leads, %s conversaciones, %s cursos y %s respuestas de formulario.',
    array_length(absorbidas, 1), p_conservar, leads, hilos, cursos, respuestas);

  raise notice '%', resumen;
  return resumen;
end $$;

revoke execute on function public.fusionar_contactos(bigint, bigint[]) from anon;
grant execute on function public.fusionar_contactos(bigint, bigint[]) to authenticated;

comment on function public.fusionar_contactos(bigint, bigint[]) is
  'Une fichas repetidas en una. Sólo dirección. Ver supabase/DUPLICADOS.sql antes.';

commit;
