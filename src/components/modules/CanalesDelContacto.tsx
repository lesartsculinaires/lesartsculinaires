"use client";

import { useEffect, useState } from "react";

import { canalesDelContacto, type CanalDelContacto } from "@/app/canales-actions";
import { cuandoConHora } from "@/lib/format";
import { T } from "@/lib/theme";

interface Props {
  clienteId: number;
  accent: string;
}

/**
 * Por dónde llegó esta persona, en orden.
 *
 * ------------------------------------------------------------------------
 * QUÉ RESUELVE
 * ------------------------------------------------------------------------
 *
 * Alguien escribe por Instagram, le contestan, y una semana después escribe
 * por WhatsApp. Antes eso no tenía dónde guardarse —el lead tiene un solo
 * canal— así que para registrar el segundo había que abrir otro lead, y el
 * mismo cliente terminaba dos veces en el tablero.
 *
 * Acá van los dos, en el orden en que llegaron. El primero lleva la marca:
 * es el que dice qué campaña lo trajo, y es el dato que se pierde cuando se
 * unifica sin dejar rastro.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ LA HORA, Y NO SÓLO EL DÍA
 * ------------------------------------------------------------------------
 *
 * Porque para WhatsApp la hora existe de verdad —la pone el mensaje— y es lo
 * que el asesor necesita para saber si contestar ahora. En los canales que
 * carga una persona a mano la hora es la del alta y vale menos, pero
 * mostrarla igual es mejor que esconderla: quien la lea sabe de dónde salió.
 */
export function CanalesDelContacto({ clienteId, accent }: Props) {
  const [canales, setCanales] = useState<CanalDelContacto[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    void canalesDelContacto(clienteId).then((r) => {
      if (!vigente) return;
      setCanales(r.canales);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [clienteId]);

  // Con un solo canal esto no aporta nada que no diga ya la etiqueta de arriba
  // de la ficha, y una sección de más es una sección que se aprende a saltear.
  if (cargando || canales.length < 2) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <p
        className="mono"
        style={{
          margin: "0 0 7px",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: T.faint,
          textTransform: "uppercase",
        }}
      >
        Por dónde llegó
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {canales.map((c, i) => {
          const primero = i === 0;
          // Cuando las dos fechas son la misma sólo llegó una vez por ahí, y
          // repetirla haría leer dos veces para no enterarse de nada.
          const volvio = c.ultimaVez !== c.primeraVez;

          return (
            <div
              key={c.canal}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                flexWrap: "wrap",
                fontSize: 12,
                color: T.muted,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: primero ? 700 : 500,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: primero ? `${accent}1A` : T.paper,
                  color: primero ? accent : T.muted,
                  flexShrink: 0,
                }}
              >
                {c.canal}
              </span>

              {primero && (
                <span className="mono" style={{ fontSize: 10, color: accent, letterSpacing: "0.06em" }}>
                  ENTRÓ POR ACÁ
                </span>
              )}

              <span style={{ fontSize: 11.5 }}>{cuandoConHora(c.primeraVez)}</span>

              {volvio && (
                <span style={{ fontSize: 11.5, color: T.faint }}>
                  · escribió de nuevo {cuandoConHora(c.ultimaVez)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
