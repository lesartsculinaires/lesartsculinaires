"use client";

import { useState } from "react";

import { guardarProgramasDeInteres } from "@/app/actions";
import { useCatalogo } from "@/lib/catalog";
import { T } from "@/lib/theme";

/**
 * Por qué programas preguntó este lead.
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En la ficha de clientes quiero que en la parte de los programas se puedan
 * seleccionar varios, ya que un lead puede preguntar por varios programas a la
 * vez; ¿podrías aplicarlo a futuros leads y que no afecte al momento de hacer
 * un lead duplicado?»
 *
 * ============================================================================
 * POR QUÉ ESTO ES OTRO CONTROL Y NO EL DESPLEGABLE DE «PROGRAMA»
 * ============================================================================
 *
 * Porque son dos preguntas y confundirlas cuesta caro:
 *
 *   PROGRAMA        Qué se está vendiendo. Uno solo. Es el que cuenta en el
 *   (el de arriba)  Dashboard, en el tablero y en los montos: `valor` y
 *                   `venta cerrada` son de UN trato con UN precio.
 *
 *   ESTO            Por qué preguntó. Varios. Es lo que se anota en el primer
 *                   contacto, cuando la persona está comparando y todavía no
 *                   eligió.
 *
 * Si «Programa» aceptara varios, habría que contestar cuánto de los $495 es de
 * Pastelería y cuánto de Barismo. No tiene respuesta, y cualquier informe que
 * la inventara estaría mal.
 *
 * ============================================================================
 * Y POR QUÉ ESTO QUITA DUPLICADOS EN VEZ DE CREARLOS
 * ============================================================================
 *
 * Hasta ahora, quien preguntaba por tres programas terminaba con tres leads
 * —uno por programa— y en la pantalla de Clientes se leía como la misma
 * persona tres veces. Con esto es UN lead con tres intereses. Y cuando entra
 * una base que la trae otra vez por uno de esos tres, el CRM ya no le abre
 * otro: reconoce que ese programa ya estaba entre los que preguntó.
 */
export function ProgramasDeInteres({
  oportunidadId,
  /** El que se está vendiendo. No se puede desmarcar desde acá. */
  principalId,
  /** Los que ya están anotados, `principalId` incluido. */
  puestos,
  accent,
}: {
  oportunidadId: number;
  principalId: number | null;
  puestos: readonly number[];
  accent: string;
}) {
  const cat = useCatalogo();
  /*
   * Se pinta lo elegido acá y no lo que llegó por props.
   *
   * Marcar una casilla escribe en la base y la lista de arriba se vuelve a
   * pedir, pero eso tarda. Sin estado propio, la casilla se marcaría y se
   * desmarcaría sola en el camino, que se ve como si no hubiera funcionado.
   */
  const [elegidos, setElegidos] = useState<number[]>(() => [...puestos]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  const alternar = async (id: number) => {
    // El principal no se saca desde acá: dejaría un lead vendiendo un programa
    // por el que dice que nunca preguntaron. Se cambia arriba, en «Programa».
    if (id === principalId) return;

    const antes = elegidos;
    const despues = elegidos.includes(id)
      ? elegidos.filter((x) => x !== id)
      : [...elegidos, id];

    setElegidos(despues);
    setGuardando(true);
    setError(null);

    const r = await guardarProgramasDeInteres(oportunidadId, despues);
    setGuardando(false);

    if (!r.ok) {
      // Se vuelve a lo que había: dejar la casilla marcada cuando no se
      // guardó haría creer que quedó anotado.
      setElegidos(antes);
      setError(r.error);
    }
  };

  const nombreDe = (id: number) => cat.productos.find((p) => p.id === id)?.nombre ?? "—";

  // Los elegidos primero, para poder leer de un vistazo qué pidió sin abrir.
  const resumen = [...elegidos].sort((a, b) => (a === principalId ? -1 : b === principalId ? 1 : 0));

  return (
    <section style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          padding: "9px 11px",
          borderRadius: 8,
          border: `1px solid ${abierto ? accent : T.border}`,
          background: T.surface,
          cursor: "pointer",
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 11, color: T.muted }}>
            Programas por los que preguntó
          </span>
          <span style={{ display: "block", fontSize: 12.5, color: T.ink, marginTop: 2 }}>
            {resumen.length === 0
              ? "Ninguno todavía"
              : resumen.map(nombreDe).join(" · ")}
          </span>
        </span>
        {guardando && <span style={{ fontSize: 11, color: T.faint }}>guardando…</span>}
        <span style={{ color: T.faint }}>{abierto ? "▴" : "▾"}</span>
      </button>

      {abierto && (
        <div
          style={{
            marginTop: 6,
            padding: "9px 11px 10px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.paper,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 11.5, lineHeight: 1.5, color: T.muted }}>
            Marcá todos los que consultó. Esto <strong>no</strong> abre leads nuevos ni
            cambia los montos: sirve para que quede en un solo lead lo que preguntó por
            varios lados.
          </p>

          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
            {cat.productos.map((prod) => {
              const marcado = elegidos.includes(prod.id);
              const esPrincipal = prod.id === principalId;

              return (
                <li key={prod.id}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 5px",
                      borderRadius: 6,
                      fontSize: 12.5,
                      color: T.ink,
                      // El principal no se puede desmarcar: se ve que está y se
                      // ve que no es una decisión de esta pantalla.
                      cursor: esPrincipal ? "default" : "pointer",
                      opacity: esPrincipal ? 0.85 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={esPrincipal || guardando}
                      onChange={() => void alternar(prod.id)}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>{prod.nombre}</span>
                    {esPrincipal && (
                      <span
                        title="Es el programa que se está vendiendo. Se cambia arriba, en «Programa»."
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 20,
                          color: accent,
                          background: T.surface,
                          border: `1px solid ${T.border}`,
                        }}
                      >
                        el de la venta
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>

          {error && (
            <p
              role="alert"
              style={{
                margin: "8px 0 0",
                padding: "7px 9px",
                fontSize: 11.5,
                borderRadius: 6,
                background: "#F7EBE9",
                color: "#8C3B2F",
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
