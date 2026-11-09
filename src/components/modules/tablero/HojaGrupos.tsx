"use client";

/**
 * «Grupos en venta»: cupos, reservas y lo que aporta cada grupo. Las mismas
 * columnas que la plantilla (sin «Instituto»: cada CRM tiene los suyos) y el
 * resumen por mes de inicio de abajo.
 *
 * Quién escribe qué, como en el Excel: los datos del grupo y los precios,
 * Ventas o Dirección; el cupo meta, Dirección; reservas e inscritos, Ventas.
 */

import { useState } from "react";
import { calcularGrupo } from "@/lib/tablero/calculos";
import { mesDe, nombreDelMes } from "@/lib/tablero/semanas";
import { T } from "@/lib/theme";
import type { GrupoGuardado } from "@/app/tablero-actions";
import { Ancha, Boton, CeldaNumero, CeldaTexto, Comentario, Titulo, formatear, tabla, td, tdNum, th } from "@/components/modules/tablero/comun";
import type { Contexto } from "@/components/modules/tablero/TableroComercial";

type Numerico = "duracionMeses" | "matricula1" | "matricula2" | "mensualidad" | "graduacion" | "mensualidadPreventa" | "cupo" | "reservas" | "inscritos";
type Quien = "datos" | "cupo" | "ventas";

const COLUMNAS_NUMERO: { clave: Numerico; nombre: string; formato: "numero" | "dinero"; quien: Quien }[] = [
  { clave: "duracionMeses", nombre: "Duración (meses)", formato: "numero", quien: "datos" },
];
const PRECIOS: typeof COLUMNAS_NUMERO = [
  { clave: "matricula1", nombre: "Matrícula 1 $", formato: "dinero", quien: "datos" },
  { clave: "matricula2", nombre: "Matrícula 2 $", formato: "dinero", quien: "datos" },
  { clave: "mensualidad", nombre: "Mensualidad regular $", formato: "dinero", quien: "datos" },
  { clave: "graduacion", nombre: "Gastos de graduación $", formato: "dinero", quien: "datos" },
  { clave: "mensualidadPreventa", nombre: "Mensualidad en preventa $", formato: "dinero", quien: "datos" },
];
const CUPOS: typeof COLUMNAS_NUMERO = [
  { clave: "cupo", nombre: "Cupo meta", formato: "numero", quien: "cupo" },
  { clave: "reservas", nombre: "Reservas con precio de preventa (#)", formato: "numero", quien: "ventas" },
  { clave: "inscritos", nombre: "Inscritos a precio regular (#)", formato: "numero", quien: "ventas" },
];

const COLOR_ALERTA: Record<string, string> = {
  Lleno: "#1E6B3A",
  "En venta": T.muted,
  "Ya inició": T.faint,
};

