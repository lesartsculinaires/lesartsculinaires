"use client";

import { useState } from "react";

import { enviarPlantillaAConversacion } from "@/app/plantillas-actions";
import {
  SelectorPlantilla,
  aprobadas,
  listaParaMandar,
} from "@/components/ui/SelectorPlantilla";
import { T } from "@/lib/theme";
import type { Plantilla } from "@/lib/types";

/**
 * Mandar una plantilla desde la conversación.
 *
 * Aparece cuando la ventana de 24 horas se cerró, que es cuando sirve: sin
 * esto, el aviso de «ya no se puede escribir» era un callejón sin salida y la
 * conversación quedaba muerta hasta que la persona escribiera sola.
 *
 * Elegir y llenar los huecos lo hace `SelectorPlantilla`, que es lo mismo que
 * usa la ventana de chat nuevo. Acá queda nada más el botón y el envío.
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
  const [elegida, setElegida] = useState<string>("");
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plantilla = aprobadas(plantillas).find((p) => p.id === elegida) ?? null;
  const completa = listaParaMandar(plantilla, valores);

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

  return (
    <div style={{ marginTop: 8 }}>
      <SelectorPlantilla
        plantillas={plantillas}
        elegida={elegida}
        valores={valores}
        onElegir={(id) => {
          setElegida(id);
          setError(null);
        }}
        onValores={(v) => {
          setValores(v);
          setError(null);
        }}
      />

      {plantilla && (
        <button
          type="button"
          onClick={() => void mandar()}
          disabled={enviando || !completa}
          style={{
            marginTop: 7,
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

      {error && (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}
    </div>
  );
}
