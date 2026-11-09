"use client";

/**
 * «Evolución»: los KPIs mes por mes, en colores. Como en la plantilla, cuatro
 * vistas —valor real, meta, estado y % de cumplimiento— con los meses en
 * columnas. Abajo, para comparar dos meses cualesquiera (por ejemplo, este
 * mes contra el mismo mes del año pasado).
 */

import { useMemo, useState } from "react";
import { indiceDe, kpisDelMes, type Estado, type KpiDelMes } from "@/lib/tablero/calculos";
import { mesAnterior, mismoMesAnioPasado, nombreDelMes } from "@/lib/tablero/semanas";
import { T } from "@/lib/theme";
import { Ancha, Semaforo, Titulo, fija, formatear, tabla, td, tdNum, th } from "@/components/modules/tablero/comun";
import type { Contexto } from "@/components/modules/tablero/TableroComercial";

const VISTAS = ["Valor real", "Meta", "Estado", "% de cumplimiento"] as const;
type Vista = (typeof VISTAS)[number];

const FONDO: Record<Estado, string> = { Cumple: "#E3F4E8", Cerca: "#FFF4D6", "No cumple": "#FBE4E2", "Sin meta": "transparent" };
const RESPONSABLE = { ventas: "Ventas", mk: "MK", compartido: "Compartido" } as const;

// Responsable y KPI quedan fijos al correr los meses hacia la derecha.
const ANCHO_RESPONSABLE = 96;
const COL_RESPONSABLE = { ...fija, boxShadow: "none", width: ANCHO_RESPONSABLE, minWidth: ANCHO_RESPONSABLE, maxWidth: ANCHO_RESPONSABLE, boxSizing: "border-box" as const };
const COL_KPI = { ...fija, left: ANCHO_RESPONSABLE, minWidth: 230 };

const corto = (mes: string) => {
  const n = nombreDelMes(mes);
  return `${n.slice(0, 3)} ${n.slice(-4)}`;
};