export function HojaGrupos({ ctx }: { ctx: Contexto }) {
  const puede: Record<Quien, boolean> = {
    datos: ctx.permisos.ventas || ctx.permisos.metas,
    cupo: ctx.permisos.metas,
    ventas: ctx.permisos.ventas,
  };
  const grupos = [...ctx.datos.grupos].sort((a, b) => (a.inicio ?? "9999").localeCompare(b.inicio ?? "9999") || a.programa.localeCompare(b.programa));
  const comentario = ctx.datos.comentarios.find((c) => c.hoja === "grupos");

  const [nuevo, setNuevo] = useState({ programa: "", grupo: "", inicio: "" });
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiar = (g: GrupoGuardado, campo: keyof GrupoGuardado, valor: string | number | null) =>
    ctx.guardar.grupo({ ...g, [campo]: valor });

  const numero = (g: GrupoGuardado, c: (typeof COLUMNAS_NUMERO)[number]) => (
    <td key={c.clave} style={tdNum}>
      <CeldaNumero
        etiqueta={`${c.nombre}, ${g.grupo}`}
        valor={g[c.clave]}
        formato={c.formato}
        puede={puede[c.quien]}
        ancho={c.formato === "dinero" ? 80 : 60}
        onGuardar={(v) => cambiar(g, c.clave, v)}
      />
    </td>
  );

  // Resumen por mes de inicio: los meses que tienen grupos.
  const porMes = new Map<string, GrupoGuardado[]>();
  for (const g of grupos) if (g.inicio) {
    const m = mesDe(g.inicio);
    porMes.set(m, [...(porMes.get(m) ?? []), g]);
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>Grupos en venta — cupos, reservas y lo que aporta cada grupo</h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 980 }}>
        La Gerente de Ventas actualiza cada lunes las reservas e inscritos por grupo. El cupo meta lo define la Dirección.
        Valor total = matrícula 1 + matrícula 2 + mensualidad × meses + graduación. Alerta: URGENTE = falta un mes o menos y va
        bajo 60% · En riesgo = faltan dos meses o menos y va bajo 30%.
      </p>

      <Ancha>
        <table style={tabla} data-grupos>
          <thead>
            <tr>
              {["Programa", "Grupo", "Días", "Horario"].map((h) => <th key={h} style={th}>{h}</th>)}
              {COLUMNAS_NUMERO.map((c) => <th key={c.clave} style={{ ...th, whiteSpace: "normal", minWidth: 70 }}>{c.nombre}</th>)}
              <th style={th}>Inicio</th>
              {PRECIOS.map((c) => <th key={c.clave} style={{ ...th, whiteSpace: "normal", minWidth: 86 }}>{c.nombre}</th>)}
              <th style={{ ...th, whiteSpace: "normal", minWidth: 96, background: "#E6F0E1" }}>Valor total por alumno a precio regular $</th>
              {CUPOS.map((c) => <th key={c.clave} style={{ ...th, whiteSpace: "normal", minWidth: 76 }}>{c.nombre}</th>)}
              {["Total reservas + inscritos", "Faltan", "% lleno", "Días para el inicio", "Mensualidad que aporta hoy $/mes", "Mensualidad con cupo lleno a precio de preventa $/mes", "Matrículas por cobrar si se llena $", "Alerta"].map((h) => (
                <th key={h} style={{ ...th, whiteSpace: "normal", minWidth: 84, background: "#E6F0E1" }}>{h}</th>
              ))}
              {puede.datos && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {grupos.length === 0 && (
              <tr><td colSpan={30} style={{ ...td, color: T.faint, padding: 14 }}>Todavía no hay grupos en venta cargados.</td></tr>
            )}
            {grupos.map((g) => {
              const c = calcularGrupo(g, ctx.hoy);
              return (
                <tr key={g.id} data-grupo={g.grupo}>
                  <td style={td}><CeldaTexto etiqueta="Programa" valor={g.programa} obligatorio puede={puede.datos} ancho={280} onGuardar={(v) => cambiar(g, "programa", v)} /></td>
                  <td style={td}><CeldaTexto etiqueta="Grupo" valor={g.grupo} obligatorio puede={puede.datos} ancho={210} onGuardar={(v) => cambiar(g, "grupo", v)} /></td>
                  <td style={td}><CeldaTexto etiqueta="Días" valor={g.dias} puede={puede.datos} ancho={120} onGuardar={(v) => cambiar(g, "dias", v)} /></td>
                  <td style={td}><CeldaTexto etiqueta="Horario" valor={g.horario} puede={puede.datos} ancho={150} onGuardar={(v) => cambiar(g, "horario", v)} /></td>
                  {COLUMNAS_NUMERO.map((col) => numero(g, col))}
                  <td style={td}><CeldaTexto etiqueta="Inicio" tipo="date" valor={g.inicio} puede={puede.datos} ancho={130} onGuardar={(v) => cambiar(g, "inicio", v)} /></td>
                  {PRECIOS.map((col) => numero(g, col))}
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(c.valorTotal, "dinero")}</td>
                  {CUPOS.map((col) => numero(g, col))}
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(c.ocupados)}</td>
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(c.faltan)}</td>
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(c.lleno, "porcentaje")}</td>
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(c.diasParaInicio)}</td>
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(c.aportaHoy, "dinero")}</td>
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(c.conCupoLleno, "dinero")}</td>
                  <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(c.matriculasPorCobrar, "dinero")}</td>
                  <td data-alerta={c.alerta} style={{ ...td, background: "#F1F7EE", fontWeight: 700, whiteSpace: "nowrap", color: COLOR_ALERTA[c.alerta] ?? "#9E2F29" }}>{c.alerta || "—"}</td>
                  {puede.datos && (
                    <td style={td}>
                      <Boton peligro onClick={async () => {
                        if (!window.confirm(`¿Quitar el grupo «${g.grupo}» de la lista en venta?`)) return;
                        setAviso(await ctx.guardar.quitarGrupo(g.id));
                      }}>Quitar</Boton>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Ancha>

      {puede.datos && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const error = await ctx.guardar.grupo({
              programa: nuevo.programa, grupo: nuevo.grupo, inicio: nuevo.inicio || null,
              dias: null, horario: null, duracionMeses: null, matricula1: null, matricula2: null, mensualidad: null,
              graduacion: null, mensualidadPreventa: null, cupo: null, reservas: null, inscritos: null,
            });
            setAviso(error);
            if (!error) setNuevo({ programa: "", grupo: "", inicio: "" });
          }}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 12.5 }}
        >
          <strong style={{ color: T.ink }}>Agregar grupo:</strong>
          <input aria-label="Programa del grupo nuevo" placeholder="Programa" value={nuevo.programa} onChange={(e) => setNuevo({ ...nuevo, programa: e.target.value })} style={entrada(220)} />
          <input aria-label="Nombre del grupo nuevo" placeholder="Grupo (ej. DSCI-1-2027)" value={nuevo.grupo} onChange={(e) => setNuevo({ ...nuevo, grupo: e.target.value })} style={entrada(200)} />
          <input aria-label="Inicio del grupo nuevo" type="date" value={nuevo.inicio} onChange={(e) => setNuevo({ ...nuevo, inicio: e.target.value })} style={entrada(140)} />
          <button type="submit" disabled={!nuevo.programa.trim() || !nuevo.grupo.trim()} style={{ ...entrada(90), background: T.ink, color: "#fff", cursor: "pointer", opacity: !nuevo.programa.trim() || !nuevo.grupo.trim() ? 0.4 : 1 }}>Agregar</button>
          {aviso && <span role="alert" style={{ color: "#9E2F29" }}>{aviso}</span>}
        </form>
      )}

      <Titulo>Resumen por mes de inicio</Titulo>
      <Ancha>
        <table style={tabla}>
          <thead>
            <tr>{["Mes de inicio", "Grupos", "Cupos meta", "Reservas + inscritos", "Faltan", "Mensualidad nueva hoy $/mes", "Mensualidad nueva con cupo lleno (preventa) $/mes"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {[...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, lista]) => {
              const calc = lista.map((g) => ({ g, c: calcularGrupo(g, ctx.hoy) }));
              const suma = (f: (x: (typeof calc)[number]) => number | null) => calc.reduce((s, x) => s + (f(x) ?? 0), 0);
              return (
                <tr key={m}>
                  <td style={{ ...td, textTransform: "capitalize" }}>{nombreDelMes(m)}</td>
                  <td style={tdNum}>{lista.length}</td>
                  <td style={tdNum}>{formatear(suma((x) => x.g.cupo))}</td>
                  <td style={tdNum}>{formatear(suma((x) => x.c.ocupados))}</td>
                  <td style={tdNum}>{formatear(suma((x) => x.c.faltan))}</td>
                  <td style={tdNum}>{formatear(suma((x) => x.c.aportaHoy), "dinero")}</td>
                  <td style={tdNum}>{formatear(suma((x) => x.c.conCupoLleno), "dinero")}</td>
                </tr>
              );
            })}
            {porMes.size === 0 && <tr><td colSpan={7} style={{ ...td, color: T.faint }}>Sin grupos con fecha de inicio.</td></tr>}
          </tbody>
        </table>
      </Ancha>

      <Comentario
        titulo="Comentario sobre los grupos"
        texto={comentario?.texto ?? ""}
        actualizadoEn={comentario?.actualizadoEn}
        puede={ctx.permisos.ventas || ctx.permisos.metas}
        onGuardar={(t) => ctx.guardar.comentario("grupos", t)}
      />
    </div>
  );
}

const entrada = (ancho: number) => ({
  width: ancho, fontSize: 12.5, padding: "5px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: "#FFFDF4", color: T.ink,
});
