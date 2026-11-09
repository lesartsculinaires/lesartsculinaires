"use client";

/**
 * La hoja «Tablero»: lo que la Dirección mira cada lunes. No se escribe nada
 * acá salvo el comentario de Dirección; todo sale de las otras hojas.
 */

import { useMemo } from "react";
import {
  calcularGrupo,
  faltaVender,
  indiceDe,
  kpisDelMes,
  lecturaDelCuadre,
  type KpiDelMes,
} from "@/lib/tablero/calculos";
import { CANALES_TABLERO } from "@/lib/tablero/campos";
import { mesAnterior, nombreDelMes } from "@/lib/tablero/semanas";
import { T } from "@/lib/theme";
import { Ancha, Comentario, Semaforo, Tendencia, Titulo, formatear, tabla, td, tdNum, th, thNum } from "@/components/modules/tablero/comun";
import type { Contexto } from "@/components/modules/tablero/TableroComercial";

function Indice({ titulo, valor, anterior }: { titulo: string; valor: number | null; anterior?: number | null }) {
  const comparacion =
    valor == null || anterior == null
      ? null
      : valor > anterior ? `▲ Mejoró vs mes anterior (${formatear(anterior, "porcentaje")})`
      : valor < anterior ? `▼ Empeoró vs mes anterior (${formatear(anterior, "porcentaje")})`
      : "= Igual que el mes anterior";
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", minWidth: 170, background: T.surface }}>
      <div style={{ fontSize: 11.5, color: T.muted }}>{titulo}</div>
      <div data-indice={titulo} style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginTop: 2 }}>
        {valor == null ? "Sin datos" : formatear(valor, "porcentaje")}
      </div>
      {comparacion && <div style={{ fontSize: 11, color: comparacion.startsWith("▲") ? "#1E6B3A" : comparacion.startsWith("▼") ? "#9E2F29" : T.muted }}>{comparacion}</div>}
    </div>
  );
}

