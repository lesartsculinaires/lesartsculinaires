"use server";

import { getServerClient } from "@/lib/supabase/server";

/**
 * Por qué canales llegó un contacto.
 *
 * Vive aparte de `actions.ts` porque es una pregunta sola y nueva: el resto de
 * la ficha sale del pipeline, que trae una fila por oportunidad. Esto trae una
 * fila por canal, que es otra cosa.
 */

/** Un canal por el que llegó alguien, con sus dos fechas. */
export interface CanalDelContacto {
  canal: string;
  /** Cuándo llegó por acá la primera vez. Es lo que ordena la tira. */
  primeraVez: string;
  /** La última. Cuando son iguales, sólo llegó una vez por ese lado. */
  ultimaVez: string;
  /** El teléfono o el usuario con el que llegó. Puede faltar. */
  identificador: string | null;
}

export interface ResultadoCanales {
  ok: boolean;
  error: string | null;
  canales: CanalDelContacto[];
  /** Cierto cuando falta correr la migración, para no gritar un error feo. */
  faltaMigracion: boolean;
}

const VACIO: ResultadoCanales = {
  ok: true,
  error: null,
  canales: [],
  faltaMigracion: false,
};

/**
 * Los canales de un contacto, del más viejo al más nuevo.
 *
 * El orden no es decorativo: el primero de la lista es por dónde entró, que es
 * el dato que dice qué campaña lo trajo. Por eso ordena por `primera_vez` y no
 * por la última ni por nombre.
 */
export async function canalesDelContacto(clienteId: number): Promise<ResultadoCanales> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ...VACIO, ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };
  }

  const { data, error } = await supabase
    .from("contactos_canal")
    .select("primera_vez, ultima_vez, identificador, canales(nombre)")
    .eq("cliente_id", clienteId)
    .order("primera_vez", { ascending: true });

  if (error) {
    // PGRST205 es «esa tabla no existe»: la migración todavía no se corrió.
    // Eso no es un error del asesor y no tiene por qué verlo como tal.
    if (error.code === "PGRST205" || error.code === "42P01") {
      return { ...VACIO, faltaMigracion: true };
    }
    return { ...VACIO, ok: false, error: error.message };
  }

  return {
    ...VACIO,
    canales: (data ?? []).map((c) => ({
      canal: String((c.canales as { nombre?: string } | null)?.nombre ?? "—"),
      primeraVez: String(c.primera_vez),
      ultimaVez: String(c.ultima_vez),
      identificador: c.identificador == null ? null : String(c.identificador),
    })),
  };
}
