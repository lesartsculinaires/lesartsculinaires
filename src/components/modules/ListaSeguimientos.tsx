"use client";

import { useState } from "react";

import {
  borrarSeguimiento,
  marcarSeguimientoHecho,
  posponerSeguimiento,
} from "@/app/seguimientos-actions";
import { TONO } from "@/components/ui/tonoRecordatorio";
import { fechaLarga } from "@/lib/format";
import {
  comoSeLeeSeguimiento,
  repeticionDe,
  type SeguimientoPendiente,
} from "@/lib/seguimientos";
import { T } from "@/lib/theme";

/**
 * Los seguimientos que salieron de la bitácora.
 *
 * Se muestran aparte de las reservas y no mezclados con ellas, aunque los dos
 * sean «cosas que hay que hacer». Son trabajos distintos: una reserva es un
 * cobro con plazo y un monto, y lo que se mira es cuánto falta para que se
 * libere el cupo; un seguimiento es una llamada que se prometió, y lo que se
 * mira es qué se había quedado. Juntarlos obligaría a leer cada fila para
 * saber cuál de las dos cosas es.
 */
export function ListaSeguimientos({
  lista,
  faltaMigracion,
  accent,
  onAbrirFicha,
  onRefrescar,
}: {
  lista: readonly SeguimientoPendiente[];
  faltaMigracion: boolean;
  accent: string;
  onAbrirFicha: (oportunidadId: number) => void;
  onRefrescar: () => void;
}) {
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (faltaMigracion) {
    return (
      <p
        style={{
          margin: 0,
          padding: "11px 14px",
          fontSize: 12.5,
          lineHeight: 1.5,
          borderRadius: 9,
          background: "#F6EEDC",
          color: "#7A5A12",
        }}
      >
        Para que las notas creen recordatorios falta correr{" "}
        <code>supabase/migrations/20260911120000_seguimientos.sql</code> en
        Supabase → SQL Editor. Mientras tanto se puede escribir «seguimiento de
        pago» en una nota, pero no queda anotado en ningún lado.
      </p>
    );
  }

  const hacer = async (
    id: number,
    accion: () => Promise<{ ok: boolean; error: string | null }>,
  ) => {
    setOcupado(id);
    setError(null);
    const r = await accion();
    setOcupado(null);
    if (!r.ok) setError(r.error);
    else onRefrescar();
  };

  if (lista.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
        No hay seguimientos anotados. Escribí «seguimiento de pago» o
        «seguimiento de cierre» en una nota de la ficha, con la fecha que quedó
        con el cliente, y aparece acá.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p style={{ margin: "0 0 10px", fontSize: 12.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {lista.map((p) => {
          const s = p.seguimiento;
          const tono = TONO[p.urgencia];
          const trabajando = ocupado === s.id;

          return (
            <div
              key={s.id}
              className="card"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                borderLeft: `4px solid ${tono.fuerte}`,
                background: T.surface,
              }}
            >
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => onAbrirFicha(s.oportunidadId)}
                    style={{
                      padding: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: T.ink,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {s.cliente}
                  </button>
                  <span
                    className="pill"
                    style={{
                      padding: "2px 8px",
                      borderRadius: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      background: T.paper,
                      color: T.muted,
                    }}
                  >
                    {s.tipo === "pago" ? "Pago" : "Cierre"}
                  </span>
                </div>

                {/*
                  Lo que decía la nota. Es lo que hace que el recordatorio se
                  llame según la información de la nota: sin esta línea, diez
                  «Seguimiento de pago» iguales no le dicen al asesor cuál es
                  cuál ni qué había quedado con cada cliente.
                */}
                {s.detalle && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 12.5,
                      color: T.ink,
                      lineHeight: 1.5,
                    }}
                  >
                    {s.detalle}
                  </p>
                )}

                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                  {s.codigo}
                  {s.producto && ` · ${s.producto}`}
                  {s.vendedor && ` · ${s.vendedor}`}
                  {s.telefono && ` · ${s.telefono}`}
                </p>
              </div>

              <div style={{ flex: "0 0 auto", textAlign: "right" }}>
                <span
                  className="pill"
                  style={{
                    display: "inline-block",
                    padding: "2px 9px",
                    borderRadius: 20,
                    fontSize: 10.5,
                    fontWeight: 700,
                    background: tono.suave,
                    color: tono.fuerte,
                  }}
                >
                  {comoSeLeeSeguimiento(p)}
                </span>
                <p className="mono" style={{ margin: "3px 0 0", fontSize: 11, color: T.faint }}>
                  {fechaLarga(s.proxima)} · {repeticionDe(s)}
                </p>
              </div>

              <div style={{ flex: "0 0 auto", display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => void hacer(s.id, () => marcarSeguimientoHecho(s.id))}
                  disabled={trabajando}
                  style={{ ...BOTON, background: accent, color: "#fff", border: "none" }}
                >
                  {/*
                    Un mensual no se cierra al atenderlo: salta al mes que
                    viene. El texto lo dice para que nadie crea que apretar acá
                    borra el acuerdo de llamar todos los 15.
                  */}
                  {s.diaDelMes == null ? "Ya lo hice" : "Hecho este mes"}
                </button>
                <button
                  type="button"
                  onClick={() => void hacer(s.id, () => posponerSeguimiento(s.id, 3))}
                  disabled={trabajando}
                  style={BOTON}
                >
                  En 3 días
                </button>
                <button
                  type="button"
                  onClick={() => void hacer(s.id, () => borrarSeguimiento(s.id))}
                  disabled={trabajando}
                  title="El CRM lee la nota solo, y a veces lee mal. La nota no se borra."
                  style={{ ...BOTON, color: T.muted }}
                >
                  Quitar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
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
