begin;

-- Que fusionar también se pueda desde el editor de SQL de Supabase.
--
-- ------------------------------------------------------------------------
-- QUÉ ESTABA MAL
-- ------------------------------------------------------------------------
--
-- Las dos funciones de fusión empiezan pidiendo `es_admin()`, y eso las dejaba
-- inservibles justo donde había que usarlas. `es_admin()` mira quién tiene la
-- sesión abierta, y el editor de SQL de Supabase no tiene ninguna: corre con
-- la llave del proyecto, sin usuario detrás. Resultado: `auth.uid()` es nulo,
-- `es_admin()` da falso, y el archivo se cortaba con «Sólo dirección puede
-- unir leads» en la cara de quien es, literalmente, la dirección.
--
-- ------------------------------------------------------------------------
-- CÓMO SE ARREGLA, Y POR QUÉ NO ES AFLOJAR EL PERMISO
-- ------------------------------------------------------------------------
--
-- La guarda pasa a ser: «si hay alguien con sesión, tiene que ser dirección».
--
-- Sin sesión no hay navegador del otro lado. `anon` no puede ejecutar estas
-- funciones —se le revocó— y toda sesión de `authenticated` trae su `sub`, así
-- que la única forma de llegar acá sin usuario es desde el servidor: el editor
-- de SQL o la llave de servicio. A esa consola no se entra sin ser dueño del
-- proyecto, y además la llave de servicio se saltea las políticas por
-- definición: exigirle permiso sería teatro.
--
-- Lo que la guarda tiene que impedir sigue impedido: que una asesora con
-- sesión llame a la función desde el navegador y una dos fichas.
--
-- La comprobación se saca a una función aparte para que la próxima operación
-- delicada no repita el mismo error de razonamiento.
--
-- Reemplaza las guardas de 20260923120000 y 20260924120000. Se puede correr
-- con gente trabajando, y dos veces.

/*
 * Exigir dirección, salvo que no haya nadie con sesión.
 *
 * `que` es lo que se estaba intentando —«unir leads»— y va en el mensaje: un
 * error que sólo dice «no podés» obliga a ir a buscar cuál de las cosas que
 * hacía el archivo fue la que se negó.
 */
