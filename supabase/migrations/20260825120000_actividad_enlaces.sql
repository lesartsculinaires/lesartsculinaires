begin;

-- Los links de registro también dejan rastro.
--
-- Crear y modificar leads ya se registraba: los triggers de `oportunidades` y
-- `clientes` están desde la migración de actividad. Lo que faltaba era el link
-- que se le manda al área académica, que hasta ahora se generaba sin que
-- quedara anotado en ningún lado.
--
-- «Generó», no «envió»: el CRM copia el enlace al portapapeles y quien lo manda
-- es la persona, por WhatsApp o por donde sea. Decir «envió» sería afirmar algo
-- que el sistema no vio. La hora que queda es la de la generación, que en la
-- práctica es la misma en que se pega en el chat.
--
-- Sólo agrega un trigger. Se puede correr con gente trabajando.

do $$
begin
  if to_regclass('public.enlaces_pago') is null then
    raise notice 'todavía no existe enlaces_pago; corré antes 20260822120000_enlaces_pago.sql';
    return;
  end if;

  if not exists (select 1 from pg_proc where proname = 'registrar_actividad') then
    raise notice 'todavía no existe el registro de actividad; corré antes 20260823120000_actividad.sql';
    return;
  end if;

  execute 'drop trigger if exists trg_actividad_enlaces on public.enlaces_pago';

  -- Se vigila `revocado` y nada más. La tabla también guarda cuántas veces se
  -- abrió el enlace, y esa columna cambia cada vez que alguien de académica lo
  -- mira: vigilarla llenaría el panel de una línea por apertura y taparía todo
  -- lo demás. Que lo abrieron se ve en la ficha, no hace falta un aviso.
  execute 'create trigger trg_actividad_enlaces
    after insert or update on public.enlaces_pago
    for each row execute function public.registrar_actividad(''{revocado}'', ''enlace'')';

  raise notice 'listo: los links de registro quedan en el registro de actividad';
end $$;

commit;
