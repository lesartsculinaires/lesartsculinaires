"use client";

/**
 * «Ventas por persona del mes»: el cierre que hace la Gerente de Ventas. Una
 * fila por persona con lo que vendió (cantidades y montos). Sin comisiones:
 * la Dirección las calcula aparte.
 *
 * Diplomados y cursos cortos los cuenta el CRM (en gris); lo demás no lo
 * distingue el CRM y se escribe. Las columnas «SOLO GERENTE» se llenan sólo
 * en la fila de quien tenga el puesto de Gerente.
 */

import { CAMPOS_VENTAS_PERSONA } from "@/lib/tablero/campos";
import { nombreDelMes } from "@/lib/tablero/semanas";
import { T } from "@/lib/theme";
import { Ancha, CeldaTexto, CeldaNumero, Comentario, fija, formatear, tabla, td, tdNum, th } from "@/components/modules/tablero/comun";
import type { Contexto } from "@/components/modules/tablero/TableroComercial";

const SOLO_GERENTE = (clave: string) => clave.startsWith("ger_");

export function HojaVentasPersona({ ctx }: { ctx: Contexto }) {
  const puede = ctx.permisos.ventas;
  const escrito = (id: number, campo: string) => ctx.datos.ventasPersona.find((x) => x.vendedorId === id && x.campo === campo)?.valor ?? null;
  const delCrm = (id: number, campo: string) => ctx.datos.crmVentasPersona.find((x) => x.vendedorId === id && x.campo === campo)?.valor ?? null;
  const conDatos = new Set([...ctx.datos.ventasPersona, ...ctx.datos.crmVentasPersona].map((x) => x.vendedorId));
  const personas = ctx.datos.vendedores
    .filter((v) => v.activo || conDatos.has(v.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const comentario = ctx.datos.comentarios.find((c) => c.hoja === "ventas_persona");

  const valor = (id: number, campo: string, origen: string) => escrito(id, campo) ?? (origen === "crm" ? delCrm(id, campo) : null);
  const total = (campo: string, origen: string) => {
    const v = personas.map((p) => valor(p.id, campo, origen)).filter((x): x is number => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) : null;
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>
        Ventas por persona del mes — Gerente de Ventas · <span style={{ textTransform: "capitalize" }}>{nombreDelMes(ctx.mes)}</span>
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 980 }}>
        Al cierre de cada mes, una fila por persona. Solo lo que vendió cada quien (cantidades y montos). Aquí NO hay comisiones
        ni salarios: Dirección las calcula aparte. Puesto: «Ejecutiva» para las vendedoras, «Gerente» para la Gerente de Ventas.
        Master Class y Priority Black no se anotan.
      </p>

      <Ancha>
        <table style={tabla} data-ventas-persona>
          <thead>
            <tr>
              <th style={{ ...th, ...fija, zIndex: 2, background: th.background }}>Persona</th>
              <th style={th}>Puesto</th>
              {CAMPOS_VENTAS_PERSONA.map((c) => (
                <th key={c.clave} style={{ ...th, whiteSpace: "normal", minWidth: 92, background: SOLO_GERENTE(c.clave) ? "#F3EEF8" : th.background }}>
                  {c.nombre}{c.origen !== "manual" && <span style={{ color: T.faint, fontWeight: 400 }}> · CRM</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {personas.length === 0 && <tr><td colSpan={20} style={{ ...td, color: T.faint, padding: 14 }}>No hay fichas de ventas activas.</td></tr>}
            {personas.map((p) => {
              const esGerente = escrito(p.id, "es_gerente") === 1;
              return (
                <tr key={p.id} data-persona={p.nombre}>
                  <td style={{ ...td, ...fija, whiteSpace: "nowrap" }}>{p.nombre}{!p.activo && <span style={{ color: T.faint }}> (inactiva)</span>}</td>
                  <td style={td}>
                    <CeldaTexto
                      etiqueta={`Puesto de ${p.nombre}`}
                      valor={esGerente ? "Gerente" : "Ejecutiva"}
                      opciones={["Ejecutiva", "Gerente"]}
                      obligatorio
                      puede={puede}
                      ancho={100}
                      onGuardar={(v) => ctx.guardar.ventasPersona(p.id, "es_gerente", v === "Gerente" ? 1 : null)}
                    />
                  </td>
                  {CAMPOS_VENTAS_PERSONA.map((c) => {
                    const soloGerente = SOLO_GERENTE(c.clave);
                    if (soloGerente && !esGerente) return <td key={c.clave} style={{ ...td, background: "#FAF8FC" }} />;
                    return (
                      <td key={c.clave} style={tdNum}>
                        <CeldaNumero
                          etiqueta={`${c.nombre}, ${p.nombre}`}
                          valor={escrito(p.id, c.clave)}
                          delCrm={c.origen === "manual" ? undefined : delCrm(p.id, c.clave)}
                          formato={c.formato}
                          puede={puede}
                          ancho={c.formato === "dinero" ? 84 : 60}
                          onGuardar={(v) => ctx.guardar.ventasPersona(p.id, c.clave, v)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {personas.length > 0 && (
              <tr data-total-del-mes>
                <td style={{ ...td, ...fija, fontWeight: 700 }} colSpan={2}>Total del mes</td>
                {CAMPOS_VENTAS_PERSONA.map((c) => (
                  <td key={c.clave} style={{ ...tdNum, fontWeight: 700 }}>{formatear(total(c.clave, c.origen), c.formato)}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </Ancha>

      <Comentario
        titulo="Comentario sobre las ventas por persona"
        texto={comentario?.texto ?? ""}
        actualizadoEn={comentario?.actualizadoEn}
        puede={puede}
        onGuardar={(t) => ctx.guardar.comentario("ventas_persona", t)}
      />
    </div>
  );
}
