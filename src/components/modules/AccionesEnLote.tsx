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
 * LO QUE SÍ SIGUE PIDIENDO UN CLIC, A PROPÓSITO
 *
 * Aplicar. Un cambio en masa no se deshace —no hay «volver atrás» que devuelva
 * treinta fichas a lo que cada una tenía antes, porque antes tenían cosas
 * distintas—, así que elegir del desplegable no escribe nada: prepara el cambio
 * y el botón dice cuántas fichas y a qué valor antes de tocar la base.
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
  /** El campo elegido y su valor. Sólo uno a la vez: son cambios distintos. */
  const [pendiente, setPendiente] = useState<{ campo: keyof CambioEnLote; id: number } | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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

  const elegido = pendiente
    ? campos.find((c) => c.campo === pendiente.campo)
    : null;
  const nombreValor = elegido?.items.find((i) => i.id === pendiente?.id)?.nombre ?? null;

  const aplicar = async () => {
    if (!pendiente) return;
    setAplicando(true);
    setAviso(null);

    const r = await actualizarVarias(ids, { [pendiente.campo]: pendiente.id });
    setAplicando(false);

    if (!r.ok) {
      setAviso(r.error);
      return;
    }

    // `error` con `ok` en verdadero es el caso a medias: cambiaron algunas.
    setAviso(r.error ?? `Listo: ${r.cuantas} ${r.cuantas === 1 ? "ficha" : "fichas"}.`);
    setPendiente(null);
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
            <span style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap" }}>{etiqueta}</span>
            <select
              value={pendiente?.campo === campo ? String(pendiente.id) : ""}
              onChange={(e) => {
                setAviso(null);
                // Elegir en un desplegable descarta lo que hubiera preparado en
                // otro: se cambia un dato por vez, y dos preparados a la vez
                // harían creer que el botón aplica los dos.
                setPendiente(e.target.value ? { campo, id: Number(e.target.value) } : null);
              }}
              style={SELECT}
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

      {/* El botón aparece recién cuando hay algo elegido, y su texto dice
          exactamente qué va a pasar. Un «Aplicar» a secas sobre treinta fichas
          es lo que hace que después nadie sepa qué se tocó. */}
      {pendiente && nombreValor && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 9 }}>
          <button
            type="button"
            onClick={() => void aplicar()}
            disabled={aplicando}
            style={{
              height: 31,
              padding: "0 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 7,
              background: accent,
              color: "#fff",
              cursor: aplicando ? "wait" : "pointer",
            }}
          >
            {aplicando
              ? "Cambiando…"
              : `${elegido?.etiqueta}: ${ids.length} ${
                  ids.length === 1 ? "ficha" : "fichas"
                } a «${nombreValor}»`}
          </button>
          <button
            type="button"
            onClick={() => {
              setPendiente(null);
              setAviso(null);
            }}
            style={{ fontSize: 12, color: T.muted }}
          >
            Cancelar
          </button>
        </div>
      )}

      {aviso && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 11.5,
            lineHeight: 1.45,
            color: aviso.startsWith("Listo") ? T.muted : T.warn,
          }}
        >
          {aviso}
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
