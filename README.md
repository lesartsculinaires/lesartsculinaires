# CRM Les Arts Culinaires

CRM de ventas: oportunidades, pipeline, agenda de seguimiento, equipo comercial
y catálogo de programas. Next.js 15 (App Router) + TypeScript + React 19, sobre
Supabase.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completá la clave publicable
npm run dev                  # http://localhost:3000
```

Sin sesión iniciada la app redirige a `/login`. Las cuentas se crean desde
**Supabase → Authentication → Users**.

| Variable | Dónde está |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API Keys → publishable |

La clave publicable es pública por diseño: viaja al navegador y sólo puede hacer
lo que permitan las políticas RLS. **La `service_role` no va acá.**

## Modelo de datos

```
territorios ─┐
canales ─────┤
productos ───┼──< oportunidades >── clientes ──> territorios
vendedores ──┤          │
etapas ──────┤          ├──< oportunidad_notas
estados ─────┘          └──< eventos >── tipos_evento
```

- **clientes** — 554 registros, deduplicados por correo, teléfono y nombre.
- **oportunidades** — 580, una por fila del Excel original. `codigo` conserva el
  `CRM-####` para rastrear cualquier fila contra la hoja.
- **oportunidad_notas** — 91 notas rescatadas de columnas numéricas.
- **eventos** — agenda de seguimiento, colgada de la oportunidad que la origina.

La app lee de **`vw_pipeline`**, que aplana los joins y expone tanto el nombre
como el id de cada catálogo: las pantallas muestran nombres, pero las escrituras
necesitan ids.

## Migraciones

| Archivo | Qué hace |
| --- | --- |
| `20260722000000_initial_schema.sql` | Esquema de recetas heredado, sin relación con el CRM |
| `20260729100000_crm_normalizado.sql` | Tablas del CRM, vistas y RLS |
| `20260729110000_seguridad_y_agenda.sql` | Cierra la fuga de las vistas, agrega ids a `vw_pipeline` y crea la agenda |

Los CSV de carga inicial quedan en `supabase/seed/`, numerados en el orden en
que deben importarse (los catálogos primero, porque las llaves foráneas de
`oportunidades` apuntan a ellos). `supabase/seed_post_import.sql` reposiciona
las secuencias — sin eso, el primer INSERT desde la app da error de llave
duplicada.

## Seguridad

RLS está activo en las nueve tablas, con políticas `to authenticated`: hay que
iniciar sesión para ver o escribir cualquier cosa.

**Una corrección importante ya aplicada.** Las tres vistas se habían creado como
`SECURITY DEFINER`, que es el comportamiento por defecto de Postgres. Eso hacía
que corrieran con los permisos de su creador y devolvieran todas las filas a
cualquiera con la clave pública, saltándose el RLS de las tablas: nombre,
teléfono y correo de los 554 clientes quedaban legibles sin iniciar sesión. La
segunda migración las pasa a `security_invoker`, así respetan el RLS de quien
consulta.

Pendiente para producción: las políticas actuales dejan que cualquier usuario
autenticado vea todo. Para que cada vendedor vea sólo su cartera hay que ligar
`vendedores` con `auth.users` (una columna `user_id uuid references
auth.users(id)`) y filtrar por ella.

## Cómo fluyen los datos

- `src/middleware.ts` refresca la sesión en cada request y manda a `/login` a
  quien no la tenga.
- `src/app/page.tsx` es un Server Component: resuelve oportunidades, catálogo y
  agenda en paralelo. Corre como el usuario firmado, así que el RLS decide qué
  vuelve.
- `src/app/actions.ts` expone las escrituras como Server Actions.
- `src/lib/catalog.tsx` reparte los catálogos por contexto.
- `src/hooks/useCrm.ts` mantiene el estado. Las ediciones son optimistas: la
  pantalla se actualiza al instante y la escritura viaja en segundo plano; si
  falla, aparece un cartel y **no** se descarta lo que hiciste.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm start          # servir el build
npm run typecheck  # tsc --noEmit
npm run lint
```
