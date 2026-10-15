import type { ReactNode } from "react";

import { AccionesDelReporte } from "@/components/reporte/AccionesDelReporte";
import { money } from "@/lib/format";
import type { FilaLead, Indicador, Reporte } from "@/lib/reporte";

/**
 * El reporte, dibujado para leerse sin conocer el CRM.
 *
 * Cada sección dice en una línea qué cuenta y cómo, porque quien lo lea puede
 * ser de marketing, de dirección o de académica, y un número sin su regla se
 * malinterpreta. Se imprime limpio: los botones desaparecen y las tablas no se
 * cortan a la mitad de una fila.
 */

const AZUL = "#031B4F";
const GRIS = "#4C5A7A";
const TENUE = "#8792AC";
const BORDE = "#DCE2EF";
const PAPEL = "#F4F6FB";

/** Los indicadores en que subir es malo. */
const MEJOR_SI_BAJA = new Set(["perdidos"]);

function cifra(i: Pick<Indicador, "formato">, v: number): string {
  if (i.formato === "dinero") return money(v);
  if (i.formato === "porcentaje") return `${v} %`;
  return v.toLocaleString("es-SV");
}

function Cambio({ i, contra }: { i: Indicador; contra: string }) {
  if (i.anterior == null) return null;
  if (i.cambio == null) {
    return <span style={{ color: TENUE }}>{contra}: {cifra(i, i.anterior)}</span>;
  }
  const sube = i.cambio > 0;
  const igual = Math.round(i.cambio) === 0;
  const bueno = igual ? null : MEJOR_SI_BAJA.has(i.clave) ? !sube : sube;
  const color = bueno == null ? TENUE : bueno ? "#1F6B3A" : "#9E2F29";
  const texto =
    i.formato === "porcentaje"
      ? `${sube ? "+" : ""}${Math.round(i.cambio)} pts`
      : `${sube ? "+" : ""}${Math.round(i.cambio)} %`;
  return (
    <span>
      <span style={{ color, fontWeight: 600 }}>{igual ? "igual" : `${sube ? "▲" : "▼"} ${texto}`}</span>
      <span style={{ color: TENUE }}> · {contra}: {cifra(i, i.anterior)}</span>
    </span>
  );
}

function Seccion({ titulo, explica, children }: { titulo: string; explica: string; children: ReactNode }) {
  return (
    <section className="rp-seccion" style={{ marginTop: 28 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontFamily: "var(--fuente-titulos), Georgia, serif" }}>{titulo}</h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: GRIS }}>{explica}</p>
      {children}
    </section>
  );
}

