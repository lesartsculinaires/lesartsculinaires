"use client";

import { useState } from "react";

import { cuantoFalta, type AvisoDeEvento } from "@/lib/avisoDeEvento";
import { permisoDeAvisos, pedirPermisoDeAvisos } from "@/hooks/useAvisoDeEvento";
import { T } from "@/lib/theme";

/**
 * El cartel de «falta poco para esta llamada».
 *
 * ============================================================================
 * POR QUÉ NO INTERRUMPE LA PANTALLA ENTERA
 * ============================================================================
 *
 * El aviso de reservas es una ventana que tapa todo, y está bien: salta una
 * vez por día y es sobre plata que se puede perder. Éste salta cada vez que
 * hay una llamada agendada —pueden ser seis en una tarde— y llega justo
 * cuando la persona está escribiéndole a un cliente. Taparle la pantalla en
 * ese momento le hace perder lo que estaba escribiendo.
 *
 * Así que va en una esquina, encima de todo, y no roba el foco. Se ve de
 * reojo, que es lo que hace falta para decidir si levantarse.
 *
 * ============================================================================
 * EL PERMISO DEL NAVEGADOR SE PIDE ACÁ
 * ============================================================================
 *
 * Y no desde el reloj. Un cuadro de permiso que salta solo se contesta que no
 * —y ahí ya no se puede volver a pedir—. Acá aparece cuando el primer aviso ya
 * está en pantalla: en ese momento se entiende para qué sirve, y apretarlo es
 * una decisión.
 */
/** Cómo se lee un evento en el cartel. Lo arma quien tiene el catálogo. */
export interface Rotulo {
  /** De quién es la llamada: el nombre del cliente y el tipo de evento. */
  titulo: string;
  /** El programa y la asesora, si se saben. */
  detalle: string | null;
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
   * El texto se arma afuera y no acá adentro.
   *
   * Para escribir «Llamada con Wel · Suprême Diplôme · Alexandra Ramos» hay
   * que cruzar el evento con la oportunidad, el catálogo de tipos y el de
   * vendedores. Traer todo eso a un cartel de esquina lo ataría a media
   * aplicación; recibiendo el texto ya armado, se puede dibujar y probar solo.
   */
  rotular: (avisoEvento: AvisoDeEvento) => Rotulo;
  onAbrirFicha: (oportunidadId: number) => void;
  onDescartar: (aviso: AvisoDeEvento) => void;
}) {
  const [permiso, setPermiso] = useState(permisoDeAvisos());

  if (avisos.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 95,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "min(360px, calc(100vw - 36px))",
      }}
    >
      {avisos.map((a) => {
        const { titulo, detalle } = rotular(a);
        return (
        <div
          key={`${a.evento.id}@${a.evento.iniciaEn}`}
          data-aviso-agenda={a.evento.id}
          style={{
            background: T.surface,
            border: `1px solid ${accent}`,
            borderLeft: `4px solid ${accent}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(3, 27, 79, 0.22)",
            padding: "11px 13px",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontSize: 12.5, color: accent, flex: 1 }}>
              {cuantoFalta(a.faltan)}
            </strong>
            <button
              type="button"
              onClick={() => onDescartar(a)}
              aria-label="Descartar el aviso"
              style={{ fontSize: 16, lineHeight: 1, color: T.faint, cursor: "pointer" }}
            >
              ×
            </button>
          </div>

          <p style={{ margin: "3px 0 0", fontSize: 13.5, color: T.ink, lineHeight: 1.35 }}>
            {titulo}
          </p>
          {detalle && (
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.4 }}>
              {detalle}
            </p>
          )}

          <button
            type="button"
            onClick={() => onAbrirFicha(a.evento.oportunidadId)}
            style={{
              marginTop: 8,
              height: 28,
              padding: "0 12px",
              fontSize: 12,
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
        );
      })}

      {/*
        El permiso, ofrecido una vez y sólo si nunca se decidió.

        Si ya dijo que no, esto no vuelve a aparecer: insistir con algo que el
        navegador además no deja volver a preguntar es puro ruido.
      */}
      {permiso === "default" && (
        <div
          style={{
            background: T.paper,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
            Para que el aviso te llegue aunque el CRM esté en otra pestaña, hace falta
            permitir las notificaciones del navegador.
          </p>
          <button
            type="button"
            onClick={() => void pedirPermisoDeAvisos().then((r) => setPermiso(r))}
            style={{
              marginTop: 7,
              height: 26,
              padding: "0 11px",
              fontSize: 11.5,
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
  );
}
