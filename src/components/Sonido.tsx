"use client";

import { useEffect, useRef, useState } from "react";

import { NOMBRES, VOLUMENES, type Ajustes } from "@/lib/campanita";
import { T, soft } from "@/lib/theme";

/**
 * El interruptor del sonido, al lado de la campana.
 *
 * Tiene que estar a la vista y no escondido en una pantalla de ajustes: un
 * aviso que suena en una oficina compartida —o en una reunión— hay que poder
 * callarlo en el segundo en que molesta, no después de buscar dónde se apaga.
 *
 * El punto naranja es la parte que más importa. Cuando está prendido pero el
 * navegador todavía no dejó sonar, sin ese aviso la persona vería el ícono
 * encendido, no escucharía nada y creería que el CRM está roto.
 *
 * ELEGIR EL SONIDO ES OTRA COSA, Y VA APARTE
 *
 * Callar el aviso se hace apurado y con alguien esperando; elegir el tono se
 * hace una vez, con calma. Por eso el clic sigue prendiendo y apagando —sin
 * menús de por medio— y lo de elegir vive detrás de la flechita de al lado.
 * Metiéndolo todo en un mismo menú, apagar el sonido pasaría a ser dos clics
 * justo cuando hace falta uno.
 */
export function Sonido({
  encendido,
  bloqueado,
  accent,
  ajustes,
  onAlternar,
  onAjustar,
}: {
  encendido: boolean;
  bloqueado: boolean;
  accent: string;
  ajustes: Ajustes;
  onAlternar: () => void;
  onAjustar: (cambios: Partial<Ajustes>) => void;
}) {
  const esperando = encendido && bloqueado;
  const color = encendido ? (esperando ? T.muted : accent) : T.faint;
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);

  /** Cerrar al hacer clic afuera y con Escape, como los demás paneles. */
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  return (
    <div ref={caja} style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
    <button
      type="button"
      onClick={onAlternar}
      aria-label={encendido ? "Apagar el sonido de los avisos" : "Prender el sonido de los avisos"}
      aria-pressed={encendido}
      title={
        esperando
          ? "El sonido está prendido, pero el navegador no deja sonar hasta que toques la pantalla una vez. Hacé clic acá."
          : encendido
            ? "Suena cuando llega un mensaje o alguien mueve un lead. Clic para apagarlo."
            : "El sonido de los avisos está apagado. Clic para prenderlo."
      }
      style={{
        position: "relative",
        width: 34,
        height: 34,
        display: "grid",
        placeItems: "center",
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        background: T.surface,
        cursor: "pointer",
      }}
    >
      <Bocina color={color} encendido={encendido} />
      {esperando && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            width: 8,
            height: 8,
            borderRadius: 4,
            background: "#E08A1E",
            border: `1.5px solid ${T.surface}`,
          }}
        />
      )}
    </button>

    <button
      type="button"
      onClick={() => setAbierto((v) => !v)}
      aria-label="Elegir el sonido de los avisos"
      aria-expanded={abierto}
      title="Elegir el sonido y el volumen"
      style={{
        width: 16,
        height: 34,
        display: "grid",
        placeItems: "center",
        color: abierto ? accent : T.faint,
        cursor: "pointer",
        background: "transparent",
      }}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>

    {abierto && (
      <div
        role="dialog"
        aria-label="Sonido de los avisos"
        style={{
          position: "absolute",
          top: 40,
          right: 0,
          zIndex: 60,
          width: 268,
          padding: "12px 13px",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          boxShadow: "0 16px 44px rgba(3, 27, 79, 0.2)",
        }}
      >
        <p style={{ margin: "0 0 8px", fontSize: 12.5, fontWeight: 700, color: T.ink }}>
          Sonido del aviso
        </p>

        <div style={{ display: "grid", gap: 4 }}>
          {NOMBRES.map((n) => {
            const puesto = ajustes.timbre === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onAjustar({ timbre: n.id })}
                aria-pressed={puesto}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 9px",
                  borderRadius: 7,
                  border: `1px solid ${puesto ? accent : T.border}`,
                  background: puesto ? soft(accent) : T.surface,
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "block", fontSize: 12.5, fontWeight: puesto ? 700 : 500, color: T.ink }}>
                  {n.nombre}
                </span>
                <span style={{ display: "block", fontSize: 11, color: T.muted, lineHeight: 1.4 }}>
                  {n.para}
                </span>
              </button>
            );
          })}
        </div>

        <p style={{ margin: "12px 0 7px", fontSize: 12.5, fontWeight: 700, color: T.ink }}>
          Volumen
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {VOLUMENES.map((v) => {
            const puesto = ajustes.volumen === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onAjustar({ volumen: v.id })}
                aria-pressed={puesto}
                style={{
                  flex: 1,
                  height: 30,
                  fontSize: 12,
                  fontWeight: puesto ? 700 : 400,
                  borderRadius: 7,
                  border: `1px solid ${puesto ? accent : T.border}`,
                  background: puesto ? accent : T.surface,
                  color: puesto ? "#fff" : T.ink,
                  cursor: "pointer",
                }}
              >
                {v.nombre}
              </button>
            );
          })}
        </div>

        {/*
          Se escucha al elegir, esté el sonido prendido o apagado. Quien entra
          acá está eligiendo, no trabajando, y comparar cinco sonidos sin
          escucharlos no se puede.
        */}
        <p style={{ margin: "10px 0 0", fontSize: 11, color: T.faint, lineHeight: 1.45 }}>
          Cada opción suena al tocarla.
          {!encendido && " El aviso está apagado: prendelo con la bocina de al lado."}
        </p>
      </div>
    )}
    </div>
  );
}

function Bocina({ color, encendido }: { color: string; encendido: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4a.9.9 0 0 1-.9-.9v-3.2a.9.9 0 0 1 .9-.9Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      {encendido ? (
        <>
          <path d="M15.4 9.6a3.4 3.4 0 0 1 0 4.8" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
          <path d="M18 7.2a6.8 6.8 0 0 1 0 9.6" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M16 9.6l4.4 4.8" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
          <path d="M20.4 9.6L16 14.4" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
