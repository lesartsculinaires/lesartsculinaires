"use client";

/**
 * «Actividad de ventas»: una fila por persona y por semana. Mensajes, citas y
 * cierres los cuenta el CRM; llamadas, recontactos, salidas de campo y
 * eventos los completa cada quien (o la Gerente por todas).
 */

import { Fragment } from "react";
import { valorDe, type FilaActividad } from "@/lib/tablero/calculos";
import { CAMPOS_ACTIVIDAD } from "@/lib/tablero/campos";
import { mesDeLaSemana, nombreDeLaSemana, nombreDelMes, semanasDelMes } from "@/lib/tablero/semanas";
import { T } from "@/lib/theme";
import { Ancha, CeldaNumero, Comentario, Titulo, fija, formatear, tabla, td, tdNum, th } from "@/components/modules/tablero/comun";
import type { Contexto } from "@/components/modules/tablero/TableroComercial";

const dividir = (a: number | null, b: number | null) => (a == null || !b ? null : a / b);
const numero = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Las tres columnas que calcula la plantilla al final de cada fila. */
function indicadores(f: { manual: FilaActividad["manual"]; crm: FilaActividad["crm"] }) {
  const v = (c: string) => valorDe(f, c);
  const contactos = [v("llamadas"), v("mensajes"), v("recontactos")];
  const hay = contactos.some((x) => x != null);
  return {
    asistencia: dividir(v("citas_realizadas"), v("citas_agendadas")),
    cierre: dividir(v("ventas_cerradas"), v("citas_realizadas")),
    contactosPorVenta: hay ? dividir(contactos.reduce<number>((s, x) => s + (x ?? 0), 0), v("ventas_cerradas")) : null,
  };
}

export function HojaActividad({ ctx }: { ctx: Contexto }) {
  const lunes = semanasDelMes(ctx.mes);
  const delMes = ctx.actividad.filter((f) => mesDeLaSemana(f.lunes) === ctx.mes);
  const conDatos = new Set(delMes.map((f) => f.vendedorId));
  const personas = ctx.datos.vendedores
    .filter((v) => v.activo || conDatos.has(v.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const fila = (l: string, id: number): FilaActividad =>
    delMes.find((f) => f.lunes === l && f.vendedorId === id) ?? { lunes: l, vendedorId: id, manual: {}, crm: {} };
  const puedePara = (id: number) => ctx.permisos.ventas || (ctx.permisos.actividad && id === ctx.miFicha);
  const comentario = ctx.datos.comentarios.find((c) => c.hoja === "actividad");

  const totalDe = (id: number) => {
    const filas = lunes.map((l) => fila(l, id));
    const manual: Record<string, number> = {};
    for (const c of CAMPOS_ACTIVIDAD) {
      const v = filas.map((f) => valorDe(f, c.clave)).filter((x): x is number => x != null);
      if (v.length) manual[c.clave] = v.reduce((s, x) => s + x, 0);
    }
    return { manual, crm: {} };
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>
        Actividad de ventas — semanal, por persona · <span style={{ textTransform: "capitalize" }}>{nombreDelMes(ctx.mes)}</span>
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 980 }}>
        Cada lunes, una fila por vendedora (y la gerente) con lo que hizo la semana anterior. No basta con atender lo que llega:
        se mide cuánto se sale a buscar y cuánto se le da seguimiento. Lo que trae el CRM (mensajes, citas, cierres) se ve en
        gris; las llamadas que el CRM tiene anotadas aparecen como ayuda y cuentan cuando se escriben.
      </p>
      {personas.length === 0 && <p style={{ color: T.faint, fontSize: 13 }}>No hay fichas de ventas activas.</p>}

      <Ancha>
        <table style={tabla} data-actividad>
          <thead>
            <tr>
              <th style={{ ...th, ...fija, zIndex: 2, background: th.background }}>Semana (lunes)</th>
              <th style={th}>Persona</th>
              {CAMPOS_ACTIVIDAD.map((c) => (
                <th key={c.clave} style={{ ...th, whiteSpace: "normal", minWidth: 84 }}>
                  {c.nombre}{c.origen !== "manual" && <span style={{ color: T.faint, fontWeight: 400 }}> · CRM</span>}
                </th>
              ))}
              {["Asistencia a citas", "Cierre por cita", "Contactos por venta"].map((h) => (
                <th key={h} style={{ ...th, whiteSpace: "normal", minWidth: 76, background: "#E6F0E1" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lunes.map((l) => (
              <Fragment key={l}>
                {personas.map((p, i) => {
                  const f = fila(l, p.id);
                  const ind = indicadores(f);
                  const puede = puedePara(p.id);
                  return (
                    <tr key={`${l}-${p.id}`} data-fila-actividad={`${l}|${p.id}`} style={{ borderTop: i === 0 ? `2px solid ${T.border}` : undefined, opacity: l > ctx.hoy ? 0.6 : 1 }}>
                      <td style={{ ...td, ...fija, whiteSpace: "nowrap", color: i === 0 ? T.ink : "transparent" }}>{nombreDeLaSemana(l)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", fontWeight: p.id === ctx.miFicha ? 700 : 400 }}>
                        {p.nombre}{!p.activo && <span style={{ color: T.faint }}> (inactiva)</span>}
                      </td>
                      {CAMPOS_ACTIVIDAD.map((c) => (
                        <td key={c.clave} style={tdNum}>
                          <CeldaNumero
                            etiqueta={`${c.nombre}, ${p.nombre}, semana del ${l}`}
                            valor={numero(f.manual[c.clave])}
                            delCrm={c.origen === "manual" ? undefined : numero(f.crm[c.clave])}
                            puede={puede}
                            ancho={64}
                            onGuardar={(v) => ctx.guardar.actividad(l, p.id, c.clave, v)}
                          />
                        </td>
                      ))}
                      <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(ind.asistencia, "porcentaje")}</td>
                      <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(ind.cierre, "porcentaje")}</td>
                      <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(ind.contactosPorVenta, "decimal")}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Ancha>

      <Titulo>Total del mes por persona</Titulo>
      <Ancha>
        <table style={tabla} data-actividad-total>
          <thead>
            <tr>
              <th style={th}>Persona</th>
              {CAMPOS_ACTIVIDAD.map((c) => <th key={c.clave} style={{ ...th, whiteSpace: "normal", minWidth: 80 }}>{c.nombre}</th>)}
              {["Asistencia a citas", "Cierre por cita", "Contactos por venta"].map((h) => <th key={h} style={{ ...th, whiteSpace: "normal", background: "#E6F0E1" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => {
              const t = totalDe(p.id);
              const ind = indicadores(t);
              return (
                <tr key={p.id}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{p.nombre}</td>
                  {CAMPOS_ACTIVIDAD.map((c) => <td key={c.clave} style={tdNum}>{formatear(t.manual[c.clave])}</td>)}
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(ind.asistencia, "porcentaje")}</td>
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(ind.cierre, "porcentaje")}</td>
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(ind.contactosPorVenta, "decimal")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Ancha>

      <Comentario
        titulo="Comentario sobre la actividad de ventas"
        texto={comentario?.texto ?? ""}
        actualizadoEn={comentario?.actualizadoEn}
        puede={ctx.permisos.ventas}
        onGuardar={(t) => ctx.guardar.comentario("actividad", t)}
      />
    </div>
  );
}
