begin;

-- «RECUPERACIÓN» en una nota deja el recordatorio de llamar en una semana.
--
-- ------------------------------------------------------------------------
-- QUÉ CAMBIA ACÁ Y QUÉ CAMBIA EN LA APLICACIÓN
-- ------------------------------------------------------------------------
--
-- Casi todo el trabajo es de la aplicación: leer la palabra en la nota, contar
-- siete días y crear el recordatorio. Eso ya existe para «seguimiento de pago»
-- y «seguimiento de cierre», y esto se suma a lo mismo.
--
-- Lo único que hace falta de este lado es dejar entrar el tipo nuevo. La tabla
-- de seguimientos tiene una restricción que enumera los tipos válidos —hoy
-- `pago`, `cierre` y `reactivacion`— y sin agregarlo, la nota se guardaría y
-- el recordatorio no, con el asesor creyendo que quedó agendado.
--
-- ------------------------------------------------------------------------
-- POR QUÉ UNA SEMANA, Y POR QUÉ ES UN TIPO APARTE
-- ------------------------------------------------------------------------
--
-- Una semana lo pidió la escuela y tiene sentido: recuperar es volver a
-- alguien que se enfrió, y llamarlo al otro día es demasiado pronto.
--
-- Va como tipo propio y no como un «seguimiento de cierre» más porque en la
-- lista de Recordatorios se lee distinto: «Recuperación» dice qué llamada es
-- sin tener que abrir la ficha, y permite contarlas aparte cuando dirección
-- quiera saber cuántas recuperaciones hay en curso.
--
-- Se puede correr con gente trabajando, y dos veces.

alter table public.seguimientos
  drop constraint if exists seguimientos_tipo_check;

alter table public.seguimientos
  add constraint seguimientos_tipo_check
  check (tipo in ('pago', 'cierre', 'reactivacion', 'recuperacion'));

commit;

-- ------------------------------------------------------------- cómo quedó

select
  case when exists (
    select 1
      from pg_constraint
     where conname = 'seguimientos_tipo_check'
       and pg_get_constraintdef(oid) like '%recuperacion%'
  ) then '✓ la base ya acepta los de recuperación' else '· falta' end as tipo,
  (select count(*) from public.seguimientos where tipo = 'recuperacion')
                                                                      as recuperaciones,
  (select count(*) from public.seguimientos where hecho_en is null)   as pendientes_en_total;
