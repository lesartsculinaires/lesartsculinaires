"use client";

import { useCatalogo } from "@/lib/catalog";
import { T } from "@/lib/theme";
import { activos } from "@/lib/types";

/** Los cuatro campos que se pueden cambiar de a varios. */
export type CampoEnLote = "vendedor_id" | "etapa_id" | "producto_id" | "estado_id";

/**
 * La barra que resume la selección y deja cambiar los cuatro campos.
 *
 * Convive con los desplegables que aparecen en las propias celdas y no los
 * reemplaza: la celda sirve cuando se está mirando una fila concreta, y la
 * barra cuando la selección es larga o se quiere cambiar algo sin buscar una
 * fila. Las dos llaman al mismo aplicador, que vive en la tabla: dos copias
 * terminarían discrepando el día que a una se le agregue una comprobación y a
 * la otra no.
 *
 * No guarda estado propio a propósito. Lo que se está escribiendo y el
 * resultado los sabe la tabla, porque también los muestran las celdas; tenerlo
 * en dos lados haría que una diga «Cambiando…» y la otra no.
 */
export function AccionesEnLote({
  ids,
  accent,
  cambiando,
  aviso,
  esAdmin,
  onWhatsapp,
  onAplicar,
  onBorrar,
  onLimpiar,
}: {
  ids: number[];
  accent: string;
  /** Qué campo se está escribiendo ahora, o null. */
  cambiando: string | null;
  aviso: { texto: string; malo: boolean } | null;
  /**
   * Si quien está mirando puede borrar.
   *
   * El botón no aparece cuando no puede, en vez de aparecer y negarse al
   * apretarlo. Ofrecer algo que va a rebotar enseña a desconfiar de los
   * botones, y además la base lo niega igual: esto es la misma regla dicha
   * antes, no una segunda regla.
   */
  esAdmin: boolean;
  /** Abre la ventana de escribirle a los marcados por WhatsApp. */
  onWhatsapp: () => void;
  onAplicar: (campo: CampoEnLote, valorId: number, etiqueta: string, nombre: string) => void;
  onBorrar: () => void;
  onLimpiar: () => void;
}) {
  const cat = useCatalogo();

  const campos: {
    campo: CampoEnLote;
    etiqueta: string;
    items: readonly { id: number; nombre: string }[];
  }[] = [
    { campo: "vendedor_id", etiqueta: "Asignar vendedor", items: activos(cat.vendedores) },
    { campo: "etapa_id", etiqueta: "Cambiar etapa", items: cat.etapas },
    { campo: "producto_id", etiqueta: "Cambiar programa", items: cat.productos },
    { campo: "estado_id", etiqueta: "Cambiar estado", items: cat.estados },
  ];

  return (
    <div
      style={{
        padding: "10px 14px",
        marginBottom: 12,
        borderRadius: 9,
        background: T.paper,
        border: `1px solid ${accent}`,
        // Opaca y con sombra a propósito: va pegada arriba y las filas pasan
        // por debajo al desplazar.
        boxShadow: "0 6px 16px rgba(3, 27, 79, 0.10)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: accent, whiteSpace: "nowrap" }}>
          {ids.length} {ids.length === 1 ? "seleccionada" : "seleccionadas"}
        </span>

        {campos.map(({ campo, etiqueta, items }) => (
          <label key={campo} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap" }}>
              {cambiando === campo ? "Cambiando…" : etiqueta}
            </span>
            <select
              // Vuelve a «—» después de aplicar: el desplegable no muestra en
              // qué están las fichas —cada una puede estar en algo distinto—
              // sino qué se les va a poner, y eso ya pasó.
              value=""
              disabled={cambiando != null}
              onChange={(e) => {
                if (!e.target.value) return;
                const id = Number(e.target.value);
                onAplicar(campo, id, etiqueta, items.find((i) => i.id === id)?.nombre ?? "");
              }}
              style={{ ...SELECT, cursor: cambiando ? "wait" : "pointer" }}
            >
              <option value="">—</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
          </label>
        ))}

        {/*
          Escribirles.

          Va antes del borrar y separado de los desplegables: los cuatro de la
          izquierda cambian un dato de las fichas marcadas, esto le manda un
          mensaje a las personas. Son cosas de distinta naturaleza y la
          segunda no se deshace.
        */}
        <button
          type="button"
          onClick={onWhatsapp}
          title={
            ids.length === 1
              ? "Mandarle una plantilla de WhatsApp"
              : `Mandarles una plantilla de WhatsApp a los ${ids.length} marcados`
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 28,
            padding: "0 11px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            background: accent,
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          Escribirles por WhatsApp
        </button>

        {esAdmin && (
          <button
            type="button"
            onClick={onBorrar}
            disabled={cambiando != null}
            title={ids.length === 1 ? "Borrar el lead seleccionado" : `Borrar los ${ids.length} leads seleccionados`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              height: 28,
              padding: "0 10px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: "1px solid #E3B7B1",
              background: "#FDF1EF",
              color: "#B85042",
              whiteSpace: "nowrap",
              cursor: cambiando ? "wait" : "pointer",
            }}
          >
            {/* El basurero dibujado y no un emoji: el emoji cambia de forma y
                de color según el sistema, y acá conviene que se vea igual en
                la computadora de la escuela que en la de la casa. */}
            <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2.5 3.5h9M5.5 3.5V2.2h3v1.3M3.6 3.5l.5 8.3h5.8l.5-8.3M6 5.8v4M8 5.8v4"
                fill="none"
                stroke="#B85042"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Borrar
          </button>
        )}

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
