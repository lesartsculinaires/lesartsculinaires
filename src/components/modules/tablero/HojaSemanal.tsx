"use client";

/**
 * «MK semanal» y «Ventas semanal»: una fila por semana del mes, con las
 * columnas de la plantilla en el mismo orden. Las columnas calculadas
 * (inversión total, leads total, venta nueva total…) van donde las tiene el
 * Excel.
 */

import { Fragment, type ReactNode } from "react";
import { semanaCargadaMk, semanaCargadaVentas, valorDe, type SemanaDeDatos } from "@/lib/tablero/calculos";
import { CAMPOS_MK, CAMPOS_VENTAS, CANALES_TABLERO, type Campo, type Formato } from "@/lib/tablero/campos";
import { domingoDe, nombreDelMes, semanasDelMes } from "@/lib/tablero/semanas";
import { T } from "@/lib/theme";
import { Ancha, CeldaNumero, Comentario, fija, formatear, tabla, td, tdNum, th } from "@/components/modules/tablero/comun";
import type { Contexto } from "@/components/modules/tablero/TableroComercial";

interface Calculada {
  /** Va justo después de este campo. `null` = al principio, antes de los campos. */
  despuesDe: string | null;
  nombre: string;
  formato: Formato;
  valor: (s: SemanaDeDatos) => number | null;
}

