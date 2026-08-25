import { COMO_SE_DICE, CUANTOS_TILDES, type Acuse } from "@/lib/acuses";

interface Props {
  acuse: Acuse;
  /**
   * El color del texto de la burbuja.
   *
   * Llega de afuera y no se decide acá porque la misma burbuja cambia de
   * fondo: la propia va en el color de la marca con letra blanca, y una nota
   * interna va en amarillo con letra marrón. Un color fijo se perdería en una
   * de las dos.
   */
  color: string;
}

/**
 * Los tildes de un mensaje que mandamos.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ DIBUJADOS Y NO EL CARÁCTER «✓»
 * ------------------------------------------------------------------------
 *
 * Porque los dos tildes tienen que solaparse, como en WhatsApp, y con texto
 * eso sale «✓✓» separado y ancho, que no se lee igual de rápido. Dibujados se
 * pisan por la mitad y ocupan lo mismo que una palabra corta.
 *
 * El de «leído» se distingue por el color, no por la forma. Va en un celeste
 * claro elegido para que se vea sobre el azul de la burbuja propia: el azul de
 * WhatsApp desaparecería ahí adentro.
 */
export function AcuseDeMensaje({ acuse, color }: Props) {
  const dicho = COMO_SE_DICE[acuse];

  if (acuse === "fallo") {
    return (
      <svg
        width="13"
        height="11"
        viewBox="0 0 13 11"
        aria-label={dicho}
        role="img"
        style={{ verticalAlign: "-1px", marginLeft: 3 }}
      >
        <title>{dicho}</title>
        <path
          d="M3 2.5 L9 8.5 M9 2.5 L3 8.5"
          fill="none"
          stroke="#FFB4AA"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const tildes = CUANTOS_TILDES[acuse];
  // El leído en celeste; los demás en el color de la burbuja, apagados, para
  // que el reloj y los tildes pesen lo mismo y ninguno robe la atención.
  const tinta = acuse === "leido" ? "#7FD4F5" : color;
  const opacidad = acuse === "leido" ? 1 : 0.75;

  return (
    <svg
      width={tildes === 2 ? 16 : 11}
      height="11"
      viewBox={tildes === 2 ? "0 0 16 11" : "0 0 11 11"}
      aria-label={dicho}
      role="img"
      style={{ verticalAlign: "-1px", marginLeft: 3, opacity: opacidad }}
    >
      <title>{dicho}</title>
      {/* El de atrás, corrido a la izquierda, sólo cuando son dos. */}
      {tildes === 2 && (
        <path
          d="M1 6 L3.6 8.6 L9 3"
          fill="none"
          stroke={tinta}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path
        d={tildes === 2 ? "M6 6 L8.6 8.6 L14 3" : "M1 6 L3.6 8.6 L9 3"}
        fill="none"
        stroke={tinta}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
