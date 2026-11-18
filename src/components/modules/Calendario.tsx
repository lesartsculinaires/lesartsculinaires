"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { createEvento, updateEvento } from "@/app/actions";
import { pedirPermisoDeAvisos, permisoDeAvisos } from "@/hooks/useAvisoDeEvento";
import { MINUTOS_ANTES } from "@/lib/avisoDeEvento";
import {
  DIAS_CORTOS,
  DIAS_LETRA,
  acomodarDia,
  alCuarto,
  diaSV,
  diaDeLaSemana,
  etiquetaDeHora,
  grillaDelMes,
  horaDeMinuto,
  horaInputSV,
  horaSV,
  horarioDelEvento,
  hoySV,
  isoDesdeSV,
  minutoSV,
  mismoMes,
  moverRango,
  numeroDelDia,
  semanaDe,
  sumarMeses,
  tituloDelMes,
  tituloDelRango,
  type Vista,
} from "@/lib/calendario";
import { useCatalogo } from "@/lib/catalog";
import { T, softer, tinte } from "@/lib/theme";
import type { Evento, Oportunidad, TipoEvento } from "@/lib/types";

/**
 * El Calendario, con la forma de Google Calendar (12/11/2026).
 *
 * Se pidió así para que quien lo use ya sepa dónde está todo: «Crear» arriba a
 * la izquierda, el mes chico debajo, los filtros como «Mis calendarios», y
 * arriba «Hoy», las flechas y la vista (Día, Semana, Mes, Agenda). Un clic en
 * un hueco agenda a esa hora; un clic en un evento lo abre.
 *
 * Todo va en hora de El Salvador (ver `@/lib/calendario`), y los colores son
 * los de cada tipo de evento, los mismos de siempre.
 */
interface Props {
  eventos: Evento[];
  oportunidades: Oportunidad[];
  accent: string;
  onRefresh: () => void;
  /** Abre la ficha del lead. Sin esto no se ofrece el botón. */
  onAbrirFicha?: (oportunidadId: number) => void;
  /** La ficha de vendedor de quien mira: para decirle si la alerta le llega. */
  miVendedorId?: number | null;
}

const HORA_PX = 48;
const CLAVE_VISTA = "crm.calendario.vista";
const VISTAS: { valor: Vista; nombre: string; tecla: string }[] = [
  { valor: "dia", nombre: "Día", tecla: "D" },
  { valor: "semana", nombre: "Semana", tecla: "W" },
  { valor: "mes", nombre: "Mes", tecla: "M" },
  { valor: "agenda", nombre: "Agenda", tecla: "A" },
];
const CANALES = ["Llamada", "Presencial", "WhatsApp", "Meet"] as const;
const DURACIONES = [15, 20, 30, 45, 60, 90, 120];

const ESTADO_TONE: Record<string, [string, string]> = {
  Pendiente: ["#1D3A7A", "#EAF1FF"],
  Realizado: ["#2F6B4F", "#E6F0E9"],
  "No se presentó": ["#B85042", "#F7EBE9"],
  Reagendado: ["#9C7118", "#F6EEDC"],
  Cancelado: ["#6B665F", "#EFEDEA"],
};

/** «noviembre de 2026» → «Noviembre de 2026»: sólo la primera letra. */
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Lo que no se hizo se ve tachado. «Cancelado» llega de las citas de Meta. */
const tachado = (estado: string) => estado === "No se presentó" || estado === "Cancelado";

/** Lo que se tiene a mano para dibujar un evento. */
interface Rotulado {
  evento: Evento;
  tipo: TipoEvento | undefined;
  op: Oportunidad | undefined;
  color: string;
  titulo: string;
  hecho: boolean;
}

/** El hueco donde se quiere crear: día y hora de El Salvador. */
interface Hueco {
  dia: string;
  hora: string;
}

