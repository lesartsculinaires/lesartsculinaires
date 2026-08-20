"use client";

import { T } from "@/lib/theme";

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
 */
export function Sonido({
  encendido,
  bloqueado,
  accent,
  onAlternar,
}: {
  encendido: boolean;
  bloqueado: boolean;
  accent: string;
  onAlternar: () => void;
}) {
  const esperando = encendido && bloqueado;
  const color = encendido ? (esperando ? T.muted : accent) : T.faint;

  return (
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
