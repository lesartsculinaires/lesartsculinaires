# Banco de pruebas local

Levanta una copia del CRM entera —base, API y tiempo real— en esta máquina,
para probar cambios sin tocar Supabase.

```
bash supabase/pruebas/banco/armar.sh
```

Lo que anda acá anda en producción: el esquema sale de las mismas migraciones
de `supabase/migrations/`, con sus políticas de RLS, sus triggers y sus vistas.

## Qué deja andando

| Puerto | Qué es |
|--------|--------|
| 5511 | Postgres con el esquema completo y fichas inventadas |
| 3140 | PostgREST, que es lo que Supabase pone delante de la base |
| 3141 | Un proxy que traduce las rutas de Supabase a las de PostgREST |
| 3143 | Un Realtime de mentira, para probar los cambios en vivo |

La aplicación se levanta aparte; el script imprime los dos comandos al terminar.

## Las sesiones

Se firman tres, con la clave de mentira que está en el script:

| Archivo | Quién | Para probar |
|---------|-------|-------------|
| `jwt-ale.txt` | Ale, de ventas | Que un asesor vea sólo lo suyo |
| `jwt-huri.txt` | Huri, de ventas | Que no vea lo de Ale |
| `jwt-jefa.txt` | Jefa, administradora | Que vea todo y pueda administrar |

Se usan poniéndolas en la cookie `sb-127-auth-token`, con el formato que guarda
supabase-js: `base64-` más el JSON de la sesión en base64.

## Cuidado con `.env.local`

El script deja instrucciones para apuntar la aplicación al banco. Eso reescribe
`.env.local`, que es el que apunta a Supabase de verdad. **Guardá una copia
antes y restaurala al terminar**, o el próximo despliegue va a salir apuntando
a una base que no existe fuera de esta máquina.

## Nada de esto es real

Ni las personas, ni los teléfonos, ni la clave de firma. El banco no toca
ninguna base de producción.
