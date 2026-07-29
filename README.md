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

## Despliegue

**En producción:** https://crm-les-arts.netlify.app

El repo trae `netlify.toml` con el runtime de Next.js ya configurado, y el sitio
`crm-les-arts` ya existe con las dos variables de entorno cargadas.

**Falta un paso manual:** conectar el sitio al repositorio para que cada push
despliegue solo. En Netlify → **Site configuration → Build & deploy → Continuous
deployment → Link repository** → GitHub → `lesartsculinaires/lesartsculinaires`,
rama de producción `main`. Hasta que eso esté hecho, los despliegues se hacen a
mano con `npx netlify deploy --build --prod`.

Si querés crear el sitio desde cero en otra cuenta:

1. **Add new site → Import an existing project** → GitHub →
   `lesartsculinaires/lesartsculinaires`.
2. Rama de producción: `main`. El build command y el publish directory los toma
   del `netlify.toml`, no hay que escribirlos.
3. **Site configuration → Environment variables**, agregá las dos:
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Sin ellas el build pasa pero la app no puede iniciar sesión.
4. Deploy.

Después, en **Supabase → Authentication → URL Configuration**, agregá la URL
que te dé Netlify como *Site URL* y en *Redirect URLs*. Si no, el login falla en
producción aunque funcione en local.

## Migraciones

| Archivo | Qué hace |
| --- | --- |
| `20260722000000_initial_schema.sql` | Esquema de recetas heredado, sin relación con el CRM |
| `20260729173224_crm_esquema_normalizado.sql` | Tablas del CRM, vistas y RLS |
| `20260729174010_cerrar_fuga_vistas_security_definer.sql` | Cierra la fuga de las vistas y agrega los ids a `vw_pipeline` |
| `20260729174325_vista_con_ids_y_tablas_agenda.sql` | Tablas de la agenda |

Los nombres de archivo coinciden con las versiones registradas en
`supabase_migrations.schema_migrations`, así que `supabase db push` las ve como
ya aplicadas y no intenta reaplicarlas.

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
