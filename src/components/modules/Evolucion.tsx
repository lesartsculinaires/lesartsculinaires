"use client";

import { useMemo, useState } from "react";

import { leadCount, money, moneyShort } from "@/lib/format";
import {
  porAnio,
  porDia,
  porMes,
  sumar,
  variacion,
  type ResumenPeriodo,
} from "@/lib/periodos";
import { T, openTone, softer } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  accent: string;
}

type Vista = "mes" | "comparativa" | "anual";

const VISTAS: readonly { id: Vista; label: string; hint: string }[] = [
  { id: "mes", label: "Por mes", hint: "detalle día a día de un mes" },
  { id: "comparativa", label: "Comparativa", hint: "todos los meses, uno al lado del otro" },
  { id: "anual", label: "Anual", hint: "totales por año y su composición mensual" },
];

/** "+12%" / "−4%" / "—" when there is no previous period to compare to. */
function Variacion({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span
        style={{ fontSize: 11, color: T.faint }}
        title="El período anterior está en cero o no existe: no hay porcentaje que calcular"
      >
        sin comparación
      </span>
    );
  }
  const sube = pct >= 0;
  const redondeado = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return (
    <span
      className="mono"
      style={{ fontSize: 11.5, color: sube ? "#2F6B4F" : "#B85042" }}
    >
      {sube ? "▲" : "▼"} {sube ? "+" : "−"}
      {Math.abs(redondeado)}%
    </span>
  );
}

