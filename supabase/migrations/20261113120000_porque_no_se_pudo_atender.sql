-- Por qué no se pudo atender una llamada, y no sólo que no se pudo.
--
-- ============================================================================
-- LO QUE PASABA
-- ============================================================================
--
-- El candado para tomar una llamada es este `update`:
--
--     update public.llamadas set atendida_por = yo, estado = 'contestando'
--      where call_id = ... and atendida_por is null and estado = 'sonando'
--
-- `atender_llamada` devolvía `conseguida = false` cuando no tocaba ninguna
-- fila, y la pantalla leía ese `false` como UNA sola cosa —«otra persona la
-- agarró primero»— cuando en realidad son tres:
--
--   1. Otra persona la agarró.    `atendida_por` ya no es nulo.
--   2. YA NO ESTABA SONANDO.      Quien llamaba colgó, o venció.
--   3. No existe esa llamada.
--
-- El 8 de octubre de 2026 a las 9:06 entró una llamada y la clienta colgó a los
-- 26 segundos. Quedó en `perdida` con `atendida_por` NULO —o sea que no la
-- atendió nadie— y a la asesora que apretó contestar el CRM le dijo que se la
-- habían ganado.
--
-- Eso manda a buscar a la compañera que atendió en vez de devolver la llamada,
-- que era lo único que quedaba por hacer. Esa vez se perdió minuto y medio.
--
-- ============================================================================
-- POR QUÉ UNA FUNCIÓN NUEVA Y NO CAMBIAR LA QUE HAY
-- ============================================================================
--
-- Porque `create or replace` no puede cambiar las columnas que devuelve una
-- función: habría que borrarla y volver a crearla. Y entre el `drop` y el
-- `create` hay un instante en el que la función NO EXISTE —con el código viejo
-- todavía desplegado y llamándola— y ninguna llamada se podría atender.
--
-- Una función nueva al lado no toca la vieja, no toma ningún candado, y deja
-- que las dos convivan mientras se despliega. La aplicación pide la nueva y, si
-- todavía no está, usa la vieja: desplegar antes de correr el SQL es lo normal
-- acá, y ese rato tiene que ser inofensivo.
--
-- La vieja queda. Borrarla es para cuando ya nadie la llame, y no vale la pena
-- correr ese riesgo por limpieza.

create or replace function public.atender_llamada_con_motivo(p_call_id text)
returns table(conseguida boolean, quien uuid, porque text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_yo     uuid := auth.uid();
  v_estado text;
  v_quien  uuid;
begin
  update public.llamadas
     set atendida_por = v_yo,
         atendida_en  = now(),
         estado       = 'contestando'
   where call_id = p_call_id
     and atendida_por is null
     and estado = 'sonando';

  if found then
    return query select true, v_yo, null::text;
    return;
  end if;

  -- No se pudo: se mira la fila para poder decir por qué.
  select l.estado, l.atendida_por into v_estado, v_quien
    from public.llamadas l
   where l.call_id = p_call_id;

  if v_estado is null then
    -- Ni existe. Pasa si Meta manda el aviso de fin antes que el de inicio.
    return query select false, null::uuid, 'no_existe'::text;
  elsif v_quien is not null then
    return query select false, v_quien, 'la_tomo_otro'::text;
  else
    /*
     * Existe, nadie la tomó, y aun así no se pudo: ya no estaba sonando. Es el
     * caso de quien cuelga, y es el que se venía contando mal.
     */
    return query select false, null::uuid, 'ya_no_sonaba'::text;
  end if;
end $function$;

comment on function public.atender_llamada_con_motivo(text) is
  'Toma una llamada que suena. `porque` dice por qué no se pudo: la_tomo_otro, ya_no_sonaba o no_existe. Reemplaza a atender_llamada, que se deja por compatibilidad.';

revoke execute on function public.atender_llamada_con_motivo(text) from anon;
grant  execute on function public.atender_llamada_con_motivo(text) to authenticated;
