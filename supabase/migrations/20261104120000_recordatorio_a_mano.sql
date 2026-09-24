begin;

-- Un recordatorio puesto a mano desde la ficha, con su fecha y su porqué.
--
-- ------------------------------------------------------------------------
-- QUÉ PIDIÓ LA ESCUELA
-- ------------------------------------------------------------------------
--
-- «En la ficha de clientes, un apartado que diga Recordatorio, con un cuadro
--  de fecha para que el asesor elija y otro de texto del por qué esa fecha; y
--  que esa fecha esté vinculada al módulo de recordatorios para notificarle.»
--
-- ------------------------------------------------------------------------
-- POR QUÉ NO HACE FALTA UNA TABLA NUEVA
-- ------------------------------------------------------------------------
--
-- Porque `seguimientos` YA es exactamente eso: una fecha, un texto de por qué,
-- la oportunidad de la que cuelga y quién lo dejó anotado. De ahí salen la
-- lista del módulo de Recordatorios, el globito de la barra y el aviso del
-- día. Una tabla aparte significaría escribir todo eso de nuevo, y a la
-- primera diferencia entre las dos listas nadie sabría cuál mirar.
--
-- Lo único que cambiaba es de dónde sale la fecha. Hasta hoy la ponía el CRM:
-- leyendo «seguimiento de pago» en una nota, contando siete días desde una
-- recuperación, o los meses de una reactivación. Ahora también la puede poner
-- el asesor a mano, que es el caso que faltaba: «me dijo que lo llame el 12
-- porque cobra el 10».
--
-- ------------------------------------------------------------------------
-- QUÉ HACE ESTE ARCHIVO
-- ------------------------------------------------------------------------
--
-- Dejar entrar el tipo `manual` en la restricción que enumera los válidos. Sin
-- esto el recordatorio se rechazaría al guardar, y el asesor se quedaría
-- creyendo que quedó agendado —que es exactamente lo que este cambio viene a
-- evitar—.
--
-- Va como tipo propio y no colgado de `cierre` porque en la lista se lee
-- distinto: «Recordatorio» dice que lo puso una persona a propósito, y no que
-- el CRM lo dedujo de una nota. Esa diferencia importa cuando alguien revisa
-- por qué hay una llamada agendada.
--
-- Se puede correr con gente trabajando, y dos veces.

alter table public.seguimientos
  drop constraint if exists seguimientos_tipo_check;

alter table public.seguimientos
  add constraint seguimientos_tipo_check
  check (tipo in ('pago', 'cierre', 'reactivacion', 'recuperacion', 'manual'));

commit;

-- ------------------------------------------------------------- cómo quedó

select
  case when exists (
    select 1
      from pg_constraint
     where conname = 'seguimientos_tipo_check'
       and pg_get_constraintdef(oid) like '%manual%'
  ) then '✓ la base ya acepta los recordatorios a mano' else '· falta' end as tipo,
  (select count(*) from public.seguimientos where tipo = 'manual')    as a_mano,
  (select count(*) from public.seguimientos where hecho_en is null)   as pendientes_en_total;
