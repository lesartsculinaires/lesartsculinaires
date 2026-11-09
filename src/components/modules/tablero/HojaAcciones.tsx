"use client";

/**
 * «Plan de acciones»: cada acción se anota ANTES de hacerla y se completa
 * DESPUÉS con lo que dio. Muestra las del mes elegido y, arriba, las que
 * quedaron atrasadas de meses anteriores para que no se pierdan.
 *
 * MK llena las suyas y Ventas las suyas; la base no deja tocar las del otro.
 */

import { useState } from "react";
import { lecturaDeAccion } from "@/lib/tablero/calculos";
import { ESTADOS_DE_ACCION, TIPOS_DE_ACCION } from "@/lib/tablero/campos";
import { mesDe, nombreDelMes } from "@/lib/tablero/semanas";
import { T } from "@/lib/theme";
import type { AccionGuardada } from "@/app/tablero-actions";
import { Ancha, Boton, CeldaNumero, CeldaTexto, Comentario, Titulo, formatear, tabla, td, tdNum, th } from "@/components/modules/tablero/comun";
import type { Contexto } from "@/components/modules/tablero/TableroComercial";

const dividir = (a: number | null, b: number | null) => (a == null || !b ? null : a / b);

const COLOR_LECTURA: Record<string, string> = {
  "Cumplió lo esperado": "#1E6B3A",
  Hecha: "#1E6B3A",
  Pendiente: T.muted,
  Cancelada: T.faint,
  "Falta anotar resultados": "#8A5A00",
};

