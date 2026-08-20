"use client";

import { useMemo, useState } from "react";

import { enviarPlantillaAConversacion } from "@/app/plantillas-actions";
import { T } from "@/lib/theme";
import type { Plantilla } from "@/lib/types";

/**
 * Mandar una plantilla desde la conversación.
 *
 * Aparece cuando la ventana de 24 horas se cerró, que es cuando sirve: sin
 * esto, el aviso de «ya no se puede escribir» era un callejón sin salida y la
 * conversación quedaba muerta hasta que la persona escribiera sola.
 *
 * Sólo se ofrecen las aprobadas. Las que están en revisión existen y figuran
 * en el módulo Plantillas, pero mandarlas falla, así que ponerlas acá sería
 * ofrecer algo que no funciona.
 */
export function MandarPlantilla({
  conversacionId,
  plantillas,
  accent,
  onEnviado,
}: {
  conversacionId: number;
  plantillas: Plantilla[];
  accent: string;
  onEnviado: () => void;
}) {
  const aprobadas = useMemo(
    () => plantillas.filter((p) => p.estado.toUpperCase() === "APPROVED"),
    [plantillas],
  );

  const [elegida, setElegida] = useState<string>("");
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plantilla = aprobadas.find((p) => p.id === elegida) ?? null;

  if (aprobadas.length === 0) {
    return (
      <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#8A5200", lineHeight: 1.5 }}>
        No hay ninguna plantilla aprobada para reabrir la conversación. Se crean en
        Meta y aparecen en el módulo <strong>Plantillas</strong>.
      </p>
    );
  }

  const mandar = async () => {
    if (!plantilla) return;
    setEnviando(true);
    setError(null);
    const r = await enviarPlantillaAConversacion(conversacionId, plantilla.id, valores);
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setElegida("");
    setValores([]);
    onEnviado();
  };

  const completa =
    plantilla != null &&
    Array.from({ length: plantilla.variables }).every((_, i) => (valores[i] ?? "").trim() !== "");

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={elegida}
          onChange={(e) => {
            setElegida(e.target.value);
            setValores([]);
            setError(null);
          }}
          style={{
            height: 28,
            padding: "0 7px",
            fontSize: 12,
            borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.ink,
          }}
        >
          <option value="">Mandar una plantilla…</option>
          {aprobadas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({p.idioma})
            </option>
          ))}
        </select>

        {plantilla && (
          <button
            type="button"
            onClick={() => void mandar()}
            disabled={enviando || !completa}
            style={{
              height: 28,
              padding: "0 13px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              background: completa ? accent : T.border,
              color: completa ? "#fff" : T.faint,
              cursor: enviando ? "wait" : completa ? "pointer" : "not-allowed",
            }}
          >
            {enviando ? "Mandando…" : "Mandar"}
          </button>
        )}
      </div>

      {plantilla && (
        <div style={{ marginTop: 7 }}>
          {/* Los huecos, en el orden en que van. Se piden todos: Meta rechaza
              el envío si falta uno, y el error que devuelve no dice cuál. */}
          {Array.from({ length: plantilla.variables }).map((_, i) => (
            <input
              key={i}
              value={valores[i] ?? ""}
              onChange={(e) => {
                const copia = [...valores];
                copia[i] = e.target.value;
                setValores(copia);
                setError(null);
              }}
              placeholder={`Dato ${i + 1} (va donde dice {{${i + 1}}})`}
              style={{
                display: "block",
                width: "100%",
                height: 27,
                marginBottom: 5,
                padding: "0 8px",
                fontSize: 12,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                background: T.surface,
                color: T.ink,
              }}
            />
          ))}

          {/* Cómo va a quedar. Una plantilla se manda a ciegas si no se ve
              armada, y el nombre solo no dice qué le llega a la persona. */}
          <p
            style={{
              margin: "4px 0 0",
              padding: "7px 9px",
              fontSize: 11.5,
              lineHeight: 1.5,
              color: T.ink,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              whiteSpace: "pre-wrap",
            }}
          >
            {vistaPrevia(plantilla.cuerpo, valores)}
          </p>
        </div>
      )}

      {error && (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** El cuerpo con lo que se escribió puesto en su lugar. */
function vistaPrevia(cuerpo: string | null, valores: string[]): string {
  if (!cuerpo) return "(esta plantilla no tiene texto)";
  return cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (entero, n: string) => {
    const v = valores[Number(n) - 1];
    return v != null && v.trim() !== "" ? v : entero;
  });
}
