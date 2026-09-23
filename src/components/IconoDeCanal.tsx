import type { CSSProperties } from "react";

/**
 * El logotipo de cada red, dibujado.
 *
 * ============================================================================
 * POR QUÉ DEJAN DE SER EMOJIS
 * ============================================================================
 *
 * Hasta acá cada canal se representaba con un emoji —🟢, 📸, 💬, 🎵— y eso tenía
 * dos problemas que en una bandeja se pagan todos los días:
 *
 *   NO SE RECONOCEN         Un círculo verde no es WhatsApp y una cámara no es
 *                           Instagram. Quien atiende tiene que leer el nombre
 *                           para saber por dónde entró el mensaje, que es
 *                           exactamente lo que un icono viene a ahorrar.
 *
 *   NO SE VEN IGUAL         Un emoji lo dibuja el sistema operativo, así que la
 *                           misma pantalla se ve distinta en la Mac de
 *                           dirección y en la PC de recepción, y a veces sale
 *                           un cuadrito vacío.
 *
 * Dibujados como SVG se ven idénticos en todas las máquinas, escalan sin
 * pixelarse y no dependen de ninguna fuente.
 *
 * ============================================================================
 * POR QUÉ NO SE BAJAN DE NINGÚN LADO
 * ============================================================================
 *
 * Van escritos acá, en el código, y no como archivos ni desde un paquete de
 * iconos. Son cuatro formas que no van a cambiar: un paquete entero para eso
 * agregaría peso a cada carga de la bandeja, y un archivo suelto es una
 * petición más que puede fallar y dejar la lista sin marcas.
 *
 * ============================================================================
 * LOS COLORES SON LOS DE CADA MARCA
 * ============================================================================
 *
 * Y se usan sólo donde ayudan a reconocer: en el encabezado de cada sección. En
 * la lista de hilos van en un solo tono —ver `mono`— porque cuarenta filas con
 * cuatro colores distintos compiten con lo único que importa ahí, que es el
 * nombre de quien escribió y si tiene mensajes sin leer.
 */

/** El tono de cada marca, para cuando el icono va en color. */
export const COLOR_DE_MARCA: Record<string, string> = {
  whatsapp: "#25D366",
  instagram: "#E4405F",
  messenger: "#0084FF",
  tiktok: "#010101",
};

export function IconoDeCanal({
  canal,
  tamano = 16,
  /**
   * Un solo tono en vez del color de la marca.
   *
   * Para la lista de hilos, donde la marca tiene que distinguir sin gritar.
   * Cuando es `true` el icono toma el color del texto que lo rodea.
   */
  mono = false,
  style,
}: {
  canal: string;
  tamano?: number;
  mono?: boolean;
  style?: CSSProperties;
}) {
  const color = mono ? "currentColor" : (COLOR_DE_MARCA[canal] ?? "currentColor");

  const comun = {
    width: tamano,
    height: tamano,
    viewBox: "0 0 24 24",
    fill: color,
    // Decorativo: al lado siempre va el nombre del canal escrito, así que
    // repetirlo para el lector de pantalla sería decirlo dos veces.
    "aria-hidden": true as const,
    focusable: "false" as const,
    style: { flexShrink: 0, display: "block", ...style },
  };

  switch (canal) {
    case "whatsapp":
      return (
        <svg {...comun}>
          <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.38-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15c-1.53 0-3.02-.41-4.32-1.19l-.31-.18-3.21.84.86-3.13-.2-.32a8.18 8.18 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.17 8.17 0 0 1 2.41 5.82c0 4.54-3.69 8.33-8.23 8.33z" />
        </svg>
      );

    case "instagram":
      return (
        <svg {...comun}>
          <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9c-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38A5.9 5.9 0 0 0 .63 4.14c-.3.76-.5 1.64-.56 2.91C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13a5.9 5.9 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.9 5.9 0 0 0 2.13-1.38 5.9 5.9 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.9 5.9 0 0 0-1.38-2.13A5.9 5.9 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0z" />
          <path d="M12 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
          <circle cx="18.41" cy="5.59" r="1.44" />
        </svg>
      );

    case "messenger":
      return (
        <svg {...comun}>
          <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.19.16.15.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.54-.04 1 .28 2.06.42 3.15.42 5.64 0 10-4.13 10-9.7S17.64 2 12 2z" />
          <path
            d="M5.99 14.54l2.94-4.66a1.5 1.5 0 0 1 2.17-.4l2.34 1.75c.21.16.51.16.72 0l3.16-2.4c.42-.32.97.18.69.63l-2.94 4.66a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63z"
            fill="#fff"
          />
        </svg>
      );

    case "tiktok":
      return (
        <svg {...comun}>
          <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.06v-3.1a5.68 5.68 0 0 0-.77-.05A5.66 5.66 0 1 0 15.54 15.4V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.24-1.48z" />
        </svg>
      );

    default:
      return null;
  }
}
