begin;

-- Cambios en vivo.
--
-- Supabase manda por websocket los cambios de las tablas que estén en la
-- publicación `supabase_realtime`. Sin esto, suscribirse no da error: la
-- pantalla simplemente nunca recibe nada, que es peor que fallar.
--
-- Sólo agrega tablas a una publicación. No toca datos, ni columnas, ni
-- vistas, así que se puede correr con gente trabajando.
--
-- Lo que viaja es el aviso de que algo cambió, no una copia de la base: la
-- pantalla lo usa para volver a pedir los datos por el camino de siempre, con
-- los permisos de quien esté mirando. Nadie ve por esta vía nada que no
-- pudiera ver recargando.

do $$
declare
  t text;
  faltantes text[] := '{}';
begin
  -- Supabase trae `supabase_realtime` de fábrica, pero un Postgres pelado no.
  -- Sin esta guarda, el archivo reventaría al probarlo fuera de Supabase.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
    raise notice 'no existía la publicación supabase_realtime; se creó';
  end if;

  -- `oportunidad_notas` entra porque la bitácora de una ficha también se
  -- comparte. `eventos`, `importaciones` y `autorizaciones` pueden no existir
  -- todavía según qué migraciones se hayan corrido, y por eso se comprueba
  -- una por una en vez de nombrarlas de golpe.
  foreach t in array array[
    'clientes',
    'oportunidades',
    'oportunidad_notas',
    'eventos',
    'importaciones',
    'autorizaciones'
  ]
  loop
    if to_regclass('public.' || t) is null then
      faltantes := faltantes || t;
      continue;
    end if;

    -- Agregar una tabla que ya está publicada es un error, así que se
    -- comprueba antes: así el archivo se puede correr dos veces sin romper.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'publicada: %', t;
    else
      raise notice 'ya estaba publicada: %', t;
    end if;
  end loop;

  if array_length(faltantes, 1) is not null then
    raise notice 'todavía no existen, se omiten: %', array_to_string(faltantes, ', ');
  end if;
end $$;

commit;