export function Calendario({
  eventos,
  oportunidades,
  accent,
  onRefresh,
  onAbrirFicha,
  miVendedorId = null,
}: Props) {
  const { tiposEvento, vendedores } = useCatalogo();

  const [hoy, setHoy] = useState(() => hoySV());
  const [ahoraMin, setAhoraMin] = useState(() => minutoSV(new Date().toISOString()));
  const [dia, setDia] = useState(hoy);
  const [vista, setVista] = useState<Vista>("semana");
  const [tiposOcultos, setTiposOcultos] = useState<ReadonlySet<number>>(() => new Set());
  const [asesorasOcultas, setAsesorasOcultas] = useState<ReadonlySet<number>>(() => new Set());
  const [creando, setCreando] = useState<Hueco | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [agendado, setAgendado] = useState<Evento | null>(null);

  // La vista elegida se recuerda en este navegador.
  useEffect(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_VISTA) as Vista | null;
      if (guardada && VISTAS.some((v) => v.valor === guardada)) setVista(guardada);
    } catch {
      // Sin almacenamiento: se queda en Semana.
    }
  }, []);
  const elegirVista = (v: Vista) => {
    setVista(v);
    try {
      localStorage.setItem(CLAVE_VISTA, v);
    } catch {
      // Ídem.
    }
  };

  // La línea roja de «ahora» y el «hoy» se mueven solos.
  useEffect(() => {
    const t = setInterval(() => {
      setHoy(hoySV());
      setAhoraMin(minutoSV(new Date().toISOString()));
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // Atajos de teclado como los de Google Calendar: D, W, M, A, T y las flechas.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (creando || abierto != null || agendado) return;
      const k = e.key.toUpperCase();
      const v = VISTAS.find((x) => x.tecla === k);
      if (v) elegirVista(v.valor);
      else if (k === "T") setDia(hoySV());
      else if (k === "J" || e.key === "ArrowRight") setDia((d) => moverRango(vista, d, 1));
      else if (k === "K" || e.key === "ArrowLeft") setDia((d) => moverRango(vista, d, -1));
      else if (k === "C") setCreando(huecoPorOmision(dia, hoy));
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [vista, dia, hoy, creando, abierto, agendado]);

  const tipoDe = (id: number) => tiposEvento.find((t) => t.id === id);
  const opDe = (id: number) => oportunidades.find((o) => o.id === id);

  const rotular = (e: Evento): Rotulado => {
    const tipo = tipoDe(e.tipoId);
    const op = opDe(e.oportunidadId);
    return {
      evento: e,
      tipo,
      op,
      color: tipo?.color ?? "#6B665F",
      titulo: op ? op.cliente : "Oportunidad no encontrada",
      hecho: e.estado !== "Pendiente",
    };
  };

  const visibles = useMemo(
    () =>
      eventos.filter(
        (e) =>
          !tiposOcultos.has(e.tipoId) &&
          !(e.vendedorId != null && asesorasOcultas.has(e.vendedorId)) &&
          !(e.vendedorId == null && asesorasOcultas.has(-1)),
      ),
    [eventos, tiposOcultos, asesorasOcultas],
  );

  const porDia = useMemo(() => {
    const m = new Map<string, Evento[]>();
    for (const e of visibles) {
      const d = diaSV(e.iniciaEn);
      m.set(d, [...(m.get(d) ?? []), e]);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.iniciaEn.localeCompare(b.iniciaEn));
    return m;
  }, [visibles]);

  const abiertoEvento = abierto != null ? eventos.find((e) => e.id === abierto) ?? null : null;
  const pendientesDelRango = useMemo(() => {
    const dias =
      vista === "dia" ? [dia] : vista === "semana" ? semanaDe(dia) : grillaDelMes(dia).flat().filter((d) => mismoMes(d, dia));
    return dias.reduce((n, d) => n + (porDia.get(d) ?? []).filter((e) => e.estado === "Pendiente").length, 0);
  }, [vista, dia, porDia]);

  const asesorasConEventos = useMemo(() => {
    const ids = new Set(eventos.map((e) => e.vendedorId ?? -1));
    return [
      ...vendedores.filter((v) => ids.has(v.id) || (v.activo && !v.academico)),
      ...(ids.has(-1) ? [{ id: -1, nombre: "Sin asesora" }] : []),
    ];
  }, [eventos, vendedores]);

  const alternar = (set: ReadonlySet<number>, id: number) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  return (
    <div data-calendario style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
      <style>{`
        [data-calendario] .cal-lateral { width: 236px; flex-shrink: 0; }
        @media (max-width: 960px) { [data-calendario] .cal-lateral { display: none; } }
        @media (min-width: 961px) { [data-calendario] .cal-crear-angosto { display: none; } }
        [data-calendario] .cal-hueco:hover { background: ${tinte(accent, 4)}; }
        [data-calendario] .cal-dia-num:hover { background: ${T.paper}; }
      `}</style>

      {/* ── La barra de la izquierda ─────────────────────────────────────── */}
      <aside className="cal-lateral">
        <button
          type="button"
          data-cal-crear
          onClick={() => setCreando(huecoPorOmision(dia, hoy))}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            height: 52,
            padding: "0 22px 0 16px",
            borderRadius: 16,
            background: T.surface,
            border: `1px solid ${T.border}`,
            boxShadow: "0 1px 3px rgba(3,27,79,0.18), 0 4px 10px rgba(3,27,79,0.10)",
            fontSize: 14,
            fontWeight: 600,
            color: T.ink,
            cursor: "pointer",
            marginBottom: 20,
          }}
        >
          <span style={{ fontSize: 26, lineHeight: 1, color: accent, fontWeight: 400 }}>+</span>
          Crear
        </button>

        <MiniMes dia={dia} hoy={hoy} accent={accent} porDia={porDia} onElegir={setDia} />

        <Seccion titulo="Asesoras">
          {asesorasConEventos.map((v) => (
            <Casilla
              key={v.id}
              marcada={!asesorasOcultas.has(v.id)}
              color={v.id === miVendedorId ? accent : "#5B6B8C"}
              onCambio={() => setAsesorasOcultas((s) => alternar(s, v.id))}
            >
              {v.nombre}
              {v.id === miVendedorId ? " (yo)" : ""}
            </Casilla>
          ))}
        </Seccion>

        <Seccion titulo="Tipos de evento">
          {tiposEvento.map((t) => (
            <Casilla
              key={t.id}
              marcada={!tiposOcultos.has(t.id)}
              color={t.color}
              onCambio={() => setTiposOcultos((s) => alternar(s, t.id))}
            >
              {t.nombre}
            </Casilla>
          ))}
        </Seccion>
      </aside>

      {/* ── Lo de la derecha ─────────────────────────────────────────────── */}
      <section style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" onClick={() => setDia(hoy)} style={botonBorde} title="Ir a hoy (T)">
            Hoy
          </button>
          <button type="button" aria-label="Anterior" title="Anterior (K)" onClick={() => setDia((d) => moverRango(vista, d, -1))} style={flecha}>
            ‹
          </button>
          <button type="button" aria-label="Siguiente" title="Siguiente (J)" onClick={() => setDia((d) => moverRango(vista, d, 1))} style={flecha}>
            ›
          </button>
          <h2 data-cal-titulo style={{ margin: 0, fontSize: 21, fontWeight: 400, color: T.ink }}>
            {mayuscula(tituloDelRango(vista, dia))}
          </h2>
          <span style={{ fontSize: 12, color: T.muted }}>
            {vista !== "agenda" && `${pendientesDelRango} pendiente${pendientesDelRango === 1 ? "" : "s"}`}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="cal-crear-angosto"
            onClick={() => setCreando(huecoPorOmision(dia, hoy))}
            style={{ ...botonBorde, borderColor: accent, color: accent, fontWeight: 600 }}
          >
            + Crear
          </button>
          <div role="tablist" aria-label="Vista" style={{ display: "inline-flex", border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
            {VISTAS.map((v) => (
              <button
                key={v.valor}
                type="button"
                role="tab"
                aria-selected={vista === v.valor}
                title={`${v.nombre} (${v.tecla})`}
                onClick={() => elegirVista(v.valor)}
                style={{
                  height: 34,
                  padding: "0 14px",
                  fontSize: 13,
                  background: vista === v.valor ? softer(accent) : T.surface,
                  color: vista === v.valor ? accent : T.ink,
                  fontWeight: vista === v.valor ? 600 : 400,
                  borderLeft: v.valor === "dia" ? "none" : `1px solid ${T.border}`,
                  cursor: "pointer",
                }}
              >
                {v.nombre}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
          {vista === "mes" && (
            <VistaMes
              dia={dia}
              hoy={hoy}
              accent={accent}
              porDia={porDia}
              rotular={rotular}
              onAbrir={setAbierto}
              onCrear={(d) => setCreando({ dia: d, hora: "09:00" })}
              onVerDia={(d) => {
                setDia(d);
                elegirVista("dia");
              }}
            />
          )}
          {(vista === "semana" || vista === "dia") && (
            <VistaHoras
              dias={vista === "dia" ? [dia] : semanaDe(dia)}
              hoy={hoy}
              ahoraMin={ahoraMin}
              accent={accent}
              porDia={porDia}
              rotular={rotular}
              onAbrir={setAbierto}
              onCrear={setCreando}
              onVerDia={(d) => {
                setDia(d);
                elegirVista("dia");
              }}
            />
          )}
          {vista === "agenda" && (
            <VistaAgenda desde={dia} hoy={hoy} accent={accent} porDia={porDia} rotular={rotular} onAbrir={setAbierto} />
          )}
        </div>
      </section>

      {creando && (
        <NuevoEvento
          hueco={creando}
          accent={accent}
          oportunidades={oportunidades}
          onCerrar={() => setCreando(null)}
          onCreado={(e) => {
            setCreando(null);
            setDia(diaSV(e.iniciaEn));
            setAgendado(e);
            onRefresh();
          }}
        />
      )}

      {abiertoEvento && (
        <DetalleEvento
          r={rotular(abiertoEvento)}
          accent={accent}
          onCerrar={() => setAbierto(null)}
          onAbrirFicha={onAbrirFicha}
          onCambio={() => onRefresh()}
        />
      )}

      {agendado && (
        <Agendado
          r={rotular(agendado)}
          accent={accent}
          miVendedorId={miVendedorId}
          onCerrar={() => setAgendado(null)}
        />
      )}
    </div>
  );
}

/** Si no se eligió un hueco: el día que se mira, a la próxima hora en punto. */
function huecoPorOmision(dia: string, hoy: string): Hueco {
  if (dia !== hoy) return { dia, hora: "09:00" };
  const proxima = Math.min(23, Math.floor(minutoSV(new Date().toISOString()) / 60) + 1);
  return { dia, hora: horaDeMinuto(proxima * 60) };
}

// ════════════════════════════════════════════════════════════════════════════
// La barra de la izquierda
// ════════════════════════════════════════════════════════════════════════════

function MiniMes({
  dia,
  hoy,
  accent,
  porDia,
  onElegir,
}: {
  dia: string;
  hoy: string;
  accent: string;
  porDia: Map<string, Evento[]>;
  onElegir: (d: string) => void;
}) {
  // El mes chico se puede hojear sin mover lo de la derecha, como en Google.
  const [mes, setMes] = useState(dia);
  useEffect(() => setMes(dia), [dia]);

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: T.ink }}>
          {mayuscula(tituloDelMes(mes))}
        </span>
        <button type="button" aria-label="Mes anterior" onClick={() => setMes((m) => sumarMeses(m, -1))} style={flechaChica}>
          ‹
        </button>
        <button type="button" aria-label="Mes siguiente" onClick={() => setMes((m) => sumarMeses(m, 1))} style={flechaChica}>
          ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2, textAlign: "center" }}>
        {DIAS_LETRA.map((l) => (
          <span key={l} style={{ fontSize: 10.5, color: T.faint, fontWeight: 600, padding: "4px 0" }}>
            {l}
          </span>
        ))}
        {grillaDelMes(mes).flat().map((d) => {
          const esHoy = d === hoy;
          const elegido = d === dia && !esHoy;
          const hay = (porDia.get(d) ?? []).some((e) => e.estado === "Pendiente");
          return (
            <button
              key={d}
              type="button"
              onClick={() => onElegir(d)}
              aria-label={d}
              style={{
                width: 28,
                height: 28,
                margin: "0 auto",
                borderRadius: "50%",
                fontSize: 11.5,
                position: "relative",
                background: esHoy ? accent : elegido ? softer(accent) : "transparent",
                color: esHoy ? "#fff" : !mismoMes(d, mes) ? T.faint : T.ink,
                fontWeight: esHoy || elegido ? 700 : 400,
                cursor: "pointer",
              }}
            >
              {numeroDelDia(d)}
              {hay && !esHoy && (
                <span style={{ position: "absolute", bottom: 3, left: "50%", width: 4, height: 4, marginLeft: -2, borderRadius: "50%", background: accent }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [abierta, setAbierta] = useState(true);
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        style={{ display: "flex", width: "100%", alignItems: "center", fontSize: 13.5, fontWeight: 600, color: T.ink, padding: "4px 0", cursor: "pointer" }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>{titulo}</span>
        <span style={{ fontSize: 11, color: T.muted }}>{abierta ? "▲" : "▼"}</span>
      </button>
      {abierta && <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>{children}</div>}
    </div>
  );
}

function Casilla({
  marcada,
  color,
  onCambio,
  children,
}: {
  marcada: boolean;
  color: string;
  onCambio: () => void;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: T.ink, padding: "4px 2px", cursor: "pointer" }}>
      <input type="checkbox" checked={marcada} onChange={onCambio} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} />
      <span
        aria-hidden
        style={{
          width: 17,
          height: 17,
          flexShrink: 0,
          borderRadius: 4,
          border: `2px solid ${color}`,
          background: marcada ? color : "transparent",
          color: "#fff",
          fontSize: 11,
          lineHeight: "13px",
          textAlign: "center",
          fontWeight: 700,
        }}
      >
        {marcada ? "✓" : ""}
      </span>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </label>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Las vistas
// ════════════════════════════════════════════════════════════════════════════

function VistaMes({
  dia,
  hoy,
  accent,
  porDia,
  rotular,
  onAbrir,
  onCrear,
  onVerDia,
}: {
  dia: string;
  hoy: string;
  accent: string;
  porDia: Map<string, Evento[]>;
  rotular: (e: Evento) => Rotulado;
  onAbrir: (id: number) => void;
  onCrear: (d: string) => void;
  onVerDia: (d: string) => void;
}) {
  const semanas = grillaDelMes(dia);
  const MAX = 3;
  return (
    <div data-cal-vista="mes">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${T.border}` }}>
        {DIAS_CORTOS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: T.muted, padding: "8px 0 4px" }}>
            {d}
          </div>
        ))}
      </div>
      {semanas.map((semana) => (
        <div key={semana[0]} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", minHeight: 118 }}>
          {semana.map((d, i) => {
            const evs = porDia.get(d) ?? [];
            const esHoy = d === hoy;
            return (
              <div
                key={d}
                className="cal-hueco"
                data-cal-dia={d}
                onClick={() => onCrear(d)}
                style={{
                  borderLeft: i ? `1px solid ${T.border}` : "none",
                  borderBottom: `1px solid ${T.border}`,
                  padding: "4px 4px 6px",
                  minWidth: 0,
                  cursor: "pointer",
                  background: mismoMes(d, dia) ? "transparent" : T.paper,
                }}
              >
                <div style={{ textAlign: "center", marginBottom: 3 }}>
                  <button
                    type="button"
                    className="cal-dia-num"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVerDia(d);
                    }}
                    style={{
                      minWidth: 26,
                      height: 26,
                      borderRadius: 13,
                      fontSize: 12,
                      fontWeight: esHoy ? 700 : 500,
                      background: esHoy ? accent : "transparent",
                      color: esHoy ? "#fff" : mismoMes(d, dia) ? T.ink : T.faint,
                      cursor: "pointer",
                    }}
                  >
                    {numeroDelDia(d) === 1 ? `1 ${tituloDelMes(d).slice(0, 3)}` : numeroDelDia(d)}
                  </button>
                </div>
                {evs.slice(0, MAX).map((e) => (
                  <ChipDelMes key={e.id} r={rotular(e)} onAbrir={onAbrir} />
                ))}
                {evs.length > MAX && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onVerDia(d);
                    }}
                    style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, padding: "1px 6px", cursor: "pointer" }}
                  >
                    {evs.length - MAX} más
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ChipDelMes({ r, onAbrir }: { r: Rotulado; onAbrir: (id: number) => void }) {
  return (
    <button
      type="button"
      data-cal-evento={r.evento.id}
      onClick={(e) => {
        e.stopPropagation();
        onAbrir(r.evento.id);
      }}
      title={`${horaSV(r.evento.iniciaEn)} ${r.tipo?.nombre ?? ""} · ${r.titulo}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        width: "100%",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: 11.5,
        color: T.ink,
        opacity: r.hecho ? 0.55 : 1,
        textDecoration: tachado(r.evento.estado) ? "line-through" : "none",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
      <span style={{ color: T.muted, flexShrink: 0 }}>{horaSV(r.evento.iniciaEn)}</span>
      <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.titulo}</span>
    </button>
  );
}

function VistaHoras({
  dias,
  hoy,
  ahoraMin,
  accent,
  porDia,
  rotular,
  onAbrir,
  onCrear,
  onVerDia,
}: {
  dias: string[];
  hoy: string;
  ahoraMin: number;
  accent: string;
  porDia: Map<string, Evento[]>;
  rotular: (e: Evento) => Rotulado;
  onAbrir: (id: number) => void;
  onCrear: (h: Hueco) => void;
  onVerDia: (d: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const clave = dias.join(",");
  // Se abre en las 7 de la mañana, que es donde empieza el día de trabajo.
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 7 * HORA_PX - 8;
  }, [dias.length]);

  const columnas = `56px repeat(${dias.length}, 1fr)`;

  return (
    <div data-cal-vista={dias.length === 1 ? "dia" : "semana"} key={clave}>
      <div style={{ display: "grid", gridTemplateColumns: columnas, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 10, color: T.faint, alignSelf: "end", padding: "0 4px 6px", textAlign: "right" }}>GMT-6</div>
        {dias.map((d) => {
          const esHoy = d === hoy;
          return (
            <div key={d} style={{ textAlign: dias.length === 1 ? "left" : "center", padding: "8px 10px 8px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: esHoy ? accent : T.muted }}>{DIAS_CORTOS[diaDeLaSemana(d)]}</div>
              <button
                type="button"
                className="cal-dia-num"
                onClick={() => onVerDia(d)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  fontSize: 22,
                  fontWeight: 400,
                  marginTop: 2,
                  background: esHoy ? accent : "transparent",
                  color: esHoy ? "#fff" : T.ink,
                  cursor: "pointer",
                }}
              >
                {numeroDelDia(d)}
              </button>
            </div>
          );
        })}
      </div>

      <div ref={scroll} style={{ height: "calc(100vh - 260px)", minHeight: 420, overflowY: "auto", position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: columnas, position: "relative", height: 24 * HORA_PX }}>
          {/* La columna de las horas */}
          <div style={{ position: "relative" }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                style={{ position: "absolute", top: h * HORA_PX - 7, right: 8, fontSize: 10.5, color: T.faint, whiteSpace: "nowrap" }}
              >
                {h === 0 ? "" : etiquetaDeHora(h)}
              </span>
            ))}
          </div>

          {dias.map((d) => {
            const acomodados = acomodarDia(porDia.get(d) ?? []);
            const porId = new Map((porDia.get(d) ?? []).map((e) => [e.id, e]));
            return (
              <div
                key={d}
                data-cal-columna={d}
                onClick={(ev) => {
                  const caja = (ev.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const minuto = ((ev.clientY - caja.top) / HORA_PX) * 60;
                  onCrear({ dia: d, hora: horaDeMinuto(alCuarto(minuto)) });
                }}
                style={{
                  position: "relative",
                  borderLeft: `1px solid ${T.border}`,
                  cursor: "pointer",
                  backgroundImage: `repeating-linear-gradient(to bottom, ${T.border} 0, ${T.border} 1px, transparent 1px, transparent ${HORA_PX}px)`,
                }}
              >
                {acomodados.map((a) => {
                  const e = porId.get(a.id);
                  if (!e) return null;
                  const r = rotular(e);
                  const alto = ((a.hasta - a.desde) / 60) * HORA_PX - 2;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      data-cal-evento={a.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onAbrir(a.id);
                      }}
                      title={`${r.tipo?.nombre ?? "Evento"} · ${r.titulo} · ${horarioDelEvento(e.iniciaEn, e.duracionMin)}`}
                      style={{
                        position: "absolute",
                        top: (a.desde / 60) * HORA_PX + 1,
                        height: Math.max(alto, 16),
                        left: `calc(${(a.carril / a.carriles) * 100}% + 2px)`,
                        width: `calc(${100 / a.carriles}% - 6px)`,
                        background: r.color,
                        opacity: r.hecho ? 0.55 : 1,
                        color: "#fff",
                        borderRadius: 5,
                        border: "1px solid rgba(255,255,255,0.7)",
                        padding: "2px 6px",
                        textAlign: "left",
                        overflow: "hidden",
                        fontSize: 11.5,
                        lineHeight: 1.25,
                        cursor: "pointer",
                        textDecoration: tachado(e.estado) ? "line-through" : "none",
                      }}
                    >
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.titulo}</div>
                      {alto >= 30 && (
                        <div style={{ opacity: 0.92, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {horarioDelEvento(e.iniciaEn, e.duracionMin)}
                          {r.tipo ? ` · ${r.tipo.nombre}` : ""}
                        </div>
                      )}
                    </button>
                  );
                })}

                {d === hoy && (
                  <div
                    aria-hidden
                    data-cal-ahora
                    style={{ position: "absolute", left: -1, right: 0, top: (ahoraMin / 60) * HORA_PX, height: 2, background: "#D93025", pointerEvents: "none", zIndex: 2 }}
                  >
                    <span style={{ position: "absolute", left: -6, top: -5, width: 12, height: 12, borderRadius: "50%", background: "#D93025" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VistaAgenda({
  desde,
  hoy,
  accent,
  porDia,
  rotular,
  onAbrir,
}: {
  desde: string;
  hoy: string;
  accent: string;
  porDia: Map<string, Evento[]>;
  rotular: (e: Evento) => Rotulado;
  onAbrir: (id: number) => void;
}) {
  const dias = [...porDia.keys()].filter((d) => d >= desde).sort().slice(0, 60);
  if (dias.length === 0) {
    return (
      <div data-cal-vista="agenda" style={{ padding: "48px 24px", textAlign: "center", color: T.muted, fontSize: 13.5 }}>
        No hay eventos desde esta fecha. Agenda uno con <strong>Crear</strong>.
      </div>
    );
  }
  return (
    <div data-cal-vista="agenda">
      {dias.map((d, k) => (
        <div key={d} style={{ display: "flex", gap: 16, padding: "12px 16px", borderTop: k ? `1px solid ${T.border}` : "none" }}>
          <div style={{ width: 92, flexShrink: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontSize: 22,
                minWidth: 36,
                height: 36,
                lineHeight: "36px",
                textAlign: "center",
                borderRadius: "50%",
                background: d === hoy ? accent : "transparent",
                color: d === hoy ? "#fff" : T.ink,
              }}
            >
              {numeroDelDia(d)}
            </span>
            <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase" }}>
              {tituloDelMes(d).slice(0, 3)}, {DIAS_CORTOS[diaDeLaSemana(d)].toLowerCase()}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {(porDia.get(d) ?? []).map((e) => {
              const r = rotular(e);
              return (
                <button
                  key={e.id}
                  type="button"
                  data-cal-evento={e.id}
                  onClick={() => onAbrir(e.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 6, textAlign: "left", cursor: "pointer", opacity: r.hecho ? 0.6 : 1 }}
                  className="cal-hueco"
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                  <span style={{ width: 110, flexShrink: 0, fontSize: 12.5, color: T.muted }}>
                    {horarioDelEvento(e.iniciaEn, e.duracionMin)}
                  </span>
                  <span style={{ fontSize: 13, color: T.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <strong style={{ fontWeight: 600 }}>{r.titulo}</strong>
                    <span style={{ color: T.muted }}>
                      {" · "}
                      {r.tipo?.nombre}
                      {r.op ? ` · ${r.op.producto}` : ""}
                    </span>
                  </span>
                  <span style={{ flex: 1 }} />
                  <EstadoPill estado={e.estado} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Las ventanas: crear, ver, y la confirmación
// ════════════════════════════════════════════════════════════════════════════

function Ventana({
  etiqueta,
  ancho = 460,
  onCerrar,
  children,
  dataAttr,
}: {
  etiqueta: string;
  ancho?: number;
  onCerrar: () => void;
  children: ReactNode;
  dataAttr?: string;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div
      onClick={onCerrar}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(3,27,79,0.25)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        {...(dataAttr ? { [dataAttr]: "" } : {})}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: `min(${ancho}px, 100%)`,
          maxHeight: "90vh",
          overflowY: "auto",
          background: T.surface,
          borderRadius: 12,
          boxShadow: "0 24px 56px rgba(3,27,79,0.30)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function NuevoEvento({
  hueco,
  accent,
  oportunidades,
  onCerrar,
  onCreado,
}: {
  hueco: Hueco;
  accent: string;
  oportunidades: Oportunidad[];
  onCerrar: () => void;
  onCreado: (e: Evento) => void;
}) {
  const { tiposEvento, vendedores } = useCatalogo();
  const [busqueda, setBusqueda] = useState("");
  const [op, setOp] = useState<Oportunidad | null>(null);
  const [tipoId, setTipoId] = useState(tiposEvento[0]?.id ?? 0);
  const [fecha, setFecha] = useState(hueco.dia);
  const [hora, setHora] = useState(hueco.hora);
  const [duracion, setDuracion] = useState(tiposEvento[0]?.duracionMin ?? 30);
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [canal, setCanal] = useState<string>("Llamada");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opciones = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return oportunidades
      .filter((o) =>
        [o.cliente, o.codigo, o.telefono ?? "", o.producto].some((x) => x.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [busqueda, oportunidades]);

  const elegirTipo = (id: number) => {
    setTipoId(id);
    const t = tiposEvento.find((x) => x.id === id);
    if (t) setDuracion(t.duracionMin);
    setCanal(id === 1 ? "Presencial" : "Llamada");
  };

  const guardar = async () => {
    if (!op) {
      setError("Elige a qué lead pertenece el evento.");
      return;
    }
    setBusy(true);
    setError(null);
    const iniciaEn = isoDesdeSV(fecha, hora);
    const r = await createEvento({
      oportunidad_id: op.id,
      tipo_id: tipoId,
      vendedor_id: vendedorId,
      inicia_en: iniciaEn,
      duracion_min: duracion,
      canal,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCreado({
      id: r.id ?? 0,
      oportunidadId: op.id,
      tipoId,
      vendedorId,
      creadoPor: null,
      iniciaEn,
      duracionMin: duracion,
      canal: canal as Evento["canal"],
      estado: "Pendiente",
      resultado: null,
      proximaAccion: null,
    });
  };

  return (
    <Ventana etiqueta="Nuevo evento" onCerrar={onCerrar} dataAttr="data-cal-nuevo">
      <div style={{ padding: "18px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, flex: 1, color: T.ink }}>Nuevo evento</h3>
          <button type="button" aria-label="Cerrar" onClick={onCerrar} style={{ fontSize: 20, color: T.muted, cursor: "pointer" }}>
            ×
          </button>
        </div>

        <Fila icono="👤" etiqueta="Lead">
          {op ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: T.paper }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                <strong>{op.cliente}</strong>
                <span style={{ color: T.muted }}> · {op.codigo} · {op.producto}</span>
              </span>
              <button type="button" onClick={() => setOp(null)} style={{ fontSize: 12, color: accent, cursor: "pointer" }}>
                Cambiar
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Busca por nombre, código o teléfono"
                style={campo}
              />
              {opciones.length > 0 && (
                <div style={{ position: "absolute", top: 38, left: 0, right: 0, zIndex: 5, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(3,27,79,0.18)", overflow: "hidden" }}>
                  {opciones.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        setOp(o);
                        setVendedorId(o.vendedorId);
                        setBusqueda("");
                      }}
                      className="cal-hueco"
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
                    >
                      <strong>{o.cliente}</strong>
                      <span style={{ color: T.muted }}> · {o.codigo} · {o.producto}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Fila>

        <Fila icono="🏷️" etiqueta="Tipo">
          <select value={tipoId} onChange={(e) => elegirTipo(Number(e.target.value))} style={campo}>
            {tiposEvento.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Fila>

        <Fila icono="🕒" etiqueta="Cuándo">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ ...campo, width: "auto", flex: "1 1 140px" }} aria-label="Fecha" />
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ ...campo, width: "auto", flex: "0 1 110px" }} aria-label="Hora" />
            <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} style={{ ...campo, width: "auto", flex: "0 1 110px" }} aria-label="Duración">
              {[...new Set([...DURACIONES, duracion])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </option>
              ))}
            </select>
          </div>
        </Fila>

        <Fila icono="📞" etiqueta="Canal">
          <select value={canal} onChange={(e) => setCanal(e.target.value)} style={campo}>
            {CANALES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Fila>

        <Fila icono="🧑‍💼" etiqueta="Asesora">
          <select
            value={vendedorId ?? ""}
            onChange={(e) => setVendedorId(e.target.value === "" ? null : Number(e.target.value))}
            style={campo}
          >
            <option value="">Sin asesora</option>
            {vendedores
              .filter((v) => v.activo || v.id === vendedorId)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
          </select>
        </Fila>

        <p style={{ margin: "4px 0 0 34px", fontSize: 12, color: T.muted }}>
          🔔 Alerta emergente {MINUTOS_ANTES} minutos antes.
        </p>

        {error && (
          <p style={{ margin: "12px 0 0", padding: "8px 12px", fontSize: 12.5, borderRadius: 8, background: "#F7EBE9", color: "#8C3B2F" }}>{error}</p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onCerrar} style={botonBorde}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={busy}
            style={{ height: 36, padding: "0 20px", fontSize: 13.5, fontWeight: 600, borderRadius: 18, background: busy ? T.border : accent, color: "#fff", cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </Ventana>
  );
}

function DetalleEvento({
  r,
  accent,
  onCerrar,
  onAbrirFicha,
  onCambio,
}: {
  r: Rotulado;
  accent: string;
  onCerrar: () => void;
  onAbrirFicha?: (oportunidadId: number) => void;
  onCambio: () => void;
}) {
  const { vendedores } = useCatalogo();
  const e = r.evento;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const [fecha, setFecha] = useState(diaSV(e.iniciaEn));
  const [hora, setHora] = useState(horaInputSV(e.iniciaEn));
  const asesora = vendedores.find((v) => v.id === e.vendedorId);
  const dia = diaSV(e.iniciaEn);

  const cambiar = async (patch: Parameters<typeof updateEvento>[1]) => {
    setBusy(true);
    setError(null);
    const res = await updateEvento(e.id, patch);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMoviendo(false);
    onCambio();
  };

  return (
    <Ventana etiqueta="Detalle del evento" ancho={440} onCerrar={onCerrar} dataAttr="data-cal-detalle">
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, padding: "8px 10px 0" }}>
        {onAbrirFicha && (
          <button type="button" onClick={() => onAbrirFicha(e.oportunidadId)} style={iconoBoton} title="Abrir el lead">
            Abrir el lead
          </button>
        )}
        {e.estado === "Pendiente" && (
          <button type="button" onClick={() => setMoviendo((v) => !v)} style={iconoBoton} title="Cambiar fecha y hora">
            ✎ Cambiar hora
          </button>
        )}
        <button type="button" aria-label="Cerrar" onClick={onCerrar} style={{ ...iconoBoton, fontSize: 18 }}>
          ×
        </button>
      </div>

      <div style={{ padding: "6px 22px 20px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, background: r.color, marginTop: 6, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: T.ink, lineHeight: 1.3 }}>
              {r.tipo?.nombre ?? "Evento"} con {r.titulo}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: T.muted }}>
              {mayuscula(tituloDelRango("dia", dia))} · {horarioDelEvento(e.iniciaEn, e.duracionMin)}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, fontSize: 13, color: T.ink }}>
          {r.op && (
            <Linea icono="🎓">
              {r.op.producto} <span style={{ color: T.muted }}>· {r.op.codigo}</span>
            </Linea>
          )}
          <Linea icono="📞">{e.canal}</Linea>
          <Linea icono="🧑‍💼">{asesora?.nombre ?? "Sin asesora"}</Linea>
          <Linea icono="🔔">
            {e.estado === "Pendiente" ? `Alerta ${MINUTOS_ANTES} minutos antes` : "Sin alerta (ya no está pendiente)"}
          </Linea>
          <Linea icono="●">
            <EstadoPill estado={e.estado} />
          </Linea>
          {e.resultado && <Linea icono="📝">{e.resultado}</Linea>}
          {e.proximaAccion && <Linea icono="➡️">{e.proximaAccion}</Linea>}
        </div>

        {moviendo && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <input type="date" value={fecha} onChange={(x) => setFecha(x.target.value)} style={{ ...campo, width: "auto" }} aria-label="Nueva fecha" />
            <input type="time" value={hora} onChange={(x) => setHora(x.target.value)} style={{ ...campo, width: "auto" }} aria-label="Nueva hora" />
            <button
              type="button"
              disabled={busy}
              onClick={() => void cambiar({ inicia_en: isoDesdeSV(fecha, hora) })}
              style={{ height: 34, padding: "0 14px", fontSize: 12.5, fontWeight: 600, borderRadius: 6, background: accent, color: "#fff", cursor: "pointer" }}
            >
              Guardar
            </button>
          </div>
        )}

        {error && (
          <p style={{ margin: "12px 0 0", padding: "8px 12px", fontSize: 12.5, borderRadius: 8, background: "#F7EBE9", color: "#8C3B2F" }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
          {e.estado === "Pendiente" ? (
            <>
              <button type="button" disabled={busy} onClick={() => void cambiar({ estado: "No se presentó" })} style={botonBorde}>
                No se presentó
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void cambiar({ estado: "Realizado" })}
                style={{ height: 34, padding: "0 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, background: accent, color: "#fff", cursor: "pointer" }}
              >
                Marcar realizado
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => void cambiar({ estado: "Pendiente" })} style={botonBorde}>
              Volver a pendiente
            </button>
          )}
        </div>
      </div>
    </Ventana>
  );
}

/** La confirmación de que quedó agendado, y a quién le va a llegar la alerta. */
function Agendado({
  r,
  accent,
  miVendedorId,
  onCerrar,
}: {
  r: Rotulado;
  accent: string;
  miVendedorId: number | null;
  onCerrar: () => void;
}) {
  const { vendedores } = useCatalogo();
  const [permiso, setPermiso] = useState(permisoDeAvisos());
  const e = r.evento;
  const asesora = vendedores.find((v) => v.id === e.vendedorId);

  // A quién le salta: a la asesora y a quien lo agendó (si tiene ficha).
  const quienes = [
    ...(asesora ? [asesora.id === miVendedorId ? "a ti" : `a ${asesora.nombre}`] : []),
    ...(miVendedorId != null && miVendedorId !== e.vendedorId ? ["a ti"] : []),
  ];

  return (
    <Ventana etiqueta="Evento agendado" ancho={420} onCerrar={onCerrar} dataAttr="data-cal-agendado">
      <div style={{ background: r.color, color: "#fff", padding: "14px 20px", borderRadius: "12px 12px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>✓</span>
        <strong style={{ fontSize: 15, flex: 1 }}>Evento agendado</strong>
      </div>
      <div style={{ padding: "16px 20px 18px" }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.ink }}>
          {r.tipo?.nombre ?? "Evento"} con {r.titulo}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: T.muted }}>
          {mayuscula(tituloDelRango("dia", diaSV(e.iniciaEn)))} · {horarioDelEvento(e.iniciaEn, e.duracionMin)}
        </p>
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: softer(accent), fontSize: 13, color: T.ink, lineHeight: 1.5 }}>
          🔔{" "}
          {quienes.length
            ? `Le saltará una alerta emergente ${quienes.join(" y ")} ${MINUTOS_ANTES} minutos antes, con el CRM abierto.`
            : "No tiene asesora asignada y tu cuenta no tiene ficha de vendedora: nadie recibirá la alerta. Asígnale una asesora."}
        </div>
        {permiso === "default" && (
          <button
            type="button"
            onClick={() => void pedirPermisoDeAvisos().then((x) => setPermiso(x))}
            style={{ marginTop: 10, height: 30, padding: "0 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${accent}`, color: accent, background: T.surface, cursor: "pointer" }}
          >
            Permitir también avisos del navegador
          </button>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button"
            onClick={onCerrar}
            style={{ height: 34, padding: "0 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, background: accent, color: "#fff", cursor: "pointer" }}
          >
            Aceptar
          </button>
        </div>
      </div>
    </Ventana>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Piezas chicas
// ════════════════════════════════════════════════════════════════════════════

function Fila({ icono, etiqueta, children }: { icono: string; etiqueta: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
      <span aria-hidden style={{ width: 22, textAlign: "center", fontSize: 15, paddingTop: 7 }}>
        {icono}
      </span>
      <label style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 11, color: T.muted, marginBottom: 3 }}>{etiqueta}</span>
        {children}
      </label>
    </div>
  );
}

function Linea({ icono, children }: { icono: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <span aria-hidden style={{ width: 16, textAlign: "center", color: T.muted }}>
        {icono}
      </span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

function EstadoPill({ estado }: { estado: string }) {
  const [fg, bg] = ESTADO_TONE[estado] ?? ESTADO_TONE.Pendiente;
  return (
    <span className="pill" style={{ flexShrink: 0, fontSize: 11, padding: "3px 9px", borderRadius: 20, background: bg, color: fg }}>
      {estado}
    </span>
  );
}

const botonBorde: CSSProperties = {
  height: 34,
  padding: "0 14px",
  fontSize: 13,
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
  cursor: "pointer",
};

const flecha: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  fontSize: 22,
  lineHeight: 1,
  color: T.ink,
  cursor: "pointer",
};

const flechaChica: CSSProperties = { ...flecha, width: 26, height: 26, fontSize: 17 };

const iconoBoton: CSSProperties = {
  height: 30,
  padding: "0 10px",
  fontSize: 12.5,
  borderRadius: 6,
  color: T.muted,
  cursor: "pointer",
};

const campo: CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  fontSize: 13,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  background: T.surface,
  color: T.ink,
};
