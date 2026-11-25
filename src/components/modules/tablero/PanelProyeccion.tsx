"use client";

/**
 * El panel de la proyección de la meta, con sus datos: lo carga, deja cambiar
 * de mes y —a quien tiene permiso para las metas del Tablero, que es
 * Dirección— cambiar la meta del mes de esta marca.
 *
 * Va arriba en el Dashboard y como primer bloque del Tablero Comercial. El
 * dibujo está en `VistaProyeccion`, que también usa el sitio de Dirección.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { cargarProyeccion, guardarMeta } from "@/app/tablero-actions";
import { nombreDeMes, VistaProyeccion } from "@/components/modules/tablero/VistaProyeccion";
import { hoyEnSalvador } from "@/lib/seguimientos";
import { primeroDelMes, proyeccionDelMes, type MetaDelMes, type VentaDelDia } from "@/lib/tablero/proyeccion";

const mesMas = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
};

export function PanelProyeccion({
  accent,
  puedeCambiarMeta,
  completo,
  mes: mesFijo,
  onMetaCambiada,
}: {
  accent: string;
  /** Dirección: puede cambiar la meta del mes (permiso «tablero.metas»). */
  puedeCambiarMeta: boolean;
  /** Ve el Tablero: todas las asesoras con nombre. Si no, sólo la suya. */
  completo: boolean;
  /** Si viene, el panel sigue ese mes (el del Tablero) y no muestra flechas. */
  mes?: string;
  /** Después de cambiar la meta: el Tablero vuelve a cargar lo suyo. */
  onMetaCambiada?: () => void;
}) {
  const hoy = hoyEnSalvador();
  const [mesPropio, setMesPropio] = useState(primeroDelMes(hoy));
  const mes = mesFijo ?? mesPropio;
  const [datos, setDatos] = useState<{ ventas: VentaDelDia[]; metas: MetaDelMes[]; nombres: Map<number, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await cargarProyeccion(mes);
    setFaltaMigracion(r.faltaMigracion);
    setError(r.error);
    setDatos({ ventas: r.ventas, metas: r.metas, nombres: new Map(r.nombres) });
  }, [mes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const p = useMemo(
    () =>
      datos
        ? proyeccionDelMes({
            mes,
            hoy,
            ventas: datos.ventas,
            metas: datos.metas,
            nombres: datos.nombres,
            sinNombre: completo ? "Corporativo / sin asesora" : "Resto del equipo",
          })
        : null,
    [datos, mes, hoy, completo],
  );

  const guardar = async () => {
    const n = valor.trim() === "" ? null : Number(valor.replace(/[$,\s]/g, ""));
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setError("Escribí la meta en dólares, sin letras.");
      return;
    }
    setGuardando(true);
    const r = await guardarMeta(mes, "venta_nueva", n);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEditando(false);
    setError(null);
    await cargar();
    onMetaCambiada?.();
  };

  if (faltaMigracion) {
    return (
      <p style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>
        Falta instalar la proyección de la meta en la base (migración 20261206120000_tablero_proyeccion.sql).
      </p>
    );
  }
  if (!p) return <p style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>Cargando la proyección de la meta…</p>;

  const boton: React.CSSProperties = {
    height: 30, padding: "0 11px", fontSize: 12, borderRadius: 7, border: "1px solid var(--crm-border)",
    background: "var(--crm-surface)", color: "var(--crm-ink)", cursor: "pointer",
  };

  const cabecera = (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {!mesFijo && (
        <>
          <button type="button" aria-label="Mes anterior" onClick={() => setMesPropio((m) => mesMas(m, -1))} style={boton}>‹</button>
          <span style={{ fontSize: 12, color: "var(--crm-muted)", minWidth: 96, textAlign: "center" }}>{nombreDeMes(mes)}</span>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => setMesPropio((m) => mesMas(m, 1))}
            disabled={mes >= primeroDelMes(hoy)}
            style={{ ...boton, opacity: mes >= primeroDelMes(hoy) ? 0.4 : 1 }}
          >
            ›
          </button>
        </>
      )}
      {puedeCambiarMeta &&
        (editando ? (
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              data-meta-input
              autoFocus
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardar();
                if (e.key === "Escape") setEditando(false);
              }}
              placeholder="Meta en $"
              style={{ ...boton, width: 120, cursor: "text" }}
            />
            <button type="button" data-meta-guardar onClick={() => void guardar()} disabled={guardando} style={{ ...boton, background: accent, color: "#fff", border: "none" }}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditando(false)} style={boton}>Cancelar</button>
          </span>
        ) : (
          <button
            type="button"
            data-cambiar-meta
            onClick={() => {
              setValor(p.meta == null ? "" : String(p.meta));
              setEditando(true);
            }}
            style={boton}
          >
            {p.meta == null ? "Poner la meta del mes" : "Cambiar la meta"}
          </button>
        ))}
    </div>
  );

  return (
    <div style={{ marginBottom: 18 }}>
      <VistaProyeccion
        p={p}
        accent={accent}
        hoy={hoy}
        cabecera={cabecera}
        avisoParcial={completo ? null : "Ves tu nombre y el total del equipo; lo de cada compañera lo ve Dirección."}
      />
      {error && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--crm-warn)" }}>{error}</p>}
    </div>
  );
}
