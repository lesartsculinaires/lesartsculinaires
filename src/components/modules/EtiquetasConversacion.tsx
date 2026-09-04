"use client";

import { useState } from "react";

import { crearEtiqueta, marcarConversacion, marcarLead } from "@/app/etiquetas-actions";
import { T } from "@/lib/theme";
import type { Etiqueta } from "@/lib/types";

/** Colores para elegir. Ninguno tan claro que su texto blanco no se lea. */
const COLORES = [
  "#031B4F", "#1F6F4A", "#8A5200", "#9B2C2C",
  "#5B3E8E", "#0E6E7D", "#6B665F", "#A8541B",
];

interface Props {
  /**
   * Cómo se pone y se saca una etiqueta de esta cosa.
   *
   * Es lo único que cambia entre las etiquetas de una conversación y las de un
   * lead: el dibujo, los colores, el crear una nueva en el momento y el
   * cerrarse al hacer clic afuera son iguales, y tenerlos escritos dos veces
   * garantizaba que se fueran pareciendo cada vez menos.
   *
   * Las dos tablas y sus permisos siguen separados del otro lado, en
   * `etiquetas-actions`, que es donde tienen que estar.
   */
  marcar: (etiquetaId: number, puesta: boolean) => Promise<{ ok: boolean; error: string | null }>;
  /** Las que ya están puestas. */
  puestas: number[];
  /** El catálogo entero. */
  etiquetas: Etiqueta[];
  accent: string;
  onCambio: () => void;
}

/**
 * Las etiquetas de una conversación.
 *
 * Son de la conversación, no de la venta: acá va «pidió beca», «no contesta»,
 * «pago pendiente». La etapa y el estado del pipeline se muestran aparte y
 * salen de la oportunidad misma —a propósito, para que no haya dos versiones
 * de lo mismo que puedan discrepar.
 *
 * Crear una etiqueta nueva se hace desde acá, en el momento: obligar a ir a
 * otra pantalla a darla de alta haría que nadie las use.
 */
