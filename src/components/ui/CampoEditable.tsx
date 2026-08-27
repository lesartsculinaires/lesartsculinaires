"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { TecladoAcentos } from "@/components/ui/TecladoAcentos";
import { T } from "@/lib/theme";

type Tipo = "texto" | "fecha" | "monto";

/** Opciones agrupadas, para los campos que se eligen de una lista. */
export interface GrupoDeOpciones {
  grupo: string;
  valores: readonly string[];
}

interface Props {
  label: string;
  /** Current stored value. Empty string renders as the placeholder. */
  value: string;
  tipo?: Tipo;
  accent: string;
  placeholder?: string;
  /**
   * Cuando viene, el campo se elige de una lista en vez de escribirse.
   *
   * Se agrupan porque una lista larga sin secciones obliga a recorrerla
   * entera: el País tiene ochenta y pico y lo que se elige casi siempre son
   * los cinco de Centroamérica.
   *
   * Lo guardado sigue siendo el texto, no un id. Así una ficha vieja con el
   * país escrito a mano se sigue leyendo, y se muestra tal cual aunque no esté
   * en la lista.
   */
  opciones?: readonly GrupoDeOpciones[];
  /** Blocks clearing the field; use for `not null` columns. */
  requerido?: boolean;
  /** Called on blur or Enter, only when the value actually changed. */
  onGuardar: (nuevo: string) => void;
  /** Muestra el teclado de tildes mientras se edita. Para texto libre. */
  acentos?: boolean;
  /** Agrega el botón de capitalizar. Para nombres propios. */
  esNombre?: boolean;
  /** Caja de varias líneas, para texto que se describe y no se rellena. */
  multilinea?: boolean;
  /** Se dibuja bajo el campo mientras se edita. Recibe el borrador. */
  extra?: (borrador: string, poner: (v: string) => void) => ReactNode;
  /**
   * Avisa en cada tecla, no al salir del campo.
   *
   * `onGuardar` sólo corre al perder el foco o con Enter, que es lo correcto
   * para escribir en la base: no tiene sentido guardar una vez por letra. Pero
   * hay pantallas que tienen que reaccionar mientras se escribe —la edad, que
   * hace aparecer los datos del responsable— y esperar a que la persona haga
   * clic en otro lado da la sensación de que el campo no hace nada.
   */
  onBorrador?: (borrador: string) => void;
}

/**
 * One inline-editable row.
 *
 * Commits on blur or Enter and only when the value changed, so tabbing through
 * the drawer does not fire a write per field. Escape restores the stored value.
 */
export function CampoEditable({
  label,
  value,
  tipo = "texto",
  accent,
  placeholder,
  opciones,
  requerido = false,
  onGuardar,
  acentos = false,
  esNombre = false,
  multilinea = false,
  extra,
  onBorrador,
}: Props) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState(value);
  const [focus, setFocus] = useState(false);

  /**
   * Cambia el borrador y avisa afuera.
   *
   * Pasa por acá todo lo que mueve el borrador —teclear, Escape, el teclado de
   * tildes— para que quien escucha nunca vea un valor viejo. Avisar sólo al
   * teclear dejaría a la pantalla creyendo que sigue diciendo «15» después de
   * que Escape lo devolvió a vacío.
   */
  const poner = (v: string) => {
    setDraft(v);
    onBorrador?.(v);
  };

  /**
   * Escape acaba de pedir descartar.
   *
   * Va en un ref y no en el estado porque hay que leerlo en el `blur` que
   * dispara el propio Escape, y eso ocurre antes de que React vuelva a pintar:
   * un `useState` todavía tendría el valor viejo.
   */
  const cancelado = useRef(false);

  /**
   * Descartar lo tecleado y volver a lo guardado.
   *
   * Sacar el foco dispara `commit`, y `commit` lee el borrador de su clausura
   * —todavía el que se quería tirar—, así que sin esta marca Escape terminaba
   * guardando justo lo que la persona pidió descartar. Es lo contrario de lo
   * que promete la tecla.
   */
  const cancelar = (campo: HTMLInputElement | HTMLTextAreaElement) => {
    cancelado.current = true;
    poner(value);
    setFocus(false);
    campo.blur();
  };

  // Follow the stored value when it changes elsewhere — a rename from another
  // opportunity of the same client, or a server refresh.
  useEffect(() => {
    if (!focus) setDraft(value);
  }, [value, focus]);

  const vacioInvalido = requerido && draft.trim() === "";

  const commit = () => {
    setFocus(false);
    if (cancelado.current) {
      cancelado.current = false;
      return;
    }
    const limpio = tipo === "monto" ? draft.replace(/[^0-9.]/g, "") : draft.trim();
    if (vacioInvalido) {
      poner(value);
      return;
    }
    if (limpio === value) return;
    onGuardar(limpio);
  };

  const input: CSSProperties = {
    width: "100%",
    height: 30,
    padding: "0 8px",
    font: "inherit",
    fontSize: 13,
    textAlign: tipo === "texto" ? "left" : "right",
    color: T.ink,
    border: `1px solid ${vacioInvalido ? "#B85042" : focus ? accent : "transparent"}`,
    borderRadius: 6,
    background: focus ? T.surface : "transparent",
    outline: "none",
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        padding: "5px 8px 5px 13px",
      }}
    >
      <span style={{ fontSize: 12, color: T.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, maxWidth: multilinea ? "72%" : tipo === "texto" ? "62%" : 150 }}>
        {opciones ? (
          /*
           * Un `select`, no un cuadro de texto.
           *
           * Se guarda en cuanto se elige y no al salir del campo: en un
           * desplegable no hay «terminar de escribir», así que esperar al
           * `blur` haría que elegir y cerrar la ficha perdiera el cambio.
           *
           * La opción vacía existe para poder borrar el dato. Y si lo guardado
           * no está en la lista —una ficha vieja, un país escrito a mano— se
           * agrega como una opción más al final, para no cambiárselo en
           * silencio a quien sólo vino a mirar.
           */
          <select
            value={draft}
            onChange={(e) => {
              poner(e.target.value);
              onGuardar(e.target.value);
            }}
            style={{ ...input, textAlign: "left", border: `1px solid ${T.border}` }}
          >
            <option value="">{placeholder ?? "—"}</option>
            {draft !== "" &&
              !opciones.some((g) => g.valores.includes(draft)) && (
                <option value={draft}>{draft}</option>
              )}
            {opciones.map((g) => (
              <optgroup key={g.grupo} label={g.grupo}>
                {g.valores.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : multilinea ? (
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            rows={focus ? 3 : 1}
            value={draft}
            placeholder={placeholder ?? "—"}
            onChange={(e) => poner(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelar(e.currentTarget);
            }}
            style={{ ...input, height: "auto", resize: "vertical", lineHeight: 1.45, padding: "6px 8px" }}
          />
        ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          type={tipo === "fecha" ? "date" : "text"}
          inputMode={tipo === "monto" ? "decimal" : undefined}
          value={draft}
          placeholder={placeholder ?? "—"}
          onChange={(e) => poner(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") cancelar(e.currentTarget);
          }}
          className={tipo === "texto" ? undefined : "mono"}
          style={input}
        />
        )}
        {extra && focus && <div style={{ marginTop: 6 }}>{extra(draft, poner)}</div>}
        {acentos && focus && (
          <div style={{ marginTop: 6 }}>
            <TecladoAcentos
              campo={ref}
              valor={draft}
              onCambio={poner}
              accent={accent}
              conCapitalizar={esNombre}
            />
          </div>
        )}
      </span>
    </div>
  );
}
