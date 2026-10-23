"use client";

import { useEffect, useState, type ReactNode } from "react";

import { filasDeLaBase, type FilaDeLaBase } from "@/app/bases-actions";
import { normalizarTexto } from "@/lib/duplicados";
import { T } from "@/lib/theme";

/**
 * Las filas del archivo de una base, todas, con el lead en que quedó cada una.
 *
 * Pedido el 23/10/2026: «Base de egresados» traía 285 filas y al desplegarla
 * se veían 232 nombres, porque la lista era de leads y las filas de una misma
 * persona se unifican en uno. Ahora se ven las 285, y al lado de cada una el
 * lead del CRM en que quedó; si varias cayeron en el mismo, se dice.
 *
 * Las bases subidas antes no guardaban sus filas: para ésas se muestra lo de
 * siempre (`antes`), la lista de leads.
 */
export function FilasDeLaBase({
  importacionId,
  onAbrir,
  antes,
}: {
  importacionId: number;
  onAbrir: (oportunidadId: number) => void;
  antes: ReactNode;
}) {
  const [filas, setFilas] = useState<FilaDeLaBase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    filasDeLaBase(importacionId)
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) setError(r.error);
        setFilas(r.filas);
      })
      .catch(() => vivo && setFilas([]));
    return () => {
      vivo = false;
    };
  }, [importacionId]);

  if (filas == null) {
    return <p style={{ margin: 0, padding: "14px 20px", fontSize: 12.5, color: T.faint }}>Cargando las filas del archivo…</p>;
  }
  if (filas.length === 0) {
    return (
      <>
        {error && <p style={{ margin: 0, padding: "10px 20px", fontSize: 12, color: T.warn }}>{error}</p>}
        {antes}
      </>
    );
  }

  // Cuántas filas cayeron en cada lead, para decir «misma persona que…».
  const porLead = new Map<number, number[]>();
  for (const f of filas) {
    if (f.oportunidadId == null) continue;
    porLead.set(f.oportunidadId, [...(porLead.get(f.oportunidadId) ?? []), f.linea]);
  }
  const importadas = filas.filter((f) => f.motivo == null).length;
  const sinImportar = filas.length - importadas;
  const personas = porLead.size;
  const repetidas = filas.filter((f) => f.oportunidadId != null).length - personas;

  return (
    <div data-filas-de-la-base>
      <p style={{ margin: 0, padding: "10px 20px", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>
        <strong style={{ color: T.ink }}>{filas.length}</strong> filas en el archivo ·{" "}
        <strong style={{ color: T.ink }}>{personas}</strong> {personas === 1 ? "persona" : "personas"} en el CRM
        {repetidas > 0 && <> · {repetidas} {repetidas === 1 ? "fila era" : "filas eran"} la misma persona que otra (se unificaron)</>}
        {sinImportar > 0 && <> · <span style={{ color: T.warn }}>{sinImportar} sin importar</span></>}
        . En Clientes, el filtro «Base» trae a las {personas} personas: un masivo le llega una vez a cada una.
      </p>
      <div style={{ maxHeight: 460, overflowY: "auto" }}>
        {filas.map((f, j) => {
          const hermanas = f.oportunidadId != null ? (porLead.get(f.oportunidadId) ?? []) : [];
          const primera = hermanas[0];
          const otroNombre =
            f.cliente && f.nombre && normalizarTexto(f.cliente) !== normalizarTexto(f.nombre) ? f.cliente : null;
          return (
            <div
              key={f.linea}
              data-fila-base={f.linea}
              className={f.oportunidadId != null ? "row" : undefined}
              onClick={f.oportunidadId != null ? () => onAbrir(f.oportunidadId as number) : undefined}
              style={{
                display: "grid",
                gridTemplateColumns: "48px 90px minmax(0, 1.2fr) minmax(0, 1fr)",
                alignItems: "center",
                gap: 12,
                padding: "8px 20px",
                cursor: f.oportunidadId != null ? "pointer" : "default",
                fontSize: 12.5,
                borderTop: j ? `1px solid ${T.border}` : "none",
              }}
            >
              <span className="mono" style={{ color: T.faint }}>{f.linea}</span>
              <span className="mono" style={{ color: T.muted }}>{f.codigo ?? "—"}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.nombre || <span style={{ color: T.faint }}>(sin nombre)</span>}
              </span>
              <span style={{ minWidth: 0, fontSize: 11.5, color: f.motivo ? T.warn : T.muted, overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.motivo
                  ? `No se importó: ${f.motivo}`
                  : f.oportunidadId == null
                    ? "El lead se eliminó después"
                    : [
                        otroNombre ? `En el CRM: ${otroNombre}` : null,
                        hermanas.length > 1 && primera !== f.linea ? `misma persona que la fila ${primera}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
