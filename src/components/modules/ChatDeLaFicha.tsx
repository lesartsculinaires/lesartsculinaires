"use client";

import { useMemo, useRef, useState } from "react";

import { Inbox } from "@/components/modules/Inbox";
import { T } from "@/lib/theme";
import type { Conversacion, Etiqueta, Mensaje, Oportunidad, Plantilla } from "@/lib/types";

interface Props {
  oportunidad: Oportunidad;
  conversaciones: Conversacion[];
  mensajes: Mensaje[];
  oportunidades: Oportunidad[];
  etiquetas: Etiqueta[];
  plantillas: Plantilla[];
  canalesConectados: Record<string, boolean>;
  puedeResponder: boolean;
  accent: string;
  onRefrescar: () => void;
  onLlamar: ((conversacionId: number) => void) | null;
  /** Mientras la bandeja no llegó: se dice, no se deja el panel en blanco. */
  cargando: boolean;
}

const NOMBRE_DE_RED: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
};

/**
 * El chat del cliente, a la izquierda de su ficha.
 *
 * Lo pidieron ventas el 16/10/2026: al abrir un lead desde el Pipeline, ver la
 * conversación al lado para ir llenando los datos mientras se lee lo que dijo.
 *
 * Es la bandeja de siempre pero con un solo hilo (`soloHilo`), así que se
 * puede contestar, mandar archivos y usar plantillas igual que en el Inbox. Se
 * le pasan sólo las conversaciones de este cliente: la bandeja entera no hace
 * falta y así no calcula nada de más. Si el cliente escribe por más de una red
 * se ofrece una pestaña por cada una.
 */
export function ChatDeLaFicha({
  oportunidad,
  conversaciones,
  mensajes,
  oportunidades,
  etiquetas,
  plantillas,
  canalesConectados,
  puedeResponder,
  accent,
  onRefrescar,
  onLlamar,
  cargando,
}: Props) {
  const suyas = useMemo(
    () =>
      conversaciones
        .filter((c) => c.clienteId === oportunidad.clienteId)
        .sort((a, b) => (b.ultimoMensajeEn ?? "").localeCompare(a.ultimoMensajeEn ?? "")),
    [conversaciones, oportunidad.clienteId],
  );
  const ids = useMemo(() => new Set(suyas.map((c) => c.id)), [suyas]);
  const susMensajes = useMemo(() => mensajes.filter((m) => ids.has(m.conversacionId)), [mensajes, ids]);

  // La que se está mirando. Si no se eligió ninguna, la de la última actividad.
  const [elegida, setElegida] = useState<number | null>(null);
  const hilo = elegida != null && ids.has(elegida) ? elegida : (suyas[0]?.id ?? null);

  // El pedido de abrir un hilo lleva un contador: la bandeja sólo lo atiende si
  // es mayor que el último.
  const contador = useRef(0);
  const pedido = useMemo(
    () => (hilo == null ? null : { conversacionId: hilo, n: ++contador.current }),
    [hilo],
  );

  if (cargando && suyas.length === 0) {
    return <p style={{ margin: "auto", fontSize: 13, color: T.muted }}>Cargando el chat…</p>;
  }
  if (suyas.length === 0) {
    return (
      <p data-chat-vacio style={{ margin: "auto", fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 1.5 }}>
        {oportunidad.cliente} todavía no tiene una conversación en el CRM.
      </p>
    );
  }

  return (
    <div data-chat-de-la-ficha style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 8 }}>
      {suyas.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {suyas.map((c) => {
            const activa = c.id === hilo;
            return (
              <button
                key={c.id}
                type="button"
                data-chat-pestana={c.id}
                onClick={() => setElegida(c.id)}
                style={{
                  padding: "5px 11px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: `1px solid ${activa ? accent : T.border}`,
                  background: activa ? "#fff" : "transparent",
                  color: activa ? accent : T.muted,
                }}
              >
                {NOMBRE_DE_RED[c.canal] ?? c.canal}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Inbox
          soloHilo
          conversaciones={suyas}
          mensajes={susMensajes}
          oportunidades={oportunidades}
          etiquetas={etiquetas}
          plantillas={plantillas}
          canalesConectados={canalesConectados}
          faltaMigracion={false}
          puedeResponder={puedeResponder}
          abrirHilo={pedido}
          onLlamar={onLlamar}
          accent={accent}
          onRefrescar={onRefrescar}
          onVerFicha={() => {}}
        />
      </div>
    </div>
  );
}
