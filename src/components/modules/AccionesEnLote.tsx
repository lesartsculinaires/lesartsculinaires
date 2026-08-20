"use client";

import { useState } from "react";

import { actualizarVarias, type CambioEnLote } from "@/app/actions";
import { useCatalogo } from "@/lib/catalog";
import { T } from "@/lib/theme";
import { activos } from "@/lib/types";

/**
 * Cambiar un dato en varias fichas de una vez.
 *
 * Es para el trabajo que hoy se hace abriendo una ficha tras otra: repartir
 * treinta leads entre asesores, mover a «Perdido» los que no contestaron,
 * corregir el programa de una tanda importada mal.
 *
 * LOS CUATRO A LA VISTA, NO ESCONDIDOS DETRÁS DE UN PASO
 *
 * Antes había que elegir primero qué campo y después el valor. Eran dos clics
 * para llegar a ver los nombres de los vendedores, y el primero no decidía
 * nada: sólo abría el segundo. Ahora los cuatro desplegables están puestos, así
 * que se ve de una qué se puede cambiar y a qué, sin abrir la ficha de nadie.
 *
 * ELEGIR APLICA
 *
 * Antes elegir sólo preparaba el cambio y hacía falta confirmar en un botón
 * aparte. Era un paso de más y, peor, engañaba: al elegir del desplegable
 * parecía que ya estaba hecho, así que quien no veía el botón se iba creyendo
 * que había asignado y no había pasado nada.
 *
 * Ahora elegir escribe. Es recuperable —volver a elegir otro valor sobre la
 * misma selección lo corrige— y el resultado se dice con todas las letras:
 * cuántas fichas cambiaron y a qué. Lo que no se puede es adivinar cuál era el
 * valor anterior de cada una, así que la selección queda puesta después de
 * aplicar: si fue un error, se corrige sobre las mismas sin volver a marcarlas.
 */
export function AccionesEnLote({
  ids,
  accent,
  onListo,
  onLimpiar,
}: {
  ids: number[];
  accent: string;
  /** Para recargar cuando el cambio ya está hecho. */
  onListo: () => void;
  onLimpiar: () => void;
}) {
  const cat = useCatalogo();
  /** Qué campo se está escribiendo ahora mismo, para apagar sólo ése. */
  const [aplicando, setAplicando] = useState<keyof CambioEnLote | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; malo: boolean } | null>(null);

  const campos: {
    campo: keyof CambioEnLote;
    etiqueta: string;
    items: readonly { id: number; nombre: string }[];
  }[] = [
    { campo: "vendedor_id", etiqueta: "Asignar vendedor", items: activos(cat.vendedores) },
    { campo: "etapa_id", etiqueta: "Cambiar etapa", items: cat.etapas },
    { campo: "producto_id", etiqueta: "Cambiar programa", items: cat.productos },
    { campo: "estado_id", etiqueta: "Cambiar estado", items: cat.estados },
  ];

  const aplicar = async (campo: keyof CambioEnLote, valorId: number, etiqueta: string) => {
    const nombre =
      campos.find((c) => c.campo === campo)?.items.find((i) => i.id === valorId)?.nombre ?? "";

    setAplicando(campo);
    setAviso(null);

    const r = await actualizarVarias(ids, { [campo]: valorId });
    setAplicando(null);

    if (!r.ok) {
      setAviso({ texto: r.error ?? "No se pudo cambiar.", malo: true });
      return;
    }

    // `error` con `ok` en verdadero es el caso a medias: cambiaron algunas.
    if (r.error) {
      setAviso({ texto: r.error, malo: true });
    } else {
      setAviso({
        texto: `${etiqueta}: ${r.cuantas} ${r.cuantas === 1 ? "ficha" : "fichas"} a «${nombre}».`,
        malo: false,
      });
    }

    // La selección NO se limpia: si el cambio fue un error, se corrige sobre
    // las mismas fichas sin tener que volver a marcarlas una por una.
    onListo();
  };

  return (
    <div
      style={{
        padding: "10px 14px",
        marginBottom: 12,
        borderRadius: 9,
        background: T.paper,
        border: `1px solid ${accent}`,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: accent, whiteSpace: "nowrap" }}>
          {ids.length} {ids.length === 1 ? "seleccionada" : "seleccionadas"}
        </span>

        {campos.map(({ campo, etiqueta, items }) => (
          <label key={campo} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap" }}>
              {aplicando === campo ? "Cambiando…" : etiqueta}
            </span>
            <select
              // Vuelve a «—» después de aplicar: el desplegable no muestra en
              // qué están las fichas —cada una puede estar en algo distinto—
              // sino qué se les va a poner, y eso ya pasó.
              value=""
              disabled={aplicando != null}
              onChange={(e) => {
                if (!e.target.value) return;
                void aplicar(campo, Number(e.target.value), etiqueta);
              }}
              style={{ ...SELECT, cursor: aplicando ? "wait" : "pointer" }}
            >
              <option value="">—</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
          </label>
        ))}

        <button
          type="button"
          onClick={onLimpiar}
          style={{ fontSize: 12, color: T.muted, padding: "0 4px", whiteSpace: "nowrap" }}
        >
          Quitar selección
        </button>
      </div>

      {aviso && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            fontWeight: aviso.malo ? 600 : 400,
            lineHeight: 1.45,
            color: aviso.malo ? T.warn : "#2F6B4F",
          }}
        >
          {aviso.malo ? "⚠ " : "✓ "}
          {aviso.texto}
        </p>
      )}
    </div>
  );
}

const SELECT: React.CSSProperties = {
  height: 29,
  maxWidth: 165,
  padding: "0 6px",
  fontSize: 12,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  background: T.surface,
  color: T.ink,
};
