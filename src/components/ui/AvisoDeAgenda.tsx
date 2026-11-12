"use client";

import { useState } from "react";

import { cuantoFalta, type AvisoDeEvento } from "@/lib/avisoDeEvento";
import { permisoDeAvisos, pedirPermisoDeAvisos } from "@/hooks/useAvisoDeEvento";
import { T } from "@/lib/theme";

/**
 * La alerta de «falta poco para este evento», como ventana emergente.
 *
 * ============================================================================
 * POR QUÉ AHORA SALTA EN EL CENTRO (12/11/2026)
 * ============================================================================
 *
 * Antes era un cartel chico en la esquina, para no interrumpir a quien está
 * escribiéndole a un cliente. El equipo pidió lo contrario: que al agendar una
 * reunión la alerta aparezca como ventana emergente, como en Google Calendar,
 * porque el cartel de la esquina se pasaba por alto.
 *
 * Lo que sí se cuida: la ventana NO roba el foco ni borra nada. Lo que se
 * estaba escribiendo sigue en su recuadro detrás, y se cierra con un clic
 * («Descartar», «Abrir el lead» o fuera de la ventana).
 *
 * ============================================================================
 * EL PERMISO DEL NAVEGADOR SE PIDE ACÁ
 * ============================================================================
 *
 * Y no desde el reloj. Un cuadro de permiso que salta solo se contesta que no
 * —y ahí ya no se puede volver a pedir—. Acá aparece cuando la primera alerta
 * ya está en pantalla: en ese momento se entiende para qué sirve.
 */
/** Cómo se lee un evento en la alerta. Lo arma quien tiene el catálogo. */
export interface Rotulo {
  /** De quién es: el tipo de evento y el nombre del cliente. */
  titulo: string;
  /** El programa y la asesora, si se saben. */
  detalle: string | null;
  /** «9:30 – 10:00», si se sabe. */
  horario?: string | null;
  /** El color del tipo de evento. */
  color?: string | null;
}

export function AvisoDeAgenda({
  avisos,
  accent,
  rotular,
  onAbrirFicha,
  onDescartar,
}: {
  avisos: readonly AvisoDeEvento[];
  accent: string;
  /*
   * El texto se arma afuera y no acá adentro: para escribir «Llamada con Wel ·
   * Suprême Diplôme · Alexandra Ramos» hay que cruzar el evento con la
   * oportunidad y los catálogos, y así esto se puede dibujar y probar solo.
   */
  rotular: (avisoEvento: AvisoDeEvento) => Rotulo;
  onAbrirFicha: (oportunidadId: number) => void;
  onDescartar: (aviso: AvisoDeEvento) => void;
}) {
  const [permiso, setPermiso] = useState(permisoDeAvisos());

  if (avisos.length === 0) return null;

  const descartarTodos = () => avisos.forEach((a) => onDescartar(a));

  return (
    <div
      onClick={descartarTodos}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
        background: "rgba(3, 27, 79, 0.28)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        role="alertdialog"
        aria-live="assertive"
        aria-label="Alerta de la agenda"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)",
          maxHeight: "85vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {avisos.map((a) => {
          const { titulo, detalle, horario, color } = rotular(a);
          const tono = color || accent;
          return (
            <div
              key={`${a.evento.id}@${a.evento.iniciaEn}`}
              data-aviso-agenda={a.evento.id}
              style={{
                background: T.surface,
                borderRadius: 12,
                boxShadow: "0 18px 48px rgba(3, 27, 79, 0.32)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: tono,
                  color: "#fff",
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span aria-hidden style={{ fontSize: 20 }}>🔔</span>
                <strong style={{ fontSize: 15, flex: 1 }}>{cuantoFalta(a.faltan)}</strong>
                <button
                  type="button"
                  onClick={() => onDescartar(a)}
                  aria-label="Descartar el aviso"
                  style={{ fontSize: 20, lineHeight: 1, color: "#fff", cursor: "pointer", opacity: 0.9 }}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: "14px 16px 16px" }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.ink, lineHeight: 1.35 }}>
                  {titulo}
                </p>
                {horario && (
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: T.muted }}>🕒 {horario}</p>
                )}
                {detalle && (
                  <p style={{ margin: "3px 0 0", fontSize: 12.5, color: T.muted, lineHeight: 1.4 }}>
                    {detalle}
                  </p>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => onDescartar(a)}
                    style={{
                      height: 32,
                      padding: "0 14px",
                      fontSize: 12.5,
                      borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      background: T.surface,
                      color: T.muted,
                      cursor: "pointer",
                    }}
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDescartar(a);
                      onAbrirFicha(a.evento.oportunidadId);
                    }}
                    style={{
                      height: 32,
                      padding: "0 14px",
                      fontSize: 12.5,
                      fontWeight: 600,
                      borderRadius: 6,
                      background: accent,
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Abrir el lead
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* El permiso, ofrecido una vez y sólo si nunca se decidió. */}
        {permiso === "default" && (
          <div
            style={{
              background: T.surface,
              borderRadius: 10,
              padding: "10px 14px",
              boxShadow: "0 8px 24px rgba(3, 27, 79, 0.2)",
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
              Para que la alerta te llegue aunque el CRM esté en otra pestaña, permite las
              notificaciones del navegador.
            </p>
            <button
              type="button"
              onClick={() => void pedirPermisoDeAvisos().then((r) => setPermiso(r))}
              style={{
                marginTop: 7,
                height: 28,
                padding: "0 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${accent}`,
                background: T.surface,
                color: accent,
                cursor: "pointer",
              }}
            >
              Permitir avisos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
