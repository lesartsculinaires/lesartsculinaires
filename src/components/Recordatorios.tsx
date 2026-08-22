"use client";

import { useEffect, useRef, useState } from "react";

import { TONO } from "@/components/ui/tonoRecordatorio";
import { money } from "@/lib/format";
import { comoSeLee, porAtender, type Recordatorio } from "@/lib/recordatorios";
import {
  comoSeLeeSeguimiento,
  seguimientosPorAtender,
  type SeguimientoPendiente,
} from "@/lib/seguimientos";
import { T } from "@/lib/theme";

/**
 * El reloj de la cabecera.
 *
 * Va al lado de la campana y hace algo distinto: la campana cuenta lo que ya
 * pasó, el reloj lo que está por pasar. Son dos preguntas diferentes —«¿qué
 * hizo el equipo?» contra «¿a quién tengo que llamar hoy?»— y meterlas en el
 * mismo panel obligaría a leer avisos de ayer para encontrar el de mañana.
 *
 * El número cuenta los vencidos, los de hoy y los que vencen pronto. Los que
 * todavía tienen plazo no: si contara todos, un asesor con veinte reservas
 * sanas vería un veinte permanente y el número dejaría de significar nada.
 *
 * Suma las dos cosas que hay que hacer: las reservas por cobrar y los
 * seguimientos que salieron de las notas. Es a propósito que sean un solo
 * número: la pregunta del asesor a las nueve de la mañana no es «¿cuántas
 * reservas?» sino «¿a quién llamo hoy?», y dos globitos al lado le harían
 * sumar de cabeza para contestársela.
 */
export function Recordatorios({
  lista,
  seguimientos,
  accent,
  onAbrirFicha,
  onVerTodos,
}: {
  lista: readonly Recordatorio[];
  seguimientos: readonly SeguimientoPendiente[];
  accent: string;
  onAbrirFicha: (oportunidadId: number) => void;
  onVerTodos: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);

  const urgentes = porAtender(lista);
  const llamadas = seguimientosPorAtender(seguimientos);
  const cuantos = urgentes.length + llamadas.length;

  /** Cerrar al hacer clic afuera y con Escape, como el panel de la campana. */
  useEffect(() => {
    if (!abierto) return;

    const afuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };

    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  // El punto rojo sólo por lo que ya se pasó o vence hoy. Que haya algo para
  // la semana que viene no amerita una alarma en la cabecera.
  const deHoy = (u: string) => u === "vencido" || u === "hoy";
  const apura =
    urgentes.some((r) => deHoy(r.urgencia)) || llamadas.some((p) => deHoy(p.urgencia));

  return (
    <div ref={caja} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={
          cuantos > 0 ? `Recordatorios, ${cuantos} por atender` : "Recordatorios"
        }
        aria-expanded={abierto}
        style={{
          position: "relative",
          width: 34,
          height: 34,
          display: "grid",
          placeItems: "center",
          borderRadius: 8,
          border: `1px solid ${abierto ? accent : T.border}`,
          background: abierto ? T.paper : T.surface,
          cursor: "pointer",
        }}
      >
        <Reloj color={abierto ? accent : T.muted} />
        {cuantos > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              padding: "0 4px",
              display: "grid",
              placeItems: "center",
              borderRadius: 9,
              background: apura ? TONO.vencido.fuerte : TONO.pronto.fuerte,
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {cuantos > 99 ? "99+" : cuantos}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Recordatorios"
          style={{
            position: "absolute",
            top: 42,
            right: 0,
            zIndex: 60,
            width: 380,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: 460,
            display: "flex",
            flexDirection: "column",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            boxShadow: "0 16px 44px rgba(3, 27, 79, 0.2)",
          }}
        >
          <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${T.border}` }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.ink }}>
              A quién llamar
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.45 }}>
              Reservas por cobrar y seguimientos anotados en las fichas.
            </p>
          </div>

          <div style={{ overflowY: "auto" }}>
            {cuantos === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: "16px 14px",
                  fontSize: 12,
                  color: T.muted,
                  lineHeight: 1.5,
                }}
              >
                Nada por cobrar ni por llamar en los próximos días.
              </p>
            ) : (
              urgentes.map((r, i) => {
                const tono = TONO[r.urgencia];
                return (
                  <div
                    key={r.oportunidad.id}
                    className="row"
                    onClick={() => {
                      onAbrirFicha(r.oportunidad.id);
                      setAbierto(false);
                    }}
                    style={{
                      padding: "9px 14px",
                      borderTop: i ? `1px solid ${T.border}` : "none",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        fontSize: 12.5,
                        color: T.ink,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{r.oportunidad.cliente}</span>
                      <span className="mono" style={{ color: T.muted, flexShrink: 0 }}>
                        {money(r.oportunidad.reserva ?? 0)}
                      </span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: tono.fuerte }}>
                      {comoSeLee(r)} · {r.oportunidad.vendedor}
                    </div>
                  </div>
                );
              })
            )}

            {/*
              Las llamadas prometidas, debajo de las reservas y con la misma
              forma. Se distinguen por lo que dice cada fila —una lleva monto,
              la otra lleva lo que quedó anotado— y no por un separador: en un
              panel de 380 píxeles, un título en el medio se come el lugar de
              dos recordatorios.
            */}
            {llamadas.map((p, i) => {
              const s = p.seguimiento;
              const tono = TONO[p.urgencia];
              return (
                <div
                  key={`s${s.id}`}
                  className="row"
                  onClick={() => {
                    onAbrirFicha(s.oportunidadId);
                    setAbierto(false);
                  }}
                  style={{
                    padding: "9px 14px",
                    borderTop: i || urgentes.length ? `1px solid ${T.border}` : "none",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      fontSize: 12.5,
                      color: T.ink,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{s.cliente}</span>
                    <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>
                      {s.tipo === "pago" ? "Pago" : "Cierre"}
                    </span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: tono.fuerte }}>
                    {comoSeLeeSeguimiento(p)}
                    {s.vendedor && ` · ${s.vendedor}`}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="nav"
            onClick={() => {
              onVerTodos();
              setAbierto(false);
            }}
            style={{
              padding: "10px 14px",
              borderTop: `1px solid ${T.border}`,
              fontSize: 12.5,
              color: accent,
              textAlign: "left",
            }}
          >
            Ver todos los recordatorios
          </button>
        </div>
      )}
    </div>
  );
}

function Reloj({ color }: { color: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth="1.7" />
      <path
        d="M12 7.3V12l3.1 1.9"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
