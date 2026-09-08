import "server-only";

import { getServerClient } from "@/lib/supabase/server";
import type { Valor } from "@/lib/envios";
import { NADA_MAS, quePide, type QuePide } from "@/lib/whatsapp/piezas";

/** El `select` se arma como texto, así que las filas llegan sin tipar. */
type Fila = Record<string, unknown>;

/** Un envío masivo con su resultado ya contado. */
export interface Envio {
  id: number;
  nombre: string;
  plantillaNombre: string | null;
  cuerpo: string | null;
  valores: Valor[];
  estado: string;
  creadoEn: string;
  empezadoEn: string | null;
  terminadoEn: string | null;
  /** Cuántos destinatarios tiene en total. */
  total: number;
  pendientes: number;
  enviados: number;
  entregados: number;
  leidos: number;
  respondieron: number;
  fallidos: number;
  omitidos: number;
  /**
   * Por qué no llegaron los que no llegaron, con las palabras de Meta.
   *
   * ==========================================================================
   * POR QUÉ ESTO NO ESTABA Y HACÍA FALTA
   * ==========================================================================
   *
   * El motivo se guardaba desde el principio en `envio_destinatarios.motivo`
   * —lo escribe `mandarTanda` con lo que contestó Meta— pero ninguna pantalla
   * lo leía. En su lugar la pantalla decía «el número no tiene WhatsApp o Meta
   * los rechazó», una frase escrita a mano que sonaba a diagnóstico sin serlo.
   *
   * La escuela mandó cinco mensajes, fallaron los cinco, y esa frase la mandó a
   * revisar los teléfonos. Los teléfonos estaban bien: el CRM ya sabía qué
   * había pasado y no lo mostraba.
   *
   * Va agrupado y no fila por fila porque en un envío de trescientos el motivo
   * se repite: lo que hay que ver es «280 por lo mismo», que dice que el
   * problema es de la cuenta, o «3 por acá y 2 por allá», que dice que son esos
   * números.
   */
  motivos: { motivo: string; cuantos: number }[];
  /** Quiénes contestaron. Es con quién hubo conversación de verdad. */
  contestaron: { nombre: string | null; telefono: string }[];
  /**
   * Qué piezas tenía la plantilla con que salió este envío.
   *
   * Hace falta para leer bien `valores`, que es una lista plana en el orden
   * encabezado → cuerpo → botones. Sin esto, la vista previa del historial
   * mostraría el dato del encabezado dentro del texto, corrido un lugar.
   *
   * Sale de la plantilla que se usó. Si esa plantilla ya no existe en Meta
   * —se borró, se rehizo— queda vacío, y entonces los valores se leen todos
   * como del cuerpo: es lo que valía para todos los envíos anteriores a que
   * existieran las piezas, así que el historial viejo se sigue viendo igual.
   */
  pide: QuePide;
}

export interface ResultadoEnvios {
  envios: Envio[];
  /** La tabla todavía no existe: falta correr la migración. */
  faltaMigracion: boolean;
  error: string | null;
}

const VACIO: ResultadoEnvios = { envios: [], faltaMigracion: false, error: null };

/**
 * Los envíos, con sus números.
 *
 * ============================================================================
 * LOS ESTADOS SE ACUMULAN HACIA ATRÁS
 * ============================================================================
 *
 * Un destinatario tiene UN estado, el más avanzado al que llegó: quien
 * contestó está en «respondio» y ya no en «entregado». Contar las filas de
 * cada estado y mostrarlas así diría que de trescientos entregados hay dos,
 * porque los otros doscientos noventa y ocho avanzaron.
 *
 * Por eso cada número incluye a los que pasaron de largo: «entregados» son los
 * que llegaron al teléfono, hayan sido leídos o contestados después. Es lo que
 * quiere decir la palabra, y es la única forma de que el embudo baje en vez de
 * dar saltos.
 */