create or replace function public.exige_direccion(que text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is not null and not public.es_admin() then
    raise exception 'Sólo dirección puede %.', que;
  end if;
end $fn$;

revoke execute on function public.exige_direccion(text) from anon;
grant execute on function public.exige_direccion(text) to authenticated;

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
  perform public.exige_direccion('fusionar contactos');

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

create or replace function public.fusionar_oportunidades(
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
  duenio     bigint;
  codigos    text;
  fila       record;
  notas      int;
  resumen    text;
begin
  perform public.exige_direccion('unir leads');

  select cliente_id into duenio from public.oportunidades where id = p_conservar;
  if duenio is null then
    raise exception 'El lead que se quiere conservar (%) no existe.', p_conservar;
  end if;

  -- Sólo los que existen, son de la misma persona, y no son el que se conserva.
  select array_agg(o.id), string_agg(o.codigo, ', ' order by o.codigo)
    into absorbidas, codigos
    from public.oportunidades o
   where o.id = any(p_absorber)
     and o.id <> p_conservar
     and o.cliente_id = duenio;

  if absorbidas is null then
    -- Puede ser que ya se hayan unido, o que se hayan pasado leads de otra
    -- persona. Lo segundo es un error y hay que decirlo, no seguir de largo.
    if exists (select 1 from public.oportunidades
                where id = any(p_absorber) and id <> p_conservar
                  and cliente_id is distinct from duenio) then
      raise exception
        'Esos leads no son del mismo contacto. Unir contactos primero, con fusionar_contactos.';
    end if;
    return 'No había nada que unir.';
  end if;

  -- ------------------------------------------- 2. el canal, antes que nada

  if to_regclass('public.contactos_canal') is not null then
    -- También el del que se conserva, no sólo el de los que se van.
    --
    -- Normalmente ya está anotado —lo pone el alta o el webhook— pero de un
    -- lead viejo, importado o cargado a mano puede faltar. Si falta y sólo se
    -- anotara el del lead borrado, la ficha terminaría diciendo que llegó por
    -- Instagram y nada más, justo después de una operación que existía para
    -- conservar los dos.
    for fila in
      select o.canal_id, o.fecha_registro
        from public.oportunidades o
       where (o.id = any(absorbidas) or o.id = p_conservar)
         and o.canal_id is not null
    loop
      -- Al mediodía y en hora de El Salvador, no a medianoche UTC.
      --
      -- `fecha_registro` es una fecha sin hora. Convertirla derecho a marca de
      -- tiempo la clava a medianoche UTC, y eso en El Salvador —seis horas
      -- atrás— cae el día anterior: un lead del 12 de julio quedaría anotado
      -- como del 11. El mediodía deja doce horas de margen para cada lado, así
      -- que ninguna zona horaria lo corre de día.
      perform public.anotar_canal(
        duenio, fila.canal_id, null,
        (fila.fecha_registro + time '12:00') at time zone 'America/El_Salvador');
    end loop;
  end if;

  -- ------------------------------------------------------------- 3. mover

  update public.oportunidad_notas       set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.adjuntos                set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.eventos                 set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.enlaces_pago            set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.recordatorios_pospuestos set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.formulario_respuestas   set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);

  -- Los seguimientos apuntan además a la nota que los creó, y esa nota se
  -- acaba de mudar, así que el enlace sigue siendo válido.
  update public.seguimientos            set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);

  -- ---------------------------------------------- 4 y 5. completar y fechar

  update public.oportunidades c
     set producto_id         = coalesce(c.producto_id,         o.producto_id),
         vendedor_id         = coalesce(c.vendedor_id,         o.vendedor_id),
         territorio_id       = coalesce(c.territorio_id,       o.territorio_id),
         canal_id            = coalesce(c.canal_id,            o.canal_id),
         estado_id           = coalesce(c.estado_id,           o.estado_id),
         motivo_perdida_id   = coalesce(c.motivo_perdida_id,   o.motivo_perdida_id),
         valor_oportunidad   = coalesce(c.valor_oportunidad,   o.valor_oportunidad),
         venta_cerrada       = coalesce(c.venta_cerrada,       o.venta_cerrada),
         reserva             = coalesce(c.reserva,             o.reserva),
         reserva_en          = coalesce(c.reserva_en,          o.reserva_en),
         fecha_cierre        = coalesce(c.fecha_cierre,        o.fecha_cierre),
         descuento_promocion = coalesce(c.descuento_promocion, o.descuento_promocion),
         -- La más vieja: la persona llegó ese día, no el día en que alguien
         -- abrió el lead repetido.
         fecha_registro      = least(c.fecha_registro, o.fecha_registro)
    from (
      select min(producto_id)         as producto_id,
             min(vendedor_id)         as vendedor_id,
             min(territorio_id)       as territorio_id,
             min(canal_id)            as canal_id,
             min(estado_id)           as estado_id,
             min(motivo_perdida_id)   as motivo_perdida_id,
             min(valor_oportunidad)   as valor_oportunidad,
             min(venta_cerrada)       as venta_cerrada,
             min(reserva)             as reserva,
             min(reserva_en)          as reserva_en,
             min(fecha_cierre)        as fecha_cierre,
             min(descuento_promocion) as descuento_promocion,
             min(fecha_registro)      as fecha_registro
        from public.oportunidades where id = any(absorbidas)
    ) as o
   where c.id = p_conservar;

  -- ------------------------------------------------- 6. que quede por escrito

  insert into public.oportunidad_notas (oportunidad_id, nota, origen)
  values (p_conservar,
          format('Se unió con %s: era el mismo lead, entrado por otro canal.', codigos),
          'sistema');
  get diagnostics notas = row_count;

  -- --------------------------------------------------------------- 7. borrar

  delete from public.oportunidades where id = any(absorbidas);

  resumen := format('Se unieron %s leads (%s) en el %s.',
                    array_length(absorbidas, 1), codigos,
                    (select codigo from public.oportunidades where id = p_conservar));
  raise notice '%', resumen;
  return resumen;
end $$;

revoke execute on function public.fusionar_contactos(bigint, bigint[]) from anon;
grant  execute on function public.fusionar_contactos(bigint, bigint[]) to authenticated;
revoke execute on function public.fusionar_oportunidades(bigint, bigint[]) from anon;
grant  execute on function public.fusionar_oportunidades(bigint, bigint[]) to authenticated;

commit;

-- Que quedaron las tres, y que la guarda deja pasar al editor.
select
  (select count(*) from pg_proc
    where proname in ('exige_direccion','fusionar_contactos','fusionar_oportunidades'))
                                                    as funciones_puestas,
  case when (select auth.uid()) is null
       then 'sin sesión (editor de SQL): puede fusionar'
       when public.es_admin() then 'con sesión de dirección: puede fusionar'
       else 'con sesión que no es dirección: NO puede' end
                                                    as desde_aca;
