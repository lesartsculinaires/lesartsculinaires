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

### Row Level Security

Si la tabla tiene RLS activo hace falta una política de lectura, y otra de
escritura para que se guarden los cambios desde la app. Para un CRM interno
detrás de login propio, lo mínimo es habilitar `select` y `update`. Sin la
política de lectura la consulta devuelve cero filas sin error, y vas a ver la
tabla vacía en vez de un mensaje.

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

- `src/app/page.tsx` es un Server Component: consulta los leads y se los pasa a
  la app ya resueltos.
- `src/lib/supabase/queries.ts` hace la lectura y cae en los datos de ejemplo si
  Supabase no está configurado o la consulta falla.
- `src/app/actions.ts` expone las escrituras como Server Actions.
- `src/hooks/useCrm.ts` mantiene el estado. Las ediciones son optimistas: la
  pantalla se actualiza al instante y la escritura viaja en segundo plano; si
  falla, aparece un cartel y **no** se descarta lo que hiciste.

## Alcance actual

Los leads salen de Supabase. El calendario, los vendedores y el catálogo de
programas todavía viven en `src/data/` — el CSV cubría leads solamente.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm start          # servir el build
npm run typecheck  # tsc --noEmit
npm run lint
```
