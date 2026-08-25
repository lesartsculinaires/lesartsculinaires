begin;

-- Que la base numere los leads, y no cada pantalla por su cuenta.
--
-- ------------------------------------------------------------------------
-- QUÉ SE ROMPÍA
-- ------------------------------------------------------------------------
--
-- El código «CRM-0582» se venía calculando en JavaScript: leer el último,
-- sumarle uno, insertar. Eso funciona mientras las altas entren de a una, y
-- desde que WhatsApp abre leads solo ya no entran de a una: si escriben cinco
-- personas en el mismo segundo, las cinco leen el mismo último código y las
-- cinco piden el mismo número. Gana una y las otras chocan contra el índice
-- único. Había un reintento, pero repetía el error: los que perdían volvían a
-- leer y volvían a pedir todos el mismo siguiente, así que cada vuelta salvaba
-- a uno solo. Pasados cinco intentos el lead no se creaba.
--
-- Medido en el banco: sesenta mensajes juntos, diez leads que no se abrieron.
-- El mensaje sí quedaba guardado y el chat también, así que desde afuera se
-- veía una conversación sin lead y sin asesor —nada avisaba que se había
-- perdido algo.
--
-- Y había un segundo problema escondido debajo: «el último» se buscaba
-- ordenando por texto, y por texto 'CRM-9999' es mayor que 'CRM-10004'. Al
-- pasar los diez mil leads, el máximo se quedaba clavado en 9999 para siempre
-- y a partir de ahí ningún lead nuevo conseguía código. Faltaba mucho para
-- llegar, pero llegaba solo.
--
-- ------------------------------------------------------------------------
-- CÓMO SE ARREGLA
-- ------------------------------------------------------------------------
--
-- Numerar es responsabilidad de quien es dueño de la unicidad, y esa es la
-- base. Un disparador antes de insertar toma un candado, mira cuál es el
-- número más alto —como número, no como texto— y le pone el siguiente.
--
-- El candado es lo que hace que sirva: mientras una alta está eligiendo su
-- número, las demás esperan, así que ninguna puede elegir el mismo. Dura lo
-- que dura el insert, que son milésimas.
--
-- ------------------------------------------------------------------------
-- POR QUÉ NO HAY QUE TOCAR NINGUNA PANTALLA
-- ------------------------------------------------------------------------
--
-- El disparador respeta el código que le manden si está libre, y sólo lo
-- reemplaza cuando viene vacío o cuando ya lo tiene otro. Así, las tres
-- puertas que hoy calculan código —el alta de Clientes, la importación por
-- lotes y el webhook de WhatsApp— siguen funcionando igual, y encima quedan
-- protegidas: lo que antes era un choque y un lead perdido, ahora es un
-- número corregido sin que nadie se entere.
--
-- Se puede correr con gente trabajando, y dos veces.

-- ------------------------------------------------------- los que quedaron sin

-- Por el choque de arriba puede haber leads con el código vacío. Se numeran
-- antes de poner el disparador, para que el máximo salga bien de una vez.
do $$
declare
  faltan int;
begin
  select count(*) into faltan from public.oportunidades where codigo is null;
  if faltan = 0 then
    raise notice 'no hay leads sin código';
    return;
  end if;

  with siguiente as (
    select id,
           coalesce(
             (select max((substring(o2.codigo from 'CRM-(\d+)$'))::bigint)
                from public.oportunidades o2
               where o2.codigo ~ '^CRM-\d+$'),
             0
           ) + row_number() over (order by id) as n
      from public.oportunidades
     where codigo is null
  )
  update public.oportunidades o
     set codigo = 'CRM-' || lpad(s.n::text, 4, '0')
    from siguiente s
   where o.id = s.id;

  raise notice 'se numeraron % leads que estaban sin código', faltan;
end $$;

-- ------------------------------------------------------------- el disparador

/*
 * El siguiente código libre.
 *
 * `security definer` porque la llama el disparador en nombre de quien esté
 * insertando —el webhook sin sesión, una asesora desde la pantalla— y todos
 * tienen que poder leer el máximo, incluso el de los leads que su política de
 * visibilidad no les deja ver. Si mirara sólo los suyos, dos personas
 * distintas obtendrían el mismo número.
 */
create or replace function public.numerar_oportunidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proximo bigint;
begin
  -- Si trae código y está libre, se respeta: puede ser una importación que
  -- quiere conservar la numeración de la planilla.
  if new.codigo is not null
     and not exists (select 1 from public.oportunidades where codigo = new.codigo)
  then
    return new;
  end if;

  -- De acá para abajo hay que elegir número, y elegir es lo que no puede
  -- pasar en paralelo. El candado se suelta solo al terminar la transacción.
  -- El número es arbitrario: sólo tiene que ser el mismo en todas las altas.
  perform pg_advisory_xact_lock(hashtext('codigo_de_oportunidad'));

  select coalesce(max((substring(codigo from 'CRM-(\d+)$'))::bigint), 0) + 1
    into proximo
    from public.oportunidades
   where codigo ~ '^CRM-\d+$';

  -- `lpad` a cuatro es el formato de siempre —CRM-0582—; pasados los diez mil
  -- crece a cinco dígitos solo, sin quedarse trabado como antes.
  new.codigo := 'CRM-' || lpad(proximo::text, 4, '0');
  return new;
end $$;

drop trigger if exists numerar_oportunidad on public.oportunidades;

create trigger numerar_oportunidad
  before insert on public.oportunidades
  for each row
  execute function public.numerar_oportunidad();

-- Sin el índice único el disparador seguiría sirviendo, pero nada impediría
-- que un `update` a mano dejara dos leads con el mismo código.
create unique index if not exists oportunidades_codigo_unico
  on public.oportunidades (codigo);

commit;