function Barra({ porcentaje, color = AZUL }: { porcentaje: number; color?: string }) {
  return (
    <div aria-hidden="true" style={{ height: 8, background: PAPEL, borderRadius: 4, minWidth: 80 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, porcentaje))}%`, height: 8, background: color, borderRadius: 4 }} />
    </div>
  );
}

function Tabla({ cabeza, filas, numericas = [] }: { cabeza: string[]; filas: ReactNode[][]; numericas?: number[] }) {
  if (filas.length === 0) return <p style={{ fontSize: 13, color: TENUE, margin: 0 }}>Sin datos en este período.</p>;
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${BORDE}`, borderRadius: 10 }}>
      <table className="rp-tabla">
        <thead>
          <tr>
            {cabeza.map((c, i) => (
              <th key={c} style={{ textAlign: numericas.includes(i) ? "right" : "left" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, n) => (
            <tr key={n}>
              {f.map((c, i) => (
                <td key={i} style={{ textAlign: numericas.includes(i) ? "right" : "left" }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const filaDeLead = (l: FilaLead): ReactNode[] => [
  <span key="c" style={{ whiteSpace: "nowrap" }}>{l.codigo}</span>,
  l.cliente,
  l.queTuvo,
  l.canal,
  l.programas,
  l.asesora,
  `${l.etapa} / ${l.estado}`,
  l.etiquetas || "—",
];

/**
 * Un lead perdido, con lo que escribió el equipo: se lee como una ficha, no
 * como una fila, porque lo que importa son las palabras de la asesora.
 */
function PerdidoConNotas({ l }: { l: FilaLead }) {
  return (
    <article data-perdido={l.codigo} className="rp-perdido" style={{ borderTop: `1px solid ${BORDE}`, padding: "10px 0" }}>
      <p style={{ margin: 0, fontSize: 13 }}>
        <strong>{l.cliente}</strong>
        <span style={{ color: TENUE }}> · {l.codigo}</span>
        <span style={{ color: GRIS }}> · {l.programas} · {l.canal} · {l.asesora}</span>
      </p>
      {l.perdidoPor && (
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: TENUE }}>Pasado a Perdido por {l.perdidoPor}</p>
      )}
      {l.notas.length === 0 ? (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: TENUE, fontStyle: "italic" }}>
          Sin notas: no se dejó ningún comentario en la ficha ni en el Inbox.
        </p>
      ) : (
        <ul data-notas style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55 }}>
          {l.notas.map((x, i) => (
            <li key={i}>
              <span style={{ color: TENUE }}>
                {x.fecha}
                {x.quien ? ` · ${x.quien}` : ""}
                {x.donde === "inbox" ? " · nota del Inbox" : ""}:
              </span>{" "}
              <span style={{ whiteSpace: "pre-wrap" }}>{x.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function ReporteVista({ reporte: r, csv, generado }: { reporte: Reporte; csv: string; generado: string }) {
  const esDia = r.periodo.tipo === "dia";
  const contra = esDia ? "día anterior" : "mes anterior";
  const archivo = `reporte-${esDia ? "dia" : "mes"}-${esDia ? r.periodo.desde : r.periodo.desde.slice(0, 7)}.csv`;
  const totalPerdidos = r.motivos.reduce((a, m) => a + m.leads, 0);

  return (
    <main className="rp" style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 60px", color: AZUL, fontFamily: "var(--fuente-cuerpo), system-ui, sans-serif" }}>
      <style>{`
        .rp-boton { font: inherit; font-size: 13px; padding: 9px 14px; border-radius: 9px; border: 1px solid #B4BFD8; background: #fff; color: ${AZUL}; cursor: pointer; min-height: 40px; display: inline-flex; align-items: center; }
        .rp-principal { background: ${AZUL}; color: #fff; border-color: ${AZUL}; }
        .rp-tabla { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .rp-tabla th { background: ${PAPEL}; font-weight: 600; padding: 9px 10px; color: ${GRIS}; white-space: nowrap; }
        .rp-tabla td { padding: 8px 10px; border-top: 1px solid ${BORDE}; vertical-align: top; }
        @media print {
          .rp-acciones { display: none !important; }
          .rp { padding: 0 !important; max-width: none !important; }
          .rp-seccion { break-inside: auto; }
          .rp-tabla tr { break-inside: avoid; }
          .rp-perdido { break-inside: avoid; }
          .rp-tabla th { background: #eef1f8 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 14mm; }
        }
      `}</style>

      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "flex-end" }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.14em", color: GRIS }}>LES ARTS CULINAIRES · CRM</p>
          <h1 style={{ margin: "4px 0 2px", fontSize: 30, fontFamily: "var(--fuente-titulos), Georgia, serif" }}>
            Reporte {esDia ? "del día" : "del mes"}
          </h1>
          <p style={{ margin: 0, fontSize: 15 }}>{r.periodo.etiqueta}</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: TENUE }}>
            Generado el {generado}. Leads contados por fecha de registro; ganados y perdidos, por fecha de cierre — igual que el Dashboard.
          </p>
        </div>
        <AccionesDelReporte tipo={r.periodo.tipo} desde={r.periodo.desde} csv={csv} archivo={archivo} />
      </header>

      <Seccion titulo="Resumen" explica={`Los números principales, comparados con el ${contra}.`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {r.indicadores.map((i) => (
            <div key={i.clave} data-indicador={i.clave} style={{ background: PAPEL, borderRadius: 10, padding: "12px 14px" }}>
              <p style={{ margin: 0, fontSize: 12, color: GRIS }}>{i.nombre}</p>
              <p data-valor style={{ margin: "4px 0", fontSize: 24, fontWeight: 600 }}>{cifra(i, i.valor)}</p>
              <p style={{ margin: 0, fontSize: 11.5 }}><Cambio i={i} contra={contra} /></p>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: TENUE }}>{i.explica}</p>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Lo más importante" explica="Lo que dicen los números, en palabras.">
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
          {r.conclusiones.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </Seccion>

      <Seccion
        titulo="Por qué se pierden"
        explica={totalPerdidos === 1 ? "El lead que se cerró como perdido en el período, con el motivo y las notas que dejó la asesora." : `Los ${totalPerdidos} leads que se cerraron como perdidos en el período, agrupados por el motivo que anotó la asesora, y abajo lo que escribió sobre cada uno.`}
      >
        {r.motivos.length === 0 ? (
          <p style={{ fontSize: 13, color: TENUE, margin: 0 }}>No se perdió ningún lead en este período.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, maxWidth: 760 }}>
            {r.motivos.map((m) => (
              <div key={m.motivo} data-motivo={m.motivo} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr 110px", gap: 12, alignItems: "center", fontSize: 13 }}>
                <span style={{ fontWeight: m.sinDecir ? 400 : 600, color: m.sinDecir ? TENUE : AZUL }}>{m.motivo}</span>
                <Barra porcentaje={m.porcentaje} color={m.sinDecir ? TENUE : "#9E2F29"} />
                <span style={{ textAlign: "right" }}>{m.leads} · {m.porcentaje} %</span>
                {m.programaPrincipal && (
                  <span style={{ gridColumn: "1 / -1", fontSize: 11.5, color: GRIS, marginTop: -4 }}>
                    Donde más se repite: {m.programaPrincipal}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {r.motivos.some((m) => m.detalle.length > 0) && (
          <div data-detalle-perdidos style={{ marginTop: 20 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Lo que anotaron las asesoras</h3>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: GRIS }}>
              Cada lead perdido, agrupado por motivo, con los comentarios de su ficha y las notas internas del Inbox,
              y quién lo pasó a Perdido.
            </p>
            {r.motivos.map((m) => (
              <section key={m.motivo} data-grupo-motivo={m.motivo} className="rp-seccion" style={{ marginTop: 12 }}>
                <h4 style={{ margin: "0 0 2px", fontSize: 13.5, color: m.sinDecir ? GRIS : "#9E2F29" }}>
                  {m.motivo} · {m.leads}
                </h4>
                {m.detalle.map((l) => <PerdidoConNotas key={l.codigo} l={l} />)}
              </section>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Programas"
        explica="Todos los cursos que se ofrecen, con su información y lo que pasó con cada uno. Interesados: leads nuevos que preguntaron por el programa (uno puede preguntar por varios)."
      >
        <Tabla
          cabeza={["Programa", "Categoría", "Precio", "Horario", "Interesados", "Ganados", "Perdidos", "Monto ganado"]}
          numericas={[2, 4, 5, 6, 7]}
          filas={r.programas.map((p) => [
            <strong key="n">{p.nombre}{!p.activo ? " (dado de baja)" : ""}</strong>,
            p.categoria,
            p.precio == null ? "—" : money(p.precio),
            p.horario || "—",
            p.interesados,
            p.ganados,
            p.perdidos,
            p.montoGanado ? money(p.montoGanado) : "—",
          ])}
        />
      </Seccion>

      <Seccion titulo="Canales" explica="Por dónde llegaron los leads nuevos, y cuántos ganados y perdidos dejó cada canal.">
        <Tabla
          cabeza={["Canal", "Leads nuevos", "% de los nuevos", "", "Ganados", "Perdidos"]}
          numericas={[1, 2, 4, 5]}
          filas={r.canales.map((c) => [
            <strong key="c">{c.canal}</strong>,
            c.nuevos,
            `${c.porcentaje} %`,
            <Barra key="b" porcentaje={c.porcentaje} />,
            c.ganados,
            c.perdidos,
          ])}
        />
      </Seccion>

      {r.semanas.length > 0 && (
        <Seccion titulo="Semana por semana" explica="Cómo se repartió el mes.">
          <Tabla
            cabeza={["Semana", "Leads nuevos", "Ganados", "Perdidos"]}
            numericas={[1, 2, 3]}
            filas={r.semanas.map((s) => [s.etiqueta, s.nuevos, s.ganados, s.perdidos])}
          />
        </Seccion>
      )}

      <Seccion
        titulo="Equipo"
        explica="Lo que hizo cada asesora: leads nuevos asignados, ganados y perdidos, conversaciones que contestó, mensajes que envió, tarjetas que movió en el Pipeline y seguimientos que anotó."
      >
        <Tabla
          cabeza={["Asesora", "Leads nuevos", "Ganados", "Perdidos", "Conversaciones", "Mensajes", "Movimientos", "Seguimientos"]}
          numericas={[1, 2, 3, 4, 5, 6, 7]}
          filas={r.asesoras.map((a) => [
            <strong key="a">{a.quien}</strong>, a.nuevos, a.ganados, a.perdidos, a.conversaciones, a.mensajes, a.movimientos, a.seguimientos,
          ])}
        />
      </Seccion>

      <Seccion titulo="Etiquetas" explica="Las etiquetas puestas a los leads del período, en su ficha o en su conversación.">
        {r.etiquetas.length === 0 ? (
          <p style={{ fontSize: 13, color: TENUE, margin: 0 }}>Ningún lead del período tiene etiquetas.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {r.etiquetas.map((e) => (
              <span key={e.nombre} style={{ border: `1.5px solid ${e.color}`, color: e.color, borderRadius: 999, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>
                {e.nombre} · {e.leads}
              </span>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo="De dónde son" explica="Departamento de los leads nuevos.">
        <Tabla
          cabeza={["Territorio", "Leads nuevos", "%"]}
          numericas={[1, 2]}
          filas={r.territorios.map((t) => [t.territorio, t.nuevos, `${t.porcentaje} %`])}
        />
      </Seccion>

      {esDia && (
        <Seccion titulo="Todos los leads del día" explica="Cada lead que entró, se ganó o se perdió en el día.">
          <Tabla
            cabeza={["Código", "Cliente", "Qué pasó", "Canal", "Programas", "Asesora", "Etapa / estado", "Etiquetas"]}
            filas={r.leads.map(filaDeLead)}
          />
        </Seccion>
      )}
    </main>
  );
}