const sumar = (s: SemanaDeDatos, claves: readonly string[]): number | null => {
  const v = claves.map((c) => valorDe(s, c)).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

const LEADS = CANALES_TABLERO.map((c) => `mk.leads_${c.clave}`);
const INSCRITOS = CANALES_TABLERO.map((c) => `ventas.inscritos_${c.clave}`);

const CALCULADAS: Record<"mk" | "ventas", Calculada[]> = {
  mk: [
    { despuesDe: "mk.pauta_otros", nombre: "Inversión total $", formato: "dinero", valor: (s) => sumar(s, ["mk.pauta_meta", "mk.pauta_tiktok", "mk.pauta_google", "mk.pauta_otros"]) },
    { despuesDe: "mk.leads_recontacto", nombre: "Leads total", formato: "numero", valor: (s) => sumar(s, LEADS) },
  ],
  ventas: [
    { despuesDe: null, nombre: "Leads que entregó MK (automático)", formato: "numero", valor: (s) => sumar(s, LEADS) },
    { despuesDe: "ventas.inscritos_recontacto", nombre: "Inscritos nuevos total (diplomados)", formato: "numero", valor: (s) => sumar(s, INSCRITOS) },
    { despuesDe: "ventas.corporativo_monto", nombre: "VENTA NUEVA total $", formato: "dinero", valor: (s) => sumar(s, ["ventas.cobrado_nuevos", "ventas.cursos_cortos_monto", "ventas.corporativo_monto"]) },
  ],
};

const TEXTO = {
  mk: {
    titulo: "Registro semanal de Marketing — Director de MK",
    nota: "Las llena el Director de MK cada lunes con los datos de la semana anterior (lunes a domingo). Escriba 0 si no hubo; deje vacío solo si aún no se carga la semana. Los leads por canal los cuenta el CRM: se ven en gris y sólo se escriben si hay que corregirlos.",
    comentario: "Comentario de Marketing",
  },
  ventas: {
    titulo: "Registro semanal de Ventas — Gerente de Ventas",
    nota: "La columna «Leads que entregó MK» se llena sola: es donde se cruzan los dos registros. Contactados, citas, inscritos por canal y cursos cortos los pone el CRM (en gris). Los montos en gris son sólo una ayuda: cuentan en el Tablero cuando Ventas escribe el monto cobrado.",
    comentario: "Comentario de Ventas",
  },
} as const;

export function HojaSemanal({ ctx, area }: { ctx: Contexto; area: "mk" | "ventas" }) {
  const campos: readonly Campo[] = area === "mk" ? CAMPOS_MK : CAMPOS_VENTAS;
  const calculadas = CALCULADAS[area];
  const puede = area === "mk" ? ctx.permisos.mk : ctx.permisos.ventas;
  const lunes = semanasDelMes(ctx.mes);
  const semanas: SemanaDeDatos[] = lunes.map((l) => ctx.semanas.get(l) ?? { lunes: l, manual: {}, crm: {} });
  const comentario = ctx.datos.comentarios.find((c) => c.hoja === area);

  const columnaCalculada = (c: Calculada, s: SemanaDeDatos | null) => {
    const v = s ? c.valor(s) : sumarTodas(semanas, c.valor);
    return <td key={c.nombre} style={{ ...tdNum, background: "#F1F7EE", fontWeight: s ? 500 : 700 }}>{formatear(v, c.formato)}</td>;
  };

  /** Las columnas en el orden de la plantilla, con las calculadas intercaladas. */
  const columnas = (dibujarCampo: (c: Campo) => ReactNode, dibujarCalculada: (c: Calculada) => ReactNode) => (
    <>
      {calculadas.filter((c) => c.despuesDe === null).map(dibujarCalculada)}
      {campos.map((c) => (
        <Fragment key={c.clave}>
          {dibujarCampo(c)}
          {calculadas.filter((x) => x.despuesDe === c.clave).map(dibujarCalculada)}
        </Fragment>
      ))}
    </>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>
        {TEXTO[area].titulo} · <span style={{ textTransform: "capitalize" }}>{nombreDelMes(ctx.mes)}</span>
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 980 }}>{TEXTO[area].nota}</p>
      {!puede && (
        <p style={{ margin: "0 0 12px", fontSize: 12, color: T.faint }}>
          Esta hoja la llena {area === "mk" ? "Marketing" : "Ventas"}. Puedes verla, pero no escribir en ella.
        </p>
      )}

      <Ancha>
        <table style={tabla} data-hoja-semanal={area}>
          <thead>
            <tr>
              <th style={{ ...th, ...fija, zIndex: 2, background: th.background, minWidth: 90 }}>Semana (lunes)</th>
              <th style={{ ...th, minWidth: 90 }}>Hasta (domingo)</th>
              {columnas(
                (c) => <th key={c.clave} style={{ ...th, minWidth: 96, whiteSpace: "normal" }}>{c.nombre}{c.origen !== "manual" && <span style={{ color: T.faint, fontWeight: 400 }}> · CRM</span>}</th>,
                (c) => <th key={c.nombre} style={{ ...th, minWidth: 96, whiteSpace: "normal", background: "#E6F0E1" }}>{c.nombre}</th>,
              )}
              {area === "ventas" && <th style={{ ...th, minWidth: 80, background: "#E6F0E1" }}>Leads sin contactar</th>}
              <th style={th}>Semana cargada</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => {
              const cargada = area === "mk" ? semanaCargadaMk(s) : semanaCargadaVentas(s, ctx.hoy);
              const futura = s.lunes > ctx.hoy;
              const leadsMk = sumar(s, LEADS);
              const contactados = valorDe(s, "ventas.contactados");
              return (
                <tr key={s.lunes} data-semana={s.lunes} style={{ opacity: futura ? 0.6 : 1 }}>
                  <td style={{ ...td, ...fija, whiteSpace: "nowrap" }}>{s.lunes}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: T.muted }}>{domingoDe(s.lunes)}</td>
                  {columnas(
                    (c) => (
                      <td key={c.clave} style={tdNum} data-campo={c.clave}>
                        <CeldaNumero
                          etiqueta={`${c.nombre}, semana del ${s.lunes}`}
                          valor={numero(s.manual[c.clave])}
                          delCrm={c.origen === "manual" ? undefined : numero(s.crm[c.clave])}
                          formato={c.formato}
                          puede={puede}
                          onGuardar={(v) => ctx.guardar.semanal(s.lunes, c.clave, v)}
                        />
                      </td>
                    ),
                    (c) => columnaCalculada(c, s),
                  )}
                  {area === "ventas" && (
                    <td style={{ ...tdNum, background: "#F1F7EE", color: leadsMk != null && contactados != null && leadsMk - contactados > 0 ? "#9E2F29" : T.ink }}>
                      {leadsMk == null || contactados == null ? "—" : formatear(leadsMk - contactados)}
                    </td>
                  )}
                  <td style={{ ...td, color: cargada ? "#1E6B3A" : T.faint }}>{cargada ? "Sí" : futura ? "Por venir" : "No"}</td>
                </tr>
              );
            })}
            <tr data-total-del-mes>
              <td style={{ ...td, ...fija, fontWeight: 700 }} colSpan={2}>Total del mes</td>
              {columnas(
                (c) => (
                  <td key={c.clave} style={{ ...tdNum, fontWeight: 700 }}>
                    {c.clave === "mk.calificacion"
                      ? formatear(ctx.resumenes.get(ctx.mes)?.calificacion, "decimal")
                      : formatear(sumarTodas(semanas, (s) => valorDe(s, c.clave)), c.formato)}
                  </td>
                ),
                (c) => columnaCalculada(c, null),
              )}
              {area === "ventas" && (
                <td style={{ ...tdNum, fontWeight: 700, background: "#F1F7EE" }}>
                  {(() => {
                    const l = sumarTodas(semanas, (s) => sumar(s, LEADS));
                    const c = sumarTodas(semanas, (s) => valorDe(s, "ventas.contactados"));
                    return l == null || c == null ? "—" : formatear(l - c);
                  })()}
                </td>
              )}
              <td style={{ ...td, fontWeight: 700 }}>
                {area === "mk" ? ctx.resumenes.get(ctx.mes)?.semanasMk : ctx.resumenes.get(ctx.mes)?.semanasVentas} de {semanas.length}
              </td>
            </tr>
          </tbody>
        </table>
      </Ancha>

      <Comentario
        titulo={TEXTO[area].comentario}
        texto={comentario?.texto ?? ""}
        actualizadoEn={comentario?.actualizadoEn}
        puede={puede}
        onGuardar={(t) => ctx.guardar.comentario(area, t)}
      />
    </div>
  );
}

const numero = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function sumarTodas(semanas: readonly SemanaDeDatos[], f: (s: SemanaDeDatos) => number | null): number | null {
  const v = semanas.map(f).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}
