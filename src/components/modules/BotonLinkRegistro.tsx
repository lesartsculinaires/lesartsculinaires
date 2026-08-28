"use client";

import { useState } from "react";

import { crearEnlaceRegistro } from "@/app/registro-actions";
import { T } from "@/lib/theme";

interface Props {
  oportunidadId: number;
  accent: string;
  /**
   * ¿Este lead ya tiene cargado el horario con el que se cerró?
   *
   * No impide generar el enlace: hay inscripciones que no lo necesitan, y
   * frenar a alguien por un campo vacío a la hora de mandar un link es la
   * forma más rápida de que dejen de usar el link. Sólo se avisa, que es
   * cuando conviene enterarse: un segundo antes de que el recibo salga sin el
   * dato y académica tenga que llamar a preguntarlo.
   */
  faltaHorario?: boolean;
}

/**
 * Genera el enlace de esta inscripción y lo deja en el portapapeles.
 *
 * Un solo botón hace las dos cosas —crear y copiar— porque son un solo gesto:
 * nadie quiere «generar» algo y después buscar dónde copiarlo. Si ya había un
 * enlace vivo se reutiliza, así que apretarlo dos veces devuelve el mismo.
 */
export function BotonLinkRegistro({ oportunidadId, accent, faltaHorario }: Props) {
  const [estado, setEstado] = useState<"idle" | "generando" | "copiado" | "error">("idle");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const generar = async () => {
    setEstado("generando");
    setMensaje(null);

    const r = await crearEnlaceRegistro(oportunidadId);
    if (!r.ok || !r.url) {
      setEstado("error");
      setMensaje(r.error ?? "No se pudo generar el enlace.");
      return;
    }

    setUrl(r.url);

    // `navigator.clipboard` no existe fuera de HTTPS y algunos navegadores lo
    // niegan igual. Cuando falla no se pierde el enlace: se muestra abajo para
    // poder copiarlo a mano, que es peor pero no deja a nadie sin nada.
    try {
      await navigator.clipboard.writeText(r.url);
      setEstado("copiado");
      setMensaje(r.reutilizado ? "Copiado. Es el mismo enlace de antes." : "Copiado.");
    } catch {
      setEstado("error");
      setMensaje("No se pudo copiar solo. Copialo de acá abajo:");
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => void generar()}
        disabled={estado === "generando"}
        style={{
          height: 34,
          padding: "0 14px",
          fontSize: 12.5,
          fontWeight: 600,
          borderRadius: 7,
          border: `1px solid ${accent}`,
          background: estado === "copiado" ? accent : T.surface,
          color: estado === "copiado" ? "#fff" : accent,
          cursor: estado === "generando" ? "wait" : "pointer",
        }}
      >
        {estado === "generando"
          ? "Generando…"
          : estado === "copiado"
            ? "Link de registro copiado ✓"
            : "Link de registro"}
      </button>

      {mensaje && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 11.5,
            lineHeight: 1.45,
            color: estado === "error" ? T.warn : T.muted,
          }}
        >
          {mensaje}
        </p>
      )}

      {/* Se muestra sólo cuando copiar falló: en el caso normal la dirección
          larga es ruido, porque ya está en el portapapeles. */}
      {estado === "error" && url && (
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            marginTop: 4,
            width: "100%",
            height: 28,
            padding: "0 8px",
            fontSize: 11.5,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            background: T.paper,
            color: T.ink,
          }}
        />
      )}

      {faltaHorario && (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
          Este lead no tiene cargado el <strong>horario del diplomado</strong>: el
          recibo va a salir sin esa línea. Podés escribirlo más abajo, en el campo
          «Horario del diplomado», y volver a copiar el link.
        </p>
      )}

      {estado === "copiado" && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: T.faint, lineHeight: 1.45 }}>
          Cualquiera con el enlace ve esta inscripción. Vence en 30 días.
        </p>
      )}
    </div>
  );
}
