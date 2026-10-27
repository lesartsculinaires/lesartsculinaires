"use client";

import { useState } from "react";

import { useCatalogo } from "@/lib/catalog";
import { cuando } from "@/lib/format";
import { T } from "@/lib/theme";
import {
  nombreDelCanalDelChat,
  resumirYaEnElCrm,
  type YaEnElCrm,
} from "@/lib/yaEnElCrm";

/** Cuántas personas se ven antes de «Ver todas». */
const DE_ENTRADA = 8;

/**
 * La gente de la base que ya está en el CRM: de quién es, por dónde entró y en
 * qué quedó la última conversación. Va en la ventana de subir la base, antes de
 * importar. Ver `@/lib/yaEnElCrm`.
 */
export function YaEstanEnElCrm({
  encontrados,
  cargando,
  error,
  nombresDelArchivo,
  accent,
}: {
  encontrados: readonly YaEnElCrm[] | null;
  cargando: boolean;
  error: string | null;
  /** Fila del archivo → el nombre como venía, para reconocerla. */
  nombresDelArchivo: ReadonlyMap<number, string>;
  accent: string;
}) {
  const cat = useCatalogo();
  const [todas, setTodas] = useState(false);

  const titulo = (
    <p
      className="mono"
      style={{
        margin: "0 0 9px",
        fontSize: 10,
        letterSpacing: "0.1em",
        color: T.faint,
        textTransform: "uppercase",
      }}
    >
      Ya están en el CRM
    </p>
  );

  if (cargando && !encontrados) {
    return (
      <div data-ya-estan style={{ marginBottom: 18 }}>
        {titulo}
        <p style={{ margin: 0, fontSize: 12.5, color: T.faint }}>
          Buscando quiénes de la base ya están en el CRM…
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div data-ya-estan style={{ marginBottom: 18 }}>
        {titulo}
        <p style={{ margin: 0, fontSize: 12.5, color: T.warn }}>
          No se pudo revisar quiénes ya están en el CRM: {error}. La importación funciona igual.
        </p>
      </div>
    );
  }
  if (!encontrados || encontrados.length === 0) return null;

  const r = resumirYaEnElCrm(encontrados);
  const nombre = (id: number | null, items: readonly { id: number; nombre: string }[]) =>
    id == null ? null : (items.find((x) => x.id === id)?.nombre ?? null);
  const vistas = todas ? encontrados : encontrados.slice(0, DE_ENTRADA);

  return (
    <div data-ya-estan style={{ marginBottom: 18 }}>
      {titulo}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface }}>
        <p
          style={{
            margin: 0,
            padding: "10px 13px",
            fontSize: 12.5,
            lineHeight: 1.5,
            color: T.muted,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <strong style={{ color: T.ink }}>
            {r.total} {r.total === 1 ? "persona de la base ya está" : "personas de la base ya están"}
          </strong>{" "}
          en el CRM: {r.conVendedor} con vendedor asignado · {r.sinVendedor} sin vendedor
          {r.deOtraAsesora > 0 && <> · {r.deOtraAsesora} de otra asesora</>}. Sus datos se
          unifican; nada de lo que ya tienen se pisa.
        </p>

        <div style={{ maxHeight: todas ? 360 : undefined, overflowY: todas ? "auto" : undefined }}>
          {vistas.map((y, i) => {
            const delArchivo = nombresDelArchivo.get(y.linea) ?? "";
            const conVendedor = y.leads.filter((l) => l.vendedorId != null);
            return (
              <div
                key={y.linea}
                data-ya-esta={y.linea}
                style={{
                  padding: "9px 13px",
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  borderTop: i ? `1px solid ${T.border}` : "none",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 11, color: T.faint }}>
                    #{y.linea}
                  </span>
                  <strong style={{ color: T.ink }}>{y.nombre || delArchivo || "—"}</strong>
                  {delArchivo && y.nombre && delArchivo.trim().toLowerCase() !== y.nombre.trim().toLowerCase() && (
                    <span style={{ fontSize: 11.5, color: T.faint }}>en el archivo: «{delArchivo}»</span>
                  )}
                </div>

                {y.deOtraAsesora ? (
                  <div style={{ color: "#7A5A12" }}>
                    Lo atiende otra asesora. Su vendedor y sus mensajes los ve quien tiene
                    «ver todo el equipo».
                  </div>
                ) : y.leads.length === 0 ? (
                  <div style={{ color: T.muted }}>Está en el CRM, todavía sin ningún lead.</div>
                ) : (
                  y.leads.map((l) => {
                    const vendedor = nombre(l.vendedorId, cat.vendedores);
                    const canal = nombre(l.canalId, cat.canales);
                    const programa = nombre(l.productoId, cat.productos);
                    const etapa = nombre(l.etapaId, cat.etapas);
                    return (
                      <div key={l.codigo} style={{ color: T.muted }}>
                        <span className="mono" style={{ fontSize: 11 }}>{l.codigo}</span>
                        {programa && <> · {programa}</>} ·{" "}
                        {vendedor ? (
                          <span>
                            Vendedor: <strong style={{ color: accent }}>{vendedor}</strong>
                          </span>
                        ) : (
                          <span style={{ color: "#7A5A12", fontWeight: 600 }}>Sin vendedor</span>
                        )}{" "}
                        · Entró por: <strong style={{ color: T.ink }}>{canal ?? "sin canal anotado"}</strong>
                        {etapa && <> · {etapa}</>}
                      </div>
                    );
                  })
                )}

                {/* El último mensaje importa sobre todo cuando ya tiene dueño:
                    dice si esa persona está en una conversación viva. */}
                {!y.deOtraAsesora && (
                  <div style={{ color: T.faint, fontSize: 12 }}>
                    {y.ultimo ? (
                      <>
                        Último mensaje {cuando(y.ultimo.en)} por{" "}
                        <strong style={{ color: T.muted }}>{nombreDelCanalDelChat(y.ultimo.canal)}</strong>
                        {y.ultimo.texto && (
                          <>
                            : <span style={{ color: T.ink }}>«{recortar(y.ultimo.texto)}»</span>
                          </>
                        )}
                      </>
                    ) : conVendedor.length > 0 ? (
                      "Todavía no tiene mensajes en el Inbox."
                    ) : (
                      "Sin mensajes en el Inbox."
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {encontrados.length > DE_ENTRADA && (
          <button
            type="button"
            onClick={() => setTodas((v) => !v)}
            style={{
              display: "block",
              width: "100%",
              padding: "9px 13px",
              fontSize: 12.5,
              color: accent,
              borderTop: `1px solid ${T.border}`,
              textAlign: "left",
            }}
          >
            {todas ? "Ver menos" : `Ver las ${encontrados.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

const recortar = (t: string) => (t.length > 140 ? `${t.slice(0, 140).trimEnd()}…` : t);
