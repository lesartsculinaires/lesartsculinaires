-- Las solicitudes de eliminación de datos que manda Meta.
--
-- ============================================================================
-- QUÉ ES ESTO Y POR QUÉ HACE FALTA
-- ============================================================================
--
-- Meta exige que una aplicación que recibe datos de personas —y los mensajes de
-- Instagram y Messenger lo son— ofrezca una forma de pedir que se borren. Es un
-- requisito de la revisión, no una opción: sin la dirección de «eliminación de
-- datos» configurada y funcionando, la app no se aprueba.
--
-- Cuando alguien quita la aplicación desde su configuración de Facebook, Meta
-- llama a esa dirección con un aviso firmado. Lo que se espera de vuelta son dos
-- cosas: una URL donde esa persona pueda ver cómo va su pedido, y un CÓDIGO DE
-- CONFIRMACIÓN con el que buscarlo. Esta tabla es lo que hace posible lo
-- segundo: sin dejar constancia, el código no se podría consultar después y la
-- página de estado tendría que inventar una respuesta.
--
-- ============================================================================
-- POR QUÉ CADA COLUMNA
-- ============================================================================
--
--   codigo_confirmacion  Lo que se le devuelve a Meta y lo que la persona usa
--                        para consultar. Único: es la llave de búsqueda, y dos
--                        pedidos con el mismo código harían imposible decir de
--                        cuál se está hablando.
--
--   canal_id +           A quién hay que borrar. El identificador es el que esa
--   identificador        persona tiene frente a NUESTRA cuenta —un IGSID, un
--                        PSID— y no significa nada fuera de ella; por eso va
--                        junto al canal y no suelto. Con índice, porque la
--                        pregunta que se hace siempre es «¿qué se pidió para
--                        éste?».
--
--   estado               `pendiente` al llegar. Después `completada`, `parcial`
--                        —se borró lo que había pero algo quedó fuera de
--                        alcance— o `sin_datos`, que es una respuesta legítima
--                        y frecuente: Meta avisa de gente que nunca escribió.
--                        Distinguirlo de `completada` importa, porque son
--                        afirmaciones distintas sobre lo que se hizo.
--
--   detalle              Qué se borró, en crudo. Es lo que permite contestar
--                        «¿y esto qué incluyó?» meses después sin tener que
--                        reconstruirlo de memoria.
--
-- ============================================================================
-- `if not exists`, COMO EL RESTO
-- ============================================================================
--
-- `armar.sh` corre todas las migraciones cada vez que se arma el banco, y el
-- editor de Supabase invita a pegar lo mismo dos veces. Es la convención del
-- repositorio y la razón por la que el índice lleva nombre propio en vez de
-- dejar que Postgres se lo invente: sin nombre no se puede decir «si ya está, no
-- lo hagas».

create table if not exists public.solicitudes_eliminacion (
  id                   bigint generated always as identity primary key,
  codigo_confirmacion  text not null unique,
  canal_id             bigint not null references public.canales(id),
  identificador        text not null,
  estado               text not null default 'pendiente'
                       check (estado in ('pendiente', 'completada', 'parcial', 'sin_datos')),
  solicitado_en        timestamptz not null default now(),
  completada_en        timestamptz,
  notas                text,
  detalle              jsonb
);

create index if not exists ix_solicitudes_eliminacion_identificador
  on public.solicitudes_eliminacion (identificador);

comment on table public.solicitudes_eliminacion is
  'Solicitudes de eliminación de datos recibidas desde Meta. Las escribe la '
  'función instagram-data-deletion; las lee instagram-estado-eliminacion.';

-- ---------------------------------------------------------------- permisos
--
-- RLS encendido y NINGUNA política, igual que `canal_credenciales`.
--
-- No es un descuido ni un «ya lo completamos después»: es la regla más estricta
-- que hay en el CRM y acá corresponde. Sin política, nadie lee ni escribe con su
-- sesión —ni dirección—, y la llave de servicio pasa por encima de RLS por
-- definición. O sea que estas filas sólo las tocan las funciones del servidor,
-- que es exactamente quién tiene que tocarlas.
--
-- Importa que sea así y no «sólo dirección»: lo que se guarda acá es el rastro
-- de que alguien pidió que lo borren. Que ese rastro no se pueda leer desde el
-- navegador —ni por error, ni con un `select *` escrito con prisa— es parte de
-- respetar el pedido.

alter table public.solicitudes_eliminacion enable row level security;

revoke all on public.solicitudes_eliminacion from anon;
revoke all on public.solicitudes_eliminacion from authenticated;
