/**
 * Las marcas del CRM: Les Arts Culinaires y Haute Couture (12/11/2026).
 *
 * ============================================================================
 * UN SOLO CÓDIGO, TRES SITIOS
 * ============================================================================
 *
 * El mismo código sirve a los tres:
 *
 *   crm-les-arts           Sólo LAC. Sin variables nuevas: es como siempre.
 *   crm-haute-couture      Sólo HC. NEXT_PUBLIC_MARCA=hc.
 *   crm-peñagroup          Las dos. NEXT_PUBLIC_CRM_UNIFICADO=1, y cada
 *                          persona elige la marca con el selector; la elegida
 *                          viaja en la galleta `crm.marca`.
 *
 * Cada marca sigue con SU base de datos: lo único que cambia al cambiar de
 * marca es a qué Supabase (y a qué cuentas de Meta) le habla la pantalla.
 * Nunca se copia ni se mezcla nada entre las dos.
 *
 * Este archivo lo leen el servidor y el navegador, así que no tiene secretos:
 * las llaves de cada marca se leen con `env()` de `@/lib/marca/servidor`.
 */

export type ClaveMarca = "lac" | "hc";

export interface Paleta {
  /** Texto principal y títulos. */
  ink: string;
  fondo: string;
  surface: string;
  paper: string;
  border: string;
  borderStrong: string;
  muted: string;
  faint: string;
  warn: string;
  /** Fondo de lo apagado: una cuenta o un rol inactivo. */
  apagado: string;
  /** Fondo de los avisos suaves (versión nueva del CRM). */
  aviso: string;
  /** El color de la marca (botones, selección). */
  acento: string;
  /** El de acción: hover, foco y selección. */
  resalte: string;
  /** El texto sobre `resalte`. */
  sobreResalte: string;
}

export interface Marca {
  clave: ClaveMarca;
  /** Como se nombra en la pantalla. */
  nombre: string;
  /** En los rótulos chicos en mayúsculas. */
  rotulo: string;
  /** El instituto: la línea que va debajo del nombre. */
  instituto: string;
  /** Cómo se presenta en la pestaña del navegador y en los buscadores. */
  descripcion: string;
  /** El logo completo, servido desde `public/`. */
  logo: string;
  /** Ancho / alto del logo, para reservarle el lugar. */
  logoProporcion: number;
  /** El símbolo solo, para el selector y los lugares chicos. */
  simbolo: string;
  /** A dónde escribir por los datos personales (página de eliminación). */
  correoDatos: string;
  /**
   * Con qué empiezan sus variables en el CRM unificado: `LAC_WHATSAPP_TOKEN`,
   * `HC_SUPABASE_SERVICE_ROLE_KEY`… En los sitios de una sola marca las
   * variables van sin prefijo, como siempre.
   */
  prefijo: "LAC" | "HC";
  paleta: Paleta;
  /** Un nombre de programa de ejemplo, para los campos vacíos. */
  ejemploPrograma: string;
  /**
   * Si mandar una plantilla sube el chat arriba de todo en la bandeja. En HC
   * no (pedido del 12/11/2026: que quede en su lugar); en LAC, como siempre.
   */
  plantillaSubeElChat: boolean;
}

