begin;

-- Por qué canales llegó cada persona, y cuándo por cada uno.
--
-- ------------------------------------------------------------------------
-- EL PROBLEMA
-- ------------------------------------------------------------------------
--
-- El canal vive hoy en `oportunidades.canal_id`: uno solo, y sin fecha. Eso
-- alcanza mientras una persona llegue por un lado, pero no es lo que pasa: se
-- escribe primero por Instagram y después por WhatsApp, y no hay dónde poner
-- el segundo.
--
-- Sin ese lugar, la única forma de registrar el otro canal era abrir un lead
-- nuevo. Así se duplicó katy G: dos leads del mismo programa, con el mismo
-- teléfono, uno por cada canal.
--
-- ------------------------------------------------------------------------
-- POR QUÉ UNA TABLA Y NO DOS COLUMNAS MÁS
-- ------------------------------------------------------------------------
--
-- Porque los canales son nueve y mañana pueden ser diez. «canal_2» y
-- «fecha_canal_2» resolverían el caso de hoy y romperían con el tercero, y
-- además obligarían a preguntar en cada consulta cuál de las dos columnas
-- mirar. Una fila por canal se lee igual con uno que con cinco.
--
-- La clave es (cliente, canal): una persona toca un canal muchas veces y eso
-- no son muchas filas, son dos fechas en la misma. Lo que importa es la
-- primera —por dónde entró— y la última —cuándo escribió por ahí—.
--
-- ------------------------------------------------------------------------
-- LO QUE NO CAMBIA
-- ------------------------------------------------------------------------
--
-- `oportunidades.canal_id` se queda como está y sigue queriendo decir «por
-- dónde entró». Es lo que miran el Dashboard y los cortes por canal, y
-- moverlo cambiaría números de informes que ya se leyeron. Esta tabla agrega
-- el historial al lado; no reemplaza nada.
--
-- Se puede correr con gente trabajando, y dos veces.

-- ----------------------------------------------------------------- la tabla

create table if not exists public.contactos_canal (
  cliente_id    bigint      not null references public.clientes(id) on delete cascade,
  canal_id      bigint      not null references public.canales(id),
  -- Con qué identidad llegó por ahí: el teléfono en WhatsApp, el usuario en
  -- Instagram. Sirve para reconocerla cuando vuelve por el mismo lado.
  identificador text,
  primera_vez   timestamptz not null default now(),
  ultima_vez    timestamptz not null default now(),
  primary key (cliente_id, canal_id)
);

comment on table public.contactos_canal is
  'Por qué canales llegó cada contacto. La primera fecha dice por dónde entró.';

create index if not exists ix_contactos_canal_cliente
  on public.contactos_canal (cliente_id, primera_vez);

-- ------------------------------------------------------------- cómo se anota

/*
 * Anotar que alguien llegó por un canal.
 *
 * Una sola llamada para todos los casos: la primera vez inserta, las
 * siguientes corren la última fecha. Nunca pisa la primera hacia adelante,
 * que es el dato que dice por dónde entró y no se puede perder.
 *
 * `least` y `greatest` en vez de asignar directo porque los avisos pueden
 * llegar desordenados —un backfill que corre después de un mensaje nuevo, un
 * reintento de Meta— y con asignación directa un aviso viejo retrasaría la
 * última fecha o adelantaría la primera.
 *
 * `security definer` porque la llama el webhook, que corre con la llave de
 * servicio y sin nadie con sesión detrás, y también las pantallas.
 */
