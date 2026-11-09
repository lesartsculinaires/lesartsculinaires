"use client";

/**
 * «Resumen mensual»: suma las semanas de cada mes de las dos hojas de
 * registro, el plan de acciones y la actividad. No se escribe nada acá. Las
 * columnas son las de la plantilla, en su orden; una fila por mes, los trece
 * meses hasta el elegido.
 */

import type { ResumenMes } from "@/lib/tablero/calculos";
import { CANALES_TABLERO, type Formato } from "@/lib/tablero/campos";
import { nombreDelMes } from "@/lib/tablero/semanas";
import { T } from "@/lib/theme";
import { Ancha, formatear, tabla, td, tdNum, th } from "@/components/modules/tablero/comun";
import type { Contexto } from "@/components/modules/tablero/TableroComercial";

interface Columna { nombre: string; formato?: Formato; valor: (r: ResumenMes) => number | null; grupo: string }

const COLUMNAS: Columna[] = [
  { grupo: "MK", nombre: "Semanas del mes", valor: (r) => r.semanas },
  { grupo: "MK", nombre: "Semanas cargadas MK", valor: (r) => r.semanasMk },
  { grupo: "MK", nombre: "Avance MK", formato: "porcentaje", valor: (r) => r.avanceMk },
  { grupo: "MK", nombre: "Inversión $", formato: "dinero", valor: (r) => r.inversion },
  { grupo: "MK", nombre: "Alcance", valor: (r) => r.alcance },
  { grupo: "MK", nombre: "Seguidores nuevos", valor: (r) => r.seguidores },
  { grupo: "MK", nombre: "Publicaciones", valor: (r) => r.publicaciones },
  { grupo: "MK", nombre: "Visitas colegios/ferias", valor: (r) => r.visitasColegios },
  { grupo: "MK", nombre: "Clases muestra", valor: (r) => r.clasesMuestra },
  { grupo: "MK", nombre: "Leads", valor: (r) => r.leads },
  ...CANALES_TABLERO.map((c) => ({ grupo: "MK", nombre: `Leads ${c.nombre}`, valor: (r: ResumenMes) => r.leadsPorCanal[c.clave] })),
  { grupo: "MK", nombre: "Reseñas", valor: (r) => r.resenas },
  { grupo: "MK", nombre: "Calificación", formato: "decimal", valor: (r) => r.calificacion },
  { grupo: "Ventas", nombre: "Semanas cargadas Ventas", valor: (r) => r.semanasVentas },
  { grupo: "Ventas", nombre: "Avance Ventas", formato: "porcentaje", valor: (r) => r.avanceVentas },
  { grupo: "Ventas", nombre: "Contactados <24 h", valor: (r) => r.contactados24h },
  { grupo: "Ventas", nombre: "Contactados", valor: (r) => r.contactados },
  { grupo: "Ventas", nombre: "Citas", valor: (r) => r.citas },
  { grupo: "Ventas", nombre: "Inscritos", valor: (r) => r.inscritos },
  ...CANALES_TABLERO.map((c) => ({ grupo: "Ventas", nombre: `Inscritos ${c.nombre}`, valor: (r: ResumenMes) => r.inscritosPorCanal[c.clave] })),
  { grupo: "Ventas", nombre: "Cursos cortos", valor: (r) => r.cursosCortos },
  { grupo: "Ventas", nombre: "Cotizaciones corp.", valor: (r) => r.cotizacionesCorp },
  { grupo: "Ventas", nombre: "Contratos corp.", valor: (r) => r.contratosCorp },
  { grupo: "Ventas", nombre: "Nuevos $", formato: "dinero", valor: (r) => r.cobradoNuevos },
  { grupo: "Ventas", nombre: "Cursos cortos $", formato: "dinero", valor: (r) => r.cursosCortosMonto },
  { grupo: "Ventas", nombre: "Corporativo $", formato: "dinero", valor: (r) => r.corporativoMonto },
  { grupo: "Ventas", nombre: "Venta nueva $", formato: "dinero", valor: (r) => r.ventaNueva },
  { grupo: "Ventas", nombre: "Descuentos $", formato: "dinero", valor: (r) => r.descuentos },
  { grupo: "Plan de acciones", nombre: "Acciones MK que ya debían hacerse", valor: (r) => r.acciones.mkDebian },
  { grupo: "Plan de acciones", nombre: "Acciones MK hechas", valor: (r) => r.acciones.mkHechas },
  { grupo: "Plan de acciones", nombre: "Acciones MK sin pauta planificadas", valor: (r) => r.acciones.mkSinPauta },
  { grupo: "Plan de acciones", nombre: "Acciones Ventas que ya debían hacerse", valor: (r) => r.acciones.ventasDebian },
  { grupo: "Plan de acciones", nombre: "Acciones Ventas hechas", valor: (r) => r.acciones.ventasHechas },
  { grupo: "Plan de acciones", nombre: "Leads de acciones", valor: (r) => r.acciones.leads },
  { grupo: "Plan de acciones", nombre: "Leads esperados de acciones", valor: (r) => r.acciones.leadsEsperados },
  { grupo: "Plan de acciones", nombre: "Inscritos de acciones", valor: (r) => r.acciones.inscritos },
  { grupo: "Plan de acciones", nombre: "Costo de acciones $", formato: "dinero", valor: (r) => r.acciones.costo },
  { grupo: "Plan de acciones", nombre: "Venta de acciones $", formato: "dinero", valor: (r) => r.acciones.venta },
  { grupo: "Actividad", nombre: "Llamadas", valor: (r) => r.actividad.llamadas },
  { grupo: "Actividad", nombre: "Mensajes", valor: (r) => r.actividad.mensajes },
  { grupo: "Actividad", nombre: "Recontactos", valor: (r) => r.actividad.recontactos },
  { grupo: "Actividad", nombre: "Citas agendadas", valor: (r) => r.actividad.citasAgendadas },
  { grupo: "Actividad", nombre: "Citas realizadas", valor: (r) => r.actividad.citasRealizadas },
  { grupo: "Actividad", nombre: "Salidas de campo", valor: (r) => r.actividad.salidasCampo },
  { grupo: "Actividad", nombre: "Eventos atendidos", valor: (r) => r.actividad.eventos },
  { grupo: "Actividad", nombre: "Cierres", valor: (r) => r.actividad.ventasCerradas },
  { grupo: "Actividad", nombre: "Filas de actividad", valor: (r) => r.actividad.filas },
];

