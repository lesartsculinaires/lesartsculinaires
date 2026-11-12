"use client";

/**
 * «Tablero Comercial de los Institutos»: la hoja «Tablero» de la plantilla tal
 * como la armó la Dirección, con Les Arts Culinaires y Haute Couture lado a
 * lado. Es la portada del sitio.
 *
 * Los cálculos son los mismos del módulo de cada CRM (`lib/tablero/calculos`):
 * acá sólo se ponen las dos empresas juntas, como en el Excel —el índice
 * general y por responsable cuentan los KPIs de las dos—.
 */

import type { ReactNode } from "react";
import {
  calcularGrupo,
  faltaVender,
  indiceDe,
  kpisDelMes,
  lecturaDelCuadre,
  type KpiDelMes,
  type ResumenMes,
} from "@/lib/tablero/calculos";
import { CANALES_TABLERO, HOJAS_CON_COMENTARIO } from "@/lib/tablero/campos";
import { mesAnterior, nombreDelMes } from "@/lib/tablero/semanas";
import type { Armado } from "@/lib/tablero/armar";
import type { DatosTablero } from "@/app/tablero-actions";
import { T } from "@/lib/theme";
import { Ancha, Semaforo, Tendencia, Titulo, formatear, tabla, td, tdNum, th, thNum } from "@/components/modules/tablero/comun";
import { IDENTIDAD, LogoDeMarca, SelloDeMarca } from "@/components/ambas/identidad";

export interface EmpresaDelSitio {
  clave: "lac" | "hc";
  nombre: string;
  corto: string;
  datos: DatosTablero;
  armado: Armado;
}

interface Calculado {
  e: EmpresaDelSitio;
  r: ResumenMes;
  kpis: KpiDelMes[];
  kpisAntes: KpiDelMes[];
}

function calcular(e: EmpresaDelSitio, mes: string): Calculado {
  const r = e.armado.resumenes.get(mes)!;
  const antes = e.armado.resumenes.get(mesAnterior(mes));
  const antesDeAntes = antes ? e.armado.resumenes.get(mesAnterior(antes.mes)) : undefined;
  return {
    e,
    r,
    kpis: kpisDelMes(r, e.armado.metas, antes),
    kpisAntes: antes ? kpisDelMes(antes, e.armado.metas, antesDeAntes) : [],
  };
}

function Indice({
  titulo,
  valor,
  anterior,
  chico = false,
  marca,
}: {
  titulo: string;
  valor: number | null;
  anterior?: number | null;
  chico?: boolean;
  /** Si es de una marca: su franja, su tinte y su logo. */
  marca?: "lac" | "hc";
}) {
  const id = marca ? IDENTIDAD[marca] : null;
  const comparacion =
    valor == null || anterior == null
      ? null
      : valor > anterior ? `▲ Mejoró vs mes anterior (${formatear(anterior, "porcentaje")})`
      : valor < anterior ? `▼ Empeoró vs mes anterior (${formatear(anterior, "porcentaje")})`
      : "= Igual que el mes anterior";
  return (
    <div
      data-indice-de={marca}
      style={{
        border: `1px solid ${T.border}`,
        borderTop: id ? `4px solid ${id.franja}` : `1px solid ${T.border}`,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: chico ? 150 : 190,
        background: id ? id.tinte : T.surface,
      }}
    >
      {marca ? (
        <div style={{ margin: "2px 0 4px" }}>
          <LogoDeMarca clave={marca} alto={22} />
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: T.muted }}>{titulo}</div>
      )}
      <div data-indice={titulo} style={{ fontSize: chico ? 20 : 28, fontWeight: 700, color: id ? id.color : T.ink, marginTop: 2 }}>
        {valor == null ? "Sin datos" : formatear(valor, "porcentaje")}
      </div>
      {comparacion && (
        <div style={{ fontSize: 11, color: comparacion.startsWith("▲") ? "#1E6B3A" : comparacion.startsWith("▼") ? "#9E2F29" : T.muted }}>{comparacion}</div>
      )}
    </div>
  );
}