export const MARCAS: Record<ClaveMarca, Marca> = {
  lac: {
    clave: "lac",
    nombre: "Les Arts Culinaires",
    rotulo: "LES ARTS CULINAIRES",
    instituto: "Instituto Superior",
    descripcion:
      "CRM de ventas de Les Arts Culinaires: leads, seguimiento, pipeline y cierre de matrículas.",
    logo: "/marca/les-arts-culinaires.webp",
    logoProporcion: 7.19,
    simbolo: "/marca/les-arts-culinaires-simbolo.png",
    correoDatos: "sistemas@lesarts.com",
    prefijo: "LAC",
    paleta: {
      ink: "#031B4F",
      fondo: "#FFFFFF",
      surface: "#FFFFFF",
      paper: "#F4F6FB",
      border: "#DCE2EF",
      borderStrong: "#B4BFD8",
      muted: "#4C5A7A",
      faint: "#8792AC",
      warn: "#B07D00",
      apagado: "#E4E9F3",
      aviso: "#E8EEF9",
      acento: "#031B4F",
      resalte: "#FFCE00",
      sobreResalte: "#031B4F",
    },
    ejemploPrograma: "Diplomado de Cocina",
    plantillaSubeElChat: true,
  },
  hc: {
    clave: "hc",
    nombre: "Haute Couture",
    rotulo: "HAUTE COUTURE",
    instituto: "Instituto Internacional de Diseño de Modas",
    descripcion:
      "CRM de ventas de Haute Couture: leads, seguimiento, pipeline y cierre de matrículas.",
    logo: "/marca/haute-couture.png",
    logoProporcion: 3.23,
    simbolo: "/marca/haute-couture-simbolo.png",
    correoDatos: "info@hautecouture.art",
    prefijo: "HC",
    paleta: {
      ink: "#000000",
      fondo: "#FFFFFF",
      surface: "#FFFFFF",
      paper: "#F6F4F0",
      border: "#E2DED6",
      borderStrong: "#BDB6A8",
      muted: "#57534B",
      faint: "#8A847A",
      warn: "#B07D00",
      apagado: "#EBE7DF",
      aviso: "#F6F4F0",
      acento: "#000000",
      resalte: "#CE9847",
      sobreResalte: "#000000",
    },
    ejemploPrograma: "Diplomado Internacional de Fashion Design",
    plantillaSubeElChat: false,
  },
};

export const CLAVES_DE_MARCA: readonly ClaveMarca[] = ["lac", "hc"];

/** La galleta con la marca elegida en el CRM unificado. */
export const GALLETA_MARCA = "crm.marca";

export const esClaveDeMarca = (x: unknown): x is ClaveMarca =>
  typeof x === "string" && (CLAVES_DE_MARCA as readonly string[]).includes(x);

/** ¿Es el CRM unificado (crm-peñagroup)? Se decide al compilar. */
export const MODO_UNIFICADO = process.env.NEXT_PUBLIC_CRM_UNIFICADO === "1";

/**
 * La marca de un sitio de una sola marca. En el unificado es la que se usa
 * cuando todavía no se eligió ninguna.
 */
export const MARCA_FIJA: ClaveMarca = esClaveDeMarca(process.env.NEXT_PUBLIC_MARCA)
  ? process.env.NEXT_PUBLIC_MARCA
  : "lac";

/** De lo que dice la galleta a la marca que se usa. */
export function marcaDeLaGalleta(valor: string | undefined | null): ClaveMarca {
  if (!MODO_UNIFICADO) return MARCA_FIJA;
  return esClaveDeMarca(valor) ? valor : MARCA_FIJA;
}

/**
 * Las variables de color de una marca, para el `style` de `<html>`. `T` y
 * `ACCENT` (`@/lib/theme`) apuntan a estas variables, así que cambiar de marca
 * repinta todo sin tocar ningún componente.
 */
export function variablesDeColor(clave: ClaveMarca): Record<string, string> {
  const p = MARCAS[clave].paleta;
  return {
    "--crm-ink": p.ink,
    "--crm-fondo": p.fondo,
    "--crm-surface": p.surface,
    "--crm-paper": p.paper,
    "--crm-border": p.border,
    "--crm-border-strong": p.borderStrong,
    "--crm-muted": p.muted,
    "--crm-faint": p.faint,
    "--crm-warn": p.warn,
    "--crm-apagado": p.apagado,
    "--crm-aviso": p.aviso,
    "--crm-acento": p.acento,
    "--crm-resalte": p.resalte,
    "--crm-sobre-resalte": p.sobreResalte,
  };
}