export function HojaEvolucion({ ctx }: { ctx: Contexto }) {
  const [vista, setVista] = useState<Vista>("Valor real");
  const porMes = useMemo(
    () => new Map(ctx.meses.map((m) => [m, kpisDelMes(ctx.resumenes.get(m)!, ctx.metas, ctx.resumenes.get(mesAnterior(m)))])),
    [ctx.meses, ctx.resumenes, ctx.metas],
  );
  const filas = porMes.get(ctx.mes)!;

  // Si se cambia «Mes a revisar» con esta hoja abierta, lo elegido puede
  // quedar fuera de los trece meses: vuelve a este mes contra el del año pasado.
  const [elegidoA, setA] = useState(ctx.mes);
  const [elegidoB, setB] = useState(mismoMesAnioPasado(ctx.mes));
  const a = ctx.meses.includes(elegidoA) ? elegidoA : ctx.mes;
  const b = ctx.meses.includes(elegidoB) ? elegidoB : ctx.meses[0];
  const kA = porMes.get(a) ?? [];
  const kB = porMes.get(b) ?? [];

  const celda = (k: KpiDelMes | undefined) => {
    if (!k) return "—";
    switch (vista) {
      case "Valor real": return formatear(k.real, k.kpi.formato);
      case "Meta": return formatear(k.meta, k.kpi.formato);
      case "Estado": return k.estado ? <Semaforo estado={k.estado} /> : "—";
      default: return formatear(k.cumplimiento, "porcentaje");
    }
  };

  const selector = (valor: string, cambiar: (m: string) => void, etiqueta: string) => (
    <select aria-label={etiqueta} value={valor} onChange={(e) => cambiar(e.target.value)} style={{ fontSize: 12.5, padding: "4px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: "#FFFDF4", textTransform: "capitalize" }}>
      {[...ctx.meses].reverse().map((m) => <option key={m} value={m}>{nombreDelMes(m)}</option>)}
    </select>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>Evolución de los KPIs mes a mes — {ctx.empresa} (se calcula sola)</h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 980 }}>
        Valor real, meta, estado y % de cumplimiento de cada KPI. Las metas de volumen se prorratean según las semanas ya
        cargadas. El color es el del semáforo de ese mes.
      </p>

      <div role="tablist" aria-label="Qué ver" style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {VISTAS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={v === vista}
            onClick={() => setVista(v)}
            style={{ fontSize: 12.5, padding: "5px 12px", borderRadius: 20, cursor: "pointer", border: `1px solid ${v === vista ? T.ink : T.border}`, background: v === vista ? T.ink : T.surface, color: v === vista ? "#fff" : T.ink }}
          >
            {v}
          </button>
        ))}
      </div>

      <Ancha>
        <table style={tabla} data-evolucion={vista}>
          <thead>
            <tr>
              <th style={{ ...th, ...COL_RESPONSABLE, zIndex: 2, background: th.background }}>Responsable</th>
              <th style={{ ...th, ...COL_KPI, zIndex: 2, background: th.background }}>KPI</th>
              <th style={th} />
              {ctx.meses.map((m) => <th key={m} style={{ ...th, textAlign: "right", textTransform: "capitalize", whiteSpace: "nowrap", background: m === ctx.mes ? "#FFF1C9" : th.background }}>{corto(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((k, i) => (
              <tr key={k.kpi.clave} data-kpi={k.kpi.clave}>
                <td style={{ ...td, ...COL_RESPONSABLE, color: T.muted }}>{RESPONSABLE[k.kpi.responsable]}</td>
                <td style={{ ...td, ...COL_KPI }}>{k.kpi.nombre}</td>
                <td style={{ ...td, color: T.faint, fontSize: 11 }}>{k.kpi.sentido === "min" ? "mín." : "máx."}</td>
                {ctx.meses.map((m) => {
                  const km = porMes.get(m)?.[i];
                  return (
                    <td key={m} data-mes={m} data-estado={km?.estado ?? undefined} style={{ ...tdNum, background: km?.estado ? FONDO[km.estado] : undefined }}>
                      {celda(km)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td style={{ ...td, ...COL_RESPONSABLE }} />
              <td style={{ ...td, ...COL_KPI, fontWeight: 700 }}>Índice de cumplimiento</td>
              <td style={td} />
              {ctx.meses.map((m) => <td key={m} style={{ ...tdNum, fontWeight: 700 }}>{formatear(indiceDe(porMes.get(m) ?? []), "porcentaje")}</td>)}
            </tr>
          </tbody>
        </table>
      </Ancha>

      <Titulo nota="Elige dos meses cualesquiera de los últimos trece. Para ver otros, cambia «Mes a revisar» arriba.">Comparar dos meses</Titulo>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, fontSize: 12.5, color: T.muted, flexWrap: "wrap" }}>
        {selector(a, setA, "Primer mes a comparar")} contra {selector(b, setB, "Segundo mes a comparar")}
      </div>
      <Ancha>
        <table style={tabla} data-comparar>
          <thead>
            <tr>
              <th style={th}>KPI</th>
              <th style={{ ...th, textAlign: "right", textTransform: "capitalize" }}>{nombreDelMes(a)}</th>
              <th style={th}>Estado</th>
              <th style={{ ...th, textAlign: "right", textTransform: "capitalize" }}>{nombreDelMes(b)}</th>
              <th style={th}>Estado</th>
              <th style={{ ...th, textAlign: "right" }}>Diferencia</th>
              <th style={th}>¿Mejoró?</th>
            </tr>
          </thead>
          <tbody>
            {kA.map((k, i) => {
              const otro = kB[i];
              const dif = k.real != null && otro?.real != null ? k.real - otro.real : null;
              const mejoro = dif == null || dif === 0 ? null : k.kpi.sentido === "min" ? dif > 0 : dif < 0;
              return (
                <tr key={k.kpi.clave}>
                  <td style={td}>{k.kpi.nombre}</td>
                  <td style={tdNum}>{formatear(k.real, k.kpi.formato)}</td>
                  <td style={td}><Semaforo estado={k.estado} /></td>
                  <td style={tdNum}>{formatear(otro?.real, k.kpi.formato)}</td>
                  <td style={td}><Semaforo estado={otro?.estado ?? null} /></td>
                  <td style={tdNum}>{dif == null ? "—" : `${dif > 0 ? "+" : ""}${formatear(dif, k.kpi.formato)}`}</td>
                  <td style={{ ...td, fontWeight: 600, color: mejoro == null ? T.faint : mejoro ? "#1E6B3A" : "#9E2F29" }}>
                    {mejoro == null ? "—" : mejoro ? "▲ Mejoró" : "▼ Empeoró"}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>Índice de cumplimiento</td>
              <td style={{ ...tdNum, fontWeight: 700 }}>{formatear(indiceDe(kA), "porcentaje")}</td>
              <td style={td} />
              <td style={{ ...tdNum, fontWeight: 700 }}>{formatear(indiceDe(kB), "porcentaje")}</td>
              <td style={td} colSpan={3} />
            </tr>
          </tbody>
        </table>
      </Ancha>
    </div>
  );
}