export function Evolucion({ oportunidades, accent }: Props) {
  const open = openTone(accent);

  const meses = useMemo(() => porMes(oportunidades), [oportunidades]);
  const anios = useMemo(() => porAnio(oportunidades), [oportunidades]);

  const [vista, setVista] = useState<Vista>("mes");
  // Defaults to the most recent month with data.
  const [mesSel, setMesSel] = useState<string | null>(null);

  const claveActual = mesSel ?? meses[meses.length - 1]?.clave ?? null;
  const idx = meses.findIndex((m) => m.clave === claveActual);
  const mes = idx >= 0 ? meses[idx] : null;
  const mesPrevio = idx > 0 ? meses[idx - 1] : null;

  const dias = useMemo(
    () => (claveActual ? porDia(oportunidades, claveActual) : []),
    [oportunidades, claveActual],
  );

  if (meses.length === 0) {
    return (
      <section
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: 18,
          marginBottom: 14,
        }}
      >
        <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
          Evolución
        </h3>
        <p style={{ margin: 0, fontSize: 12.5, color: T.faint }}>
          No hay oportunidades con fecha de registro para graficar.
        </p>
      </section>
    );
  }

  const tabStyle = (v: Vista) => ({
    padding: "6px 13px",
    fontSize: 12.5,
    borderRadius: 7,
    fontWeight: vista === v ? 500 : 400,
    background: vista === v ? accent : "transparent",
    color: vista === v ? "#fff" : T.muted,
  });

  return (
    <section
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: 18,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
            Evolución
          </h3>
          <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
            {VISTAS.find((v) => v.id === vista)?.hint} · agrupado por mes de
            registro del lead
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: 4,
            borderRadius: 9,
            background: T.paper,
            flexShrink: 0,
          }}
        >
          {VISTAS.map((v) => (
            <button key={v.id} type="button" onClick={() => setVista(v.id)} style={tabStyle(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {vista === "mes" && mes && (
        <VistaMes
          mes={mes}
          previo={mesPrevio}
          meses={meses}
          dias={dias}
          accent={accent}
          onSelect={setMesSel}
        />
      )}

      {vista === "comparativa" && (
        <VistaComparativa meses={meses} accent={accent} open={open} />
      )}

      {vista === "anual" && <VistaAnual anios={anios} meses={meses} accent={accent} open={open} />}
    </section>
  );
}

// ------------------------------------------------------------------ por mes

function VistaMes({
  mes,
  previo,
  meses,
  dias,
  accent,
  onSelect,
}: {
  mes: ResumenPeriodo;
  previo: ResumenPeriodo | null;
  meses: ResumenPeriodo[];
  dias: ReturnType<typeof porDia>;
  accent: string;
  onSelect: (clave: string) => void;
}) {
  const maxDia = Math.max(...dias.map((d) => d.leads), 1);

  const kpis = [
    { label: "Leads registrados", valor: String(mes.leads), pct: previo ? variacion(mes.leads, previo.leads) : null },
    { label: "Ganados", valor: String(mes.ganados), pct: previo ? variacion(mes.ganados, previo.ganados) : null },
    { label: "Venta cerrada", valor: money(mes.cerrado || null), pct: previo ? variacion(mes.cerrado, previo.cerrado) : null },
    { label: "Pipeline abierto", valor: money(mes.pipeline || null), pct: previo ? variacion(mes.pipeline, previo.pipeline) : null },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {meses.map((m) => (
          <button
            key={m.clave}
            type="button"
            onClick={() => onSelect(m.clave)}
            style={{
              padding: "5px 11px",
              fontSize: 12,
              borderRadius: 6,
              border: `1px solid ${m.clave === mes.clave ? accent : T.border}`,
              background: m.clave === mes.clave ? softer(accent) : "transparent",
              color: m.clave === mes.clave ? accent : T.muted,
            }}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 9,
          marginBottom: 20,
        }}
      >
        {kpis.map((k) => (
          <div key={k.label} style={{ background: T.paper, borderRadius: 8, padding: "12px 14px" }}>
            <p style={{ margin: "0 0 5px", fontSize: 11.5, color: T.muted }}>{k.label}</p>
            <p className="mono dsp" style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 500 }}>
              {k.valor}
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <Variacion pct={k.pct} />
              {previo && k.pct != null && (
                <span style={{ fontSize: 10.5, color: T.faint }}>vs {previo.etiqueta}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p
        className="mono"
        style={{
          margin: "0 0 10px",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: T.faint,
          textTransform: "uppercase",
        }}
      >
        Leads por día — {mes.etiquetaLarga}
      </p>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 130 }}>
        {dias.map((d) => (
          <div
            key={d.dia}
            title={`${d.dia} · ${leadCount(d.leads)}${d.cerrado ? ` · ${money(d.cerrado)} cerrado` : ""}`}
            style={{
              flex: 1,
              minWidth: 0,
              height: `${Math.max(2, (d.leads / maxDia) * 100)}%`,
              background: d.cerrado > 0 ? "#2F6B4F" : d.leads > 0 ? accent : T.border,
              borderRadius: "2px 2px 0 0",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
        {dias.map((d) => (
          <span
            key={d.dia}
            className="mono"
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              fontSize: 8.5,
              color: T.faint,
              overflow: "hidden",
            }}
          >
            {d.dia % 5 === 0 || d.dia === 1 ? d.dia : ""}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        <Leyenda color={accent} texto="Leads registrados" />
        <Leyenda color="#2F6B4F" texto="Día con venta cerrada" />
        <span style={{ fontSize: 11, color: T.faint }}>
          Pasá el cursor sobre una barra para ver el detalle del día.
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- comparativa

function VistaComparativa({
  meses,
  accent,
  open,
}: {
  meses: ResumenPeriodo[];
  accent: string;
  open: string;
}) {
  const max = Math.max(...meses.map((m) => Math.max(m.cerrado, m.pipeline)), 1);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))`,
          gap: 10,
          alignItems: "end",
          height: 170,
        }}
      >
        {meses.map((m) => (
          <div key={m.clave} style={{ minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, height: "100%" }}>
              <div
                title={`${m.etiquetaLarga} · ${money(m.cerrado || null)} cerrado`}
                style={{
                  width: "38%",
                  maxWidth: 46,
                  height: `${Math.max(2, (m.cerrado / max) * 100)}%`,
                  background: accent,
                  borderRadius: "3px 3px 0 0",
                }}
              />
              <div
                title={`${m.etiquetaLarga} · ${money(m.pipeline || null)} en pipeline`}
                style={{
                  width: "38%",
                  maxWidth: 46,
                  height: `${Math.max(2, (m.pipeline / max) * 100)}%`,
                  background: open,
                  borderRadius: "3px 3px 0 0",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))`,
          gap: 10,
          marginTop: 8,
          marginBottom: 16,
        }}
      >
        {meses.map((m) => (
          <span key={m.clave} style={{ fontSize: 11, textAlign: "center", color: T.muted }}>
            {m.etiqueta}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <Leyenda color={accent} texto="Venta cerrada" />
        <Leyenda color={open} texto="Pipeline abierto" />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
          <thead>
            <tr>
              {["Mes", "Leads", "Ganados", "Venta cerrada", "Pipeline", "Cerrada vs mes anterior"].map(
                (h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i === 0 ? "left" : "right",
                      padding: "8px 10px",
                      fontWeight: 500,
                      fontSize: 11,
                      color: T.muted,
                      borderBottom: `1px solid ${T.border}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {meses.map((m, i) => (
              <tr key={m.clave} style={{ borderTop: i ? `1px solid ${T.border}` : "none" }}>
                <td style={{ padding: "9px 10px" }}>{m.etiquetaLarga}</td>
                <td className="mono" style={{ padding: "9px 10px", textAlign: "right" }}>{m.leads}</td>
                <td className="mono" style={{ padding: "9px 10px", textAlign: "right" }}>{m.ganados}</td>
                <td className="mono" style={{ padding: "9px 10px", textAlign: "right" }}>
                  {money(m.cerrado || null)}
                </td>
                <td className="mono" style={{ padding: "9px 10px", textAlign: "right", color: T.muted }}>
                  {money(m.pipeline || null)}
                </td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}>
                  <Variacion pct={i > 0 ? variacion(m.cerrado, meses[i - 1].cerrado) : null} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${T.border}`, background: T.paper }}>
              <td style={{ padding: "9px 10px", fontWeight: 500 }}>Total</td>
              <td className="mono" style={{ padding: "9px 10px", textAlign: "right" }}>
                {sumar(meses, "leads")}
              </td>
              <td className="mono" style={{ padding: "9px 10px", textAlign: "right" }}>
                {sumar(meses, "ganados")}
              </td>
              <td className="mono" style={{ padding: "9px 10px", textAlign: "right" }}>
                {money(sumar(meses, "cerrado") || null)}
              </td>
              <td className="mono" style={{ padding: "9px 10px", textAlign: "right", color: T.muted }}>
                {money(sumar(meses, "pipeline") || null)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- anual

function VistaAnual({
  anios,
  meses,
  accent,
  open,
}: {
  anios: ResumenPeriodo[];
  meses: ResumenPeriodo[];
  accent: string;
  open: string;
}) {
  const max = Math.max(...anios.map((a) => a.cerrado + a.pipeline), 1);

  return (
    <div>
      {anios.length === 1 && (
        <p
          style={{
            margin: "0 0 16px",
            padding: "9px 13px",
            fontSize: 12,
            borderRadius: 8,
            background: "#F6EEDC",
            color: "#7A5A12",
          }}
        >
          Los datos cargados cubren un solo año, así que todavía no hay contra
          qué comparar. La vista se llena sola cuando el CRM acumule un segundo
          año; mientras tanto muestra la composición mes a mes de {anios[0].clave}.
        </p>
      )}

      <div style={{ display: "flex", gap: 18, alignItems: "flex-end", height: 180, marginBottom: 8 }}>
        {anios.map((a) => (
          <div
            key={a.clave}
            style={{
              flex: 1,
              maxWidth: 140,
              minWidth: 0,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            <span className="mono" style={{ fontSize: 11, textAlign: "center", marginBottom: 5, color: T.ink }}>
              {a.cerrado ? moneyShort(a.cerrado) : ""}
            </span>
            <div
              title={`${a.etiquetaLarga} · ${money(a.cerrado || null)} cerrado`}
              style={{
                height: `${Math.max(2, (a.cerrado / max) * 100)}%`,
                background: accent,
                borderRadius: "3px 3px 0 0",
              }}
            />
            <div
              title={`${a.etiquetaLarga} · ${money(a.pipeline || null)} en pipeline`}
              style={{ height: `${Math.max(1, (a.pipeline / max) * 100)}%`, background: open }}
            />
            <span style={{ fontSize: 12, textAlign: "center", marginTop: 7, color: T.muted }}>
              {a.clave}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, margin: "16px 0", flexWrap: "wrap" }}>
        <Leyenda color={accent} texto="Venta cerrada" />
        <Leyenda color={open} texto="Pipeline abierto" />
      </div>

      <div style={{ overflowX: "auto", marginBottom: 22 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
          <thead>
            <tr>
              {["Año", "Leads", "Ganados", "Tasa de cierre", "Venta cerrada", "Interanual"].map(
                (h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i === 0 ? "left" : "right",
                      padding: "8px 10px",
                      fontWeight: 500,
                      fontSize: 11,
                      color: T.muted,
                      borderBottom: `1px solid ${T.border}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {anios.map((a, i) => (
              <tr key={a.clave} style={{ borderTop: i ? `1px solid ${T.border}` : "none" }}>
                <td style={{ padding: "9px 10px" }}>{a.clave}</td>
                <td className="mono" style={{ padding: "9px 10px", textAlign: "right" }}>{a.leads}</td>
                <td className="mono" style={{ padding: "9px 10px", textAlign: "right" }}>{a.ganados}</td>
                <td className="mono" style={{ padding: "9px 10px", textAlign: "right", color: T.muted }}>
                  {a.leads ? `${Math.round((a.ganados / a.leads) * 100)}%` : "—"}
                </td>
                <td className="mono" style={{ padding: "9px 10px", textAlign: "right" }}>
                  {money(a.cerrado || null)}
                </td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}>
                  <Variacion pct={i > 0 ? variacion(a.cerrado, anios[i - 1].cerrado) : null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {anios.map((a) => {
        const delAnio = meses.filter((m) => m.clave.startsWith(a.clave));
        const maxMes = Math.max(...delAnio.map((m) => m.leads), 1);
        return (
          <div key={a.clave} style={{ marginBottom: 18 }}>
            <p
              className="mono"
              style={{
                margin: "0 0 10px",
                fontSize: 10,
                letterSpacing: "0.1em",
                color: T.faint,
                textTransform: "uppercase",
              }}
            >
              Composición de {a.clave} — {leadCount(a.leads)} en {delAnio.length}{" "}
              {delAnio.length === 1 ? "mes" : "meses"}
            </p>
            {delAnio.map((m) => (
              <div
                key={m.clave}
                style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}
              >
                <span style={{ flex: "0 0 66px", fontSize: 11.5, color: T.muted }}>
                  {m.etiqueta}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 7,
                    background: "#E4E9F3",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(m.leads / maxMes) * 100}%`,
                      background: accent,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <span className="mono" style={{ flex: "0 0 44px", textAlign: "right", fontSize: 11.5, color: T.muted }}>
                  {m.leads}
                </span>
                <span className="mono" style={{ flex: "0 0 76px", textAlign: "right", fontSize: 11.5 }}>
                  {money(m.cerrado || null)}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      {texto}
    </span>
  );
}
