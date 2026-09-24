"use client";

import { NOMBRE, SIMBOLO, type Marca } from "@/lib/formatoDeWhatsapp";
import { T } from "@/lib/theme";

/**
 * Los botones de formato del cuadro de respuesta.
 *
 * ============================================================================
 * SON CUATRO Y NO CINCO
 * ============================================================================
 *
 * Falta el subrayado, y no es un olvido: WhatsApp no tiene una marca para
 * subrayar. Un botón de subrayado escribiría un símbolo que le llega al cliente
 * tal cual, en medio de la frase. El porqué completo está en
 * `formatoDeWhatsapp.ts`.
 *
 * ============================================================================
 * ATAJOS, PORQUE ES LO QUE LA MANO YA SABE
 * ============================================================================
 *
 * Ctrl+B y Ctrl+I los tiene aprendidos cualquiera que haya escrito en un
 * procesador de texto, y quien atiende la bandeja escribe rápido. Los botones
 * están para descubrirlos —y para el ratón—, pero el camino corto tiene que
 * andar o la barra se vuelve un adorno que nadie usa.
 */

/** Qué botón mostrar, en qué orden, y con qué se dispara desde el teclado. */
export const BOTONES: { marca: Marca; rotulo: string; atajo: string | null }[] = [
  { marca: "negrita", rotulo: "B", atajo: "b" },
  { marca: "cursiva", rotulo: "I", atajo: "i" },
  { marca: "tachado", rotulo: "S", atajo: null },
  { marca: "mono", rotulo: "</>", atajo: null },
];

const estiloDelRotulo = (marca: Marca): React.CSSProperties => {
  if (marca === "negrita") return { fontWeight: 800 };
  if (marca === "cursiva") return { fontStyle: "italic", fontWeight: 600 };
  if (marca === "tachado") return { textDecoration: "line-through", fontWeight: 600 };
  return { fontFamily: "ui-monospace, monospace", fontSize: 11 };
};

export function BarraDeFormato({
  onMarca,
  disabled = false,
}: {
  onMarca: (marca: Marca) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Formato del texto"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 12px 6px",
        flexWrap: "wrap",
      }}
    >
      {BOTONES.map(({ marca, rotulo, atajo }) => (
        <button
          key={marca}
          type="button"
          data-formato={marca}
          aria-label={NOMBRE[marca]}
          disabled={disabled}
          // Sin esto, pulsar el botón le saca el foco al cuadro de texto y se
          // pierde lo que estaba seleccionado: la marca terminaría envolviendo
          // la nada.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onMarca(marca)}
          title={
            `${NOMBRE[marca]} — ${SIMBOLO[marca]}texto${SIMBOLO[marca]}` +
            (atajo ? ` (Ctrl+${atajo.toUpperCase()})` : "")
          }
          style={{
            width: 30,
            height: 26,
            borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: disabled ? T.faint : T.ink,
            fontSize: 12.5,
            lineHeight: 1,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.55 : 1,
            ...estiloDelRotulo(marca),
          }}
        >
          {rotulo}
        </button>
      ))}
      {/* Dicho una vez, acá: es la primera pregunta de quien mira la barra y
          no encuentra la S subrayada que tiene cualquier otro editor. */}
      <span style={{ fontSize: 10.5, color: T.faint, marginLeft: 5, lineHeight: 1.4 }}>
        WhatsApp no tiene subrayado
      </span>
    </div>
  );
}
