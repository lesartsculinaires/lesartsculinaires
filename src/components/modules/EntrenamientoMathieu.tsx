"use client";

/**
 * «Entrenamiento Mathieu»: el chat fijo del Inbox para enseñarle al agente
 * (27/11/2026, LAC).
 *
 * Tres pasos, de izquierda a derecha: elegir un lead que contestó Mathieu,
 * marcar el mensaje suyo que no gustó, y escribir cómo queremos que conteste.
 * Se aplica al momento —Raquel y Alexandra están a cargo, sin aprobación—: pasa
 * a los casos que Mathieu consulta. Un cambio que salió mal se desactiva en
 * «Cambios hechos». Sin capturas ni copiar: el mensaje se toma tal cual de la
 * base.
 *
 * Lo ven Raquel, Alexandra y los administradores (ver
 * `20261207120000_entrenamiento_agente.sql`). Nadie más.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import {
  activarEjemplo,
  chatsConMathieu,
  ejemplosEnviados,
  enviarEjemplo,
  escenariosDelAgente,
  mensajesParaMarcar,
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

type Pestana = "nuevo" | "cambios";
type Filtro = "hoy" | "semana" | "alerta";

const ESTADOS: Record<EjemploEnviado["estado"], { texto: string; fondo: string; color: string }> = {
  activo: { texto: "Activo · Mathieu ya lo usa", fondo: "#E8F6EE", color: "#14532D" },
  desactivado: { texto: "Desactivado", fondo: "#EEF0F4", color: "#5B6478" },
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
  /** Algo cambió (se guardó o se desactivó): la fila fija se recalcula. */
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
    setAviso({ ok: true, texto: t("Guardado: Mathieu lo usa desde su próximo mensaje. Lo ves en «Cambios hechos».") });
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
              {t("Elige el lead, marca el mensaje de Mathieu y escribe cómo queremos que conteste. Se aplica al momento.")}
            </p>
          </div>
        </div>
        <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" role="tab" aria-selected={pestana === "nuevo"} data-pestana-ent="nuevo" onClick={() => setPestana("nuevo")} style={pastilla(pestana === "nuevo")}>
            {t("Nuevo ejemplo")}
          </button>
          <button type="button" role="tab" aria-selected={pestana === "cambios"} data-pestana-ent="cambios" onClick={() => setPestana("cambios")} style={pastilla(pestana === "cambios")}>
            {t("Cambios hechos")} · {resumen.activos}
          </button>
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
                {t("Se aplica al momento: Mathieu lo usa desde su próximo mensaje. Si sale mal, se desactiva en «Cambios hechos».")}
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
                {enviando ? t("Guardando…") : t("Guardar cambio")}
              </button>
            </div>
          </section>
        </div>
      )}

      {pestana === "cambios" && (
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {ejemplos == null && <p style={{ fontSize: 12.5, color: T.muted }}>{t("Cargando…")}</p>}
          {ejemplos != null && ejemplos.length === 0 && (
            <p style={{ fontSize: 12.5, color: T.muted }}>{t("Todavía no hay cambios hechos.")}</p>
          )}
          {(ejemplos ?? []).map((e) => (
            <TarjetaCambio
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
          ))}
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

function TarjetaCambio({
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
  const [ocupado, setOcupado] = useState(false);
  const est = ESTADOS[e.estado];
  const esc = escenarios.find((x) => x.escenario === e.escenario)?.nombre;
  const activo = e.estado === "activo";

  const cambiar = async () => {
    if (activo && !window.confirm(t("¿Desactivar este cambio? Mathieu deja de usarlo."))) return;
    setOcupado(true);
    const r = await activarEjemplo(e.id, !activo);
    setOcupado(false);
    if (!r.ok) {
      onError(r.error ?? t("No se pudo cambiar."));
      return;
    }
    await onListo(activo ? t("Desactivado: Mathieu ya no lo usa.") : t("Activado otra vez: Mathieu lo vuelve a usar."));
  };

  return (
    <article data-ejemplo={e.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10, opacity: activo ? 1 : 0.75 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: T.ink }}>
          <b>{e.situacion}</b>
          <span style={{ color: T.muted }}>
            {" · "}
            {e.creadoPor ?? t("Equipo")} · {diaYHora(e.creadoEn)}
            {e.cliente ? ` · ${t("chat con")} ${e.cliente}` : ""}
            {esc ? ` · ${esc}` : ""}
          </span>
        </span>
        <span data-estado-ejemplo={e.estado} style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 9, background: est.fondo, color: est.color }}>
          {t(est.texto)}
        </span>
      </div>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: T.faint }}>
          {e.cambiadoPor && e.cambiadoEn ? `${activo ? t("Activado por") : t("Desactivado por")} ${e.cambiadoPor} · ${diaYHora(e.cambiadoEn)}` : ""}
        </span>
        <button
          type="button"
          data-activar={activo ? "no" : "si"}
          disabled={ocupado}
          onClick={() => void cambiar()}
          style={{
            height: 32,
            padding: "0 13px",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            background: T.surface,
            color: activo ? "#9E2F29" : "#14532D",
            border: `1px solid ${activo ? "#F0C2BE" : "#BFE3CD"}`,
            cursor: "pointer",
            opacity: ocupado ? 0.5 : 1,
          }}
        >
          {activo ? t("Desactivar") : t("Activar otra vez")}
        </button>
      </div>
    </article>
  );
}
