"use server";

import { revalidatePath } from "next/cache";

import { getServerClient } from "@/lib/supabase/server";
import { revisar, type Adjunto } from "@/lib/adjuntos";

/**
 * Los adjuntos de una oportunidad.
 *
 * El archivo en sí no pasa por acá: lo sube el navegador directo al
 * almacenamiento de Supabase. Una Server Action acepta 1 MB de cuerpo por
 * omisión y las funciones de Netlify tienen su propio tope, así que mandar una
 * captura de 4 MB por este camino fallaría con un error que no explica nada.
 * Acá queda lo que sí corresponde al servidor: anotar la ficha, listar con
 * enlaces firmados, y borrar las dos cosas juntas.
 */

const BALDE = "adjuntos";

/** Cuánto vale un enlace firmado: una hora. */
const VIGENCIA_S = 3600;

export interface ResultadoAdjuntos {
  ok: boolean;
  error: string | null;
  adjuntos: Adjunto[];
  /** La migración todavía no se corrió. La pantalla lo dice en vez de fallar. */
  faltaMigracion: boolean;
}

const VACIO: ResultadoAdjuntos = {
  ok: true,
  error: null,
  adjuntos: [],
  faltaMigracion: false,
};

export async function listarAdjuntos(oportunidadId: number): Promise<ResultadoAdjuntos> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ...VACIO, ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };
  }

  const { data: sesion } = await supabase.auth.getUser();
  const yo = sesion.user?.id ?? null;

  const { data, error } = await supabase
    .from("adjuntos")
    .select("id, ruta, nombre, tipo_mime, tamano_bytes, subido_por, created_at")
    .eq("oportunidad_id", oportunidadId)
    .order("created_at", { ascending: false });

  if (error) {
    // PGRST205: la tabla no existe todavía en el esquema.
    if (error.code === "PGRST205") return { ...VACIO, faltaMigracion: true };
    return { ...VACIO, ok: false, error: error.message };
  }

  const filas = data ?? [];
  if (filas.length === 0) return VACIO;

  // Los enlaces se firman de a todos juntos: uno por archivo sería un viaje
  // por cada fila, y una ficha con ocho comprobantes tardaría en abrirse.
  const { data: firmados } = await supabase.storage
    .from(BALDE)
    .createSignedUrls(
      filas.map((f) => String(f.ruta)),
      VIGENCIA_S,
    );

  const porRuta = new Map<string, string>();
  for (const f of firmados ?? []) {
    if (f.path && f.signedUrl) porRuta.set(f.path, f.signedUrl);
  }

  return {
    ok: true,
    error: null,
    faltaMigracion: false,
    adjuntos: filas.map((f) => ({
      id: Number(f.id),
      nombre: String(f.nombre),
      tipoMime: f.tipo_mime ? String(f.tipo_mime) : null,
      tamanoBytes: f.tamano_bytes == null ? null : Number(f.tamano_bytes),
      creadoEn: String(f.created_at),
      url: porRuta.get(String(f.ruta)) ?? null,
      propio: yo != null && f.subido_por === yo,
    })),
  };
}

export interface DatosAdjunto {
  oportunidadId: number;
  /** Dónde quedó el archivo dentro del balde, lo que devolvió la subida. */
  ruta: string;
  nombre: string;
  tipoMime: string;
  tamanoBytes: number;
}

/**
 * Anotar un archivo que el navegador ya subió.
 *
 * Se vuelven a revisar tamaño y tipo. El navegador ya lo hizo, pero eso es una
 * cortesía para quien está usando la pantalla, no un control: quien llame esto
 * a mano puede decir lo que quiera. El balde tiene además su propio tope, así
 * que un archivo grande ni siquiera llega a subirse.
 */
export async function registrarAdjunto(
  d: DatosAdjunto,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  const malo = revisar({ name: d.nombre, size: d.tamanoBytes, type: d.tipoMime });
  if (malo) {
    // El archivo ya está arriba pero no se acepta la ficha, así que se lo
    // quita: dejarlo sería basura que nadie puede ver ni borrar desde la app.
    await supabase.storage.from(BALDE).remove([d.ruta]);
    return { ok: false, error: malo };
  }

  const { data: sesion } = await supabase.auth.getUser();
  const yo = sesion.user?.id ?? null;

  const { error } = await supabase.from("adjuntos").insert({
    oportunidad_id: d.oportunidadId,
    ruta: d.ruta,
    nombre: d.nombre.slice(0, 200),
    tipo_mime: d.tipoMime,
    tamano_bytes: d.tamanoBytes,
    subido_por: yo,
  });

  if (error) {
    await supabase.storage.from(BALDE).remove([d.ruta]);
    if (error.code === "PGRST205") {
      return { ok: false, error: "Falta correr la migración de adjuntos en Supabase." };
    }
    return { ok: false, error: error.message };
  }

  // Queda anotado en la bitácora: mirando el seguimiento se ve que ese día
  // llegó el comprobante, sin tener que abrir la lista de archivos.
  await supabase.from("oportunidad_notas").insert({
    oportunidad_id: d.oportunidadId,
    nota: `Adjuntó «${d.nombre}»`,
    origen: "adjunto",
  });

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Quitar un adjunto.
 *
 * Primero la fila y después el archivo. El orden importa por cómo fallan las
 * dos mitades: si se cae la segunda, queda un archivo que nadie ve —ocupa
 * lugar y ya está—, mientras que al revés quedaría una fila apuntando a un
 * archivo que no existe, y eso la pantalla lo muestra como un adjunto roto
 * que no se puede abrir ni volver a borrar.
 *
 * Quién puede hacerlo lo decide la base, no esto: la política deja sólo a
 * quien lo subió y a los administradores. Si no le toca, el borrado no
 * encuentra ninguna fila y se contesta que no se pudo.
 */
export async function borrarAdjunto(
  id: number,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  // Se borra devolviendo la fila: así se sabe en un solo viaje si existía, si
  // la política dejó, y con qué ruta y nombre seguir.
  const { data: borradas, error: errFila } = await supabase
    .from("adjuntos")
    .delete()
    .eq("id", id)
    .select("ruta, nombre, oportunidad_id");

  if (errFila) return { ok: false, error: errFila.message };
  if (!borradas || borradas.length === 0) {
    return {
      ok: false,
      error: "No se pudo quitar: sólo quien lo subió o un administrador puede hacerlo.",
    };
  }

  const fila = borradas[0];

  const { error: errArchivo } = await supabase.storage
    .from(BALDE)
    .remove([String(fila.ruta)]);

  // La ficha ya se fue, que es lo que se ve en pantalla. Si el archivo quedó,
  // no se le dice a nadie que falló algo que para su trabajo ya terminó.
  if (errArchivo) {
    console.error("[adjuntos] la fila se borró pero el archivo quedó:", fila.ruta, errArchivo.message);
  }

  await supabase.from("oportunidad_notas").insert({
    oportunidad_id: Number(fila.oportunidad_id),
    nota: `Quitó el adjunto «${String(fila.nombre)}»`,
    origen: "adjunto",
  });

  revalidatePath("/");
  return { ok: true, error: null };
}