create or replace function public.anotar_canal(
  p_cliente       bigint,
  p_canal         bigint,
  p_identificador text default null,
  p_cuando        timestamptz default now()
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.contactos_canal
         (cliente_id, canal_id, identificador, primera_vez, ultima_vez)
  values (p_cliente, p_canal, nullif(trim(coalesce(p_identificador, '')), ''),
          coalesce(p_cuando, now()), coalesce(p_cuando, now()))
      on conflict (cliente_id, canal_id) do update
     set primera_vez   = least(public.contactos_canal.primera_vez, excluded.primera_vez),
         ultima_vez    = greatest(public.contactos_canal.ultima_vez, excluded.ultima_vez),
         -- El identificador que ya está manda: pudo corregirse a mano.
         identificador = coalesce(public.contactos_canal.identificador,
                                  excluded.identificador);
$$;

revoke execute on function public.anotar_canal(bigint, bigint, text, timestamptz) from anon;
grant execute on function public.anotar_canal(bigint, bigint, text, timestamptz) to authenticated;

-- ------------------------------------------------------------------ quién ve

alter table public.contactos_canal enable row level security;

/*
 * Ver, todo el equipo con sesión.
 *
 * Qué contactos puede mirar cada quien ya lo decide la política de `clientes`
 * y la de `oportunidades`; si una persona no puede ver la ficha, esta tabla no
 * le sirve de nada porque no tiene por dónde llegar. Repetir la regla acá
 * sería tener dos lugares donde se puede desincronizar.
 */
drop policy if exists canales_ver on public.contactos_canal;
create policy canales_ver on public.contactos_canal
  for select to authenticated using (true);

-- Escribir va por `anotar_canal`, que es `security definer`. No hay política
-- de insert a propósito: así no hay dos caminos para lo mismo, y el de la
-- función es el único que sabe no pisar la primera fecha.

-- --------------------------------------------------------------- lo que ya hay

/*
 * Rellenar con lo que ya está guardado.
 *
 * Sin esto la tabla arranca vacía y las fichas de hoy no muestran nada, que se
 * leería como «esta persona no llegó por ningún lado». Los datos existen, sólo
 * que desparramados:
 *
 *   de `oportunidades`   el canal con el que se abrió cada lead. La fecha es
 *                        `fecha_registro`, que es el día en que llegó.
 *   de `conversaciones`  cada hilo de WhatsApp con cliente vinculado. Acá la
 *                        fecha es de verdad, con hora: cuándo se abrió el hilo
 *                        y cuándo escribió por última vez.
 *
 * El orden importa: primero las oportunidades y después las conversaciones,
 * para que la hora exacta de WhatsApp le gane a la fecha suelta del lead si
 * son el mismo día.
 */
do $$
declare
  cuantos int;
begin
  insert into public.contactos_canal (cliente_id, canal_id, primera_vez, ultima_vez)
  select o.cliente_id,
         o.canal_id,
         min(o.fecha_registro::timestamptz),
         max(o.fecha_registro::timestamptz)
    from public.oportunidades o
   where o.canal_id is not null and o.cliente_id is not null
   group by o.cliente_id, o.canal_id
      on conflict (cliente_id, canal_id) do update
     set primera_vez = least(public.contactos_canal.primera_vez, excluded.primera_vez),
         ultima_vez  = greatest(public.contactos_canal.ultima_vez, excluded.ultima_vez);

  get diagnostics cuantos = row_count;
  raise notice 'canales tomados de los leads: %', cuantos;

  perform 1 from public.canales where nombre = 'Whatsapp';
  if not found then
    raise notice 'no existe el canal «Whatsapp»; no se puede rellenar desde la bandeja';
    return;
  end if;

  insert into public.contactos_canal
         (cliente_id, canal_id, identificador, primera_vez, ultima_vez)
  select cv.cliente_id,
         (select id from public.canales where nombre = 'Whatsapp'),
         min(cv.telefono),
         min(cv.created_at),
         max(cv.ultimo_mensaje_en)
    from public.conversaciones cv
   where cv.cliente_id is not null
   group by cv.cliente_id
      on conflict (cliente_id, canal_id) do update
     set primera_vez   = least(public.contactos_canal.primera_vez, excluded.primera_vez),
         ultima_vez    = greatest(public.contactos_canal.ultima_vez, excluded.ultima_vez),
         identificador = coalesce(public.contactos_canal.identificador, excluded.identificador);

  get diagnostics cuantos = row_count;
  raise notice 'canales tomados de la bandeja de WhatsApp: %', cuantos;
end $$;

commit;

-- Cómo quedó: los contactos que llegaron por más de un canal.
select
  c.nombre                                        as contacto,
  c.telefono,
  count(*)                                        as canales,
  string_agg(ca.nombre || ' (' || to_char(cc.primera_vez, 'DD/MM/YY') || ')',
             ' → ' order by cc.primera_vez)       as por_donde_y_cuando
  from public.contactos_canal cc
  join public.clientes c  on c.id  = cc.cliente_id
  join public.canales  ca on ca.id = cc.canal_id
 group by c.id, c.nombre, c.telefono
having count(*) > 1
 order by count(*) desc, c.nombre
 limit 30;
