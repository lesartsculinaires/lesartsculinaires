"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { T, softer } from "@/lib/theme";

export type MenuValue = string | number | null;

export interface MenuOption {
  label: string;
  value: MenuValue;
}

type Variant =
  /** Toolbar chip — Clientes and Calendario filter bars. */
  | "chip"
  /** Full-width control with the label inline — event drawer. */
  | "block"
  /** Full-width control with the label above the value — client drawer. */
  | "stacked";

interface Props {
  /** Unique key; the parent keeps at most one menu open at a time. */
  menuKey: string;
  label: string;
  options: readonly MenuOption[];
  /** Currently selected value in single-select mode. */
  current?: MenuValue;
  /** Overrides the displayed text when `current` is not itself presentable. */
  valueText?: string;
  open: boolean;
  accent: string;
  variant?: Variant;
  onToggle: () => void;
  onPick: (value: MenuValue) => void;
  /** Multi-select mode: check every value in `selected` and show `summary`. */
  multi?: { selected: readonly MenuValue[]; summary: string };
}

const MENU_STYLE: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 5px)",
  zIndex: 70,
  minWidth: 196,
  /*
   * Un techo de ancho, además del piso.
   *
   * Sin esto, una opción larga —el nombre de una base con su fecha, o un
   * programa entero— estira el menú hasta donde haga falta, y a la derecha de
   * la pantalla eso es lo que lo empuja afuera. Con el techo, el texto se parte
   * en dos líneas adentro del menú, que es donde se puede leer.
   */
  maxWidth: 280,
  maxHeight: 268,
  overflowY: "auto",
  background: T.surface,
  border: `1px solid ${T.borderStrong}`,
  borderRadius: 8,
  boxShadow: "0 14px 30px rgba(31,29,26,0.15)",
  padding: 5,
};

