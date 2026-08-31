"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { reaccionar } from "@/app/inbox-actions";
import { PanelEmoji } from "@/components/ui/SelectorEmoji";
import { T } from "@/lib/theme";
import type { Mensaje } from "@/lib/types";

/**
 * Las reacciones de un mensaje: las que hay y el botón para poner una.
 *
 * ============================================================================
 * ESTA SÍ SALE A WHATSAPP
 * ============================================================================
 *
 * A diferencia de las marcas de la bandeja —fijar, silenciar, dejar pendiente—
 * una reacción es un mensaje para Meta: viaja, le llega al cliente y aparece
 * en su teléfono igual que si se la hubiéramos puesto desde la aplicación. Dos
 * consecuencias que se ven en el código de acá:
 *
 *   NO SE PUEDE DESHACER SIN QUE SE NOTE   Poner y sacar un ❤️ le llega al
 *                                          cliente dos veces. Por eso el botón
 *                                          se apaga mientras el envío está en
 *                                          curso: dos clics apurados son dos
 *                                          notificaciones en su teléfono.
 *
 *   VALE LA VENTANA DE 24 HORAS            Un 👍 sobre algo de hace tres días
 *                                          lo rechaza Meta con el mismo error
 *                                          que un mensaje. Se apaga antes de
 *                                          intentarlo, con la misma razón que
 *                                          ya explica el resto de la bandeja.
 *
 * ============================================================================
 * LOS SEIS DE SIEMPRE, Y DESPUÉS TODOS
 * ============================================================================
 *
 * Se abre con seis y un «＋». Es lo que hace WhatsApp y no es capricho: casi
 * todas las reacciones de un chat de ventas son las mismas seis, y abrir un
 * teclado de trescientos para poner un 👍 es tres veces más trabajo del que
 * hace falta. El teclado entero sigue estando, a un clic.
 */

/** Los seis que se usan de verdad, en el orden en que los pone WhatsApp. */
const LOS_DE_SIEMPRE = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export function ReaccionesDelMensaje({
  mensaje,
  mio,
  accent,
  /** Falso pasadas las 24 horas: Meta rechaza también las reacciones. */
  ventanaAbierta,
  onCambio,
}: {
  mensaje: Mensaje;
  mio: boolean;
  accent: string;
  ventanaAbierta: boolean;
  onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [todos, setTodos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);

  const nuestra = mensaje.reacciones.find((r) => r.direccion === "saliente") ?? null;
  const suya = mensaje.reacciones.find((r) => r.direccion === "entrante") ?? null;

  useEffect(() => {
    if (!abierto) {
      setTodos(false);
      return;
    }

    const afuera = (ev: MouseEvent) => {
      if (caja.current && !caja.current.contains(ev.target as Node)) setAbierto(false);
    };
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setAbierto(false);
    };

    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  /**
   * Pone la reacción, o la saca si ya era ésa.
   *
   * Volver a tocar la que ya está puesta la quita, que es lo que hace WhatsApp
   * y lo que la mano espera: sin eso haría falta un botón aparte de «sacar»
   * para algo que se deshace tocando lo mismo.
   */
  const poner = async (emoji: string) => {
    if (enviando) return;
    const quitando = nuestra?.emoji === emoji;

    setEnviando(true);
    setError(null);
    const r = await reaccionar(mensaje.id, quitando ? null : emoji);
    setEnviando(false);

    if (!r.ok) {
      setError(r.error);
      return;
    }
    setAbierto(false);
    onCambio();
  };

  const puede = mensaje.reaccionable && ventanaAbierta;
  const hay = mensaje.reacciones.length > 0;

  return (
    <div
      ref={caja}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginTop: hay ? 3 : 0,
        // Del lado de la burbuja: las nuestras van a la derecha, las del
        // cliente a la izquierda, como el mensaje al que pertenecen.
        justifyContent: mio ? "flex-end" : "flex-start",
      }}
    >
      {/* Las que ya están. La nuestra se puede tocar para sacarla; la del
          cliente no —es suya— y por eso va como texto y no como botón. */}
      {suya && (
        <span title="La puso el cliente" style={pastilla(false, accent)}>
          {suya.emoji}
        </span>
      )}
      {nuestra && (
        <button
          type="button"
          onClick={() => void poner(nuestra.emoji)}
          disabled={!puede || enviando}
          title={puede ? "Tocá para sacarla" : "Pasaron más de 24 horas"}
          style={{ ...pastilla(true, accent), cursor: puede ? "pointer" : "default" }}
        >
          {nuestra.emoji}
        </button>
      )}

      {/*
        El botón de poner una.
        Se dibuja siempre y no sólo al pasar el mouse por encima: un botón que
        aparece al acercarse es invisible para quien no sabe que está, y nadie
        va a pasear el mouse por una conversación a ver qué se prende. Queda
        tenue para no competir con el mensaje.
      */}
      {puede && !nuestra && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          disabled={enviando}
          title="Reaccionar a este mensaje"
          aria-label="Reaccionar a este mensaje"
          aria-expanded={abierto}
          style={{
            height: 19,
            padding: "0 6px",
            fontSize: 11,
            lineHeight: "17px",
            borderRadius: 10,
            border: `1px solid ${abierto ? accent : T.border}`,
            background: T.surface,
            color: T.faint,
            cursor: enviando ? "wait" : "pointer",
          }}
        >
          ☺+
        </button>
      )}

      {abierto && (
        <div
          style={{
            position: "absolute",
            // Encima del mensaje, no debajo: abajo está el mensaje siguiente y
            // el panel taparía justo lo que se está leyendo.
            bottom: "calc(100% + 4px)",
            // Alineado al mismo borde que la burbuja, para que no se salga.
            right: mio ? 0 : undefined,
            left: mio ? undefined : 0,
            zIndex: 85,
          }}
        >
          {todos ? (
            <PanelEmoji onElegir={(e) => void poner(e)} accent={accent} />
          ) : (
            <div
              role="menu"
              aria-label="Reaccionar"
              style={{
                display: "flex",
                gap: 2,
                padding: 4,
                background: T.surface,
                border: `1px solid ${T.borderStrong}`,
                borderRadius: 20,
                boxShadow: "0 10px 26px rgba(3,27,79,0.16)",
              }}
            >
              {LOS_DE_SIEMPRE.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="menuitem"
                  onClick={() => void poner(e)}
                  disabled={enviando}
                  aria-label={`Reaccionar con ${e}`}
                  style={{
                    width: 30,
                    height: 30,
                    fontSize: 18,
                    borderRadius: 15,
                    background: nuestra?.emoji === e ? T.paper : "transparent",
                    cursor: enviando ? "wait" : "pointer",
                  }}
                >
                  {e}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => setTodos(true)}
                title="Todos los emojis"
                aria-label="Todos los emojis"
                style={{
                  width: 30,
                  height: 30,
                  fontSize: 15,
                  borderRadius: 15,
                  color: T.muted,
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                ＋
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <span
          role="alert"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: "#9E2F29", maxWidth: 260 }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

/** La pastilla de una reacción ya puesta. */
const pastilla = (nuestra: boolean, accent: string): CSSProperties => ({
  height: 19,
  padding: "0 6px",
  fontSize: 12,
  lineHeight: "17px",
  borderRadius: 10,
  // La nuestra se distingue con el borde del color de la escuela: en un hilo
  // con reacciones de los dos lados hay que poder saber cuál puso quién.
  border: `1px solid ${nuestra ? accent : T.border}`,
  background: T.surface,
});