/** Una tabla «Concepto | LAC | HC | de dónde sale», como en la plantilla. */
function PorEmpresa({ filas, empresas, nota }: { filas: [string, string, string, string?][]; empresas: Calculado[]; nota?: string }) {
  return (
    <Ancha>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={th}>Concepto</th>
            {empresas.map((c) => (
              <th
                key={c.e.clave}
                style={{ ...thNum, background: IDENTIDAD[c.e.clave].tinteFuerte, borderBottom: `3px solid ${IDENTIDAD[c.e.clave].franja}` }}
              >
                <SelloDeMarca clave={c.e.clave} estilo={{ justifyContent: "flex-end" }} />
              </th>
            ))}
            {nota && <th style={th}>{nota}</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map(([concepto, a, b, de]) => {
            const fuerte = concepto === concepto.toUpperCase();
            return (
              <tr key={concepto}>
                <td style={{ ...td, whiteSpace: "pre", fontWeight: fuerte ? 700 : 400 }}>{concepto}</td>
                <td style={{ ...tdNum, fontWeight: 600, background: IDENTIDAD[empresas[0].e.clave].tinte, color: IDENTIDAD[empresas[0].e.clave].color }}>{a}</td>
                <td style={{ ...tdNum, fontWeight: 600, background: IDENTIDAD[empresas[1].e.clave].tinte, color: IDENTIDAD[empresas[1].e.clave].color }}>{b}</td>
                {nota && <td style={{ ...td, color: T.faint }}>{de ?? ""}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Ancha>
  );
}

const RESPONSABLE = { ventas: "Gerente Ventas", mk: "Director MK", compartido: "MK + Ventas" } as const;

export function HojaTableroConjunto({ lac, hc, mes, hoy }: { lac: EmpresaDelSitio; hc: EmpresaDelSitio; mes: string; hoy: string }) {
  const empresas = [calcular(lac, mes), calcular(hc, mes)];
  const todos = empresas.flatMap((c) => c.kpis);
  const todosAntes = empresas.flatMap((c) => c.kpisAntes);
  const [L, H] = empresas;

  // ¿Cuánto falta vender?
  const falta = empresas.map((c) => faltaVender(c.r, c.e.armado.metas));
  const fila = (concepto: string, f: (c: Calculado, i: number) => string, de: string): [string, string, string, string] =>
    [concepto, f(L, 0), f(H, 1), de];

  // Grupos en venta: los que inician desde el mes elegido.
  const grupos = empresas.map((c) =>
    c.e.datos.grupos.filter((g) => !g.inicio || g.inicio >= mes).map((g) => ({ g, k: calcularGrupo(g, hoy) })),
  );
  const sumaG = (i: number, f: (x: (typeof grupos)[number][number]) => number | null) => grupos[i].reduce((s, x) => s + (f(x) ?? 0), 0);

  // Qué canal convierte, las dos juntas.
  const leadsDe = (canal: string) => {
    const v = empresas.map((c) => c.r.leadsPorCanal[canal as keyof ResumenMes["leadsPorCanal"]]);
    return v.every((x) => x == null) ? null : v.reduce<number>((s, x) => s + (x ?? 0), 0);
  };
  const inscritosDe = (canal: string) => {
    const v = empresas.map((c) => c.r.inscritosPorCanal[canal as keyof ResumenMes["inscritosPorCanal"]]);
    return v.every((x) => x == null) ? null : v.reduce<number>((s, x) => s + (x ?? 0), 0);
  };
  const totalLeads = CANALES_TABLERO.reduce((s, c) => s + (leadsDe(c.clave) ?? 0), 0);
  const totalInscritos = CANALES_TABLERO.reduce((s, c) => s + (inscritosDe(c.clave) ?? 0), 0);

  const comentarios = empresas.flatMap((c) =>
    HOJAS_CON_COMENTARIO.map((h) => ({ c, h, x: c.e.datos.comentarios.find((k) => k.hoja === h.hoja) })).filter((y) => y.x?.texto),
  );

  const celdaDe = (titulo: string, contenido: ReactNode) => (
    <div>
      <div style={{ fontSize: 12, color: T.muted, margin: "0 0 6px", fontWeight: 600 }}>{titulo}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{contenido}</div>
    </div>
  );

  return (
    <div data-hoja-conjunta>
      <h2 style={{ margin: "0 0 4px", fontSize: 19, color: T.ink }}>
        Tablero Comercial de los Institutos — Marketing y Ventas · <span style={{ textTransform: "capitalize" }}>{nombreDelMes(mes)}</span>
      </h2>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: T.muted, maxWidth: 980, lineHeight: 1.5 }}>
        Les Arts Culinaires y Haute Couture. Cada área llena su parte en el CRM de su empresa; acá se ve todo junto, al momento.
        Índice de cumplimiento: % de los KPIs con meta y con datos que llegaron a su meta.
      </p>
      <div data-leyenda-marcas style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 16px" }}>
        {empresas.map((c) => (
          <span
            key={c.e.clave}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px 6px 10px",
              borderRadius: 8,
              background: IDENTIDAD[c.e.clave].tinte,
              borderLeft: `4px solid ${IDENTIDAD[c.e.clave].franja}`,
              fontSize: 12.5,
            }}
          >
            <SelloDeMarca clave={c.e.clave} />
            <span style={{ color: T.muted, fontWeight: 400 }}>· {c.e.clave === "lac" ? "azul" : "dorado"} en todo el tablero</span>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
        {celdaDe("Índice de cumplimiento general", <Indice titulo="LAC + HC" valor={indiceDe(todos)} anterior={todosAntes.length ? indiceDe(todosAntes) : null} />)}
        {celdaDe("Por instituto", empresas.map((c) => (
          <Indice key={c.e.clave} chico marca={c.e.clave} titulo={c.e.nombre} valor={indiceDe(c.kpis)} anterior={c.kpisAntes.length ? indiceDe(c.kpisAntes) : null} />
        )))}
        {celdaDe("Por responsable", <>
          <Indice chico titulo="Gerente de Ventas" valor={indiceDe(todos, "ventas")} />
          <Indice chico titulo="Director de MK" valor={indiceDe(todos, "mk")} />
          <Indice chico titulo="Compartidos MK + Ventas" valor={indiceDe(todos, "compartido")} />
        </>)}
      </div>

      <Titulo nota="Venta nueva, aparte de las mensualidades que ya entran.">¿Cuánto falta vender este mes?</Titulo>
      <PorEmpresa
        empresas={empresas}
        nota="Cómo se obtiene"
        filas={[
          fila("META DE VENTA NUEVA", (_, i) => formatear(falta[i].meta, "dinero"), "Definida por Dirección General"),
          fila("Venta nueva lograda", (_, i) => formatear(falta[i].lograda, "dinero"), "Registro de Ventas"),
          fila("     · Alumnos nuevos (matrícula + 1ª cuota)", (c) => formatear(c.r.cobradoNuevos, "dinero"), "Registro de Ventas"),
          fila("     · Cursos cortos", (c) => formatear(c.r.cursosCortosMonto, "dinero"), "Registro de Ventas"),
          fila("     · Corporativo", (c) => formatear(c.r.corporativoMonto, "dinero"), "Registro de Ventas"),
          fila("FALTA POR VENDER", (_, i) => (falta[i].meta == null ? "—" : falta[i].cubierta ? "Cubierto" : formatear(falta[i].falta, "dinero")), "Meta − venta lograda"),
          fila("% de la meta de venta nueva", (_, i) => formatear(falta[i].porcentaje, "porcentaje"), "Venta lograda ÷ meta"),
          fila("Semanas que quedan en el mes", (_, i) => String(falta[i].semanasQuedan), "Semanas del mes que todavía no terminan"),
          fila("Hay que vender por semana", (_, i) => formatear(falta[i].porSemana, "dinero"), "Falta por vender ÷ semanas que quedan"),
        ]}
      />

      <Titulo nota="Dónde se conectan los dos registros: los leads que trajo MK contra lo que hizo Ventas con ellos.">Cuadre MK ↔ Ventas</Titulo>
      <Ancha>
        <table style={tabla}>
          <thead>
            <tr>
              <th style={th}>Empresa</th>
              {["Leads que entregó MK", "Contactados por Ventas", "Sin contactar", "Contactados < 24 h", "Citas / visitas", "Inscritos", "Conversión lead → inscrito", "Costo de pauta por inscrito"].map((h) => <th key={h} style={thNum}>{h}</th>)}
              <th style={th}>Lectura</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map(({ e, r }) => (
              <tr key={e.clave} data-cuadre={e.clave} style={{ background: IDENTIDAD[e.clave].tinte }}>
                <td style={{ ...td, whiteSpace: "nowrap", borderLeft: `4px solid ${IDENTIDAD[e.clave].franja}` }}>
                  <SelloDeMarca clave={e.clave} />
                </td>
                <td style={tdNum}>{formatear(r.leads)}</td>
                <td style={tdNum}>{formatear(r.contactados)}</td>
                <td style={tdNum}>{r.leads == null || r.contactados == null ? "—" : formatear(r.leads - r.contactados)}</td>
                <td style={tdNum}>{formatear(r.leads && r.contactados24h != null ? r.contactados24h / r.leads : null, "porcentaje")}</td>
                <td style={tdNum}>{formatear(r.citas)}</td>
                <td style={tdNum}>{formatear(r.inscritos)}</td>
                <td style={tdNum}>{formatear(r.leads && r.inscritos != null ? r.inscritos / r.leads : null, "porcentaje")}</td>
                <td style={tdNum}>{formatear(r.inversion != null && r.inscritos ? r.inversion / r.inscritos : null, "dinero")}</td>
                <td style={{ ...td, fontWeight: 600 }}>{lecturaDelCuadre(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Ancha>

      <Titulo nota="Si un canal trae muchos leads pero pocos inscritos, MK y Ventas revisan juntos: o el lead llega mal calificado, o no se está atendiendo bien.">
        Qué canal sí convierte (LAC + HC juntos)
      </Titulo>
      <Ancha>
        <table style={tabla}>
          <thead>
            <tr>
              <th style={th}>Canal</th>
              {["Leads (MK)", "Inscritos (Ventas)", "Conversión", "% de los leads", "% de los inscritos"].map((h) => <th key={h} style={thNum}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {CANALES_TABLERO.map((c) => {
              const l = leadsDe(c.clave);
              const i = inscritosDe(c.clave);
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

      <Titulo nota="Los que inician desde el mes elegido (el detalle está en «Grupos en venta» de cada empresa).">Grupos en venta</Titulo>
      <PorEmpresa
        empresas={empresas}
        filas={[
          ["Grupos por iniciar", String(grupos[0].length), String(grupos[1].length)],
          ["Cupos meta", formatear(sumaG(0, (x) => x.g.cupo)), formatear(sumaG(1, (x) => x.g.cupo))],
          ["Reservas + inscritos", formatear(sumaG(0, (x) => x.k.ocupados)), formatear(sumaG(1, (x) => x.k.ocupados))],
          ["FALTAN POR LLENAR", formatear(sumaG(0, (x) => x.k.faltan)), formatear(sumaG(1, (x) => x.k.faltan))],
          ["Grupos en alerta URGENTE", String(grupos[0].filter((x) => x.k.alerta.startsWith("URGENTE")).length), String(grupos[1].filter((x) => x.k.alerta.startsWith("URGENTE")).length)],
          ["Mensualidad nueva con lo vendido hoy $/mes", formatear(sumaG(0, (x) => x.k.aportaHoy), "dinero"), formatear(sumaG(1, (x) => x.k.aportaHoy), "dinero")],
          ["Mensualidad nueva si se llenan (preventa) $/mes", formatear(sumaG(0, (x) => x.k.conCupoLleno), "dinero"), formatear(sumaG(1, (x) => x.k.conCupoLleno), "dinero")],
        ]}
      />

      <Titulo nota="No solo anuncios ni esperar llamadas.">Acciones y actividad del mes</Titulo>
      <PorEmpresa
        empresas={empresas}
        nota="De dónde sale"
        filas={[
          fila("MK: acciones hechas / que ya debían hacerse", (c) => `${c.r.acciones.mkHechas} de ${c.r.acciones.mkDebian}`, "Plan de acciones"),
          fila("MK: acciones sin pauta planificadas en el mes", (c) => String(c.r.acciones.mkSinPauta), "Plan de acciones"),
          fila("Ventas: acciones hechas / que ya debían hacerse", (c) => `${c.r.acciones.ventasHechas} de ${c.r.acciones.ventasDebian}`, "Plan de acciones"),
          fila("Leads de las acciones: obtenidos / esperados", (c) => `${formatear(c.r.acciones.leads)} de ${formatear(c.r.acciones.leadsEsperados)}`, "Plan de acciones (hechas)"),
          fila("Inscritos que salieron de las acciones", (c) => formatear(c.r.acciones.inscritos), "Plan de acciones (hechas)"),
          fila("Venta generada por las acciones $", (c) => formatear(c.r.acciones.venta, "dinero"), "Plan de acciones (hechas)"),
          fila("Costo de las acciones $", (c) => formatear(c.r.acciones.costo, "dinero"), "Plan de acciones (hechas)"),
          fila("Llamadas + mensajes + recontactos", (c) => (c.r.actividad.filas ? formatear((c.r.actividad.llamadas ?? 0) + (c.r.actividad.mensajes ?? 0) + (c.r.actividad.recontactos ?? 0)) : "—"), "Actividad de ventas"),
          fila("Citas agendadas / realizadas", (c) => (c.r.actividad.filas ? `${formatear(c.r.actividad.citasAgendadas)} / ${formatear(c.r.actividad.citasRealizadas)}` : "—"), "Actividad de ventas"),
          fila("Salidas de campo", (c) => formatear(c.r.actividad.salidasCampo), "Actividad de ventas"),
          fila("Eventos o clases muestra atendidos por Ventas", (c) => formatear(c.r.actividad.eventos), "Actividad de ventas"),
          fila("Ventas cerradas (según actividad)", (c) => formatear(c.r.actividad.ventasCerradas), "Actividad de ventas"),
        ]}
      />

      <Titulo nota="A mitad de mes, las metas de volumen se comparan contra la parte proporcional a las semanas ya cargadas.">Radiografía del mes: todos los KPIs</Titulo>
      <Ancha>
        <table style={tabla} data-radiografia>
          <thead>
            <tr>
              {["Empresa", "Responsable", "KPI"].map((h) => <th key={h} style={th}>{h}</th>)}
              {["Meta", "Real", "% cumplimiento"].map((h) => <th key={h} style={thNum}>{h}</th>)}
              <th style={th}>Estado</th>
              <th style={thNum}>Real mes anterior</th>
              {["Tendencia", "Cómo se mide"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {empresas.flatMap(({ e, kpis }) =>
              kpis.map((k, i) => (
                <tr
                  key={`${e.clave}-${k.kpi.clave}`}
                  data-kpi={`${e.clave}.${k.kpi.clave}`}
                  style={{ borderTop: i === 0 ? `3px solid ${IDENTIDAD[e.clave].franja}` : undefined, background: i % 2 ? IDENTIDAD[e.clave].tinte : undefined }}
                >
                  <td style={{ ...td, whiteSpace: "nowrap", borderLeft: `4px solid ${IDENTIDAD[e.clave].franja}` }}>
                    <SelloDeMarca clave={e.clave} corto medida={16} estilo={{ opacity: i === 0 ? 1 : 0.55 }} />
                  </td>
                  <td style={{ ...td, color: T.muted, whiteSpace: "nowrap" }}>{RESPONSABLE[k.kpi.responsable]}</td>
                  <td style={td}>{k.kpi.nombre}</td>
                  <td style={tdNum}>{formatear(k.meta, k.kpi.formato)}{k.meta != null && <span style={{ color: T.faint, fontSize: 10.5 }}> {k.kpi.sentido === "min" ? "mín." : "máx."}</span>}</td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>{formatear(k.real, k.kpi.formato)}</td>
                  <td style={tdNum}>{formatear(k.cumplimiento, "porcentaje")}</td>
                  <td style={td}><Semaforo estado={k.estado} /></td>
                  <td style={tdNum}>{formatear(k.anterior, k.kpi.formato)}</td>
                  <td style={td}><Tendencia mejoro={k.mejoro} /></td>
                  <td style={{ ...td, color: T.faint, fontSize: 11.5 }}>{k.kpi.comoSeMide}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </Ancha>

      <Titulo nota="Lo que escribió cada área en su hoja este mes, en el CRM de su empresa.">Comentarios del mes</Titulo>
      {comentarios.length === 0 ? (
        <p style={{ fontSize: 13, color: T.faint }}>Ningún área dejó comentario este mes.</p>
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {comentarios.map(({ c, h, x }) => (
            <section
              key={`${c.e.clave}-${h.hoja}`}
              data-comentario-de={`${c.e.clave}.${h.hoja}`}
              style={{ border: `1px solid ${T.border}`, borderLeft: `4px solid ${IDENTIDAD[c.e.clave].franja}`, borderRadius: 10, padding: "10px 12px", background: IDENTIDAD[c.e.clave].tinte }}
            >
              <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <SelloDeMarca clave={c.e.clave} medida={16} /> · {h.nombre}
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: T.ink, whiteSpace: "pre-wrap" }}>{x!.texto}</p>
              {x!.actualizadoEn && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: T.faint }}>
                  {new Date(x!.actualizadoEn).toLocaleString("es-SV", { timeZone: "America/El_Salvador", dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
