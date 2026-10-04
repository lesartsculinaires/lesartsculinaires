-- «Canales» y «Fríos» entran al catálogo de permisos.
--
-- ============================================================================
-- POR QUÉ CANALES
-- ============================================================================
--
-- Para que exista un rol que entre SÓLO a conectar una cuenta de Meta.
--
-- Meta aprueba `instagram_manage_messages` después de mandar a una persona a
-- probar el producto, y esa persona tiene que conectar su propia cuenta de
-- Instagram desde el CRM. Hasta ahora la pantalla de Canales era de dirección,
-- así que la única forma de dejarla entrar era darle una cuenta de
-- administrador: el revisor vería los clientes, el pipeline y las
-- conversaciones de la escuela, que no es algo que se le dé a alguien de afuera
-- para una prueba de una tarde.
--
-- Con la fila en el catálogo, la casilla aparece en «Usuarios y Roles» y el
-- permiso se da como cualquier otro.
--
-- ----------------------------------------------------------------------------
-- Y OJO CON ESTO, QUE ES LO QUE DECIDE SI ESTO ES SEGURO
-- ----------------------------------------------------------------------------
--
-- El resto del CRM deja VER por omisión: un rol sin fila para un módulo lo ve
-- igual. Es razonable en general —un módulo nuevo no tiene por qué
-- desaparecerle a nadie— y sería un desastre acá, donde se conectan y
-- desconectan las cuentas con las que se le escribe a los clientes.
--
-- Por eso Canales se comprueba aparte, con `puedeVerCanales` en la pantalla y
-- con `puedeEnModulo` en el servidor, y las dos piden la casilla marcada A
-- PROPÓSITO. Esta fila sólo hace que la casilla exista para poder marcarla; no
-- habilita nada por sí sola.
--
-- ============================================================================
-- Y POR QUÉ FRÍOS, QUE PARECE NO VENIR AL CASO
-- ============================================================================
--
-- Porque sí venía: `Fríos` es la única pantalla del CRM que nunca tuvo fila en
-- el catálogo, y un módulo sin fila lo ve todo el mundo pase lo que pase. O sea
-- que no se le podía quitar a nadie, ni se veía en la pantalla de permisos para
-- notar que faltaba.
--
-- Se encontró armando el rol del revisor: era la única pantalla que seguía
-- apareciendo por más que se destildara todo. Agregarla no le cambia nada a
-- ningún rol de hoy —sin fila de permiso, se sigue viendo— y a partir de ahora
-- se puede decidir.

insert into public.modulos (clave, nombre, orden) values
  ('frios',   'Fríos',   67),
  ('canales', 'Canales', 72)
on conflict (clave) do nothing;

comment on table public.modulos is
  'Catálogo de pantallas para los permisos por rol. Una pantalla sin fila acá la ve cualquiera.';
