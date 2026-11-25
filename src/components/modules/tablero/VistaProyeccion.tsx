"use client";

/**
 * Cómo se DIBUJA la proyección de la meta. Sólo recibe el cálculo ya hecho
 * (`@/lib/tablero/proyeccion`) y no lee nada: así el mismo dibujo sirve en el
 * Dashboard, en el Tablero y en el sitio de Dirección.
 *
 * De arriba abajo, como se pidió el 25/11/2026:
 *   1. la meta del mes y cuánto se lleva, en barras, con el porcentaje;
 *   2. las asesoras con lo suyo;
 *   3. lo vendido por semana del mes y por mes.
 */
import type { ReactNode } from "react";

import type { Proyeccion } from "@/lib/tablero/proyeccion";

const DORADO = "#CE9847";
const VERDE = "#1E6B3A";
const ROJO = "#9E2F29";
const TINTA = "var(--crm-ink, #141826)";
const SUAVE = "var(--crm-muted, #5B6478)";
const TENUE = "var(--crm-faint, #8A93A6)";
const BORDE = "var(--crm-border, #DADFE8)";
const PISTA = "var(--crm-paper, #EEF1F6)";
const SUPERFICIE = "var(--crm-surface, #FFFFFF)";

const dinero = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)} %`);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreDeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/** Una barra horizontal: pista gris, relleno, y marcas opcionales (meta, «hoy»). */
function Barra({
  parte,
  color,
  alto = 14,
  extension,
  marcas = [],
}: {
  parte: number;
  color: string;
  alto?: number;
  /** Un tramo más claro después del relleno (la proyección). */
  extension?: number;
  marcas?: { en: number; color: string; titulo: string }[];
}) {
  const a = Math.max(0, Math.min(1, parte));
  const b = extension == null ? a : Math.max(a, Math.min(1, extension));
  return (
    <div style={{ position: "relative", height: alto, background: PISTA, borderRadius: alto / 2, overflow: "visible" }}>
      {b > a && (
        <div
          style={{ position: "absolute", inset: 0, width: `${b * 100}%`, background: color, opacity: 0.22, borderRadius: alto / 2 }}
        />
      )}
      <div style={{ position: "absolute", inset: 0, width: `${a * 100}%`, background: color, borderRadius: alto / 2, transition: "width .4s" }} />
      {marcas.map((m) => (
        <div
          key={m.titulo}
          title={m.titulo}
          style={{
            position: "absolute",
            left: `calc(${Math.max(0, Math.min(1, m.en)) * 100}% - 1px)`,
            top: -3,
            bottom: -3,
            width: 2,
            background: m.color,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

function Titulo({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "18px 0 8px" }}>
      <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: TINTA }}>{children}</h3>
      {extra && <span style={{ fontSize: 11.5, color: TENUE }}>{extra}</span>}
    </div>
  );
}

export function VistaProyeccion({
  p,
  accent,
  hoy,
  cabecera,
  avisoParcial,
}: {
  p: Proyeccion;
  accent: string;
  hoy: string;
  /** Lo que va arriba a la derecha: el selector de mes, el botón de cambiar la meta. */
  cabecera?: ReactNode;
  /** Cuando quien mira sólo ve su nombre: se aclara debajo de las asesoras. */
  avisoParcial?: string | null;
}) {
  const esteMes = hoy.slice(0, 7) === p.mes.slice(0, 7);
  const deberiaIr = esteMes ? p.diasCorridos / p.diasDelMes : null;
  const vaBien = p.porcentaje != null && deberiaIr != null ? p.porcentaje >= deberiaIr : null;
  const tope = Math.max(p.meta ?? 0, p.vendido, p.proyeccion ?? 0, 1);
  const maxAsesora = Math.max(...p.asesoras.map((a) => a.monto), 1);
  const maxSemana = Math.max(...p.semanas.map((s) => Math.max(s.monto, s.meta ?? 0)), 1);
  const maxMes = Math.max(...p.meses.map((m) => Math.max(m.monto, m.meta ?? 0)), 1);

  return (
    <section
      data-proyeccion
      style={{ background: SUPERFICIE, border: `1px solid ${BORDE}`, borderRadius: 12, padding: "16px 18px 18px" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: TENUE }}>Proyección de la meta</div>
          <h2 style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: TINTA }}>
            Venta de {nombreDeMes(p.mes)}
          </h2>
        </div>
        {cabecera}
      </div>

      {/* 1. La meta y el avance */}
      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <div data-barra-meta>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: SUAVE, marginBottom: 5 }}>
            <span>Meta del mes</span>
            <strong style={{ color: TINTA, fontSize: 15 }}>{p.meta == null ? "Sin meta cargada" : dinero(p.meta)}</strong>
          </div>
          <Barra parte={p.meta == null ? 0 : p.meta / tope} color={DORADO} />
        </div>
        <div data-barra-avance>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, color: SUAVE, marginBottom: 5, gap: 8, flexWrap: "wrap" }}>
            <span>
              Vendido: <strong style={{ color: TINTA, fontSize: 15 }}>{dinero(p.vendido)}</strong>
            </span>
            <strong
              data-porcentaje
              style={{ fontSize: 15, color: p.porcentaje == null ? TENUE : p.cubierta ? VERDE : vaBien === false ? ROJO : accent }}
            >
              {p.porcentaje == null ? "—" : `${pct(p.porcentaje)} de la meta`}
            </strong>
          </div>
          <Barra
            parte={p.vendido / tope}
            color={accent}
            extension={esteMes && p.proyeccion != null ? p.proyeccion / tope : undefined}
            marcas={[
              ...(p.meta != null ? [{ en: p.meta / tope, color: DORADO, titulo: "Meta" }] : []),
              ...(deberiaIr != null && p.meta != null ? [{ en: (deberiaIr * p.meta) / tope, color: TINTA, titulo: "Dónde debería ir hoy" }] : []),
            ]}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {[
          esteMes && p.proyeccion != null
            ? { t: "A este ritmo cierra en", v: `${dinero(p.proyeccion)}${p.porcentajeProyectado != null ? ` · ${pct(p.porcentajeProyectado)}` : ""}`, c: p.porcentajeProyectado != null && p.porcentajeProyectado < 1 ? ROJO : VERDE }
            : null,
          deberiaIr != null && p.meta != null ? { t: "Hoy debería ir en", v: `${dinero(deberiaIr * p.meta)} · ${pct(deberiaIr)}`, c: TINTA } : null,
          p.falta != null ? { t: p.cubierta ? "Meta cubierta" : "Falta vender", v: p.cubierta ? `+${dinero(p.vendido - (p.meta ?? 0))}` : dinero(p.falta), c: p.cubierta ? VERDE : TINTA } : null,
          esteMes && p.porSemanaParaLlegar != null
            ? { t: `Por semana para llegar (${p.semanasQuedan})`, v: dinero(p.porSemanaParaLlegar), c: TINTA }
            : null,
        ]
          .filter(Boolean)
          .map((x) => (
            <div key={x!.t} style={{ flex: "1 1 150px", border: `1px solid ${BORDE}`, borderRadius: 9, padding: "7px 10px" }}>
              <div style={{ fontSize: 11, color: TENUE }}>{x!.t}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: x!.c }}>{x!.v}</div>
            </div>
          ))}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: TENUE, lineHeight: 1.5 }}>
        Diplomados: {p.desglose.diplomados.cantidad} · {dinero(p.desglose.diplomados.monto)} &nbsp;·&nbsp; Cursos cortos:{" "}
        {p.desglose.cursosCortos.cantidad} · {dinero(p.desglose.cursosCortos.monto)}
        {p.desglose.corporativo > 0 ? <> &nbsp;·&nbsp; Corporativo: {dinero(p.desglose.corporativo)}</> : null}
        {esteMes ? <> &nbsp;·&nbsp; Día {p.diasCorridos} de {p.diasDelMes}</> : null}
      </p>

      {/* 2. Las asesoras */}
      <Titulo extra="lo vendido en el mes y cuánto de la meta cubre">Por asesora</Titulo>
      {p.asesoras.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: TENUE }}>Todavía no hay ventas este mes.</p>
      ) : (
        <div data-asesoras style={{ display: "grid", gap: 7 }}>
          {p.asesoras.map((a) => (
            <div key={a.id ?? "sin"} data-asesora={a.nombre} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 170px) 1fr auto", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: a.id == null ? SUAVE : TINTA, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.nombre}
              </span>
              <Barra parte={a.monto / maxAsesora} color={a.id == null ? TENUE : accent} alto={10} />
              <span style={{ fontSize: 12, color: TINTA, textAlign: "right", whiteSpace: "nowrap" }}>
                <strong>{dinero(a.monto)}</strong>
                <span style={{ color: TENUE }}>
                  {a.deLaMeta != null ? ` · ${pct(a.deLaMeta)} de la meta` : ""}
                  {a.diplomados || a.cursosCortos
                    ? ` · ${a.diplomados} ${a.diplomados === 1 ? "diplomado" : "diplomados"} · ${a.cursosCortos} ${a.cursosCortos === 1 ? "curso" : "cursos"}`
                    : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {avisoParcial && <p style={{ margin: "6px 0 0", fontSize: 11, color: TENUE }}>{avisoParcial}</p>}

      {/* 3. Por semana y por mes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <div>
          <Titulo extra="la línea dorada es la parte de la meta de esa semana">Vendido por semana</Titulo>
          <div data-semanas style={{ display: "grid", gap: 7 }}>
            {p.semanas.map((s) => (
              <div key={s.desde} style={{ display: "grid", gridTemplateColumns: "96px 1fr 70px", gap: 8, alignItems: "center", opacity: s.futura ? 0.45 : 1 }}>
                <span style={{ fontSize: 11.5, color: s.actual ? TINTA : SUAVE, fontWeight: s.actual ? 700 : 400 }}>{s.etiqueta}</span>
                <Barra
                  parte={s.monto / maxSemana}
                  color={s.meta != null && s.monto >= s.meta ? VERDE : accent}
                  alto={10}
                  marcas={s.meta != null ? [{ en: s.meta / maxSemana, color: DORADO, titulo: `Meta de la semana: ${dinero(s.meta)}` }] : []}
                />
                <span style={{ fontSize: 12, color: TINTA, textAlign: "right" }}>{dinero(s.monto)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Titulo extra="últimos seis meses frente a su meta">Vendido por mes</Titulo>
          <div data-meses style={{ display: "grid", gap: 7 }}>
            {p.meses.map((m) => (
              <div key={m.mes} style={{ display: "grid", gridTemplateColumns: "56px 1fr 110px", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: m.actual ? TINTA : SUAVE, fontWeight: m.actual ? 700 : 400 }}>{m.etiqueta}</span>
                <Barra
                  parte={m.monto / maxMes}
                  color={m.porcentaje != null && m.porcentaje >= 1 ? VERDE : accent}
                  alto={10}
                  marcas={m.meta != null ? [{ en: m.meta / maxMes, color: DORADO, titulo: `Meta: ${dinero(m.meta)}` }] : []}
                />
                <span style={{ fontSize: 12, color: TINTA, textAlign: "right", whiteSpace: "nowrap" }}>
                  {dinero(m.monto)}
                  <span style={{ color: TENUE }}>{m.porcentaje != null ? ` · ${pct(m.porcentaje)}` : ""}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ margin: "14px 0 0", fontSize: 10.5, color: TENUE, lineHeight: 1.5 }}>
        Cuenta como venta lo mismo que la «Venta nueva» del Tablero: diplomados y cursos cortos ganados en el CRM, el día de su
        cierre, más el corporativo que Ventas carga a mano. La meta la pone Dirección cada mes. La proyección supone que el resto
        del mes se vende al mismo ritmo que hasta hoy.
      </p>
    </section>
  );
}
