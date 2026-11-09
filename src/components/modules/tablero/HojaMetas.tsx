"use client";

/**
 * «Metas»: las define la Dirección General. Tabla 1, las que cambian cada mes;
 * tabla 2, las fijas, que aplican todos los meses. Si una meta está vacía, ese
 * KPI aparece como «Sin meta» y no cuenta en el índice.
 */

import { METAS_DEL_MES, METAS_FIJAS } from "@/lib/tablero/campos";
import { mesAnterior, nombreDelMes } from "@/lib/tablero/semanas";
import { T } from "@/lib/theme";
import { Ancha, CeldaNumero, Titulo, tabla, td, tdNum, th } from "@/components/modules/tablero/comun";
import type { Contexto } from "@/components/modules/tablero/TableroComercial";

/** La columna «Origen de la meta» de la plantilla. */
const ORIGEN: Record<string, string> = {
  cursos_cortos: "LAC: plan de metas (8–10 al mes). HC: definir",
  contratos_corp: "LAC: informe a Junta 2026. HC: definir",
  contactados_24h: "Propuesta: validar",
  descuentos_pct: "Propuesta: igual que en el Tablero LAC",
  conversion: "Propuesta: validar con 2–3 meses de datos",
  costo_por_inscrito: "Definir: cuánto se puede pagar por cada alumno",
  costo_por_lead: "Definir con el costo actual de la pauta",
  retorno_pauta: "Propuesta: venta nueva 5 veces lo invertido en pauta",
  seguidores: "Definir",
  publicaciones: "Propuesta: 3 por semana por marca",
  resenas: "Definir",
  calificacion: "Propuesta: validar",
  acciones_a_tiempo: "Propuesta: lo que se planifica se hace",
  acciones_sin_pauta: "Propuesta: al menos 1 por semana (colegios, ferias, eventos, alianzas)",
  citas: "Definir",
  salidas_campo: "Propuesta: 2 por semana por instituto",
  llamadas: "Definir",
  leads_sin_pauta_pct: "Propuesta: que no todo dependa de la pauta",
};

const sumarMeses = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
};

export function HojaMetas({ ctx }: { ctx: Contexto }) {
  const puede = ctx.permisos.metas;
  const desde = mesAnterior(ctx.mes);
  const meses = Array.from({ length: 14 }, (_, i) => sumarMeses(desde, i));

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>Metas — las define la Dirección General — {ctx.empresa}</h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 980 }}>
        Tabla 1: metas que cambian cada mes. Tabla 2: metas fijas de la empresa. Si una meta está vacía, ese KPI aparece como
        «Sin meta» y no cuenta en el índice. {!puede && "Sólo la Dirección puede cambiarlas."}
      </p>

      <Titulo nota="META DE VENTA NUEVA = lo que el instituto tiene que vender en el mes, aparte de lo que ya entra por mensualidades de los alumnos activos. Es una sola meta para Marketing y Ventas: MK trae los leads y Ventas los convierte en matrícula.">
        Tabla 1 · Metas mensuales (mes completo)
      </Titulo>
      <Ancha>
        <table style={tabla} data-metas-del-mes>
          <thead>
            <tr>
              <th style={th}>Mes</th>
              {METAS_DEL_MES.map((m) => <th key={m.clave} style={{ ...th, whiteSpace: "normal", minWidth: 130 }}>{m.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m} data-mes={m} style={{ background: m === ctx.mes ? "#FFF8E1" : undefined }}>
                <td style={{ ...td, textTransform: "capitalize", fontWeight: m === ctx.mes ? 700 : 400 }}>{nombreDelMes(m)}</td>
                {METAS_DEL_MES.map((meta) => (
                  <td key={meta.clave} style={tdNum}>
                    <CeldaNumero
                      etiqueta={`${meta.nombre}, ${nombreDelMes(m)}`}
                      valor={ctx.metas.delMes[m]?.[meta.clave] ?? null}
                      formato={meta.formato}
                      puede={puede}
                      ancho={110}
                      onGuardar={(v) => ctx.guardar.meta(m, meta.clave, v)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Ancha>

      <Titulo nota="Mín. = hay que llegar o pasar. Máx. = no hay que pasarse. Los porcentajes se escriben con «%» (90%) o como fracción (0.9).">
        Tabla 2 · Metas fijas (aplican todos los meses)
      </Titulo>
      <Ancha>
        <table style={tabla} data-metas-fijas>
          <thead>
            <tr>{["Meta", ctx.empresa, "Origen de la meta"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {METAS_FIJAS.map((m) => {
              const valor = ctx.metas.fijas[m.clave] ?? null;
              return (
                <tr key={m.clave} data-meta={m.clave}>
                  <td style={td}>{m.nombre}</td>
                  <td style={tdNum}>
                    <CeldaNumero etiqueta={m.nombre} valor={valor} formato={m.formato} puede={puede} ancho={100} onGuardar={(v) => ctx.guardar.meta(null, m.clave, v)} />
                  </td>
                  <td style={{ ...td, color: valor == null || ORIGEN[m.clave]?.startsWith("Propuesta") || ORIGEN[m.clave]?.startsWith("Definir") ? "#9E2F29" : T.muted, fontSize: 12 }}>
                    {ORIGEN[m.clave] ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Ancha>
      <p style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>En rojo: metas propuestas o pendientes de definir.</p>
    </div>
  );
}