export function HojaTablero({ ctx, kpis }: { ctx: Contexto; kpis: KpiDelMes[] }) {
  const r = ctx.resumenes.get(ctx.mes)!;
  const antes = ctx.resumenes.get(mesAnterior(ctx.mes));
  const kpisAntes = useMemo(
    () => (antes ? kpisDelMes(antes, ctx.metas, ctx.resumenes.get(mesAnterior(antes.mes))) : []),
    [antes, ctx.metas, ctx.resumenes],
  );
  const falta = faltaVender(r, ctx.metas);
  const comentario = ctx.datos.comentarios.find((c) => c.hoja === "direccion");

  const grupos = ctx.datos.grupos
    .filter((g) => !g.inicio || g.inicio >= ctx.mes)
    .map((g) => ({ g, c: calcularGrupo(g, ctx.hoy) }));
  const sumaG = (f: (x: (typeof grupos)[number]) => number | null) => grupos.reduce((s, x) => s + (f(x) ?? 0), 0);

  const totalLeads = CANALES_TABLERO.reduce((s, c) => s + (r.leadsPorCanal[c.clave] ?? 0), 0);
  const totalInscritos = CANALES_TABLERO.reduce((s, c) => s + (r.inscritosPorCanal[c.clave] ?? 0), 0);

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>
        Tablero Comercial — {ctx.empresa} · <span style={{ textTransform: "capitalize" }}>{nombreDelMes(ctx.mes)}</span>
      </h2>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: T.muted }}>
        Índice de cumplimiento: % de los KPIs con meta y con datos que llegaron a su meta. Es la nota del mes.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Indice titulo={ctx.empresa} valor={indiceDe(kpis)} anterior={antes ? indiceDe(kpisAntes) : null} />
        <Indice titulo="Director de MK" valor={indiceDe(kpis, "mk")} />
        <Indice titulo="Gerente de Ventas" valor={indiceDe(kpis, "ventas")} />
        <Indice titulo="Compartidos MK + Ventas" valor={indiceDe(kpis, "compartido")} />
      </div>

      <Titulo nota="Venta nueva, aparte de las mensualidades que ya entran.">¿Cuánto falta vender este mes?</Titulo>
      <Ancha>
        <table style={tabla}>
          <tbody>
            {[
              ["META DE VENTA NUEVA", formatear(falta.meta, "dinero"), "Definida por Dirección General"],
              ["Venta nueva lograda", formatear(falta.lograda, "dinero"), "Registro de Ventas"],
              ["     · Alumnos nuevos (matrícula + 1ª cuota)", formatear(r.cobradoNuevos, "dinero"), "Registro de Ventas"],
              ["     · Cursos cortos", formatear(r.cursosCortosMonto, "dinero"), "Registro de Ventas"],
              ["     · Corporativo", formatear(r.corporativoMonto, "dinero"), "Registro de Ventas"],
              ["FALTA POR VENDER", falta.meta == null ? "—" : falta.cubierta ? "Cubierto" : formatear(falta.falta, "dinero"), "Meta − venta lograda"],
              ["% de la meta de venta nueva", formatear(falta.porcentaje, "porcentaje"), "Venta lograda ÷ meta"],
              ["Semanas que quedan en el mes", String(falta.semanasQuedan), "Semanas del mes que todavía no terminan"],
              ["Hay que vender por semana", formatear(falta.porSemana, "dinero"), "Falta por vender ÷ semanas que quedan"],
            ].map(([a, b, c]) => (
              <tr key={a}>
                <td style={{ ...td, whiteSpace: "pre", fontWeight: a === a.toUpperCase() ? 700 : 400 }}>{a}</td>
                <td data-falta-vender={a.trim()} style={{ ...tdNum, fontWeight: 600 }}>{b}</td>
                <td style={{ ...td, color: T.faint }}>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Ancha>

      <Titulo nota="Dónde se conectan los dos registros: los leads que trajo MK contra lo que hizo Ventas con ellos.">Cuadre MK ↔ Ventas</Titulo>
      <Ancha>
        <table style={tabla}>
          <thead>
            <tr>
              {["Leads que entregó MK", "Contactados por Ventas", "Sin contactar", "Contactados < 24 h", "Citas / visitas", "Inscritos", "Conversión lead → inscrito", "Costo de pauta por inscrito", "Lectura"].map((h) => <th key={h} style={h === "Lectura" ? th : thNum}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr data-cuadre>
              <td style={tdNum}>{formatear(r.leads)}</td>
              <td style={tdNum}>{formatear(r.contactados)}</td>
              <td style={tdNum}>{r.leads == null || r.contactados == null ? "—" : formatear(r.leads - r.contactados)}</td>
              <td style={tdNum}>{formatear(r.leads ? (r.contactados24h ?? null) == null ? null : r.contactados24h! / r.leads : null, "porcentaje")}</td>
              <td style={tdNum}>{formatear(r.citas)}</td>
              <td style={tdNum}>{formatear(r.inscritos)}</td>
              <td style={tdNum}>{formatear(r.leads && r.inscritos != null ? r.inscritos / r.leads : null, "porcentaje")}</td>
              <td style={tdNum}>{formatear(r.inversion != null && r.inscritos ? r.inversion / r.inscritos : null, "dinero")}</td>
              <td style={{ ...td, fontWeight: 600 }}>{lecturaDelCuadre(r)}</td>
            </tr>
          </tbody>
        </table>
      </Ancha>

      <Titulo nota="Si un canal trae muchos leads pero pocos inscritos, MK y Ventas revisan juntos: o el lead llega mal calificado, o no se está atendiendo bien.">Qué canal sí convierte</Titulo>
      <Ancha>
        <table style={tabla}>
          <thead>
            <tr>{["Canal", "Leads (MK)", "Inscritos (Ventas)", "Conversión", "% de los leads", "% de los inscritos"].map((h) => <th key={h} style={h === "Canal" ? th : thNum}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {CANALES_TABLERO.map((c) => {
              const l = r.leadsPorCanal[c.clave];
              const i = r.inscritosPorCanal[c.clave];
              return (
                <tr key={c.clave} data-canal={c.clave}>
                  <td style={td}>{c.nombre}{c.pauta ? " (pauta)" : ""}</td>
                  <td style={tdNum}>{formatear(l)}</td>
                  <td style={tdNum}>{formatear(i)}</td>
                  <td style={tdNum}>{formatear(l ? (i ?? 0) / l : null, "porcentaje")}</td>
                  <td style={tdNum}>{formatear(totalLeads ? (l ?? 0) / totalLeads : null, "porcentaje")}</td>
                  <td style={tdNum}>{formatear(totalInscritos ? (i ?? 0) / totalInscritos : null, "porcentaje")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Ancha>

      <Titulo nota="Los que inician desde el mes elegido (detalle en la hoja «Grupos en venta»).">Grupos en venta</Titulo>
      <Ancha>
        <table style={tabla}>
          <tbody>
            {[
              ["Grupos por iniciar", String(grupos.length)],
              ["Cupos meta", formatear(sumaG((x) => x.g.cupo))],
              ["Reservas + inscritos", formatear(sumaG((x) => x.c.ocupados))],
              ["FALTAN POR LLENAR", formatear(sumaG((x) => x.c.faltan))],
              ["Grupos en alerta URGENTE", String(grupos.filter((x) => x.c.alerta.startsWith("URGENTE")).length)],
              ["Mensualidad nueva con lo vendido hoy $/mes", formatear(sumaG((x) => x.c.aportaHoy), "dinero")],
              ["Mensualidad nueva si se llenan (preventa) $/mes", formatear(sumaG((x) => x.c.conCupoLleno), "dinero")],
            ].map(([a, b]) => (
              <tr key={a}><td style={{ ...td, fontWeight: a === a.toUpperCase() ? 700 : 400 }}>{a}</td><td style={{ ...tdNum, fontWeight: 600 }}>{b}</td></tr>
            ))}
          </tbody>
        </table>
      </Ancha>

      <Titulo nota="No solo anuncios ni esperar llamadas.">Acciones y actividad del mes</Titulo>
      <Ancha>
        <table style={tabla}>
          <tbody>
            {[
              ["MK: acciones hechas / que ya debían hacerse", `${r.acciones.mkHechas} de ${r.acciones.mkDebian}`, "Plan de acciones"],
              ["MK: acciones sin pauta planificadas en el mes", String(r.acciones.mkSinPauta), "Plan de acciones"],
              ["Ventas: acciones hechas / que ya debían hacerse", `${r.acciones.ventasHechas} de ${r.acciones.ventasDebian}`, "Plan de acciones"],
              ["Leads de las acciones: obtenidos / esperados", `${formatear(r.acciones.leads)} de ${formatear(r.acciones.leadsEsperados)}`, "Plan de acciones (hechas)"],
              ["Inscritos que salieron de las acciones", formatear(r.acciones.inscritos), "Plan de acciones (hechas)"],
              ["Venta generada por las acciones $", formatear(r.acciones.venta, "dinero"), "Plan de acciones (hechas)"],
              ["Costo de las acciones $", formatear(r.acciones.costo, "dinero"), "Plan de acciones (hechas)"],
              ["Llamadas + mensajes + recontactos", r.actividad.filas ? formatear((r.actividad.llamadas ?? 0) + (r.actividad.mensajes ?? 0) + (r.actividad.recontactos ?? 0)) : "—", "Actividad de ventas"],
              ["Citas agendadas / realizadas", r.actividad.filas ? `${formatear(r.actividad.citasAgendadas)} / ${formatear(r.actividad.citasRealizadas)}` : "—", "Actividad de ventas"],
              ["Salidas de campo", formatear(r.actividad.salidasCampo), "Actividad de ventas"],
              ["Eventos o clases muestra atendidos por Ventas", formatear(r.actividad.eventos), "Actividad de ventas"],
              ["Ventas cerradas (según actividad)", formatear(r.actividad.ventasCerradas), "Actividad de ventas"],
            ].map(([a, b, c]) => (
              <tr key={a}><td style={td}>{a}</td><td style={{ ...tdNum, fontWeight: 600 }}>{b}</td><td style={{ ...td, color: T.faint }}>{c}</td></tr>
            ))}
          </tbody>
        </table>
      </Ancha>

      <Titulo nota="A mitad de mes, las metas de volumen se comparan contra la parte proporcional a las semanas ya cargadas. Las metas se cambian en «Metas».">Radiografía del mes: todos los KPIs</Titulo>
      <Ancha>
        <table style={tabla}>
          <thead>
            <tr>{["Responsable", "KPI", "Meta", "Real", "% cumplimiento", "Estado", "Real mes anterior", "Tendencia", "Cómo se mide"].map((h) => <th key={h} style={["Meta", "Real", "% cumplimiento", "Real mes anterior"].includes(h) ? thNum : th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.kpi.clave} data-kpi={k.kpi.clave}>
                <td style={{ ...td, color: T.muted, whiteSpace: "nowrap" }}>
                  {k.kpi.responsable === "mk" ? "Director MK" : k.kpi.responsable === "ventas" ? "Gerente Ventas" : "MK + Ventas"}
                </td>
                <td style={td}>{k.kpi.nombre}</td>
                <td style={tdNum}>{formatear(k.meta, k.kpi.formato)}{k.meta != null && <span style={{ color: T.faint, fontSize: 10.5 }}> {k.kpi.sentido === "min" ? "mín." : "máx."}</span>}</td>
                <td style={{ ...tdNum, fontWeight: 600 }}>{formatear(k.real, k.kpi.formato)}</td>
                <td style={tdNum}>{formatear(k.cumplimiento, "porcentaje")}</td>
                <td style={td}><Semaforo estado={k.estado} /></td>
                <td style={tdNum}>{formatear(k.anterior, k.kpi.formato)}</td>
                <td style={td}><Tendencia mejoro={k.mejoro} /></td>
                <td style={{ ...td, color: T.faint, fontSize: 11.5 }}>{k.kpi.comoSeMide}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Ancha>

      <Comentario
        titulo="Comentario de Dirección"
        texto={comentario?.texto ?? ""}
        actualizadoEn={comentario?.actualizadoEn}
        puede={ctx.permisos.metas}
        onGuardar={(t) => ctx.guardar.comentario("direccion", t)}
      />
    </div>
  );
}
