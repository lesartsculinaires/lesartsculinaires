"use client";

import { useCatalogo } from "@/lib/catalog";
import { leadCount, money } from "@/lib/format";
import { T, soft } from "@/lib/theme";
import type { Oportunidad, OportunidadPatch } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  accent: string;
  drag: number | null;
  over: number | null;
  onSetDrag: (id: number | null) => void;
  onSetOver: (etapaId: number | null) => void;
  onEditar: (
    id: number,
    patch: OportunidadPatch,
    display: Partial<Oportunidad>,
  ) => void;
  onOpen: (id: number) => void;
}

export function Pipeline({
  oportunidades,
  accent,
  drag,
  over,
  onSetDrag,
  onSetOver,
  onEditar,
  onOpen,
}: Props) {
  const { etapas } = useCatalogo();

  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        // El mínimo baja de 200 a 164 desde que el embudo tiene seis etapas:
        // con 200 el tablero se pasaba del ancho de una laptop de 1366 y había
        // que desplazarlo de costado para ver el cierre, que es justo la
        // columna que más se mira. El tablero sigue pudiendo desplazarse, pero
        // ahora sólo en pantallas de verdad chicas.
        gridAutoColumns: "minmax(164px, 1fr)",
        gap: 10,
        alignItems: "start",
        overflowX: "auto",
        paddingBottom: 6,
      }}
    >
      {etapas.map((etapa) => {
        const enEtapa = oportunidades.filter((o) => o.etapaId === etapa.id);
        const isOver = over === etapa.id;
        // The last stage in the funnel is the close.
        const esCierre = etapa.orden === Math.max(...etapas.map((e) => e.orden));
        const tone = esCierre ? "#2F6B4F" : accent;

        return (
          <div key={etapa.id}>
            <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${tone}` }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>
                {etapa.nombre}
              </span>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: T.muted }}>
                  {leadCount(enEtapa.length)}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: enEtapa.length ? T.ink : T.faint,
                  }}
                >
                  {money(enEtapa.reduce((a, o) => a + (o.valor ?? 0), 0) || null)}
                </span>
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (over !== etapa.id) onSetOver(etapa.id);
              }}
              onDragLeave={() => {
                if (over === etapa.id) onSetOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const raw = drag ?? Number(e.dataTransfer.getData("text/plain"));
                if (raw) {
                  onEditar(
                    raw,
                    { etapa_id: etapa.id },
                    { etapa: etapa.nombre, etapaId: etapa.id, etapaOrden: etapa.orden },
                  );
                }
                onSetDrag(null);
                onSetOver(null);
              }}
              style={{
                minHeight: 120,
                maxHeight: "62vh",
                overflowY: "auto",
                borderRadius: 9,
                padding: 5,
                margin: -5,
                background: isOver ? soft(accent) : "transparent",
                outline: isOver ? `1px dashed ${accent}` : "1px dashed transparent",
              }}
            >
              {enEtapa.map((o) => (
                <div
                  key={o.id}
                  className="card"
                  draggable
                  onClick={() => onOpen(o.id)}
                  onDragStart={(e) => {
                    // `dataTransfer` está siempre en un arrastre de verdad,
                    // pero no en un `dragstart` disparado por código —una
                    // extensión, una prueba—, y ahí esto tiraba una excepción
                    // que se llevaba puesta la pantalla entera.
                    if (e.dataTransfer) {
                      e.dataTransfer.effectAllowed = "move";
                      try {
                        e.dataTransfer.setData("text/plain", String(o.id));
                      } catch {
                        // Algunos navegadores no dejan `setData` fuera de un
                        // gesto del usuario; el id que queda en el estado
                        // cubre ese caso.
                      }
                    }
                    onSetDrag(o.id);
                  }}
                  onDragEnd={() => {
                    onSetDrag(null);
                    onSetOver(null);
                  }}
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: 11,
                    marginBottom: 8,
                    cursor: "grab",
                    opacity: drag === o.id ? 0.4 : 1,
                  }}
                >
                  <p style={{ margin: "0 0 3px", fontSize: 12.5 }}>{o.cliente}</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>{o.producto}</p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <span className="mono" style={{ fontSize: 10.5, color: T.faint }}>
                      {o.vendedor}
                    </span>
                    <span className="mono" style={{ fontSize: 12 }}>{money(o.valor)}</span>
                  </div>
                </div>
              ))}

              {enEtapa.length === 0 && (
                <p
                  style={{
                    margin: 0,
                    padding: "26px 8px",
                    textAlign: "center",
                    fontSize: 12,
                    color: isOver ? accent : T.faint,
                  }}
                >
                  Soltá una tarjeta acá
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
