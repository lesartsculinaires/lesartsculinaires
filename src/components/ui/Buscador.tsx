"use client";

import { useRef, type CSSProperties } from "react";

import { T } from "@/lib/theme";

/**
 * Una caja de búsqueda que se puede vaciar sin borrar a mano.
 *
 * ------------------------------------------------------------------------
 * LAS DOS MANERAS, Y POR QUÉ LAS DOS
 * ------------------------------------------------------------------------
 *
 * La equis se ve, así que la encuentra quien no sabe que existe. Escape no se
 * ve, pero es lo que la mano hace sola cuando se busca todo el día. Cada una
 * sirve a una persona distinta y ninguna reemplaza a la otra.
 *
 * ------------------------------------------------------------------------
 * ESCAPE CON LA CAJA VACÍA NO HACE NADA ACÁ
 * ------------------------------------------------------------------------
 *
 * Y eso es a propósito. Estos buscadores viven dentro de ventanas que también
 * escuchan Escape para cerrarse. Si la caja se quedara con la tecla estando
 * vacía, cerrar la ventana pasaría a necesitar dos Escapes seguidos —uno que
 * no hace nada visible y otro que sí—, y se sentiría como que el primero no
 * anduvo.
 *
 * Con texto, Escape lo borra y ahí sí frena la tecla: quien está buscando no
 * quiere que limpiar el filtro le cierre la pantalla encima.
 */
export function Buscador({
  valor,
  onCambio,
  placeholder,
  style,
  autoFocus,
}: {
  valor: string;
  onCambio: (v: string) => void;
  placeholder: string;
  /** Para el ancho: cada pantalla lo acomoda distinto. */
  style?: CSSProperties;
  autoFocus?: boolean;
}) {
  const caja = useRef<HTMLInputElement | null>(null);
  const hayTexto = valor !== "";

  const limpiar = () => {
    onCambio("");
    // El foco vuelve a la caja: se limpia para escribir otra cosa, no para
    // dejar de buscar. Sin esto hay que volver a hacer clic para seguir.
    caja.current?.focus();
  };

  return (
    <div style={{ position: "relative", display: "flex", ...style }}>
      <input
        ref={caja}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && hayTexto) {
            e.stopPropagation();
            limpiar();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: "100%",
          height: 32,
          // Lugar para la equis, y sólo cuando está: sin texto, el hueco a la
          // derecha se lee como un renglón mal centrado.
          padding: hayTexto ? "0 30px 0 12px" : "0 12px",
          fontSize: 13,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          background: T.paper,
          color: T.ink,
        }}
      />

      {hayTexto && (
        <button
          type="button"
          onClick={limpiar}
          aria-label="Limpiar la búsqueda"
          title="Limpiar (Esc)"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 30,
            height: 32,
            display: "grid",
            placeItems: "center",
            fontSize: 15,
            lineHeight: 1,
            color: T.faint,
            cursor: "pointer",
            background: "transparent",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
