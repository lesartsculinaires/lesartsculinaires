import "server-only";

import { getServerClient } from "@/lib/supabase/server";
import type { Accesos, Modulo, Permiso, Rol, Usuario } from "@/lib/types";

type Row = Record<string, unknown>;

const rows = (r: { data: unknown }): Row[] =>
  Array.isArray(r.data) ? (r.data as Row[]) : [];

const str = (v: unknown, fallback = ""): string =>
  v == null || v === "" ? fallback : String(v);

const VACIO: Accesos = {
  modulos: [],
  roles: [],
  permisos: [],
  usuarios: [],
  yo: null,
  esAdmin: false,
};

/**
 * Load the access model: modules, roles, their permissions and the users.
 *
 * RLS decides the reach — a non-admin gets the catalogue plus only their own
 * user row, which is all the sidebar needs to know what to show.
 */
export async function fetchAccesos(userId: string): Promise<{
  data: Accesos;
  /** Set when the tables are missing, i.e. the migration has not been run. */
  faltaMigracion: boolean;
}> {
  const supabase = await getServerClient();
  if (!supabase) return { data: VACIO, faltaMigracion: false };

  /*
   * Las siete consultas van juntas.
   *
   * Las tres de abajo —las dos casillas de roles y el enlace con vendedores—
   * se pedían después de las cuatro primeras y una detrás de otra, sin
   * depender de nada de lo anterior: cuatro viajes a la base en fila en cada
   * refresco de cada pestaña. Con la base lenta del 10 de octubre de 2026,
   * cuatro veces lo que tardaba una. Separadas siguen estando, por lo que
   * explica cada una; lo que cambió es que ya no se esperan.
   */
  const [mods, rls, perms, usrs, casillaPropios, casillaReparto, vends] = await Promise.all([
    supabase.from("modulos").select("clave, nombre, padre, orden").order("orden"),
    supabase.from("roles").select("id, nombre, descripcion, activo, es_admin, ve_todo").order("nombre"),
    supabase.from("rol_permisos").select("*"),
    supabase.from("usuarios").select("id, nombre, correo, rol_id, activo").order("correo"),
    supabase.from("roles").select("id, pipeline_solo_propios"),
    supabase.from("roles").select("id, recibe_leads"),
    supabase.from("vendedores").select("id, usuario_id").not("usuario_id", "is", null),
  ]);

  /*
   * La casilla del tablero se pide aparte, y si no está no pasa nada.
   *
   * Va en su propia consulta a propósito. Nombrar una columna que todavía no
   * existe hace que PostgREST conteste «does not exist», y eso lo lee la
   * comprobación de abajo como «faltan las tablas de roles»: el CRM entero
   * pasaría a mostrar la pantalla de «corré la migración» hasta que alguien la
   * corriera. Desplegar el código antes que el SQL es lo normal, así que ese
   * rato tiene que ser inofensivo.
   *
   * Sin la columna, nadie estrecha su tablero, que es exactamente como se
   * comportaba el CRM hasta ahora.
   */
  const soloPropios = new Set<number>();
  const recibenLeads = new Set<number>();
  {
    const { data, error } = casillaPropios;
    if (!error) {
      for (const r of (data ?? []) as Row[]) {
        if (r.pipeline_solo_propios === true) soloPropios.add(Number(r.id));
      }
    }
  }
  /*
   * Y quién entra en el reparto, también aparte y por lo mismo de arriba.
   *
   * Va en su propia consulta y no junto a `pipeline_solo_propios` porque son de
   * migraciones distintas: pedirlas juntas haría que, faltando una, se perdiera
   * también la otra.
   */
  {
    const { data, error } = casillaReparto;
    if (!error) {
      for (const r of (data ?? []) as Row[]) {
        if (r.recibe_leads === true) recibenLeads.add(Number(r.id));
      }
    }
  }

  // El enlace usuario→vendedor vive en `vendedores`, no en `usuarios`: es esa
  // ficha la que apunta a la cuenta. Se trae aparte y se cruza acá.
  const vendedorDe = new Map<string, number>();
  for (const v of (vends.data ?? []) as Row[]) {
    if (v.usuario_id) vendedorDe.set(str(v.usuario_id), Number(v.id));
  }

  // PostgREST answers PGRST205 ("Could not find the table … in the schema
  // cache") for a table that does not exist — not Postgres' own 42P01, which
  // only surfaces on direct SQL.
  const falta = [mods, rls, perms, usrs].some(
    (r) =>
      r.error &&
      (r.error.code === "PGRST205" ||
        r.error.code === "42P01" ||
        /schema cache|does not exist/i.test(r.error.message)),
  );
  if (falta) return { data: VACIO, faltaMigracion: true };

  const roles: Rol[] = rows(rls).map((r) => ({
    id: Number(r.id),
    nombre: str(r.nombre),
    descripcion: r.descripcion ? str(r.descripcion) : null,
    activo: r.activo !== false,
    esAdmin: r.es_admin === true,
    // Falta la columna mientras no se corra la migración de permisos; sin ella
    // nadie tiene el permiso, que es el estado de antes.
    veTodo: r.ve_todo === true,
    pipelineSoloPropios: soloPropios.has(Number(r.id)),
    recibeLeads: recibenLeads.has(Number(r.id)),
  }));

  const usuarios: Usuario[] = rows(usrs).map((r) => ({
    id: str(r.id),
    nombre: r.nombre ? str(r.nombre) : null,
    correo: str(r.correo),
    rolId: r.rol_id == null ? null : Number(r.rol_id),
    activo: r.activo !== false,
    vendedorId: vendedorDe.get(str(r.id)) ?? null,
  }));

  const yo = usuarios.find((u) => u.id === userId) ?? null;
  const miRol = yo ? roles.find((r) => r.id === yo.rolId) : undefined;

  return {
    data: {
      modulos: rows(mods).map(
        (r): Modulo => ({
          clave: str(r.clave),
          nombre: str(r.nombre),
          padre: r.padre ? str(r.padre) : null,
          orden: Number(r.orden ?? 0),
        }),
      ),
      roles,
      permisos: rows(perms).map(
        (r): Permiso => ({
          rolId: Number(r.rol_id),
          modulo: str(r.modulo),
          ver: r.ver === true,
          crear: r.crear === true,
          editar: r.editar === true,
          eliminar: r.eliminar === true,
        }),
      ),
      usuarios,
      yo,
      esAdmin: miRol?.esAdmin === true,
    },
    faltaMigracion: false,
  };
}
