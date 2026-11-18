"use client";

import { useCallback, useEffect, useState } from "react";

import {
  cerrarSesionDeDispositivo,
  sesionesAbiertas,
  type SesionDeDispositivo,
} from "@/app/sesiones-actions";
import { useMarca } from "@/components/marca/MarcaContexto";
import { T } from "@/lib/theme";

const ICONO = { computadora: "💻", celular: "📱", tablet: "📲" } as const;

const haceCuanto = (iso: string): string => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 2) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
};

/**
 * Las sesiones abiertas en crm-peñagroup, para administración (12/11/2026).
 *
 * Una fila por dispositivo, con el botón para cerrarla: esa pantalla vuelve al
 * inicio de sesión en su próxima comprobación (al minuto, o al volver a la
 * pestaña). Las de la marca en uso: cada marca lleva su cuenta en su base.
 */
export function SesionesAbiertas({ nombres }: { nombres: ReadonlyMap<string, string> }) {
  const marca = useMarca();
  const [sesiones, setSesiones] = useState<SesionDeDispositivo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await sesionesAbiertas();
    setSesiones(r.sesiones);
    setError(r.error);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cerrar = async (id: string) => {
    setCerrando(id);
    const r = await cerrarSesionDeDispositivo(id);
    setCerrando(null);
    if (!r.ok) setError(r.error);
    await cargar();
  };

  return (
    <section
      data-sesiones-abiertas
      style={{ marginTop: 22, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}
    >
      <h3 className="dsp" style={{ margin: 0, fontSize: 18 }}>
        Sesiones abiertas en {marca.nombre}
      </h3>
      <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
        Una por dispositivo. Al pasar el límite del rol se cierra sola la más vieja de ese tipo; desde acá se puede
        cerrar cualquiera a mano.
      </p>
      {error && <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#B3261E" }}>{error}</p>}
      {sesiones == null ? (
        <p style={{ margin: 0, fontSize: 13, color: T.faint }}>Cargando…</p>
      ) : sesiones.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: T.faint }}>No hay sesiones abiertas.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: T.muted, fontSize: 12 }}>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Persona</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Dispositivo</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Desde</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Última vez</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sesiones.map((s) => (
                <tr key={s.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: "8px" }}>{nombres.get(s.usuarioId) ?? "—"}</td>
                  <td style={{ padding: "8px" }}>
                    <span aria-hidden>{ICONO[s.tipo]}</span> {s.tipo}
                    {s.agente && <span style={{ color: T.faint }}> · {s.agente}</span>}
                  </td>
                  <td style={{ padding: "8px", color: T.muted }}>{haceCuanto(s.creadaEn)}</td>
                  <td style={{ padding: "8px", color: T.muted }}>{haceCuanto(s.vistaEn)}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>
                    <button
                      type="button"
                      disabled={cerrando === s.id}
                      onClick={() => void cerrar(s.id)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: `1px solid ${T.border}`,
                        fontSize: 12,
                        color: "#B3261E",
                      }}
                    >
                      {cerrando === s.id ? "Cerrando…" : "Cerrar sesión"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
