-- Les Arts Culinaires — CRM de ventas
--
-- Tablas que respaldan el frontend: equipo comercial, catálogo de programas,
-- tipos de actividad, leads y eventos de calendario.
--
-- Se puede aplicar sobre un proyecto que ya tiene la tabla `leads` cargada
-- desde CSV: el bloque de leads usa `if not exists` y añade sólo las columnas
-- que falten, sin tocar los datos existentes.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Equipo de ventas
--
-- `nombre` es la clave con la que el resto del CRM referencia al vendedor,
-- por eso es unique. `meta` es el objetivo de venta mensual en USD.
-- ---------------------------------------------------------------------
create table if not exists public.vendedores (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  rol text not null default '',
  email text unique,
  tel text,
  meta numeric(12,2) not null default 0 check (meta >= 0),
  desde text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists vendedores_touch on public.vendedores;
create trigger vendedores_touch before update on public.vendedores
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Catálogo de diplomados, cursos y certificaciones
-- ---------------------------------------------------------------------
create table if not exists public.programas (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  tipo text not null default 'Curso corto'
    check (tipo in ('Diplomado', 'Curso corto', 'Certificación')),
  duracion text,
  precio numeric(12,2) not null default 0 check (precio >= 0),
  cupos_llenos integer not null default 0 check (cupos_llenos >= 0),
  cupos_total integer not null default 0 check (cupos_total >= 0),
  inicio text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists programas_touch on public.programas;
create trigger programas_touch before update on public.programas
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Tipos de actividad del calendario
--
-- `id` es un entero fijo, no un uuid: el frontend indexa los tipos por
-- posición y `color`/`codigo` alimentan el badge de cada evento.
-- ---------------------------------------------------------------------
create table if not exists public.tipos_evento (
  id integer primary key,
  label text unique not null,
  codigo text not null,
  color text not null,
  duracion_min integer not null default 30 check (duracion_min > 0),
  orden integer not null default 0
);

-- ---------------------------------------------------------------------
-- Leads
--
-- `id` es el código visible del lead ("LA-0414"), no un uuid, para que
-- coincida con lo que ya venía en el CSV y con lo que muestra la interfaz.
--
-- `vendedor` y `producto` referencian por nombre a vendedores/programas.
-- No llevan foreign key a propósito: un import puede traer un vendedor que
-- todavía no está dado de alta, o el sentinel 'Sin asignar', y no queremos
-- que la carga falle por eso.
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id text primary key,
  fecha text,
  mes text,
  vendedor text not null default 'Sin asignar',
  nombre text not null default '',
  producto text,
  territorio text,
  canal text,
  etapa text not null default 'Nuevo lead',
  estado text not null default 'Activo',
  valor numeric(12,2) not null default 0,
  cerrada numeric(12,2),
  descuento text,
  tel text,
  correo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Para una tabla `leads` que ya existía (import de CSV): agrega lo que falte
-- sin tocar columnas ni filas existentes.
alter table public.leads add column if not exists fecha text;
alter table public.leads add column if not exists mes text;
alter table public.leads add column if not exists vendedor text;
alter table public.leads add column if not exists nombre text;
alter table public.leads add column if not exists producto text;
alter table public.leads add column if not exists territorio text;
alter table public.leads add column if not exists canal text;
alter table public.leads add column if not exists etapa text;
alter table public.leads add column if not exists estado text;
alter table public.leads add column if not exists valor numeric(12,2);
alter table public.leads add column if not exists cerrada numeric(12,2);
alter table public.leads add column if not exists descuento text;
alter table public.leads add column if not exists tel text;
alter table public.leads add column if not exists correo text;
alter table public.leads add column if not exists created_at timestamptz default now();
alter table public.leads add column if not exists updated_at timestamptz default now();

create index if not exists leads_vendedor_idx on public.leads (vendedor);
create index if not exists leads_producto_idx on public.leads (producto);
create index if not exists leads_etapa_idx on public.leads (etapa);
create index if not exists leads_estado_idx on public.leads (estado);
create index if not exists leads_mes_idx on public.leads (mes);

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Eventos de calendario
--
-- `dia_idx` es el índice plano de dos meses que usa la interfaz:
-- 1 = 1 jul 2026 … 62 = 31 ago 2026.
-- `hora` es decimal: 9.5 son las 09:30.
-- `next_text` guarda la próxima acción con la que se cerró el evento.
-- ---------------------------------------------------------------------
create table if not exists public.eventos (
  id text primary key,
  lead_id text references public.leads (id) on delete cascade,
  tipo_id integer not null references public.tipos_evento (id),
  vendedor text not null default '',
  dia_idx integer not null check (dia_idx between 1 and 62),
  hora numeric(4,2) not null check (hora >= 0 and hora < 24),
  canal text not null default 'Llamada'
    check (canal in ('Presencial', 'Llamada', 'WhatsApp', 'Meet')),
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'Realizado', 'No se presentó', 'Reagendado')),
  next_text text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eventos_lead_id_idx on public.eventos (lead_id);
create index if not exists eventos_dia_idx on public.eventos (dia_idx);
create index if not exists eventos_vendedor_idx on public.eventos (vendedor);

drop trigger if exists eventos_touch on public.eventos;
create trigger eventos_touch before update on public.eventos
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Datos de referencia
--
-- Los `on conflict do nothing` hacen que la migración se pueda volver a
-- correr sin duplicar ni pisar ediciones hechas desde la app.
-- ---------------------------------------------------------------------
insert into public.vendedores (nombre, rol, email, tel, meta, desde) values
  ('Karla Menjívar', 'Ejecutiva senior', 'karla@lesarts.com', '7822-4410', 1500, '2023'),
  ('Rodrigo Solís', 'Ejecutivo de admisiones', 'rodrigo@lesarts.com', '7455-0192', 1000, '2025'),
  ('Andrea Pineda', 'Cuentas corporativas', 'andrea@lesarts.com', '7099-6633', 1500, '2024')
on conflict (nombre) do nothing;

insert into public.programas (nombre, tipo, duracion, precio, cupos_llenos, cupos_total, inicio) values
  ('Diplomado de Cocina', 'Diplomado', '9 meses', 1850, 22, 24, '12 ago'),
  ('Diplomado de Pastelería', 'Diplomado', '8 meses', 1750, 18, 24, '12 ago'),
  ('Diplomado de Mixología', 'Diplomado', '5 meses', 1180, 11, 20, '19 ago'),
  ('Diplomado de Barismo y Extracción de Café', 'Diplomado', '4 meses', 980, 9, 18, '26 ago'),
  ('Diplomado Management Gastronómico', 'Diplomado', '6 meses', 1420, 7, 20, '2 sep'),
  ('Suprême Diplôme', 'Diplomado', '18 meses', 4600, 12, 16, '1 sep'),
  ('Les Petits Chefs', 'Curso corto', '6 sesiones', 220, 24, 24, '3 ago'),
  ('Cocina Nikkei', 'Curso corto', '4 sesiones', 260, 13, 18, '9 ago'),
  ('Bowl Fusion', 'Curso corto', '3 sesiones', 180, 8, 18, '16 ago'),
  ('Mixología 360', 'Curso corto', '4 sesiones', 240, 15, 20, '23 ago'),
  ('Bollería Francesa', 'Curso corto', '4 sesiones', 280, 17, 18, '30 ago'),
  ('Pastelería Saludable', 'Curso corto', '3 sesiones', 195, 6, 18, '6 sep'),
  ('Certificación Profesional', 'Certificación', 'Examen + práctica', 340, 14, 30, 'Todo el mes')
on conflict (nombre) do nothing;

insert into public.tipos_evento (id, label, codigo, color, duracion_min, orden) values
  (0, 'Llamada / videollamada', 'LL', '#2F6FA8', 30, 0),
  (1, 'Visita o tour al campus', 'TC', '#B85042', 60, 1),
  (2, 'Clase muestra o demo', 'CM', '#8A5AA8', 120, 2),
  (3, 'Envío de propuesta', 'PR', '#0F6E7A', 15, 3),
  (4, 'Seguimiento', 'SG', '#6B665F', 20, 4),
  (5, 'Recordatorio de pago', 'PG', '#9C7118', 15, 5),
  (6, 'Reactivación a 6 meses', 'RE', '#2F6B4F', 20, 6)
on conflict (id) do nothing;

-- Eventos de demostración.
--
-- Sólo se insertan los que apuntan a un lead que realmente existe: si tu CSV
-- usó otros códigos, este bloque simplemente no inserta nada en vez de fallar
-- por la foreign key.
insert into public.eventos (id, lead_id, tipo_id, vendedor, dia_idx, hora, canal, estado)
select v.id, v.lead_id, v.tipo_id, v.vendedor, v.dia_idx, v.hora, v.canal, v.estado
from (values
  ('EV-01', 'LA-0412', 0, 'Karla Menjívar', 24, 10.0, 'Llamada', 'Realizado'),
  ('EV-02', 'LA-0411', 3, 'Rodrigo Solís', 24, 15.0, 'Meet', 'Realizado'),
  ('EV-03', 'LA-0408', 1, 'Rodrigo Solís', 27, 9.5, 'Presencial', 'Realizado'),
  ('EV-04', 'LA-0407', 0, 'Andrea Pineda', 27, 14.0, 'WhatsApp', 'No se presentó'),
  ('EV-05', 'LA-0413', 5, 'Andrea Pineda', 27, 16.0, 'Llamada', 'Realizado'),
  ('EV-06', 'LA-0410', 4, 'Karla Menjívar', 28, 9.0, 'WhatsApp', 'Pendiente'),
  ('EV-07', 'LA-0409', 1, 'Andrea Pineda', 28, 10.5, 'Presencial', 'Pendiente'),
  ('EV-08', 'LA-0414', 0, 'Karla Menjívar', 28, 12.0, 'Llamada', 'Pendiente'),
  ('EV-09', 'LA-0411', 2, 'Rodrigo Solís', 28, 14.0, 'Presencial', 'Pendiente'),
  ('EV-10', 'LA-0405', 5, 'Rodrigo Solís', 28, 16.5, 'Llamada', 'Pendiente'),
  ('EV-11', 'LA-0402', 6, 'Karla Menjívar', 28, 17.5, 'WhatsApp', 'Pendiente'),
  ('EV-12', 'LA-0409', 3, 'Andrea Pineda', 29, 9.0, 'Meet', 'Pendiente'),
  ('EV-13', 'LA-0404', 0, 'Karla Menjívar', 29, 11.0, 'Llamada', 'Pendiente'),
  ('EV-14', 'LA-0414', 1, 'Karla Menjívar', 29, 15.0, 'Presencial', 'Pendiente'),
  ('EV-15', 'LA-0407', 2, 'Andrea Pineda', 30, 10.0, 'Presencial', 'Pendiente'),
  ('EV-16', 'LA-0413', 4, 'Andrea Pineda', 30, 14.5, 'WhatsApp', 'Pendiente'),
  ('EV-17', 'LA-0405', 5, 'Rodrigo Solís', 31, 9.5, 'Llamada', 'Pendiente'),
  ('EV-18', 'LA-0401', 6, 'Andrea Pineda', 31, 11.5, 'WhatsApp', 'Pendiente'),
  ('EV-19', 'LA-0410', 0, 'Karla Menjívar', 31, 16.0, 'Meet', 'Pendiente'),
  ('EV-20', 'LA-0408', 1, 'Rodrigo Solís', 34, 10.0, 'Presencial', 'Pendiente'),
  ('EV-21', 'LA-0403', 3, 'Karla Menjívar', 35, 15.0, 'Meet', 'Pendiente')
) as v (id, lead_id, tipo_id, vendedor, dia_idx, hora, canal, estado)
where exists (select 1 from public.leads l where l.id = v.lead_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Row Level Security
--
-- ⚠️  Estas políticas abren lectura y escritura al rol `anon`, que es el que
--     usa la anon key incrustada en el navegador. Sirve para poner el CRM en
--     marcha, pero significa que cualquiera con esa clave pública puede leer
--     y modificar los datos.
--
--     Para producción: montá Supabase Auth, cambiá `to anon` por
--     `to authenticated` en todas las políticas de abajo, y revocá el acceso
--     anónimo. El login del frontend hoy es sólo un selector de área, no
--     autentica contra nada.
-- ---------------------------------------------------------------------
alter table public.vendedores enable row level security;
alter table public.programas enable row level security;
alter table public.tipos_evento enable row level security;
alter table public.leads enable row level security;
alter table public.eventos enable row level security;

-- Acceso completo para las tablas que el CRM edita.
drop policy if exists "CRM administra vendedores" on public.vendedores;
create policy "CRM administra vendedores" on public.vendedores
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "CRM administra programas" on public.programas;
create policy "CRM administra programas" on public.programas
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "CRM administra leads" on public.leads;
create policy "CRM administra leads" on public.leads
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "CRM administra eventos" on public.eventos;
create policy "CRM administra eventos" on public.eventos
  for all to anon, authenticated using (true) with check (true);

-- Los tipos de actividad son catálogo fijo: sólo lectura desde la app.
drop policy if exists "CRM lee tipos de evento" on public.tipos_evento;
create policy "CRM lee tipos de evento" on public.tipos_evento
  for select to anon, authenticated using (true);