function Etiquetas({
  marcar,
  puestas,
  etiquetas,
  accent,
  onCambio,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState("");
  const [color, setColor] = useState(COLORES[0]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disponibles = etiquetas.filter((e) => e.activa || puestas.includes(e.id));
  const suyas = disponibles.filter((e) => puestas.includes(e.id));

  const alternar = async (id: number, poner: boolean) => {
    setTrabajando(true);
    setError(null);
    const r = await marcar(id, poner);
    setTrabajando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCambio();
  };

  const agregar = async () => {
    const nombre = nueva.trim();
    if (!nombre) return;

    setTrabajando(true);
    setError(null);
    const r = await crearEtiqueta(nombre, color);

    if (!r.ok || !r.etiqueta) {
      setTrabajando(false);
      setError(r.error);
      return;
    }

    // Recién creada, se pone sola: nadie crea una etiqueta para no usarla.
    const puesta = await marcar(r.etiqueta.id, true);
    setTrabajando(false);
    if (!puesta.ok) {
      setError(puesta.error);
      return;
    }
    setNueva("");
    onCambio();
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
      {suyas.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => void alternar(e.id, false)}
          disabled={trabajando}
          title="Quitar esta etiqueta"
          className="pill"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 21,
            padding: "0 8px",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 11,
            background: e.color,
            color: "#fff",
            cursor: trabajando ? "wait" : "pointer",
          }}
        >
          {e.nombre}
          <span aria-hidden style={{ opacity: 0.75, fontSize: 12 }}>×</span>
        </button>
      ))}

      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setAbierto((x) => !x)}
          style={{
            height: 21,
            padding: "0 8px",
            fontSize: 11,
            borderRadius: 11,
            border: `1px dashed ${T.border}`,
            color: T.muted,
          }}
        >
          + Etiqueta
        </button>

        {abierto && (
          <>
            {/* Cierra al hacer clic en cualquier otro lado. */}
            <div
              onClick={() => setAbierto(false)}
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
            />
            <div
              style={{
                position: "absolute",
                top: 26,
                left: 0,
                zIndex: 41,
                width: 232,
                padding: 10,
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 9,
                boxShadow: "0 12px 30px rgba(3, 27, 79, 0.16)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 9 }}>
                {disponibles.length === 0 && (
                  <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                    Todavía no hay etiquetas. Creá la primera acá abajo.
                  </p>
                )}
                {disponibles.map((e) => {
                  const activa = puestas.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => void alternar(e.id, !activa)}
                      disabled={trabajando}
                      style={{
                        height: 21,
                        padding: "0 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 11,
                        border: `1px solid ${e.color}`,
                        background: activa ? e.color : "transparent",
                        color: activa ? "#fff" : e.color,
                        cursor: trabajando ? "wait" : "pointer",
                      }}
                    >
                      {e.nombre}
                    </button>
                  );
                })}
              </div>

              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                <input
                  value={nueva}
                  onChange={(e) => {
                    setNueva(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void agregar();
                  }}
                  placeholder="Nueva etiqueta…"
                  style={{
                    width: "100%",
                    height: 27,
                    padding: "0 7px",
                    fontSize: 12,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    background: T.surface,
                    color: T.ink,
                  }}
                />

                <div style={{ display: "flex", gap: 4, margin: "7px 0" }}>
                  {COLORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Color ${c}`}
                      style={{
                        width: 17,
                        height: 17,
                        borderRadius: "50%",
                        background: c,
                        border: c === color ? `2px solid ${T.ink}` : "none",
                      }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void agregar()}
                  disabled={trabajando || !nueva.trim()}
                  style={{
                    width: "100%",
                    height: 28,
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    background: nueva.trim() ? accent : T.border,
                    color: nueva.trim() ? "#fff" : T.faint,
                    cursor: trabajando ? "wait" : nueva.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  {trabajando ? "Un momento…" : "Crear y ponerla"}
                </button>
              </div>

              {error && (
                <p style={{ margin: "7px 0 0", fontSize: 11, color: T.warn, lineHeight: 1.4 }}>
                  {error}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {error && !abierto && (
        <span style={{ fontSize: 11, color: T.warn }}>{error}</span>
      )}
    </div>
  );
}

/**
 * Las etiquetas de una conversación.
 *
 * Son de la conversación, no de la venta: acá va «pidió beca», «no contesta»,
 * «pago pendiente». La etapa y el estado del pipeline se muestran aparte y
 * salen de la oportunidad misma —a propósito, para que no haya dos versiones
 * de lo mismo que puedan discrepar.
 *
 * Crear una etiqueta nueva se hace desde acá, en el momento: obligar a ir a
 * otra pantalla a darla de alta haría que nadie las use.
 */
export function EtiquetasConversacion({
  conversacionId,
  ...resto
}: Omit<Props, "marcar"> & { conversacionId: number }) {
  return (
    <Etiquetas
      {...resto}
      marcar={(etiquetaId, puesta) => marcarConversacion(conversacionId, etiquetaId, puesta)}
    />
  );
}

/**
 * Las etiquetas de un lead.
 *
 * Mismo catálogo que las de la bandeja y a propósito: «viene de feria» es lo
 * mismo escrito en el chat que en la ficha, y dos catálogos separados
 * terminarían con la misma etiqueta dos veces y filtros que devuelven la mitad
 * de la gente según por dónde se pregunte.
 *
 * Lo que cambia es para qué sirven acá: agrupar gente a la que escribirle. Un
 * lead que entró por una base y nunca escribió no tiene conversación que
 * etiquetar, y es justamente al que la escuela quiere poder meter en un envío.
 */
export function EtiquetasDelLead({
  oportunidadId,
  ...resto
}: Omit<Props, "marcar"> & { oportunidadId: number }) {
  return (
    <Etiquetas
      {...resto}
      marcar={(etiquetaId, puesta) => marcarLead(oportunidadId, etiquetaId, puesta)}
    />
  );
}
