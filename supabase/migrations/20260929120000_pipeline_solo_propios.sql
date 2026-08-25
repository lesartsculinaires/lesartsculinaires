begin;

-- Ver todos los clientes, pero sólo los leads propios en el tablero.
--
-- ------------------------------------------------------------------------
-- POR QUÉ NO ALCANZA `ve_todo`
-- ------------------------------------------------------------------------
--
-- `ve_todo` es una sola llave para dos puertas. Decide qué filas de
-- `oportunidades` devuelve la base, y de esas mismas filas se alimentan las
-- dos pantallas: Clientes las lista y Pipeline las acomoda en columnas. Con la
-- llave puesta se ve todo en las dos; sin ella, lo propio en las dos.
--
-- Lo que hace falta acá es distinto: el asesor tiene que poder buscar a
-- cualquier cliente —para no llamar dos veces a la misma persona, para ver si
-- ya la atendió otro— y a la vez tener un tablero que sea el suyo, sin los
-- leads de los demás encima.
--
-- Así que la llave se queda como está y se suma una casilla que sólo estrecha
-- el tablero.
--
-- ------------------------------------------------------------------------
-- QUÉ ES Y QUÉ NO ES ESTA CASILLA
-- ------------------------------------------------------------------------
--
-- Es acomodar la pantalla, no esconder datos. Y en este caso está bien que así
-- sea: los datos se ven igual en Clientes, a propósito, porque eso fue lo que
-- se pidió. El tablero no muestra menos de lo que la persona puede consultar;
-- muestra lo que es suyo, que es lo que sirve para trabajar.
--
-- Quien no tiene `ve_todo` no necesita esta casilla: la base ya le devuelve
-- nada más lo suyo, y el tablero sale filtrado solo.
--
-- Se puede correr con gente trabajando, y dos veces.

alter table public.roles
  add column if not exists pipeline_solo_propios boolean not null default false;

comment on column public.roles.pipeline_solo_propios is
  'Ve todos los clientes, pero en el Pipeline sólo sus propios leads.';

-- «Asesor Secundario» es el caso que lo pidió: sigue viendo Clientes completo
-- y su tablero pasa a ser el suyo. Si el rol no existe, no pasa nada.
update public.roles
   set pipeline_solo_propios = true
 where nombre = 'Asesor Secundario';

commit;

-- Quién ve qué, ahora con las dos pantallas por separado.
select
  r.nombre                                                       as rol,
  case when r.es_admin or r.ve_todo
       then 'todos los clientes'
       else 'sólo sus clientes' end                              as en_clientes,
  case when (r.es_admin or r.ve_todo) and not r.pipeline_solo_propios
       then 'todo el pipeline'
       else 'sólo sus propios leads' end                         as en_pipeline,
  case when r.recibe_leads then 'sí' else 'no' end               as recibe_leads_de_whatsapp,
  (select count(*) from public.usuarios u
    where u.rol_id = r.id and u.activo)                          as personas
  from public.roles r
 where r.activo
 order by (r.es_admin or r.ve_todo) desc, r.nombre;
