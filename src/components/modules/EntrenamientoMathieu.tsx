"use client";

/**
 * «Entrenamiento Mathieu»: el chat fijo del Inbox para enseñarle al agente
 * (27/11/2026, LAC).
 *
 * Tres pasos, de izquierda a derecha: elegir un lead que contestó Mathieu,
 * marcar el mensaje suyo que no gustó, y escribir cómo queremos que conteste.
 * Se envía a Dirección; al aprobarlo pasa a los casos que Mathieu consulta.
 * Sin capturas ni copiar: el mensaje se toma tal cual de la base.
 *
 * Lo ven Raquel, Alexandra y los administradores (ver
 * `20261207120000_entrenamiento_agente.sql`). Los administradores además
 * tienen la pestaña «Por aprobar».
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import {
  chatsConMathieu,
  ejemplosEnviados,
  enviarEjemplo,
  escenariosDelAgente,
  mensajesParaMarcar,
  revisarEjemplo,
  type ChatConMathieu,
  type EjemploEnviado,
  type Escenario,
  type MensajeParaMarcar,
  type ResumenEntrenamiento,
} from "@/app/entrenamiento-actions";
import { enSalvador } from "@/lib/format";
import { useT } from "@/lib/i18n/idioma";
import { T } from "@/lib/theme";

/** El morado del entrenamiento: distinto de un cliente y del verde del agente. */
export const MORADO = { fuerte: "#5B3FC4", texto: "#4A3A99", fondo: "#EEEBFB", borde: "#CFC6F2" } as const;