const FONDO: Record<string, string> = { MK: "#FFFBEA", Ventas: "#EEF4FC", "Plan de acciones": "#F3EEF8", Actividad: "#EEF7F1" };

export function HojaResumen({ ctx }: { ctx: Contexto }) {
  const grupos = [...new Set(COLUMNAS.map((c) => c.grupo))];
  const filas = [...ctx.meses].reverse();
  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>Resumen mensual — {ctx.empresa} (se calcula solo)</h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 980 }}>
        Suma las semanas de cada mes de las dos hojas de registro, el plan de acciones y la actividad de ventas. No se escribe
        nada aquí. Se ven los trece meses hasta el mes elegido: el último es el mismo mes del año pasado.
      </p>
      <Ancha>
        <table style={tabla} data-resumen>
          <thead>
            <tr>
              <th style={th} />
              {grupos.map((g) => (
                <th key={g} colSpan={COLUMNAS.filter((c) => c.grupo === g).length} style={{ ...th, background: FONDO[g], color: T.ink, textAlign: "center" }}>{g}</th>
              ))}
            </tr>
            <tr>
              <th style={{ ...th, position: "sticky", left: 0, zIndex: 2, minWidth: 120 }}>Mes</th>
              {COLUMNAS.map((c) => <th key={c.nombre} style={{ ...th, whiteSpace: "normal", minWidth: 80, background: FONDO[c.grupo] }}>{c.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => {
              const r = ctx.resumenes.get(m)!;
              return (
                <tr key={m} data-mes={m} style={{ background: m === ctx.mes ? "#FFF8E1" : undefined }}>
                  <td style={{ ...td, position: "sticky", left: 0, background: m === ctx.mes ? "#FFF8E1" : T.surface, textTransform: "capitalize", fontWeight: m === ctx.mes ? 700 : 500, whiteSpace: "nowrap" }}>
                    {nombreDelMes(m)}
                  </td>
                  {COLUMNAS.map((c) => <td key={c.nombre} style={tdNum}>{formatear(c.valor(r), c.formato)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Ancha>
    </div>
  );
}
