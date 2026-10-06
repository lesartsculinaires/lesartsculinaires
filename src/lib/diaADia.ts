import { parseISO } from "@/lib/format";
import { SIN_DATO, type Oportunidad } from "@/lib/types";

/**
 * El mes abierto día por día, y cada día abierto por canal y por programa.
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En vez de los días en una línea, un gráfico de cada día: cuántos leads
 * entraron por los canales y cuántos hay en cada diplomado o curso, para que de
 * esa manera se pueda medir cada día y al final del mes se vea completo.»
 *
 * Antes el día era una barra de un solo color: decía CUÁNTOS entraron y nada
 * más. Un día de ocho leads y otro de ocho se veían idénticos aunque uno fuera
 * entero de WhatsApp y el otro de una feria —que para decidir dónde poner la
 * plata del mes siguiente es toda la diferencia—.
 *
 * ============================================================================
 * EL ORDEN DE LAS SERIES SALE DE TODO EL HISTÓRICO, NO DEL MES
 * ============================================================================
 *
 * Y es la decisión que más importa de este archivo.
 *
 * El orden es el que después fija el color de cada canal. Si se calculara con
 * los leads del mes elegido, WhatsApp sería el primero en octubre y el segundo
 * en noviembre, y al cambiar de mes TODOS los colores se correrían. La pantalla
 * se leería como si hubiera cambiado la composición cuando lo único que cambió
 * fue el ranking.
 *
 * Calculándolo sobre la lista completa, un canal se queda con su color mientras
 * exista. Cambiar de mes mueve las alturas, nunca los colores.
 */

/** Un canal —o un programa— dentro de un día. */
export interface Segmento {
  etiqueta: string;
  leads: number;
}

export interface DiaDesglose {
  /** 1 a 31. */
  dia: number;
  /** ISO, para los rótulos y para las marcas de prueba. */
  fecha: string;
  /** Cuántos entraron ese día, en total. */
  leads: number;
  /** Por canal, SIEMPRE en el orden de `seriesCanales` y sin huecos. */
  canales: Segmento[];
  /** Por programa, en el orden de `seriesProgramas`. */
  programas: Segmento[];
}

export interface MesDiaADia {
  dias: DiaDesglose[];
  /** El orden fijo de los canales; de acá sale el color de cada uno. */
  seriesCanales: string[];
  seriesProgramas: string[];
  /** El día más alto del mes, para escalar las barras. */
  tope: number;
  /** El mes completo, que es la otra mitad de lo que pidió la escuela. */
  totalLeads: number;
  totalCanales: Segmento[];
  totalProgramas: Segmento[];
}

/**
 * Cuántas series se dibujan antes de juntar el resto en «Otros».
 *
 * Seis y no más porque son las que la paleta tiene validadas para barras
 * apiladas: pasada esa cuenta, dos colores contiguos dejan de distinguirse para
 * quien no ve bien el color, y un gráfico que no se puede leer no es un gráfico
 * más completo sino uno roto. Lo que cae en «Otros» sigue sumando y se dice.
 */
export const TOPE_DE_SERIES = 6;

/** Cómo se llama lo que no tiene nombre. Se cuenta, no se esconde. */
export const SIN_CANAL = "Sin canal";
export const SIN_PROGRAMA = "Sin programa";
export const OTROS = "Otros";

/**
 * El nombre de la categoría, o el cajón de los que no tienen.
 *
 * `SIN_DATO` es el guion largo con el que la aplicación entera dibuja un campo
 * vacío, así que un lead sin programa llega acá como «—». Si no se tratara como
 * vacío, la leyenda mostraría una serie llamada «—» —se vio en pantalla antes de
 * arreglarlo— que parece un programa del catálogo y no lo es.
 */
const nombreDe = (valor: string | null | undefined, vacio: string): string => {
  const limpio = (valor ?? "").trim();
  return limpio === "" || limpio === SIN_DATO ? vacio : limpio;
};

/**
 * El orden fijo de una dimensión, mirando TODO el histórico.
 *
 * De mayor a menor, y con «Otros» y el «Sin …» siempre al final: son los dos
 * cajones de sastre, y verlos arriba del todo haría parecer que son una
 * categoría más.
 */
