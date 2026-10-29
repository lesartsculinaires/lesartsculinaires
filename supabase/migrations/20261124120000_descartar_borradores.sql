-- Descartar los envíos masivos que se armaron y no se mandaron (29/10/2026).
--
-- «Ver a quiénes les llega» crea el envío como borrador, con sus
-- destinatarios, para poder mostrar el reparto. Si después se cancelaba, el
-- borrador quedaba en la lista de Envíos como «sin mandar»: Sussy abrió y
-- cerró la ventana cinco veces y quedaron cinco «OPORTUNIDAD DE PASANTÍAS».
--
-- Borrar envíos es de dirección (`envios_borrar`), así que quien armó el
-- borrador no podía tirarlo. Esta función hace sólo eso, y sólo cuando es
-- seguro: es un borrador, nunca empezó, no salió ningún mensaje, y lo creó
-- quien pide borrarlo (o dirección).
--
--   p_envio   un borrador concreto: el de la ventana que se cerró.
--   null      todos los borradores abandonados de quien llama: los que quedaron
--             de una pestaña cerrada o una recarga a mitad de camino.

create or replace function public.descartar_borradores(p_envio bigint default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cuantos integer;
begin
  delete from public.envios e
   where (p_envio is null or e.id = p_envio)
     and e.estado = 'borrador'
     and e.empezado_en is null
     and (e.creado_por = auth.uid() or (p_envio is not null and public.es_admin()))
     and not exists (
       select 1 from public.envio_destinatarios d
        where d.envio_id = e.id
          and (d.estado <> 'pendiente' or d.enviado_en is not null)
     );
  get diagnostics cuantos = row_count;
  return cuantos;
end $$;

revoke execute on function public.descartar_borradores(bigint) from public, anon;
grant execute on function public.descartar_borradores(bigint) to authenticated;
