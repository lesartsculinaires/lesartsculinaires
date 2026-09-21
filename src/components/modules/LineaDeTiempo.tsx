"use client";

import { useEffect, useState } from "react";

import { lineaDeTiempo, type Interaccion } from "@/app/linea-actions";
import { canalDe } from "@/lib/canales";
import { T } from "@/lib/theme";

/**
 * Toda la conversación de esta persona, cruzando canales.
 *
 * ============================================================================
 * QUÉ RESUELVE
 * ============================================================================
 *
 * La bandeja muestra un hilo a la vez, y un hilo es de un canal. Alguien que
 * preguntó el precio por Instagram el martes y volvió por WhatsApp el jueves
 * tiene dos hilos, y quien lo atiende hoy ve uno: contesta como si fuera la
 * primera vez, o le repite lo que ya se le dijo.
 *
 * Acá van los dos, en orden, con su etiqueta y su hora. Es lo que hace que
 * unificar las fichas sirva para algo.
 *
 * ============================================================================
 * POR QUÉ ESTÁ PLEGADA
 * ============================================================================
 *
 * Porque no se mira siempre. La ficha se abre veinte veces al día para ver el
 * teléfono o cambiar la etapa, y una conversación de cuatrocientos mensajes
 * abierta de entrada empujaría todo lo demás fuera de pantalla.
 *
 * El encabezado dice lo que sí se mira siempre —cuántas interacciones, desde
 * cuándo, hasta cuándo— y eso ya contesta «¿este cliente está activo?» sin
 * abrir nada.
 */
export function LineaDeTiempo({ clienteId, accent }: { clienteId: number; accent: string }) {
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState<{
    interacciones: Interaccion[];
    total: number;
    primero: string | null;
    ultimo: string | null;
  } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
   * Se carga siempre, aunque esté plegada.
   *
   * El resumen del encabezado —cuántas y desde cuándo— es el dato que más se
   * mira, así que tiene que estar sin tocar nada. Lo que se evita plegando no es
   * la consulta sino dibujar cuatrocientas filas.
   */
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    void lineaDeTiempo(clienteId).then((r) => {
      if (!vigente) return;
      setError(r.ok ? null : r.error);
      setDatos({
        interacciones: r.interacciones,
        total: r.total,
        primero: r.primerContacto,
        ultimo: r.ultimoContacto,
      });
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [clienteId]);

  if (cargando) {
    return <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.faint }}>Cargando la conversación…</p>;
  }

  if (error) {
    return (
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.5 }}>{error}</p>
    );
  }

  if (!datos || datos.total === 0) {
    return (
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
        Todavía no hay mensajes de esta persona por ningún canal.
      </p>
    );
  }

  const { interacciones, total, primero, ultimo } = datos;
  const recortada = total > interacciones.length;

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        data-linea-tiempo
        onClick={() => setAbierta((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 10px",
          textAlign: "left",
          borderRadius: 8,
          border: `1px solid ${T.border}`,
          background: T.paper,
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
          Conversación completa
        </span>
        <span style={{ fontSize: 11.5, color: T.muted }}>
          {total} {total === 1 ? "mensaje" : "mensajes"}
          {primero && ` · desde ${soloFecha(primero)}`}
          {ultimo && ` · último ${soloFecha(ultimo)}`}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: accent }}>
          {abierta ? "ocultar" : "ver"}
        </span>
      </button>

      {abierta && (
        <div style={{ marginTop: 8 }}>
          {/*
            Se avisa cuando hay más de las que se trajeron.
            ------------------------------------------------------------------
            Una lista cortada en silencio hace creer que la conversación empieza
            ahí. Con clientes de dos años eso es una lectura equivocada de toda
            la historia.
          */}
          {recortada && (
            <p style={{ margin: "0 0 8px", fontSize: 11, color: T.faint, lineHeight: 1.5 }}>
              Se muestran los últimos {interacciones.length} de {total}. Los
              anteriores están en la bandeja, en el hilo de cada canal.
            </p>
          )}

          {interacciones.map((m, i) => (
            <Fila
              key={m.id}
              interaccion={m}
              // El día se escribe una vez y no en cada mensaje: veinte veces la
              // misma fecha seguida es ruido que tapa lo que cambia.
              diaNuevo={i === 0 || soloFecha(m.cuando) !== soloFecha(interacciones[i - 1].cuando)}
              // La etiqueta del canal sólo cuando cambia respecto del anterior.
              // Es lo que hace visible el salto de Instagram a WhatsApp, que es
              // justamente lo que esta pantalla vino a mostrar.
              canalNuevo={i === 0 || m.canal !== interacciones[i - 1].canal}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Fila({
  interaccion: m,
  diaNuevo,
  canalNuevo,
}: {
  interaccion: Interaccion;
  diaNuevo: boolean;
  canalNuevo: boolean;
}) {
  const canal = canalDe(m.canal);
  const mio = m.direccion === "saliente";

  return (
    <>
      {diaNuevo && (
        <p
          style={{
            margin: "10px 0 5px",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: T.faint,
          }}
        >
          {soloFecha(m.cuando)}
        </p>
      )}

      <div style={{ display: "flex", gap: 7, alignItems: "baseline", padding: "3px 0" }}>
        {/* La hora, en ancho fijo, para que las líneas se lean como una columna. */}
        <span
          className="mono"
          style={{ flexShrink: 0, width: 42, fontSize: 10.5, color: T.faint }}
        >
          {soloHora(m.cuando)}
        </span>

        {canalNuevo ? (
          <span
            title={canal.nombre}
            style={{
              flexShrink: 0,
              padding: "1px 7px",
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 999,
              border: `1px solid ${canal.color}`,
              color: canal.color,
            }}
          >
            {canal.icono} {canal.nombre}
          </span>
        ) : (
          // Sin etiqueta, pero con el hueco: si la línea se corriera a la
          // izquierda, el salto de canal se vería donde no lo hay.
          <span style={{ flexShrink: 0, width: 0 }} />
        )}

        <span
          style={{
            fontSize: 12,
            lineHeight: 1.45,
            color: m.privado ? T.muted : T.ink,
            fontStyle: m.privado ? "italic" : undefined,
          }}
        >
          {/*
            Quién habló, en una flecha y no en un color.
            ------------------------------------------------------------------
            Los colores de las burbujas de la bandeja acá no se pueden usar: la
            línea de tiempo es una lista, no un chat, y pintar media lista de
            azul la vuelve ilegible. La flecha ocupa un carácter y dice lo mismo.
          */}
          <span style={{ color: T.faint, marginRight: 4 }}>{mio ? "→" : "←"}</span>
          {m.privado && <span style={{ color: T.faint }}>Nota interna: </span>}
          {m.texto ?? <span style={{ color: T.faint }}>{sinTexto(m.tipo)}</span>}
        </span>
      </div>
    </>
  );
}

/** Lo que se dice de un mensaje que no trae texto. */
function sinTexto(tipo: string): string {
  const etiquetas: Record<string, string> = {
    image: "(foto)",
    video: "(video)",
    audio: "(nota de voz)",
    document: "(documento)",
    file: "(archivo)",
    sticker: "(sticker)",
    location: "(ubicación)",
    story_mention: "(mención en una historia)",
    story_reply: "(respuesta a una historia)",
  };
  return etiquetas[tipo] ?? `(${tipo})`;
}

const soloFecha = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
};

const soloHora = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false });
};