export function HojaAcciones({ ctx }: { ctx: Contexto }) {
  const puedeDe = (r: AccionGuardada["responsable"]) => (r === "MK" ? ctx.permisos.mk : ctx.permisos.ventas);
  const responsables = (["MK", "Ventas"] as const).filter(puedeDe);
  const comentario = ctx.datos.comentarios.find((c) => c.hoja === "acciones");

  const delMes = ctx.datos.acciones.filter((a) => a.fecha && mesDe(a.fecha) === ctx.mes);
  const atrasadas = ctx.datos.acciones.filter(
    (a) => (!a.fecha || a.fecha < ctx.mes) && a.estado !== "Hecha" && a.estado !== "Cancelada",
  );
  const ordenar = (l: AccionGuardada[]) => [...l].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || a.id - b.id);

  const [nueva, setNueva] = useState({ tipo: TIPOS_DE_ACCION[0] as string, accion: "", responsable: responsables[0] ?? "MK", persona: "", fecha: "" });
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiar = (a: AccionGuardada, campo: keyof AccionGuardada, valor: string | number | null) =>
    ctx.guardar.accion({ ...a, [campo]: valor });

  const filas = (lista: AccionGuardada[]) =>
    ordenar(lista).map((a) => {
      const puede = puedeDe(a.responsable);
      const lectura = lecturaDeAccion(a, ctx.hoy);
      const n = (campo: "costo" | "leadsEsperados" | "leadsObtenidos" | "inscritos" | "venta", nombre: string, formato: "numero" | "dinero" = "numero") => (
        <td style={tdNum}>
          <CeldaNumero etiqueta={`${nombre}, ${a.accion}`} valor={a[campo]} formato={formato} puede={puede} ancho={formato === "dinero" ? 80 : 60} onGuardar={(v) => cambiar(a, campo, v)} />
        </td>
      );
      return (
        <tr key={a.id} data-accion={a.accion} style={{ background: a.responsable === "MK" ? "#FFFDF0" : "#F5F9FF" }}>
          <td style={td}><CeldaTexto etiqueta="Tipo de acción" valor={a.tipo} opciones={TIPOS_DE_ACCION} obligatorio puede={puede} ancho={170} onGuardar={(v) => cambiar(a, "tipo", v)} /></td>
          <td style={td}><CeldaTexto etiqueta="Acción" valor={a.accion} obligatorio puede={puede} ancho={230} onGuardar={(v) => cambiar(a, "accion", v)} /></td>
          <td style={{ ...td, fontWeight: 600 }}>
            {ctx.permisos.mk && ctx.permisos.ventas
              ? <CeldaTexto etiqueta="Responsable" valor={a.responsable} opciones={["MK", "Ventas"]} obligatorio puede ancho={80} onGuardar={(v) => cambiar(a, "responsable", v)} />
              : a.responsable}
          </td>
          <td style={td}><CeldaTexto etiqueta="Persona a cargo" valor={a.persona} puede={puede} ancho={120} onGuardar={(v) => cambiar(a, "persona", v)} /></td>
          <td style={td}><CeldaTexto etiqueta="Fecha" tipo="date" valor={a.fecha} puede={puede} ancho={130} onGuardar={(v) => cambiar(a, "fecha", v)} /></td>
          <td style={td}><CeldaTexto etiqueta="Estado" valor={a.estado} opciones={ESTADOS_DE_ACCION} obligatorio puede={puede} ancho={115} onGuardar={(v) => cambiar(a, "estado", v)} /></td>
          {n("costo", "Costo", "dinero")}
          {n("leadsEsperados", "Leads esperados")}
          {n("leadsObtenidos", "Leads obtenidos")}
          {n("inscritos", "Inscritos / ventas cerradas")}
          {n("venta", "Venta generada", "dinero")}
          <td style={{ ...td, background: "#F1F7EE", textTransform: "capitalize", whiteSpace: "nowrap" }}>{a.fecha ? nombreDelMes(mesDe(a.fecha)) : "—"}</td>
          <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(dividir(a.leadsObtenidos, a.leadsEsperados), "porcentaje")}</td>
          <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(dividir(a.inscritos, a.leadsObtenidos), "porcentaje")}</td>
          <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(dividir(a.costo, a.leadsObtenidos), "dinero")}</td>
          <td style={{ ...tdNum, background: "#F1F7EE" }}>{formatear(dividir(a.venta, a.costo), "decimal")}</td>
          <td data-lectura={lectura} style={{ ...td, background: "#F1F7EE", fontWeight: 700, whiteSpace: "nowrap", color: COLOR_LECTURA[lectura] ?? "#9E2F29" }}>{lectura || "—"}</td>
          <td style={td}>
            {puede && (
              <Boton peligro onClick={async () => {
                if (!window.confirm(`¿Borrar la acción «${a.accion}»?`)) return;
                setAviso(await ctx.guardar.borrarAccion(a.id));
              }}>Borrar</Boton>
            )}
          </td>
        </tr>
      );
    });

  const encabezado = (
    <thead>
      <tr>
        {["Tipo de acción", "Acción (qué se hará)", "Responsable (MK / Ventas)", "Persona a cargo", "Fecha", "Estado", "Costo $", "Leads esperados", "Leads obtenidos", "Inscritos / ventas cerradas", "Venta generada $"].map((h) => (
          <th key={h} style={{ ...th, whiteSpace: "normal", minWidth: 70 }}>{h}</th>
        ))}
        {["Mes", "Leads vs esperado", "Conversión", "Costo por lead $", "Retorno (venta ÷ costo)", "Lectura"].map((h) => (
          <th key={h} style={{ ...th, whiteSpace: "normal", minWidth: 70, background: "#E6F0E1" }}>{h}</th>
        ))}
        <th style={th} />
      </tr>
    </thead>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>
        Plan de acciones — Marketing y Ventas · <span style={{ textTransform: "capitalize" }}>{nombreDelMes(ctx.mes)}</span>
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 980 }}>
        Cada acción se anota ANTES de hacerla (qué, cuándo, cuánto cuesta y cuántos leads se esperan) y se completa DESPUÉS con
        lo que dio. Así se mide qué acción sí vende. Fondo amarillo = MK · azul = Ventas; cada quien llena sus acciones. Estado:
        Planificada → Hecha (o Reprogramada / Cancelada). Si se reprograma, cambiar la fecha. Lo «Hecho» se completa con sus
        resultados a los 7 días.
      </p>

      {atrasadas.length > 0 && (
        <>
          <Titulo nota="Quedaron sin marcar como hechas o canceladas en meses anteriores (o no tienen fecha).">Pendientes de antes</Titulo>
          <Ancha><table style={tabla} data-acciones-atrasadas>{encabezado}<tbody>{filas(atrasadas)}</tbody></table></Ancha>
        </>
      )}

      <Titulo>Acciones del mes</Titulo>
      <Ancha>
        <table style={tabla} data-acciones>
          {encabezado}
          <tbody>
            {delMes.length === 0 && <tr><td colSpan={18} style={{ ...td, color: T.faint, padding: 14 }}>No hay acciones con fecha en este mes.</td></tr>}
            {filas(delMes)}
          </tbody>
        </table>
      </Ancha>

      {responsables.length > 0 && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const error = await ctx.guardar.accion({
              tipo: nueva.tipo, accion: nueva.accion.trim(), responsable: nueva.responsable, persona: nueva.persona.trim() || null,
              fecha: nueva.fecha || null, estado: "Planificada", costo: null, leadsEsperados: null, leadsObtenidos: null, inscritos: null, venta: null,
            });
            setAviso(error);
            if (!error) setNueva({ ...nueva, accion: "", persona: "", fecha: "" });
          }}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 12.5 }}
        >
          <strong style={{ color: T.ink }}>Nueva acción:</strong>
          <select aria-label="Tipo de la acción nueva" value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })} style={entrada(190)}>
            {TIPOS_DE_ACCION.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input aria-label="Qué se hará" placeholder="Acción (qué se hará)" value={nueva.accion} onChange={(e) => setNueva({ ...nueva, accion: e.target.value })} style={entrada(260)} />
          <select aria-label="Responsable de la acción nueva" value={nueva.responsable} onChange={(e) => setNueva({ ...nueva, responsable: e.target.value as "MK" | "Ventas" })} style={entrada(90)}>
            {responsables.map((r) => <option key={r}>{r}</option>)}
          </select>
          <input aria-label="Persona a cargo de la acción nueva" placeholder="Persona a cargo" value={nueva.persona} onChange={(e) => setNueva({ ...nueva, persona: e.target.value })} style={entrada(140)} />
          <input aria-label="Fecha de la acción nueva" type="date" value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} style={entrada(140)} />
          <button type="submit" disabled={!nueva.accion.trim()} style={{ ...entrada(90), background: T.ink, color: "#fff", cursor: "pointer", opacity: nueva.accion.trim() ? 1 : 0.4 }}>Agregar</button>
        </form>
      )}
      {aviso && <p role="alert" style={{ color: "#9E2F29", fontSize: 12.5 }}>{aviso}</p>}

      <Comentario
        titulo="Comentario sobre el plan de acciones"
        texto={comentario?.texto ?? ""}
        actualizadoEn={comentario?.actualizadoEn}
        puede={ctx.permisos.mk || ctx.permisos.ventas}
        onGuardar={(t) => ctx.guardar.comentario("acciones", t)}
      />
    </div>
  );
}

const entrada = (ancho: number) => ({
  width: ancho, fontSize: 12.5, padding: "5px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: "#FFFDF4", color: T.ink,
});