export async function fetchEnvios(): Promise<ResultadoEnvios> {
  const supabase = await getServerClient();
  if (!supabase) return VACIO;

  const { data: filas, error } = await supabase
    .from("envios")
    .select(
      "id, nombre, plantilla_id, plantilla_nombre, cuerpo, valores, estado, creado_en, empezado_en, terminado_en",
    )
    .order("creado_en", { ascending: false })
    .limit(100);

  if (error) {
    if (error.code === "PGRST205") return { ...VACIO, faltaMigracion: true };
    return { ...VACIO, error: error.message };
  }

  const ids = ((filas ?? []) as unknown as Fila[]).map((e) => Number(e.id));
  if (ids.length === 0) return VACIO;

  /*
   * Las plantillas con que salieron, para poder leer sus valores.
   *
   * Una sola consulta para todas, no una por envío: la lista trae hasta cien y
   * casi siempre repiten plantilla.
   */
  const piezas = new Map<string, QuePide>();
  {
    const usadas = [
      ...new Set(
        ((filas ?? []) as unknown as Fila[])
          .map((e) => (e.plantilla_id == null ? null : String(e.plantilla_id)))
          .filter((v): v is string => v != null),
      ),
    ];
    if (usadas.length > 0) {
      const { data } = await supabase
        .from("plantillas")
        .select("id, cuerpo, payload")
        .in("id", usadas);
      for (const p of (data ?? []) as unknown as Fila[]) {
        piezas.set(String(p.id), quePide(p.payload, p.cuerpo ? String(p.cuerpo) : null));
      }
    }
  }

  const { data: dest, error: errDest } = await supabase
    .from("envio_destinatarios")
    .select("envio_id, estado, motivo, nombre, telefono")
    .in("envio_id", ids)
    .limit(50000);

  if (errDest) return { ...VACIO, error: errDest.message };

  const cuenta = new Map<number, Record<string, number>>();
  const porque = new Map<number, Map<string, number>>();
  const quienes = new Map<number, { nombre: string | null; telefono: string }[]>();

  for (const d of (dest ?? []) as unknown as Fila[]) {
    const id = Number(d.envio_id);
    const suyos = cuenta.get(id) ?? {};
    const estado = String(d.estado);
    suyos[estado] = (suyos[estado] ?? 0) + 1;
    cuenta.set(id, suyos);

    if (estado === "fallido") {
      const motivo = d.motivo == null ? "" : String(d.motivo).trim();
      const m = porque.get(id) ?? new Map<string, number>();
      /*
       * Sin motivo guardado se dice eso y no se inventa uno.
       *
       * Pasa con los envíos anteriores a que esto se guardara. «Meta no dijo
       * por qué» es información —quiere decir «este dato no lo tenemos»— y una
       * causa inventada haría perder el tiempo buscando donde no hay nada.
       */
      const clave = motivo || "Meta no dijo por qué. Es un envío anterior a que el CRM lo guardara.";
      m.set(clave, (m.get(clave) ?? 0) + 1);
      porque.set(id, m);
    }

    if (estado === "respondio") {
      const lista = quienes.get(id) ?? [];
      lista.push({
        nombre: d.nombre == null ? null : String(d.nombre),
        telefono: String(d.telefono ?? ""),
      });
      quienes.set(id, lista);
    }
  }

  return {
    envios: ((filas ?? []) as unknown as Fila[]).map((e) => {
      const c = cuenta.get(Number(e.id)) ?? {};
      const n = (k: string) => c[k] ?? 0;

      // Cada uno incluye a los que avanzaron más: ver la explicación de arriba.
      const respondieron = n("respondio");
      const leidos = n("leido") + respondieron;
      const entregados = n("entregado") + leidos;
      const enviados = n("enviado") + entregados;

      return {
        id: Number(e.id),
        nombre: String(e.nombre),
        plantillaNombre: e.plantilla_nombre ? String(e.plantilla_nombre) : null,
        cuerpo: e.cuerpo ? String(e.cuerpo) : null,
        valores: Array.isArray(e.valores) ? (e.valores as Valor[]) : [],
        estado: String(e.estado),
        creadoEn: String(e.creado_en),
        empezadoEn: e.empezado_en ? String(e.empezado_en) : null,
        terminadoEn: e.terminado_en ? String(e.terminado_en) : null,
        total: Object.values(c).reduce((a, b) => a + b, 0),
        pendientes: n("pendiente"),
        enviados,
        entregados,
        leidos,
        respondieron,
        fallidos: n("fallido"),
        omitidos: n("omitido"),
        // De mayor a menor: el motivo que explica la campaña va primero.
        motivos: [...(porque.get(Number(e.id)) ?? new Map())]
          .map(([motivo, cuantos]) => ({ motivo, cuantos }))
          .sort((a, b) => b.cuantos - a.cuantos),
        contestaron: quienes.get(Number(e.id)) ?? [],
        pide:
          (e.plantilla_id != null ? piezas.get(String(e.plantilla_id)) : undefined) ?? NADA_MAS,
      };
    }),
    faltaMigracion: false,
    error: null,
  };
}
