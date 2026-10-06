"use client";

import { partirLoDicho } from "@/lib/meta/cita";
import { T } from "@/lib/theme";

/**
 * La cita que alguien agendó desde Messenger o Instagram.
 *
 * ============================================================================
 * POR QUÉ NO ES UNA BURBUJA DE TEXTO MÁS
 * ============================================================================
 *
 * Porque no la escribió nadie: es un hecho con fecha. En una conversación de
 * treinta mensajes, «Cita solicitada: jueves, 1 de octubre, 3:30 p. m.» en el
 * mismo gris que todo lo demás se pierde, y lo que se pierde es la única línea
 * del hilo que obliga a estar en un lugar a una hora.
 *
 * Meta la dibuja como tarjeta por lo mismo. Acá se dibuja parecida para que
 * quien compare las dos pantallas —que es lo que hace una asesora cuando algo
 * no cuadra— vea lo mismo en las dos.
 *
 * ============================================================================
 * LO QUE ESTA TARJETA NO HACE
 * ============================================================================
 *
 * No confirma ni cancela. Eso se hace desde Meta, que es donde vive la reserva,
 * y un botón acá que no la mueva allá sería peor que no tenerlo: dos pantallas
 * diciendo cosas distintas sobre la misma cita.
 */
export function CitaMensaje({ texto, mio }: { texto: string | null; mio: boolean }) {
  if (!texto) return null;

  const { que, cuando } = partirLoDicho(texto);
  const cancelada = /cancelada/i.test(que);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        marginTop: 5,
        padding: "9px 11px",
        borderRadius: 10,
        border: `1px solid ${mio ? "rgba(255,255,255,0.3)" : T.border}`,
        background: mio ? "rgba(255,255,255,0.12)" : T.paper,
      }}
    >
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1.2 }}>
        {cancelada ? "🚫" : "📅"}
      </span>
      <span style={{ display: "block", minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 700,
            /* Tachado no: una cita cancelada hay que poder leerla bien. */
            color: cancelada ? T.warn : "inherit",
          }}
        >
          {que}
        </span>
        {cuando && (
          <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.45, marginTop: 1 }}>
            {cuando}
          </span>
        )}
      </span>
    </div>
  );
}
