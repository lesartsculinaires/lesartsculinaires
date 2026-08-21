"use client";

import { useEffect, useState } from "react";

import { posponerRecordatorio } from "@/app/recordatorios-actions";
import { TONO } from "@/components/ui/tonoRecordatorio";
import { money } from "@/lib/format";
import { comoSeLee, type Recordatorio } from "@/lib/recordatorios";
import { T } from "@/lib/theme";

/**
 * La ventana que interrumpe: reservas que vencen hoy o ya vencieron.
 *
 * INTERRUMPIR ES CARO, ASÍ QUE SE HACE POCO
 *
 * Una ventana que salta seguido enseña a cerrarla sin leer, y a partir de ahí
 * deja de servir para siempre. Por eso hay tres frenos:
 *
 * 1. Sólo por lo de hoy y lo vencido. Que algo venza en tres días se ve en el
 *    reloj de la cabecera, que no tapa nada.
 * 2. Una vez por día y por navegador. El CRM se refresca solo cada diez
 *    minutos y eso volvería a abrirla seis veces por hora.
 * 3. Cada aviso se puede posponer, y eso sí queda guardado en la base: vale
 *    para la computadora de la casa igual que para la de la oficina.
 *
 * QUÉ VE CADA QUIEN
 *
 * Lo suyo. No hay nada acá que lo decida: la lista viene de las oportunidades
 * que la base le mandó, y a un asesor le manda las que tiene asignadas. La
 * gerencia ve las del equipo por el mismo motivo, y por eso cada ficha dice de
 * quién es —para uno solo sería una obviedad, para el que ve todo es el dato
 * que le dice a quién reclamarle.
 */
export function AvisoReservas({
  lista,
  accent,
  onAbrirFicha,
  onCerrar,
}: {
  lista: readonly Recordatorio[];
  accent: string;
  onAbrirFicha: (oportunidadId: number) => void;
  onCerrar: () => void;
}) {
  /** Los que se pospusieron acá mismo, para sacarlos sin esperar al servidor. */
  const [ocultos, setOcultos] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const visibles = lista.filter((r) => !ocultos.includes(r.oportunidad.id));

  // Si se pospusieron todos, la ventana ya no tiene nada que decir. Va en un
  // efecto y no en el cuerpo porque avisarle al padre mientras se está
  // dibujando es cambiarle el estado en medio del dibujo, y React lo rechaza.
  const vacia = visibles.length === 0;
  useEffect(() => {
    if (vacia) onCerrar();
  }, [vacia, onCerrar]);

  if (vacia) return null;

  const posponer = async (id: number, dias: number) => {
    // Se oculta antes de que conteste el servidor: la persona ya decidió, y
    // dejarle la ficha ahí mientras viaja el pedido se lee como que el botón
    // no anduvo. Si falla, vuelve con el aviso puesto.
    setOcultos((o) => [...o, id]);
    const r = await posponerRecordatorio(id, dias);
    if (!r.ok) {
      setOcultos((o) => o.filter((x) => x !== id));
      setError(r.error);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reservas por cobrar"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
        background: "rgba(3, 27, 79, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "min(80vh, 640px)",
          display: "flex",
          flexDirection: "column",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
        }}
      >
        <div style={{ padding: "18px 20px 12px" }}>
          <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
            {visibles.length === 1
              ? "Una reserva por cobrar"
              : `${visibles.length} reservas por cobrar`}
          </h2>
          <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
            Dejaron anticipo y se les cumple el plazo de quince días. Pasado eso
            el cupo se libera.
          </p>
        </div>

        <div style={{ overflowY: "auto", padding: "0 20px" }}>
          {visibles.map((r) => {
            const tono = TONO[r.urgencia];
            const o = r.oportunidad;
            return (
              <div
                key={o.id}
                style={{
                  marginBottom: 9,
                  padding: "11px 12px",
                  borderRadius: 9,
                  border: `1px solid ${tono.fuerte}`,
                  background: tono.suave,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
                    {o.cliente}
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: 11.5, fontWeight: 700, color: tono.fuerte }}
                  >
                    {comoSeLee(r)}
                  </span>
                </div>

                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                  {o.producto} · Reserva {money(o.reserva ?? 0)} de{" "}
                  {money(o.valor ?? 0)} · {o.vendedor}
                  {o.telefono && ` · ${o.telefono}`}
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
                  <button
                    type="button"
                    onClick={() => onAbrirFicha(o.id)}
                    style={{ ...BOTON, background: accent, color: "#fff", border: "none" }}
                  >
                    Abrir la ficha
                  </button>
                  {/*
                    Tres plazos y no una casilla de «ya está».
                    Dar por cerrado un recordatorio a mano deja al CRM
                    diciendo que se cobró algo que nadie cobró; el aviso se
                    apaga solo cuando la venta queda registrada, que es el
                    único hecho que de verdad lo termina.
                  */}
                  <button type="button" onClick={() => void posponer(o.id, 1)} style={BOTON}>
                    Mañana
                  </button>
                  <button type="button" onClick={() => void posponer(o.id, 3)} style={BOTON}>
                    En 3 días
                  </button>
                  <button type="button" onClick={() => void posponer(o.id, 7)} style={BOTON}>
                    En una semana
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <p style={{ margin: "0 20px", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            padding: "12px 20px 16px",
          }}
        >
          <span style={{ fontSize: 11, color: T.faint, lineHeight: 1.45 }}>
            Vuelve a aparecer mañana. Están siempre en Recordatorios.
          </span>
          <button type="button" onClick={onCerrar} style={{ ...BOTON, flexShrink: 0 }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const BOTON: React.CSSProperties = {
  height: 30,
  padding: "0 11px",
  fontSize: 12,
  borderRadius: 7,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
  cursor: "pointer",
};
