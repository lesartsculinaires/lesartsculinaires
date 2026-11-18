/**
 * Paleta de la marca (12/11/2026: por variables, para el CRM unificado).
 *
 * Cada valor es una variable CSS (`var(--crm-…)`) y no un color fijo: el
 * `<html>` trae los colores de la marca en uso (`variablesDeColor`, en
 * `@/lib/marcas`), así que en el CRM unificado cambiar de marca repinta todo
 * sin tocar ningún componente. Los sitios de una sola marca se ven igual que
 * antes: sus variables son los mismos colores que estaban escritos acá.
 *
 *   Les Arts Culinaires  azul #031B4F, amarillo #FFCE00 para la acción
 *   Haute Couture        negro #000000, dorado #CE9847 para la acción
 *
 * El color de acción (`RESALTE`) es para una sola cosa: señalar lo que el
 * mouse está tocando o lo que el usuario puede accionar.
 *
 * Por ser variables, NO se les puede pegar una transparencia al final
 * (`${ACCENT}14`): para los tintes están `soft`, `softer`, `openTone` y
 * `tinte`, que usan `color-mix`.
 */
export const T = {
  /** Texto principal y títulos. */
  ink: "var(--crm-ink)",
  /** Fondo de la aplicación. */
  fondo: "var(--crm-fondo)",
  /** Tarjetas y superficies elevadas. */
  surface: "var(--crm-surface)",
  /** Relleno sutil: encabezados de tabla, campos, celdas de indicadores. */
  paper: "var(--crm-paper)",
  border: "var(--crm-border)",
  borderStrong: "var(--crm-border-strong)",
  /** Texto secundario. */
  muted: "var(--crm-muted)",
  /** Texto terciario y marcas de agua. */
  faint: "var(--crm-faint)",
  warn: "var(--crm-warn)",
  /** Fondo de lo apagado: una cuenta o un rol inactivo, una pastilla sin datos. */
  apagado: "var(--crm-apagado)",
} as const;

/** El color de la marca. El diseño lo pasa como prop. */
export const ACCENT = "var(--crm-acento)";

/** El color de acción: hover, foco y selección. */
export const RESALTE = "var(--crm-resalte)";
/** Texto sobre el color de acción. */
export const SOBRE_RESALTE = "var(--crm-sobre-resalte)";

/** Un color con transparencia: `tinte(ACCENT, 10)` = el acento al 10 %. */
export const tinte = (color: string, porciento: number) =>
  `color-mix(in srgb, ${color} ${porciento}%, transparent)`;

/** Tintes del acento (antes, sufijos de alfa 1A, 14 y 3D sobre el hex). */
export const soft = (accent: string) => tinte(accent, 10);
/** Relleno de menús y fichas — algo más claro que `soft`. */
export const softer = (accent: string) => tinte(accent, 8);
/** Segmentos «en pipeline», detrás del segmento sólido de lo ganado. */
export const openTone = (accent: string) => tinte(accent, 24);
