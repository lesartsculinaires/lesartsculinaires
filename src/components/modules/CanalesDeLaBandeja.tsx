"use client";

import { useState, type CSSProperties } from "react";

import { CANALES, CAPACIDADES, COMO_SE_DICE, canalDe, type Canal } from "@/lib/canales";
import { T } from "@/lib/theme";

/**
 * La fila para cambiar de red social, arriba de los hilos.
 *
 * ============================================================================
 * POR QUÉ SE VEN LOS QUE TODAVÍA NO ANDAN
 * ============================================================================
 *
 * Podrían mostrarse sólo los conectados y aparecer los demás el día que se
 * enchufen. Se hizo al revés, y a propósito:
 *
 *   PORQUE ES LA PREGUNTA QUE SE HACE      «¿Se puede contestar el Instagram
 *                                          desde acá?» tiene que tener una
 *                                          respuesta en la pantalla, no en una
 *                                          conversación. Y la respuesta —qué
 *                                          falta y quién lo tiene que hacer—
 *                                          está a un clic.
 *
 *   PORQUE NO SON TODOS IGUALES            Instagram y Messenger se conectan en
 *                                          el mismo panel de Meta donde ya está
 *                                          WhatsApp. TikTok no: hay que ser un
 *                                          socio aprobado por ellos. Verlos
 *                                          juntos con esa diferencia escrita
 *                                          evita planificar sobre algo que no
 *                                          depende de nosotros.
 *
 * Lo que NO se hace es dejarlos apagados sin explicación. Una pestaña que no
 * responde y no dice por qué es peor que no tenerla.
 *
 * ============================================================================
 * Y POR QUÉ LA FILA APARECE IGUAL CON UN SOLO CANAL
 * ============================================================================
 *
 * Hoy todas las conversaciones son de WhatsApp, así que filtrar no sirve para
 * nada todavía. La fila está para lo otro: para que se vea el lugar que ya
 * tienen los demás, que es justamente lo que la escuela pidió dejar preparado.
 */
export function CanalesDeLaBandeja({
  /** Cuántos hilos hay por canal, para poder decirlo en la pestaña. */
  cuantos,
  elegido,
  accent,
  onElegir,
}: {
  cuantos: Record<string, number>;
  /** Null = todos los canales juntos. */
  elegido: string | null;
  accent: string;
  onElegir: (clave: string | null) => void;
}) {
  /** Cuál se está mirando en la ficha de abajo. Null = ninguna abierta. */
  const [mirando, setMirando] = useState<string | null>(null);

  const total = Object.values(cuantos).reduce((a, b) => a + b, 0);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          padding: "8px 12px 7px",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => onElegir(null)}
          style={pestana(elegido == null, accent)}
        >
          Todos
          {total > 0 && <span style={numerito(elegido == null)}>{total}</span>}
        </button>

        {CANALES.map((c) => {
          const n = cuantos[c.clave] ?? 0;
          const puesto = elegido === c.clave;

          return (
            <button
              key={c.clave}
              type="button"
              onClick={() => {
                // Un canal que no anda no filtra nada: lo que hace es explicar
                // qué le falta. Filtrar por él dejaría la lista vacía y eso no
                // dice nada.
                if (c.disponible) onElegir(puesto ? null : c.clave);
                setMirando(mirando === c.clave ? null : c.clave);
              }}
              title={c.disponible ? `Ver sólo ${c.nombre}` : `${c.nombre}: todavía no está conectado`}
              style={{
                ...pestana(puesto, accent),
                // Los que no andan van en gris y con el borde punteado: se ve
                // que están y se ve que todavía no.
                borderStyle: c.disponible ? "solid" : "dashed",
                opacity: c.disponible ? 1 : 0.72,
              }}
            >
              <span aria-hidden style={{ fontSize: 11 }}>{c.icono}</span>
              {c.nombre}
              {c.disponible && n > 0 && <span style={numerito(puesto)}>{n}</span>}
              {!c.disponible && (
                <span style={{ fontSize: 9.5, color: T.faint, fontWeight: 600 }}>pronto</span>
              )}
            </button>
          );
        })}
      </div>

      {mirando && <Ficha canal={canalDe(mirando)} onCerrar={() => setMirando(null)} />}
    </div>
  );
}

/**
 * Qué se puede hacer en este canal, y qué le falta.
 *
 * Es la pantalla que contesta «¿por qué no puedo contestar el Instagram?» sin
 * que nadie tenga que preguntar. Y para el que ya anda sirve igual: dice
 * cuánto dura su ventana, que es el dato que más se olvida.
 */
function Ficha({ canal, onCerrar }: { canal: Canal; onCerrar: () => void }) {
  return (
    <div
      style={{
        padding: "10px 13px 12px",
        margin: "0 10px 10px",
        borderRadius: 9,
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${canal.color}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{canal.nombre}</span>
        <span style={{ fontSize: 11, color: canal.disponible ? "#2F6B4F" : T.faint }}>
          {canal.disponible ? "conectado" : "todavía no conectado"}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{ fontSize: 14, color: T.faint, lineHeight: 1, padding: "0 3px" }}
        >
          ×
        </button>
      </div>

      {canal.falta && (
        <p style={{ margin: "7px 0 0", fontSize: 11.5, lineHeight: 1.55, color: "#6B5200" }}>
          {canal.falta}
        </p>
      )}

      <p style={{ margin: "8px 0 0", fontSize: 11.5, lineHeight: 1.55, color: T.muted }}>
        {canal.laVentana}
      </p>

      <ul
        style={{
          margin: "9px 0 0",
          padding: 0,
          listStyle: "none",
          display: "grid",
          gap: 2,
          fontSize: 11.5,
        }}
      >
        {CAPACIDADES.map((cap) => {
          const v = canal.puede[cap.clave];
          return (
            <li key={cap.clave} style={{ display: "flex", gap: 7 }}>
              <span
                aria-hidden
                style={{
                  width: 12,
                  flexShrink: 0,
                  color: v === "si" ? "#2F6B4F" : v === "no" ? "#9E2F29" : "#8A7020",
                }}
              >
                {v === "si" ? "✓" : v === "no" ? "×" : "?"}
              </span>
              <span style={{ color: T.muted }}>
                {cap.nombre}
                {v !== "si" && (
                  <span style={{ color: T.faint }}> — {COMO_SE_DICE[v]}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const pestana = (puesta: boolean, accent: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  whiteSpace: "nowrap",
  height: 24,
  boxSizing: "border-box",
  padding: "0 9px",
  fontSize: 11.5,
  fontWeight: 600,
  borderRadius: 20,
  background: puesta ? accent : "transparent",
  color: puesta ? "#fff" : T.muted,
  border: `1px solid ${puesta ? "transparent" : T.border}`,
  cursor: "pointer",
});

const numerito = (puesta: boolean): CSSProperties => ({
  minWidth: 15,
  padding: "0 4px",
  borderRadius: 8,
  fontSize: 10,
  fontWeight: 700,
  lineHeight: "14px",
  textAlign: "center",
  background: puesta ? "rgba(255,255,255,0.25)" : T.paper,
  color: puesta ? "#fff" : T.muted,
});
