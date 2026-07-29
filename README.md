# CRM Les Arts Culinaires

CRM de ventas para Les Arts Culinaires: leads, seguimiento, pipeline, calendario
de actividades, equipo comercial y catálogo de programas.

Next.js 15 (App Router) + TypeScript + React 19.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completá la anon key
npm run dev                  # http://localhost:3000
```

Sin `.env.local` la app arranca igual: muestra el juego de datos de ejemplo que
vive en `src/data/` y lo avisa con un cartel arriba de cada módulo.

## Conexión con Supabase

Las dos variables salen del panel de Supabase, en **Project Settings**:

| Variable | Dónde está |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | API Keys → anon / publishable |

La anon key es pública por diseño: viaja al navegador y sólo puede hacer lo que
permitan tus políticas de Row Level Security. **La service_role key no va acá.**

### Esquema

La migración `supabase/migrations/20260729000000_crm_schema.sql` crea todo lo
que el frontend necesita:

| Tabla | Qué guarda |
| --- | --- |
| `leads` | Oportunidades. `id` es el código visible (`LA-0414`). |
| `vendedores` | Equipo comercial, con su meta mensual. |
| `programas` | Catálogo de diplomados, cursos y certificaciones. |
| `tipos_evento` | Tipos de actividad, con su color, código y duración. |
| `eventos` | Agenda. `dia_idx` va de 1 (1 jul 2026) a 62 (31 ago 2026). |

Se aplica con `supabase db push`, o pegándola en el SQL Editor. Es idempotente:
se puede volver a correr sin duplicar los datos de referencia.

Sobre una tabla `leads` que ya existía por un import de CSV, la migración sólo
**agrega** las columnas que falten — no borra ni renombra nada. Si tu CSV usó
encabezados distintos (`telefono` en vez de `tel`), vas a terminar con las dos
columnas: la tuya con datos y la nueva vacía. En ese caso conviene o migrar los
datos con un `update`, o apuntar `COLUMNS` a tus nombres reales.

### Row Level Security

La migración activa RLS y crea políticas que **permiten lectura y escritura al
rol `anon`**. Es lo que hace falta para que el CRM funcione hoy, pero implica
que cualquiera con la anon key —que es pública, va en el bundle del navegador—
puede leer y modificar los datos.

Para producción: montá Supabase Auth y cambiá `to anon` por `to authenticated`
en las políticas de la migración. El login actual del frontend es sólo un
selector de área, no autentica contra nada.

Si desactivás las políticas de lectura, la consulta devuelve cero filas **sin
error**: vas a ver las tablas vacías en vez de un mensaje de permiso denegado.

### Adaptar el mapeo de columnas

Todo lo que depende del nombre real de tu tabla y sus columnas está en un solo
archivo: **`src/lib/supabase/leads.ts`**.

```ts
export const TABLE = "leads";

export const COLUMNS: Record<keyof Cliente, string> = {
  id: "id",
  nombre: "nombre",
  tel: "tel",       // si tu CSV trae "telefono", cambiá sólo esto
  correo: "correo", // si trae "email", ídem
  ...
};
```

El resto del código nunca toca nombres de columnas: lee y escribe usando los
campos del tipo `Cliente`. Cambiar el lado derecho de ese objeto alcanza para
que todo el CRM apunte a tu esquema.

Los importadores de CSV suelen dejar los montos como texto (`"$1,750"`); el
mapeo ya los limpia, así que no hace falta normalizarlos antes.

## Cómo fluyen los datos

- `src/app/page.tsx` es un Server Component: resuelve leads y catálogo en
  paralelo y se los pasa a la app ya listos.
- `src/lib/supabase/queries.ts` lee los leads; `catalog.ts` lee vendedores,
  programas, tipos de actividad y eventos. Cada uno cae en los datos de ejemplo
  por separado, así que una tabla vacía no se lleva puestas a las demás.
- `src/app/actions.ts` expone las escrituras como Server Actions.
- `src/lib/catalog.tsx` reparte los datos de referencia por contexto, para que
  los módulos no tengan que recibirlos por props.
- `src/hooks/useCrm.ts` mantiene el estado. Las ediciones son optimistas: la
  pantalla se actualiza al instante y la escritura viaja en segundo plano; si
  falla, aparece un cartel y **no** se descarta lo que hiciste.

Al cerrar un evento se agenda la próxima acción primero y recién después se
marca el evento como realizado, para que un fallo no deje al lead cerrado y sin
seguimiento.

## Alcance actual

Leads, vendedores, programas, tipos de actividad y eventos salen de Supabase.
Las taxonomías fijas del diseño —etapas, estados, canales, territorios— siguen
siendo constantes en `src/data/taxonomia.ts`.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm start          # servir el build
npm run typecheck  # tsc --noEmit
npm run lint
```
