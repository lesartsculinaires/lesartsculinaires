/**
 * Paleta de la marca.
 *
 * Azul #031B4F como color principal, blanco como fondo dominante, y amarillo
 * #FFCE00 reservado para una sola cosa: señalar lo que el mouse está tocando
 * o lo que el usuario puede accionar. Si el amarillo apareciera también como
 * relleno decorativo dejaría de significar «acá se puede hacer clic».
 *
 * Los grises son azules desaturados, no neutros: sobre un fondo blanco con
 * texto azul marino, un gris neutro se ve sucio al lado.
 */
export const T = {
  /** Texto principal y títulos. */
  ink: "#031B4F",
  /** Fondo de la aplicación. */
  fondo: "#FFFFFF",
  /** Tarjetas y superficies elevadas. */
  surface: "#FFFFFF",
  /** Relleno sutil: encabezados de tabla, campos, celdas de indicadores. */
  paper: "#F4F6FB",
  border: "#DCE2EF",
  borderStrong: "#B4BFD8",
  /** Texto secundario. */
  muted: "#4C5A7A",
  /** Texto terciario y marcas de agua. */
  faint: "#8792AC",
  warn: "#B07D00",
} as const;

/** Azul de la marca. El diseño lo pasa como prop; es el único tono que varía. */
export const ACCENT = "#031B4F";

/** Amarillo de acción: hover, foco y selección. */
export const RESALTE = "#FFCE00";
/** Texto sobre el amarillo. Es el único par de contraste aprobado. */
export const SOBRE_RESALTE = "#031B4F";

/**
 * Tintes del azul. El diseño agrega sufijos de alfa de 8 bits al hex, así
 * que se mantienen en sintonía solos cuando cambia el acento.
 */
export const soft = (accent: string) => `${accent}1A`;
/** Relleno de menús y fichas — algo más claro que `soft`. */
export const softer = (accent: string) => `${accent}14`;
/** Segmentos «en pipeline», detrás del segmento sólido de lo ganado. */
export const openTone = (accent: string) => `${accent}3D`;