export function FilterMenu({
  menuKey,
  label,
  options,
  current,
  valueText: valueTextProp,
  open,
  accent,
  variant = "chip",
  onToggle,
  onPick,
  multi,
}: Props) {
  // A multi-select chip never reads as "filtered" — its summary already says so.
  const active = multi ? false : current != null && current !== "";
  const valueText = multi
    ? multi.summary
    : (valueTextProp ?? current ?? "Todos");

  const btnStyle: CSSProperties =
    variant === "chip"
      ? {
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 32,
          padding: "0 11px",
          fontSize: 12.5,
          border: `1px solid ${active || open ? accent : T.border}`,
          borderRadius: 6,
          background: active ? softer(accent) : T.surface,
          whiteSpace: "nowrap",
        }
      : {
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "8px 11px",
          border: `1px solid ${open ? accent : T.border}`,
          borderRadius: 7,
          background: T.surface,
        };

  /*
   * De qué lado se abre el menú.
   *
   * ==========================================================================
   * POR QUÉ SE MIDE Y NO SE DECIDE DE ANTEMANO
   * ==========================================================================
   *
   * El menú colgaba siempre del borde izquierdo del botón. Los primeros de la
   * fila quedan bien; el último —«Base», que además tiene las opciones más
   * largas— se sale por la derecha de la pantalla y sus opciones aparecen
   * cortadas a la mitad. Es lo que la escuela reportó.
   *
   * No alcanza con abrirlos todos hacia la izquierda: los de la izquierda de la
   * fila se saldrían por el otro lado. Y no alcanza con mirar cuál es el último,
   * porque la fila cambia —los filtros aparecen y desaparecen según lo que haya
   * cargado— y en una pantalla angosta se parte en varias líneas.
   *
   * Así que se mide al abrir: si el menú no entra a la derecha del botón, se
   * cuelga del borde derecho. Es lo único que funciona sin importar cuántos
   * filtros haya ni de qué ancho sea la pantalla.
   */
  const caja = useRef<HTMLDivElement>(null);
  const [haciaLaIzquierda, setHaciaLaIzquierda] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nodo = caja.current;
    if (!nodo) return;

    const acomodar = () => {
      const desde = nodo.getBoundingClientRect().left;
      // El ancho máximo del menú más un respiro contra el borde.
      setHaciaLaIzquierda(desde + 280 + 12 > window.innerWidth);
    };

    acomodar();
    // Al cambiar el tamaño de la ventana el lado bueno puede ser el otro.
    window.addEventListener("resize", acomodar);
    return () => window.removeEventListener("resize", acomodar);
  }, [open]);

  /*
   * Cómo se cierra el menú.
   *
   * Antes se cerraba solo: elegir una opción era el último paso, así que el
   * clic hacía las dos cosas. Con la selección múltiple ya no —elegir un ítem
   * tiene que dejar el menú abierto para poder elegir el siguiente—, y sin esto
   * la única forma de cerrarlo sería volver a apretar el mismo botón, que es
   * justo lo que nadie hace: se hace clic afuera y se espera que se vaya.
   *
   * Un menú que se queda abierto tapando la tabla que uno acaba de filtrar es
   * peor que el problema que la selección múltiple vino a resolver.
   */
  useEffect(() => {
    if (!open) return;

    const afuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) onToggle();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle();
    };

    // En `mousedown` y no en `click`: si se esperara al `click`, el mismo
    // gesto que cierra este menú abriría el de al lado y volvería a cerrarlo.
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [open, onToggle]);

  return (
    <div ref={caja} style={{ position: "relative", zIndex: open ? 70 : 1 }}>
      <button
        type="button"
        onClick={onToggle}
        data-filtro={menuKey}
        aria-haspopup="menu"
        aria-expanded={open}
        style={btnStyle}
      >
        {variant === "stacked" ? (
          <>
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: T.faint,
                marginBottom: 3,
              }}
            >
              {label}
            </span>
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
              }}
            >
              {valueText}
              <span style={{ color: T.faint }}>▾</span>
            </span>
          </>
        ) : (
          <>
            {/* The chip variant spaces these with flex gap; block has none. */}
            <span
              style={{ color: T.faint, marginRight: variant === "block" ? 6 : undefined }}
            >
              {label}
            </span>
            <span>{valueText}</span>
            <span style={{ color: T.faint, marginLeft: 2 }}>▾</span>
          </>
        )}
      </button>

      {open && (
        <div
          data-menu={menuKey}
          aria-label={label}
          style={{
            ...MENU_STYLE,
            // Ver arriba: del borde que deje el menú adentro de la pantalla.
            ...(haciaLaIzquierda ? { right: 0 } : { left: 0 }),
          }}
        >
          {options.map((o) => {
            /*
             * «Todos» se marca cuando no hay nada marcado.
             *
             * Su valor es `null` y nunca está en la lista de elegidos, así que
             * sin esto quedaría siempre en blanco: el menú se vería como si no
             * hubiera nada seleccionado incluso al abrirlo sin filtrar, y no
             * habría forma de ver de un vistazo que se está mirando todo.
             */
            const on = multi
              ? o.value == null
                ? multi.selected.length === 0
                : multi.selected.includes(o.value)
              : current === o.value;
            return (
              <button
                type="button"
                key={`${menuKey}:${String(o.value)}`}
                className="nav"
                onClick={() => onPick(o.value)}
                /*
                 * `aria-pressed` y no `role="menuitemcheckbox"`.
                 *
                 * Los dos hacen que un lector de pantalla diga si la opción
                 * está marcada, que es lo que hacía falta al poder marcar
                 * varias. La diferencia está en lo que cada uno promete:
                 * `role="menu"` con `menuitemcheckbox` adentro es el patrón de
                 * menú de ARIA, y ese patrón se maneja con las flechas del
                 * teclado. Ponerle el rol sin implementar las flechas deja a
                 * quien navega con teclado peor que antes —le anuncian un menú
                 * que no responde como un menú—.
                 *
                 * Como botones que se prenden y se apagan, en cambio, el
                 * tabulador funciona solo y `aria-pressed` dice el estado.
                 */
                aria-pressed={on}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 9px",
                  borderRadius: 5,
                  fontSize: 13,
                  color: on ? T.ink : T.muted,
                  /*
                    Que el texto largo se parta en vez de estirar el menú.
                    Un nombre de base entero —con su fecha— llega a ochenta
                    caracteres, y en una sola línea es lo que empujaba el menú
                    fuera de la pantalla.
                  */
                  lineHeight: 1.4,
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                }}
              >
                <span
                  style={{
                    width: 11,
                    height: 11,
                    flexShrink: 0,
                    // Arriba y no al medio: con el texto en dos líneas, una
                    // casilla centrada queda flotando entre renglones.
                    marginTop: 3,
                    alignSelf: "flex-start",
                    borderRadius: 3,
                    border: `1px solid ${on ? accent : T.borderStrong}`,
                    background: on ? accent : "transparent",
                  }}
                />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Wraps a list of plain values as menu options, with a leading "Todos". */
export const withTodos = (values: readonly string[]): MenuOption[] => [
  { label: "Todos", value: null },
  ...values.map((v) => ({ label: v, value: v })),
];