const hora = (iso: string) => enSalvador(new Date(iso), { hour: "2-digit", minute: "2-digit" });
const diaYHora = (iso: string) =>
  enSalvador(new Date(iso), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

type Pestana = "nuevo" | "enviados" | "aprobar";
type Filtro = "hoy" | "semana" | "alerta";

const ESTADOS: Record<EjemploEnviado["estado"], { texto: string; fondo: string; color: string }> = {
  pendiente: { texto: "Pendiente de aprobación", fondo: "#FFF4D6", color: "#7A5200" },
  aprobado: { texto: "Aprobado · Mathieu ya lo usa", fondo: "#E8F6EE", color: "#14532D" },
  devuelto: { texto: "Devuelto con comentario", fondo: "#FDECEA", color: "#9E2F29" },
  descartado: { texto: "Descartado", fondo: "#EEF0F4", color: "#5B6478" },
};

export function EntrenamientoMathieu({
  resumen,
  inicial,
  onVolver,
  onCambio,
}: {
  resumen: ResumenEntrenamiento;
  /** Al llegar desde «Enseñar a Mathieu» en un chat: ese chat y ese mensaje ya elegidos. */
  inicial?: { conversacionId: number; mensajeId: number } | null;
  onVolver: () => void;
  /** Algo cambió (se envió o se revisó): el número de la fila fija se recalcula. */
  onCambio: () => void;
}) {
  const t = useT();
  const [pestana, setPestana] = useState<Pestana>("nuevo");
  const [filtro, setFiltro] = useState<Filtro>("semana");
  const [buscar, setBuscar] = useState("");
  const [chats, setChats] = useState<ChatConMathieu[] | null>(null);
  const [chat, setChat] = useState<number | null>(inicial?.conversacionId ?? null);
  const [mensajes, setMensajes] = useState<MensajeParaMarcar[] | null>(null);
  const [marcados, setMarcados] = useState<number[]>(inicial ? [inicial.mensajeId] : []);
  const [respuesta, setRespuesta] = useState("");
  const [situacion, setSituacion] = useState("");
  const [escenario, setEscenario] = useState<number | null>(null);
  const [escenarios, setEscenarios] = useState<Escenario[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ejemplos, setEjemplos] = useState<EjemploEnviado[] | null>(null);

  useEffect(() => {
    void escenariosDelAgente().then(setEscenarios);
  }, []);

  useEffect(() => {
    setChats(null);
    void chatsConMathieu(filtro === "hoy" ? 1 : 7).then((r) => {
      setChats(r.chats);
      if (r.error) setAviso({ ok: false, texto: r.error });
    });
  }, [filtro]);

  useEffect(() => {
    if (chat == null) return;
    setMensajes(null);
    void mensajesParaMarcar(chat).then((r) => {
      setMensajes(r.mensajes);
      if (r.error) setAviso({ ok: false, texto: r.error });
    });
  }, [chat]);

  const cargarEjemplos = useCallback(async () => {
    const r = await ejemplosEnviados();
    setEjemplos(r.ejemplos);
    if (r.error) setAviso({ ok: false, texto: r.error });
  }, []);

  useEffect(() => {
    if (pestana !== "nuevo") void cargarEjemplos();
  }, [pestana, cargarEjemplos]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (chats ?? []).filter(
      (c) => (filtro !== "alerta" || c.conAlerta) && (!q || c.nombre.toLowerCase().includes(q)),
    );
  }, [chats, filtro, buscar]);

  // El chat elegido puede no estar en la lista (llegó desde otro chat, o es de
  // hace más de una semana): se muestra igual arriba de todo.
  const elegido = chats?.find((c) => c.conversacionId === chat) ?? null;
  const textosMarcados = (mensajes ?? []).filter((m) => marcados.includes(m.id));

  const enviar = async () => {
    if (chat == null || marcados.length === 0) return;
    setEnviando(true);
    setAviso(null);
    const r = await enviarEjemplo({ conversacionId: chat, mensajeIds: marcados, respuesta, situacion, escenario });
    setEnviando(false);
    if (!r.ok) {
      setAviso({ ok: false, texto: r.error ?? t("No se pudo enviar.") });
      return;
    }
    setAviso({ ok: true, texto: t("Enviado a Dirección para aprobar. Lo ves en «Enviados».") });
    setMarcados([]);
    setRespuesta("");
    setSituacion("");
    setEscenario(null);
    onCambio();
  };

  const pastilla = (activa: boolean): CSSProperties => ({
    height: 30,
    padding: "0 12px",
    borderRadius: 15,
    fontSize: 12.5,
    fontWeight: activa ? 600 : 400,
    border: activa ? "none" : `1px solid ${T.border}`,
    background: activa ? MORADO.fuerte : T.surface,
    color: activa ? "#fff" : T.ink,
    cursor: "pointer",
  });
  const caja: CSSProperties = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  };
  const titulo: CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700, color: T.ink };

  return (
    <div data-entrenamiento style={{ display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - 150px)", minHeight: 480 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button type="button" onClick={onVolver} data-volver-inbox style={{ ...pastilla(false), display: "flex", alignItems: "center", gap: 6 }}>
            ← {t("Volver al Inbox")}
          </button>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink }}>🤖 {t("Entrenamiento Mathieu")}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>
              {t("Elige el lead, marca el mensaje de Mathieu y escribe cómo queremos que conteste. Dirección lo aprueba.")}
            </p>
          </div>
        </div>
        <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" role="tab" aria-selected={pestana === "nuevo"} data-pestana-ent="nuevo" onClick={() => setPestana("nuevo")} style={pastilla(pestana === "nuevo")}>
            {t("Nuevo ejemplo")}
          </button>
          <button type="button" role="tab" aria-selected={pestana === "enviados"} data-pestana-ent="enviados" onClick={() => setPestana("enviados")} style={pastilla(pestana === "enviados")}>
            {t("Enviados")}
            {resumen.miosDevueltos > 0 && ` · ${resumen.miosDevueltos} ${t("devueltos")}`}
          </button>
          {resumen.admin && (
            <button type="button" role="tab" aria-selected={pestana === "aprobar"} data-pestana-ent="aprobar" onClick={() => setPestana("aprobar")} style={pastilla(pestana === "aprobar")}>
              {t("Por aprobar")} · {resumen.porAprobar}
            </button>
          )}
        </div>
      </div>

      {aviso && (
        <p
          role={aviso.ok ? "status" : "alert"}
          data-aviso-ent={aviso.ok ? "ok" : "error"}
          style={{
            margin: 0,
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12.5,
            background: aviso.ok ? "#E8F6EE" : "#FAE8E6",
            color: aviso.ok ? "#14532D" : "#9E2F29",
          }}
        >
          {aviso.texto}
        </p>
      )}

      {pestana === "nuevo" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, flex: 1, minHeight: 0, alignItems: "stretch" }}>
          {/* 1. El lead */}
          <section aria-label={t("Elegir el lead")} style={{ ...caja, flex: "1 1 230px", maxWidth: 300 }}>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, borderBottom: `1px solid ${T.border}` }}>
              <h3 style={titulo}>1. {t("¿Qué lead contestó Mathieu?")}</h3>
              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder={t("Buscar por nombre")}
                aria-label={t("Buscar lead")}
                style={{ fontFamily: "inherit", height: 34, padding: "0 10px", fontSize: 12.5, border: `1px solid ${T.border}`, borderRadius: 8 }}
              />
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {(
                  [
                    ["hoy", "Hoy"],
                    ["semana", "Esta semana"],
                    ["alerta", "Con alerta"],
                  ] as const
                ).map(([k, n]) => (
                  <button key={k} type="button" onClick={() => setFiltro(k)} style={{ ...pastilla(filtro === k), height: 26, fontSize: 11.5, padding: "0 9px" }}>
                    {t(n)}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11, color: T.muted }}>{t("Solo salen los chats donde contestó Mathieu.")}</span>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {chats == null && <p style={{ margin: 12, fontSize: 12, color: T.muted }}>{t("Cargando…")}</p>}
              {chats != null && visibles.length === 0 && (
                <p style={{ margin: 12, fontSize: 12, color: T.muted }}>{t("No hay chats de Mathieu con ese filtro.")}</p>
              )}
              {visibles.map((c) => {
                const activo = c.conversacionId === chat;
                return (
                  <button
                    key={c.conversacionId}
                    type="button"
                    data-chat-mathieu={c.conversacionId}
                    aria-pressed={activo}
                    onClick={() => {
                      setChat(c.conversacionId);
                      setMarcados([]);
                      setAviso(null);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      width: "100%",
                      textAlign: "left",
                      padding: "9px 12px",
                      border: "none",
                      borderBottom: `1px solid ${T.border}`,
                      background: activo ? MORADO.fondo : "transparent",
                      boxShadow: activo ? `inset 3px 0 0 ${MORADO.fuerte}` : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 6, width: "100%" }}>
                      <span style={{ fontSize: 13, fontWeight: activo ? 700 : 500, color: T.ink }}>{c.nombre}</span>
                      <span style={{ fontSize: 10.5, color: T.faint }}>{c.ultimo ? diaYHora(c.ultimo) : ""}</span>
                    </span>
                    <span style={{ fontSize: 11.5, color: activo ? MORADO.texto : T.muted }}>
                      {c.mensajesAgente} {c.mensajesAgente === 1 ? t("mensaje de Mathieu") : t("mensajes de Mathieu")}
                      {c.conAlerta ? ` · ⚠️ ${t("con alerta")}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Los mensajes */}
          <section aria-label={t("Marcar el mensaje de Mathieu")} style={{ ...caja, flex: "2 1 380px" }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <h3 style={titulo}>
                2. {t("Marca el mensaje de Mathieu")}
                {elegido ? ` · ${elegido.nombre}` : ""}
              </h3>
              {marcados.length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: MORADO.texto }}>
                  {marcados.length} {marcados.length === 1 ? t("elegido") : t("elegidos")}
                </span>
              )}
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 12, background: T.paper, display: "flex", flexDirection: "column", gap: 10 }}>
              {chat == null && <p style={{ margin: "auto", fontSize: 12.5, color: T.muted }}>{t("Elige un lead a la izquierda.")}</p>}
              {chat != null && mensajes == null && <p style={{ margin: "auto", fontSize: 12.5, color: T.muted }}>{t("Cargando…")}</p>}
              {(mensajes ?? []).map((m) => {
                const mio = m.direccion === "saliente";
                const texto = m.texto ?? `[${m.tipo}]`;
                if (!m.deAgente) {
                  return (
                    <div key={m.id} style={{ alignSelf: mio ? "flex-end" : "flex-start", maxWidth: "78%", display: "flex", flexDirection: "column", gap: 2, alignItems: mio ? "flex-end" : "flex-start" }}>
                      <span style={{ fontSize: 10.5, color: T.faint }}>
                        {mio ? t("Asesora") : t("Cliente")} · {hora(m.creadoEn)}
                      </span>
                      <span style={{ padding: "7px 11px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", background: mio ? "#DCE3F2" : T.surface, border: mio ? "none" : `1px solid ${T.border}`, color: T.ink }}>
                        {texto}
                      </span>
                    </div>
                  );
                }
                const marcado = marcados.includes(m.id);
                return (
                  <label
                    key={m.id}
                    data-msg-agente={m.id}
                    style={{
                      alignSelf: "flex-end",
                      maxWidth: "86%",
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                      padding: 6,
                      borderRadius: 12,
                      border: `2px solid ${marcado ? MORADO.fuerte : "transparent"}`,
                      background: marcado ? MORADO.fondo : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() =>
                        setMarcados((xs) => (xs.includes(m.id) ? xs.filter((x) => x !== m.id) : [...xs, m.id]))
                      }
                      style={{ fontFamily: "inherit", marginTop: 18, width: 17, height: 17, accentColor: MORADO.fuerte }}
                    />
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: MORADO.texto }}>🤖 Mathieu · {hora(m.creadoEn)}</span>
                      <span style={{ padding: "8px 11px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", background: "#0B2257", color: "#fff" }}>
                        {texto}
                      </span>
                    </span>
                  </label>
                );
              })}
              {mensajes != null && mensajes.length > 0 && (
                <span style={{ alignSelf: "center", fontSize: 11, color: T.faint }}>
                  {t("Solo se pueden marcar los mensajes de Mathieu.")}
                </span>
              )}
            </div>
          </section>

          {/* 3. Cómo queremos que conteste */}
          <section aria-label={t("Cómo queremos que conteste")} style={{ ...caja, flex: "1 1 280px", maxWidth: 380 }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
              <h3 style={titulo}>3. {t("Cómo queremos que conteste")}</h3>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, letterSpacing: "0.04em" }}>{t("MENSAJE ELEGIDO")}</span>
                {textosMarcados.length === 0 ? (
                  <span style={{ fontSize: 12, color: T.faint }}>{t("Marca uno o más mensajes de Mathieu.")}</span>
                ) : (
                  textosMarcados.map((m) => (
                    <span key={m.id} style={{ padding: "7px 10px", borderRadius: 8, fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap", background: "#0B2257", color: "#fff", maxHeight: 120, overflow: "auto" }}>
                      {m.texto ?? `[${m.tipo}]`}
                    </span>
                  ))
                )}
                <span style={{ fontSize: 11, color: T.muted }}>{t("Se guarda exacto, con el chat y la hora. No hace falta captura.")}</span>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: MORADO.texto }}>
                {t("Comentario y respuesta ideal")}
                <textarea
                  data-respuesta-ideal
                  rows={6}
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                  placeholder={t("Qué estuvo mal y cómo queremos que lo diga")}
                  style={{ fontFamily: "inherit", fontWeight: 400, fontSize: 12.5, lineHeight: 1.45, padding: "8px 10px", border: `1.5px solid ${MORADO.fuerte}`, borderRadius: 8, resize: "vertical", color: T.ink }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: T.ink }}>
                {t("Situación")}
                <input
                  data-situacion
                  value={situacion}
                  onChange={(e) => setSituacion(e.target.value)}
                  placeholder={t("Ej.: pregunta por descuentos")}
                  style={{ fontFamily: "inherit", fontWeight: 400, height: 34, padding: "0 10px", fontSize: 12.5, border: `1px solid ${T.border}`, borderRadius: 8 }}
                />
              </label>
              {escenarios.length > 0 && (
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: T.ink }}>
                  {t("Tipo de situación (opcional)")}
                  <select
                    value={escenario ?? ""}
                    onChange={(e) => setEscenario(e.target.value ? Number(e.target.value) : null)}
                    style={{ fontFamily: "inherit", fontWeight: 400, height: 34, padding: "0 8px", fontSize: 12.5, border: `1px solid ${T.border}`, borderRadius: 8 }}
                  >
                    <option value="">{t("Sin elegir (lo decide Dirección)")}</option>
                    {escenarios.map((e) => (
                      <option key={e.escenario} value={e.escenario}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span style={{ fontSize: 11.5, lineHeight: 1.45, padding: "7px 10px", borderRadius: 8, background: "#FFF8E6", color: "#5C4300" }}>
                {t("Va a Dirección para aprobar. Mathieu lo usa con clientes cuando se apruebe.")}
              </span>
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                data-enviar-ejemplo
                onClick={() => void enviar()}
                disabled={enviando || chat == null || marcados.length === 0 || !respuesta.trim() || !situacion.trim()}
                style={{
                  height: 38,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  background: MORADO.fuerte,
                  color: "#fff",
                  cursor: "pointer",
                  opacity: enviando || chat == null || marcados.length === 0 || !respuesta.trim() || !situacion.trim() ? 0.5 : 1,
                }}
              >
                {enviando ? t("Enviando…") : t("Enviar a aprobación")}
              </button>
            </div>
          </section>
        </div>
      )}

      {pestana !== "nuevo" && (
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {ejemplos == null && <p style={{ fontSize: 12.5, color: T.muted }}>{t("Cargando…")}</p>}
          {ejemplos != null &&
            (pestana === "aprobar" ? ejemplos.filter((e) => e.estado === "pendiente") : ejemplos).length === 0 && (
              <p style={{ fontSize: 12.5, color: T.muted }}>
                {pestana === "aprobar" ? t("No hay ejemplos por aprobar.") : t("Todavía no hay ejemplos enviados.")}
              </p>
            )}
          {(ejemplos ?? [])
            .filter((e) => (pestana === "aprobar" ? e.estado === "pendiente" : true))
            .map((e) =>
              pestana === "aprobar" ? (
                <TarjetaPorAprobar
                  key={e.id}
                  ejemplo={e}
                  escenarios={escenarios}
                  onListo={async (texto) => {
                    setAviso({ ok: true, texto });
                    await cargarEjemplos();
                    onCambio();
                  }}
                  onError={(texto) => setAviso({ ok: false, texto })}
                />
              ) : (
                <TarjetaEnviada key={e.id} ejemplo={e} escenarios={escenarios} />
              ),
            )}
        </div>
      )}
    </div>
  );
}

function DosColumnas({ agente, deseada }: { agente: string; deseada: ReactNode }) {
  const t = useT();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, letterSpacing: "0.04em" }}>{t("LO QUE PUSO MATHIEU")}</span>
        <span style={{ padding: "8px 11px", borderRadius: 8, fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", background: "#0B2257", color: "#fff" }}>
          {agente}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: MORADO.texto, letterSpacing: "0.04em" }}>{t("CÓMO QUEREMOS QUE CONTESTE")}</span>
        {deseada}
      </div>
    </div>
  );
}

function Cabecera({ e }: { e: EjemploEnviado }) {
  const t = useT();
  const est = ESTADOS[e.estado];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12.5, color: T.ink }}>
        <b>{e.situacion}</b>
        <span style={{ color: T.muted }}>
          {" · "}
          {e.creadoPor ?? t("Equipo")} · {diaYHora(e.creadoEn)}
          {e.cliente ? ` · ${t("chat con")} ${e.cliente}` : ""}
        </span>
      </span>
      <span data-estado-ejemplo={e.estado} style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 9, background: est.fondo, color: est.color }}>
        {t(est.texto)}
      </span>
    </div>
  );
}

function TarjetaEnviada({ ejemplo: e, escenarios }: { ejemplo: EjemploEnviado; escenarios: Escenario[] }) {
  const t = useT();
  const esc = escenarios.find((x) => x.escenario === e.escenario)?.nombre;
  return (
    <article data-ejemplo={e.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <Cabecera e={e} />
      {e.textoCliente && (
        <span style={{ fontSize: 12, color: T.muted }}>
          {t("El cliente escribió")}: «{e.textoCliente}»
        </span>
      )}
      <DosColumnas
        agente={e.textoAgente}
        deseada={
          <span style={{ padding: "8px 11px", borderRadius: 8, fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", background: MORADO.fondo, border: `1px solid ${MORADO.borde}`, color: T.ink }}>
            {e.respuestaDeseada}
          </span>
        }
      />
      {(e.nota || esc) && (
        <span style={{ fontSize: 12, color: T.ink }}>
          {esc && <>{t("Tipo")}: {esc}. </>}
          {e.nota && (
            <>
              <b>{t("Comentario de Dirección")}:</b> {e.nota}
            </>
          )}
        </span>
      )}
      {e.revisadoPor && e.revisadoEn && (
        <span style={{ fontSize: 11, color: T.faint }}>
          {t("Revisado por")} {e.revisadoPor} · {diaYHora(e.revisadoEn)}
        </span>
      )}
    </article>
  );
}

function TarjetaPorAprobar({
  ejemplo: e,
  escenarios,
  onListo,
  onError,
}: {
  ejemplo: EjemploEnviado;
  escenarios: Escenario[];
  onListo: (texto: string) => Promise<void>;
  onError: (texto: string) => void;
}) {
  const t = useT();
  const [respuesta, setRespuesta] = useState(e.respuestaDeseada);
  const [situacion, setSituacion] = useState(e.situacion);
  const [escenario, setEscenario] = useState<number | null>(e.escenario);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const hacer = async (accion: "aprobar" | "devolver" | "descartar") => {
    if (accion === "devolver" && !nota.trim()) {
      onError(t("Escribe en el comentario qué hay que cambiar para devolverlo."));
      return;
    }
    if (accion === "descartar" && !window.confirm(t("¿Descartar este ejemplo? Mathieu no lo va a usar."))) return;
    setOcupado(true);
    const r = await revisarEjemplo({ id: e.id, accion, respuesta, situacion, escenario, nota });
    setOcupado(false);
    if (!r.ok) {
      onError(r.error ?? t("No se pudo guardar la revisión."));
      return;
    }
    await onListo(
      accion === "aprobar"
        ? t("Aprobado: Mathieu lo usa desde su próximo mensaje.")
        : accion === "devolver"
          ? t("Devuelto con tu comentario.")
          : t("Descartado."),
    );
  };

  const boton = (fondo: string, color: string, borde: string): CSSProperties => ({
    height: 36,
    padding: "0 14px",
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    background: fondo,
    color,
    border: borde,
    cursor: "pointer",
    opacity: ocupado ? 0.5 : 1,
  });

  return (
    <article data-ejemplo={e.id} style={{ background: T.surface, border: "1px solid #F0D592", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <Cabecera e={e} />
      {e.textoCliente && (
        <span style={{ fontSize: 12, color: T.muted }}>
          {t("El cliente escribió")}: «{e.textoCliente}»
        </span>
      )}
      <DosColumnas
        agente={e.textoAgente}
        deseada={
          <textarea
            data-editar-respuesta
            rows={4}
            value={respuesta}
            onChange={(x) => setRespuesta(x.target.value)}
            style={{ fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.45, padding: "8px 10px", border: `1.5px solid ${MORADO.borde}`, borderRadius: 8, resize: "vertical", color: T.ink }}
          />
        }
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          aria-label={t("Situación")}
          value={situacion}
          onChange={(x) => setSituacion(x.target.value)}
          style={{ fontFamily: "inherit", flex: "1 1 200px", height: 34, padding: "0 10px", fontSize: 12.5, border: `1px solid ${T.border}`, borderRadius: 8 }}
        />
        {escenarios.length > 0 && (
          <select
            aria-label={t("Tipo de situación")}
            value={escenario ?? ""}
            onChange={(x) => setEscenario(x.target.value ? Number(x.target.value) : null)}
            style={{ fontFamily: "inherit", flex: "1 1 200px", height: 34, padding: "0 8px", fontSize: 12.5, border: `1px solid ${T.border}`, borderRadius: 8 }}
          >
            <option value="">{t("Otra situación / escenario libre")}</option>
            {escenarios.map((x) => (
              <option key={x.escenario} value={x.escenario}>
                {x.nombre}
              </option>
            ))}
          </select>
        )}
        <input
          data-nota
          aria-label={t("Comentario para quien lo envió")}
          placeholder={t("Comentario para quien lo envió (obligatorio para devolver)")}
          value={nota}
          onChange={(x) => setNota(x.target.value)}
          style={{ fontFamily: "inherit", flex: "2 1 280px", height: 34, padding: "0 10px", fontSize: 12.5, border: `1px solid ${T.border}`, borderRadius: 8 }}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" data-aprobar disabled={ocupado} onClick={() => void hacer("aprobar")} style={boton("#1F8A52", "#fff", "none")}>
          {t("Aprobar")}
        </button>
        <button type="button" data-devolver disabled={ocupado} onClick={() => void hacer("devolver")} style={boton(T.surface, "#7A5200", "1px solid #F0D592")}>
          {t("Devolver con comentario")}
        </button>
        <button type="button" data-descartar disabled={ocupado} onClick={() => void hacer("descartar")} style={boton(T.surface, "#9E2F29", "1px solid #F0C2BE")}>
          {t("Descartar")}
        </button>
      </div>
    </article>
  );
}