function ordenDeSeries(
  todas: readonly Oportunidad[],
  campo: "canal" | "producto",
  vacio: string,
): string[] {
  const cuenta = new Map<string, number>();
  for (const o of todas) {
    const k = nombreDe(o[campo], vacio);
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }

  const alFinal = (k: string) => (k === vacio ? 1 : 0);
  const ordenadas = [...cuenta.entries()]
    .sort((a, b) => alFinal(a[0]) - alFinal(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);

  if (ordenadas.length <= TOPE_DE_SERIES) return ordenadas;
  return [...ordenadas.slice(0, TOPE_DE_SERIES), OTROS];
}

/** A qué serie va a parar esta fila, ya con el tope aplicado. */
const serieDe = (nombre: string, series: readonly string[]): string =>
  series.includes(nombre) ? nombre : OTROS;

const sumarEn = (acc: Map<string, number>, clave: string) =>
  acc.set(clave, (acc.get(clave) ?? 0) + 1);

/** Un mapa de cuentas → segmentos en el orden de las series, sin huecos. */
const enOrden = (cuenta: Map<string, number>, series: readonly string[]): Segmento[] =>
  series.map((etiqueta) => ({ etiqueta, leads: cuenta.get(etiqueta) ?? 0 }));

/**
 * El desglose del mes `mesClave` ("2026-10").
 *
 * `todas` es la lista completa y `mesClave` el mes que se está mirando: las dos
 * hacen falta, porque el orden de los colores se calcula sobre la primera y las
 * alturas sobre el recorte de la segunda.
 *
 * Devuelve SIEMPRE los días del mes completo, incluso los que no tuvieron
 * ningún lead. Un domingo en cero es información —y saltárselo correría el
 * calendario, que es lo que hace que un gráfico por día no se pueda leer—.
 */
export function diaADia(todas: readonly Oportunidad[], mesClave: string): MesDiaADia {
  const seriesCanales = ordenDeSeries(todas, "canal", SIN_CANAL);
  const seriesProgramas = ordenDeSeries(todas, "producto", SIN_PROGRAMA);

  const [anio, mes] = mesClave.split("-").map(Number);
  const vacio: MesDiaADia = {
    dias: [],
    seriesCanales,
    seriesProgramas,
    tope: 1,
    totalLeads: 0,
    totalCanales: [],
    totalProgramas: [],
  };
  if (!anio || !mes || mes < 1 || mes > 12) return vacio;

  const cuantos = new Date(anio, mes, 0).getDate();
  const dd = (n: number) => String(n).padStart(2, "0");

  const porDia = new Map<number, { canales: Map<string, number>; programas: Map<string, number> }>();
  for (let d = 1; d <= cuantos; d += 1) {
    porDia.set(d, { canales: new Map(), programas: new Map() });
  }

  const totalCanales = new Map<string, number>();
  const totalProgramas = new Map<string, number>();
  let totalLeads = 0;

  for (const o of todas) {
    if (!o.fechaRegistro || o.fechaRegistro.slice(0, 7) !== mesClave) continue;
    const fecha = parseISO(o.fechaRegistro);
    if (!fecha) continue;
    const casilla = porDia.get(fecha.getDate());
    if (!casilla) continue;

    const canal = serieDe(nombreDe(o.canal, SIN_CANAL), seriesCanales);
    const programa = serieDe(nombreDe(o.producto, SIN_PROGRAMA), seriesProgramas);

    sumarEn(casilla.canales, canal);
    sumarEn(casilla.programas, programa);
    sumarEn(totalCanales, canal);
    sumarEn(totalProgramas, programa);
    totalLeads += 1;
  }

  const dias: DiaDesglose[] = [];
  for (let d = 1; d <= cuantos; d += 1) {
    const casilla = porDia.get(d)!;
    const leads = [...casilla.canales.values()].reduce((a, b) => a + b, 0);
    dias.push({
      dia: d,
      fecha: `${anio}-${dd(mes)}-${dd(d)}`,
      leads,
      canales: enOrden(casilla.canales, seriesCanales),
      programas: enOrden(casilla.programas, seriesProgramas),
    });
  }

  return {
    dias,
    seriesCanales,
    seriesProgramas,
    /*
     * El tope nunca baja de 1: con un mes entero en cero, dividir por el máximo
     * daría NaN y las barras desaparecerían en vez de quedar en el piso.
     */
    tope: Math.max(1, ...dias.map((x) => x.leads)),
    totalLeads,
    totalCanales: enOrden(totalCanales, seriesCanales),
    totalProgramas: enOrden(totalProgramas, seriesProgramas),
  };
}
