/**
 * El panel de Mathieu, el agente IA: cuántos mensajes contestó, en cuántos
 * chats, cuántas alertas dejó al equipo, y los cambios de respuesta que se le
 * hicieron para entrenarlo (27/11/2026).
 *
 * Sólo dibuja: los datos llegan armados (`MetricasMathieu`). El mismo archivo
 * vive en el CRM (Dashboard) y en el sitio de Dirección: si se cambia uno, se
 * cambia el otro.
 */
import type { ReactNode } from "react";

import { mensajesPorChat, type MetricasMathieu } from "@/lib/agente/metricas";

const VERDE = "#1F8A52";
const MORADO = "#5B3FC4";
const MORADO_FONDO = "#EEEBFB";
const AZUL = "#0B2257";
const TINTA = "var(--crm-ink, #141826)";
const SUAVE = "var(--crm-muted, #5B6478)";
const TENUE = "var(--crm-faint, #8A93A6)";
const BORDE = "var(--crm-border, #DADFE8)";
const PISTA = "var(--crm-paper, #EEF1F6)";
const SUPERFICIE = "var(--crm-surface, #FFFFFF)";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreDeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const diaCorto = (iso: string) => `${Number(iso.slice(8, 10))} ${CORTOS[Number(iso.slice(5, 7)) - 1]}`;
const cifra = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, uno: string, varios: string) => `${cifra(n)} ${n === 1 ? uno : varios}`;
/** La semana cortada al mes, como en la proyección: «1 nov», «2 nov – 8 nov». */
const tramo = (lunes: string, mes: string) => {
  const sumar = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);
  const fin = sumar(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 1)).toISOString().slice(0, 10), -1);
  const a = lunes < mes ? mes : lunes;
  const b = sumar(lunes, 6) > fin ? fin : sumar(lunes, 6);
  return a === b ? diaCorto(a) : `${diaCorto(a)} – ${diaCorto(b)}`;
};
const detalle = (msj: number, chats: number, cambios: number) =>
  `${plural(msj, "msj", "msj")} · ${plural(chats, "chat", "chats")}${cambios ? ` · ${plural(cambios, "cambio", "cambios")}` : ""}`;
const cuando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("es-SV", { timeZone: "America/El_Salvador", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

function Dato({ titulo, valor, nota, dato }: { titulo: string; valor: string; nota?: string; dato: string }) {
  return (
    <div data-dato-mathieu={dato} style={{ padding: "12px 14px", borderRadius: 10, background: PISTA, display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 11.5, color: SUAVE }}>{titulo}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: TINTA, lineHeight: 1.1 }}>{valor}</span>
      {nota && <span style={{ fontSize: 11, color: TENUE }}>{nota}</span>}
    </div>
  );
}

function Fila({ etiqueta, parte, texto, color }: { etiqueta: string; parte: number; texto: string; color: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 130px) 1fr minmax(120px, auto)", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: SUAVE }}>{etiqueta}</span>
      <div style={{ height: 10, borderRadius: 5, background: PISTA, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(1, parte)) * 100}%`, background: color, borderRadius: 5 }} />
      </div>
      <span style={{ fontSize: 12, color: TINTA, textAlign: "right" }}>{texto}</span>
    </div>
  );
}

function Subtitulo({ children }: { children: ReactNode }) {
  return <h4 style={{ margin: "18px 0 8px", fontSize: 13, fontWeight: 700, color: TINTA }}>{children}</h4>;
}

export function VistaMathieu({ m, cabecera }: { m: MetricasMathieu; cabecera?: ReactNode }) {
  const maxSemana = Math.max(1, ...m.semanas.map((s) => s.mensajes));
  const maxMes = Math.max(1, ...m.meses.map((x) => x.mensajes));
  const porChat = mensajesPorChat(m);

  return (
    <section data-mathieu style={{ background: SUPERFICIE, border: `1px solid ${BORDE}`, borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TINTA }}>🤖 Mathieu, el agente IA · {nombreDeMes(m.mes)}</h3>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: SUAVE }}>Lo que contestó en los chats de LAC y lo que se le enseñó para mejorar sus respuestas.</p>
        </div>
        {cabecera}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 14 }}>
        <Dato dato="mensajes" titulo="Mensajes que contestó" valor={cifra(m.mensajes)} />
        <Dato dato="chats" titulo="Chats que atendió" valor={cifra(m.chats)} nota={m.chats ? `${porChat} ${porChat === 1 ? "mensaje" : "mensajes"} por chat` : undefined} />
        <Dato dato="alertas" titulo="Alertas al equipo" valor={cifra(m.alertas)} nota="«el cliente necesita atención»" />
        <Dato dato="cambios" titulo="Cambios de respuesta" valor={cifra(m.cambios)} nota={`${plural(m.cambiosActivos, "activo", "activos")} en total`} />
      </div>

      <Subtitulo>Por semana</Subtitulo>
      <div data-mathieu-semanas style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {m.semanas.map((s) => (
          <Fila
            key={s.lunes}
            etiqueta={tramo(s.lunes, m.mes)}
            parte={s.mensajes / maxSemana}
            color={VERDE}
            texto={detalle(s.mensajes, s.chats, s.cambios)}
          />
        ))}
      </div>

      <Subtitulo>Últimos seis meses</Subtitulo>
      <div data-mathieu-meses style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {m.meses.map((x) => (
          <Fila
            key={x.mes}
            etiqueta={nombreDeMes(x.mes)}
            parte={x.mensajes / maxMes}
            color={AZUL}
            texto={detalle(x.mensajes, x.chats, x.cambios)}
          />
        ))}
      </div>

      <Subtitulo>Cambios de respuesta para entrenarlo</Subtitulo>
      {m.ultimos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: SUAVE }}>
          Todavía no hay cambios. Se hacen en el Inbox, en «Entrenamiento Mathieu».
        </p>
      ) : (
        <div data-mathieu-cambios style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {m.ultimos.map((c, i) => (
            <article key={`${c.en}-${i}`} data-cambio style={{ border: `1px solid ${BORDE}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12.5, color: TINTA }}>
                  <b>{c.situacion}</b>
                  <span style={{ color: SUAVE }}> · {c.quien ?? "Equipo"} · {cuando(c.en)}</span>
                </span>
                {c.estado === "desactivado" && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 9, background: "#EEF0F4", color: "#5B6478" }}>Desactivado</span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: SUAVE, letterSpacing: "0.04em" }}>ANTES CONTESTABA</span>
                  <span style={{ padding: "7px 10px", borderRadius: 8, background: AZUL, color: "#fff", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{c.textoAgente}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: MORADO, letterSpacing: "0.04em" }}>AHORA DEBE CONTESTAR</span>
                  <span style={{ padding: "7px 10px", borderRadius: 8, background: MORADO_FONDO, color: TINTA, fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{c.respuestaDeseada}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
