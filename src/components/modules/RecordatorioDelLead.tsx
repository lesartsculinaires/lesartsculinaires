"use client";

import { useState } from "react";

import { crearRecordatorio, marcarSeguimientoHecho } from "@/app/seguimientos-actions";
import { cuando } from "@/lib/format";
import { hoyEnSalvador, tituloDe, type SeguimientoPendiente } from "@/lib/seguimientos";
import { T } from "@/lib/theme";

/**
 * «Recordame este lead el día tal, por esto.»
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Un apartado que diga Recordatorio, con un cuadro de fecha para que el
 *  asesor elija y otro de texto del por qué esa fecha; y que esa fecha esté
 *  vinculada al módulo de recordatorios para notificarle.»
 *
 * ============================================================================
 * QUÉ ESTABA FALTANDO, EXACTAMENTE
 * ============================================================================
 *
 * El CRM ya agendaba recordatorios solo: leyendo «seguimiento de pago» en una
 * nota, contando siete días desde una recuperación, los meses de una
 * reactivación. Todos esos los DEDUCE. Lo que no había era poner una fecha
 * porque sí —«me dijo que lo llame el 12, que cobra el 10»—, que es el caso
 * más común de todos.
 *
 * No es una lista nueva: cae en la misma tabla que los otros, así que aparece
 * en el módulo de Recordatorios, suma al globito de la barra y entra en el
 * aviso del día sin que haya que escribir nada de eso otra vez.
 *
 * ============================================================================
 * LO QUE YA ESTÁ AGENDADO SE VE ACÁ ARRIBA
 * ============================================================================
 *
 * Y no es decorado. Sin eso, quien abre la ficha no sabe si ya dejó un
 * recordatorio, y la manera de averiguarlo sería irse al otro módulo y
 * volver. El resultado predecible es dejar tres para el mismo cliente.
 */
export function RecordatorioDelLead({
  oportunidadId,
  pendientes,
  accent,
  onCambio,
}: {
  oportunidadId: number;
  /** Los que ya están agendados para este lead, de cualquier tipo. */
  pendientes: readonly SeguimientoPendiente[];
  accent: string;
  /** Para que la pantalla vuelva a pedir los datos. */
  onCambio: () => void;
}) {
  const [fecha, setFecha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);

  const mios = pendientes.filter((p) => p.seguimiento.oportunidadId === oportunidadId);
  const listo = fecha !== "" && motivo.trim() !== "";

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const r = await crearRecordatorio(oportunidadId, fecha, motivo);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setFecha("");
    setMotivo("");
    onCambio();
  };

  const darPorHecho = async (id: number) => {
    setOcupado(id);
    setError(null);
    const r = await marcarSeguimientoHecho(id);
    setOcupado(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCambio();
  };

  return (
    <section style={{ marginBottom: 20 }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, color: T.muted }}>Recordatorio</p>

      {mios.length > 0 && (
        <ul style={{ margin: "0 0 9px", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
          {mios.map((p) => (
            <li
              key={p.seguimiento.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                padding: "8px 10px",
                borderRadius: 8,
                background: T.paper,
                border: `1px solid ${p.diasRestantes <= 0 ? T.warn : T.border}`,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="mono"
                  style={{ display: "block", fontSize: 11, color: p.diasRestantes <= 0 ? T.warn : accent }}
                >
                  {cuando(p.seguimiento.proxima)}
                  {p.diasRestantes < 0
                    ? " · atrasado"
                    : p.diasRestantes === 0
                      ? " · hoy"
                      : ` · en ${p.diasRestantes} ${p.diasRestantes === 1 ? "día" : "días"}`}
                </span>
                <span style={{ display: "block", fontSize: 12.5, color: T.ink, lineHeight: 1.4 }}>
                  {p.seguimiento.detalle || tituloDe(p.seguimiento.tipo)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void darPorHecho(p.seguimiento.id)}
                disabled={ocupado === p.seguimiento.id}
                style={{
                  flexShrink: 0,
                  fontSize: 11.5,
                  color: T.muted,
                  cursor: ocupado === p.seguimiento.id ? "wait" : "pointer",
                }}
              >
                {ocupado === p.seguimiento.id ? "…" : "Ya lo hice"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <input
          type="date"
          value={fecha}
          // Hoy como mínimo: un recordatorio para ayer no va a aparecer nunca
          // en la lista, y el asesor se queda esperándolo.
          min={hoyEnSalvador()}
          onChange={(e) => {
            setFecha(e.target.value);
            setError(null);
          }}
          aria-label="Fecha del recordatorio"
          className="mono"
          style={{
            width: 148,
            height: 32,
            padding: "0 8px",
            fontSize: 12.5,
            border: `1px solid ${T.border}`,
            borderRadius: 7,
            background: T.surface,
            color: T.ink,
          }}
        />
        <textarea
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            setError(null);
          }}
          rows={2}
          placeholder="¿Por qué esa fecha? Ej.: cobra el 10 y dijo que le marque después."
          aria-label="Por qué esa fecha"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "7px 9px",
            fontSize: 12.5,
            lineHeight: 1.4,
            resize: "vertical",
            border: `1px solid ${T.border}`,
            borderRadius: 7,
            background: T.surface,
            color: T.ink,
          }}
        />
      </div>

      {error && (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={!listo || guardando}
          style={{
            height: 28,
            padding: "0 13px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            background: listo ? accent : T.border,
            color: listo ? "#fff" : T.faint,
            cursor: guardando ? "wait" : listo ? "pointer" : "not-allowed",
          }}
        >
          {guardando ? "Guardando…" : "Agendar recordatorio"}
        </button>
        <span style={{ fontSize: 11, color: T.faint, lineHeight: 1.4 }}>
          Va a aparecer en Recordatorios ese día, y en el globito de la barra.
        </span>
      </div>
    </section>
  );
}
