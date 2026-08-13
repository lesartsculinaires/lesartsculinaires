# Probar el esquema sin tocar Supabase

Levanta un Postgres local, corre `supabase/bootstrap.sql` encima y comprueba
que los permisos siguen haciendo lo que deben. Sirve para dos cosas:

1. Verificar que `bootstrap.sql` instala bien en una base vacía, **antes** de
   pegarlo en un proyecto de Supabase de verdad.
2. Detectar si un cambio en las políticas abre un hueco: que ventas pueda
   autorizar promociones, o que alguien sin sesión pueda leer los clientes.

No toca producción ni internet. Todo pasa en un Postgres desechable.

## Correrlo

Hace falta Postgres 16 instalado localmente (`postgresql-16`).

```sh
# 1. Postgres desechable en el puerto 55432
initdb -D /tmp/pgcrm -U postgres --auth=trust
pg_ctl -D /tmp/pgcrm -o '-p 55432 -h 127.0.0.1' -l /tmp/pgcrm.log start

# 2. Base limpia
psql -h 127.0.0.1 -p 55432 -U postgres -c 'create database prueba;'

# 3. Lo que Supabase ya trae de fábrica (esquema auth, roles, auth.uid())
psql -h 127.0.0.1 -p 55432 -U postgres -d prueba -f supabase/pruebas/01_shim_supabase.sql

# 4. El instalador
psql -h 127.0.0.1 -p 55432 -U postgres -d prueba -v ON_ERROR_STOP=1 -f supabase/bootstrap.sql

# 5. Las pruebas de permisos
psql -h 127.0.0.1 -p 55432 -U postgres -d prueba -tA -f supabase/pruebas/02_prueba_rls.sql

# 6. Botar todo
pg_ctl -D /tmp/pgcrm stop && rm -rf /tmp/pgcrm
```

Postgres no arranca como `root`; si estás en un contenedor, hacelo con un
usuario normal y con el directorio de datos dentro de su propio `home`.

## Qué tiene que salir

El paso 4 no debe imprimir ningún `ERROR`, y debe poder correrse dos veces
seguidas sin fallar (es idempotente a propósito: así se puede volver a pegar
sin miedo si quedó a medias).

El paso 5 debe terminar exactamente así:

```
anon ve clientes: 0
anon ve autorizaciones: 0
ventas es_admin(): false
ventas ve autorizaciones: 1
UPDATE 0                         <- ventas NO pudo autorizar
admin es_admin(): true
UPDATE 1                         <- admin SI pudo autorizar
rol de ventas despues del intento: 2   <- no se pudo hacer administrador
```

Los dos `UPDATE 0` son el punto de toda la prueba. Si alguno se vuelve
`UPDATE 1`, una persona de ventas quedó con permiso de autorizar sus propias
promociones o de volverse administradora, y eso hay que arreglarlo antes de
desplegar.

## Un hueco conocido, a propósito

`ventas ve clientes: 1` — hoy cualquier usuario con sesión ve **todos** los
clientes, no sólo los suyos. Las políticas de `clientes` y `oportunidades`
están como `to authenticated using (true)`. Es el comportamiento actual del
CRM, no un error de esta prueba; queda anotado aquí para que no se confunda
con un hallazgo nuevo el día que se decida limitarlo por vendedor.
