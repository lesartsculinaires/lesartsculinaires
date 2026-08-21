import type { Campo, Formulario, Mapeo, Opcion, TipoCampo } from "@/lib/formularios";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Los formularios con sus preguntas, en una sola ida.
 *
 * Se traen enteros aunque la pantalla muestre uno por vez: son pocas filas
 * —una feria tiene siete u ocho preguntas— y así el asesor puede abrir uno,
 * llenarlo, y abrir el siguiente sin esperar nada en el medio, que es lo que
 * pasa parado en un stand.
 */
export interface ResultadoFormularios {
  data: Formulario[];
  /** Las tablas no existen todavía. */
  faltaMigracion: boolean;
  error: string | null;
}

interface FilaCampo {
  id: number | string;
  formulario_id: number | string;
  orden: number | string;
  etiqueta: string;
  ayuda: string | null;
  tipo: string;
  requerido: boolean;
  opciones: unknown;
  mapea_a: string | null;
}

/**
 * Las opciones, saneadas.
 *
 * Vienen de una columna jsonb, así que su forma la garantiza quien las
 * escribió y no el tipo. Una opción sin texto no se puede ni dibujar ni
 * elegir; se descarta acá y no en la pantalla, que si no tendría que
 * defenderse en cada lugar donde las use.
 */
function leerOpciones(crudas: unknown): Opcion[] {
  if (!Array.isArray(crudas)) return [];
  return crudas.flatMap((o): Opcion[] => {
    if (o == null || typeof o !== "object") return [];
    const texto = (o as { texto?: unknown }).texto;
    if (typeof texto !== "string" || texto.trim() === "") return [];
    const valor = (o as { valor?: unknown }).valor;
    return [{ texto, valor: typeof valor === "number" ? valor : null }];
  });
}

export async function fetchFormularios(): Promise<ResultadoFormularios> {
  const vacio: ResultadoFormularios = { data: [], faltaMigracion: false, error: null };

  const supabase = await getServerClient();
  if (!supabase) return vacio;

  const [forms, campos, conteos] = await Promise.all([
    supabase
      .from("formularios")
      .select("id, nombre, descripcion, activo, canal_id, etapa_id, estado_id, territorio_id, creado_en")
      .order("creado_en", { ascending: false }),
    supabase
      .from("formulario_campos")
      .select("id, formulario_id, orden, etiqueta, ayuda, tipo, requerido, opciones, mapea_a")
      .order("orden"),
    supabase.from("formulario_respuestas").select("formulario_id"),
  ]);

  if (forms.error) {
    // PGRST205 es «la tabla no está en el esquema», no una falla de verdad.
    if (forms.error.code === "PGRST205") return { ...vacio, faltaMigracion: true };
    return { ...vacio, error: forms.error.message };
  }

  const porFormulario = new Map<number, Campo[]>();
  for (const c of (campos.data ?? []) as unknown as FilaCampo[]) {
    const lista = porFormulario.get(Number(c.formulario_id)) ?? [];
    lista.push({
      id: Number(c.id),
      orden: Number(c.orden),
      etiqueta: String(c.etiqueta),
      ayuda: c.ayuda ? String(c.ayuda) : null,
      tipo: String(c.tipo) as TipoCampo,
      requerido: c.requerido === true,
      opciones: leerOpciones(c.opciones),
      mapeaA: (c.mapea_a as Mapeo | null) ?? null,
    });
    porFormulario.set(Number(c.formulario_id), lista);
  }

  // Las respuestas llegan filtradas por la política de la tabla: un asesor
  // cuenta las suyas y la dirección las de todos. El número dice entonces
  // «cuántos leads entraron por acá que yo pueda ver», que es lo honesto.
  const cuenta = new Map<number, number>();
  for (const r of conteos.data ?? []) {
    const k = Number((r as { formulario_id: number }).formulario_id);
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }

  return {
    faltaMigracion: false,
    error: null,
    data: (forms.data ?? []).map((f): Formulario => {
      const id = Number(f.id);
      return {
        id,
        nombre: String(f.nombre),
        descripcion: f.descripcion ? String(f.descripcion) : null,
        activo: f.activo === true,
        canalId: f.canal_id == null ? null : Number(f.canal_id),
        etapaId: f.etapa_id == null ? null : Number(f.etapa_id),
        estadoId: f.estado_id == null ? null : Number(f.estado_id),
        territorioId: f.territorio_id == null ? null : Number(f.territorio_id),
        campos: porFormulario.get(id) ?? [],
        respuestas: cuenta.get(id) ?? 0,
      };
    }),
  };
}
