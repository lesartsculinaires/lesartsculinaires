-- ============================================================================
-- Tablero Comercial: lo que la plantilla de la Dirección ya traía cargado.
-- ============================================================================
--
-- La Guía de la plantilla dice que las metas «ya están cargadas», y la hoja
-- «Grupos en venta» trae los grupos de LAC con sus precios, fechas y cupos
-- (del archivo «Horarios en venta NOV–MARZO LAC»). Esto los pasa a la base
-- tal cual, para que el módulo arranque como arrancaba el Excel.
--
-- Sólo agrega lo que falta: si la Dirección ya escribió una meta o alguien
-- ya cargó un grupo con el mismo nombre, no se toca. Se puede volver a correr.
--
-- Es de LAC. El CRM de HC tiene su propia versión con sus números.

-- -------------------------------------------- tabla 1: metas de cada mes
insert into public.tablero_metas (mes, clave, valor)
select m.mes::date, 'venta_nueva', 38200
from (values
  ('2026-11-01'), ('2026-12-01'), ('2027-01-01'), ('2027-02-01'), ('2027-03-01'), ('2027-04-01'), ('2027-05-01'),
  ('2027-06-01'), ('2027-07-01'), ('2027-08-01'), ('2027-09-01'), ('2027-10-01'), ('2027-11-01'), ('2027-12-01')
) as m(mes)
where not exists (
  select 1 from public.tablero_metas t where t.mes = m.mes::date and t.clave = 'venta_nueva'
);

-- ----------------------------------------------------- tabla 2: metas fijas
insert into public.tablero_metas (mes, clave, valor)
select null, f.clave, f.valor
from (values
  ('cursos_cortos', 10::numeric),
  ('contratos_corp', 2),
  ('contactados_24h', 0.9),
  ('descuentos_pct', 0.2),
  ('conversion', 0.1),
  ('retorno_pauta', 5),
  ('publicaciones', 12),
  ('calificacion', 4.5),
  ('acciones_a_tiempo', 0.9),
  ('acciones_sin_pauta', 4),
  ('salidas_campo', 8),
  ('leads_sin_pauta_pct', 0.4)
) as f(clave, valor)
where not exists (
  select 1 from public.tablero_metas t where t.mes is null and t.clave = f.clave
);

-- --------------------------------------------------------- grupos en venta
insert into public.tablero_grupos
  (programa, grupo, dias, horario, duracion_meses, inicio, matricula_1, matricula_2, mensualidad, graduacion,
   mensualidad_preventa, cupo, reservas, inscritos)
select g.programa, g.grupo, g.dias, g.horario, g.duracion, g.inicio::date, g.m1, g.m2, g.mensualidad, g.graduacion,
       g.preventa, g.cupo, g.reservas, g.inscritos
from (values
  ('Diplomado Superior de Cocina Internacional', 'DSCI-1-2027- con demo en laboratorio', 'Sábado', '7:00 am a 12:30 md', 12::numeric, '2027-01-16', 265::numeric, 150::numeric, 230::numeric, 350::numeric, 161::numeric, 22, null::integer, null::integer),
  ('Diplomado Superior de Cocina Internacional', 'DSCI-2-2027', 'Sábado', '1:00 pm a 6:30 pm', 12, '2027-01-16', 265, 150, 230, 350, 161, 22, null, null),
  ('Diplomado Superior de Cocina Internacional', 'DSCI-3-2027', 'Lunes y martes', '7:30 am a 12:00 md', 12, '2027-01-18', 265, 150, 230, 350, 161, 22, null, null),
  ('Diplomado Superior de Cocina Internacional', 'DSCI-4-2027', 'Lunes y martes', '1:00 pm a 5:00 pm', 12, '2027-01-18', 265, 150, 230, 350, 161, 22, null, null),
  ('Diplomado Superior de Cocina Internacional', 'DSCI-5-2027', 'Lunes y martes', '6:00 pm a 9:00 pm', 12, '2027-01-18', 265, 150, 230, 350, 161, 22, null, null),
  ('Diplomado Superior de Cocina Internacional', 'DSCI-6-2027', 'Jueves y viernes', '1:00 pm a 5:00 pm', 12, '2027-01-28', 265, 150, 230, 350, 161, 22, null, null),
  ('Diplomado Superior de Pastelería Internacional', 'DSPI-1-2027', 'Jueves y viernes', '1:00 pm a 5:00 pm', 12, '2027-01-28', 265, 150, 230, 350, 161, 22, null, null),
  ('Diplomado Superior de Pastelería Internacional', 'DSPI-2-2027', 'Lunes y martes', '7:30 am a 12:00 md', 12, '2027-02-01', 265, 150, 230, 350, 161, 22, null, null),
  ('Diplomado Superior de Pastelería Internacional', 'DSPI-3-2027', 'Lunes y martes', '1:00 pm a 5:00 pm', 12, '2027-02-01', 265, 150, 230, 350, 161, 22, null, null),
  ('Diplomado Superior de Pastelería Internacional', 'DSPI-4-2027', 'Jueves y viernes', '6:00 pm a 9:00 pm', 12, '2027-03-18', 265, 150, 230, 350, 161, 22, null, null),
  ('Diplomado Superior de Mixología Internacional', 'DSMI-1-2027', 'Martes', '5:00 p.m. a 9:00 p.m.', 6, '2027-01-05', 265, 0, 185, 350, 129.5, 15, null, null),
  ('Diplomado Superior de Mixología Internacional', 'DSMI-2-2027', 'Sábado', '1:00 pm a 5:00 pm', 6, '2027-01-16', 265, 0, 185, 350, 129.5, 15, null, null),
  ('Diplomado Superior de Mixología Internacional', 'DSMI-3-2027', 'Lunes', '1:00 pm a 5:00 pm', 6, '2027-01-18', 265, 0, 185, 350, 129.5, 15, null, null),
  ('Diplomado Superior de Management Gastronómico', 'DSMG-grupo 1-fase 1-2027', 'Miércoles', '1:00 pm a 5:00 pm', 6, '2027-01-13', 230, 0, 185, 350, 129.5, 30, null, null),
  ('Diplomado Superior de Barismo y extracción de café', 'DSBA-1-2027', 'Sábado', '8:00 am a 12:00 md', 6, '2027-01-09', 265, 0, 225, 350, 157.5, 15, null, null),
  ('Diplomado Superior de Barismo y extracción de café', 'DSBA-2-2027', 'Martes', '8:00 am a 12:00 md', 6, '2027-01-19', 265, 0, 225, 350, 157.5, 15, null, null)
) as g(programa, grupo, dias, horario, duracion, inicio, m1, m2, mensualidad, graduacion, preventa, cupo, reservas, inscritos)
where not exists (
  select 1 from public.tablero_grupos t where t.grupo = g.grupo
);
