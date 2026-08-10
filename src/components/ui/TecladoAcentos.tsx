"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

import {
  ACENTOS_MAYUSCULA,
  ACENTOS_MINUSCULA,
  SIGNOS,
  insertarEnCursor,
  tituloEspanol,
} from "@/lib/texto";
import { T } from "@/lib/theme";

type Campo = HTMLInputElement | HTMLTextAreaElement;

interface Props {
  campo: RefObject<Campo | null>;
  valor: string;
  onCambio: (v: string) => void;
  accent: string;
  /** Agrega el botón de capitalizar, para nombres propios. */
  conCapitalizar?: boolean;
}

/**
 * Botonera de tildes, eñes y signos de apertura.
 *
 * Ningún botón toma el foco: se cancela el `mousedown`. Eso importa porque
 * los campos del panel de cliente guardan al perder el foco — sin esto, poner
 * una tilde dispararía un guardado a medio escribir y el teclado desaparecería
 * después de cada carácter.
 */
export function TecladoAcentos({
  campo,
  valor,
  onCambio,
  accent,
  conCapitalizar = false,
}: Props) {
  const [mayusculas, setMayusculas] = useState(false);
  /** Dónde dejar el cursor en cuanto el valor nuevo esté en el DOM. */
  const [pendiente, setPendiente] = useState<number | null>(null);

  /**
   * Recolocar el cursor tiene que pasar después de que React escribió el valor
   * nuevo en el input, y antes de que el navegador pinte. Con
   * requestAnimationFrame se adelantaba al commit de React: la posición se
   * aplicaba sobre el texto viejo y el control la mandaba al final, así que
   * poner una tilde en medio de una palabra saltaba al final.
   */
  useLayoutEffect(() => {
    if (pendiente == null) return;
    const el = campo.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pendiente, pendiente);
    }
    setPendiente(null);
  }, [pendiente, campo]);

  const insertar = (caracter: string) => {
    const el = campo.current;
    if (!el) return;

    const { valor: nuevo, cursor } = insertarEnCursor(
      valor,
      el.selectionStart ?? valor.length,
      el.selectionEnd ?? valor.length,
      caracter,
    );
    onCambio(nuevo);
    setPendiente(cursor);
  };

  const tecla: CSSProperties = {
    minWidth: 25,
    height: 23,
    padding: "0 5px",
    fontSize: 12.5,
    lineHeight: 1,
    borderRadius: 5,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.ink,
  };

  // El mousedown se cancela en todos: es lo que evita que el campo pierda el foco.
  const sinRobarFoco = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      <button
        type="button"
        onMouseDown={sinRobarFoco}
        onClick={() => setMayusculas((v) => !v)}
        title={mayusculas ? "Cambiar a minúsculas" : "Cambiar a mayúsculas"}
        aria-pressed={mayusculas}
        style={{
          ...tecla,
          fontWeight: 600,
          background: mayusculas ? accent : T.surface,
          color: mayusculas ? "#fff" : T.muted,
          borderColor: mayusculas ? accent : T.border,
        }}
      >
        ⇧
      </button>

      {(mayusculas ? ACENTOS_MAYUSCULA : ACENTOS_MINUSCULA).map((c) => (
        <button
          key={c}
          type="button"
          onMouseDown={sinRobarFoco}
          onClick={() => insertar(c)}
          title={`Insertar ${c}`}
          style={tecla}
        >
          {c}
        </button>
      ))}

      {SIGNOS.map((c) => (
        <button
          key={c}
          type="button"
          onMouseDown={sinRobarFoco}
          onClick={() => insertar(c)}
          title={`Insertar ${c}`}
          style={tecla}
        >
          {c}
        </button>
      ))}

      {conCapitalizar && (
        <button
          type="button"
          onMouseDown={sinRobarFoco}
          onClick={() => onCambio(tituloEspanol(valor))}
          disabled={!valor.trim()}
          title="Mayúscula inicial en cada palabra, respetando de / del / la"
          style={{ ...tecla, minWidth: 0, padding: "0 8px", fontSize: 11, color: T.muted }}
        >
          Aa
        </button>
      )}
    </div>
  );
}
