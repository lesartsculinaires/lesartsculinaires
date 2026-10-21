"use client";

import { useIdioma, type Idioma } from "@/lib/i18n/idioma";

const OPCIONES: { id: Idioma; texto: string; nombre: string }[] = [
  { id: "es", texto: "ES", nombre: "Español" },
  { id: "en", texto: "EN", nombre: "English" },
];

/**
 * El cambio de idioma: castellano o inglés.
 *
 * Es chico a propósito: se usa para grabar el video de la revisión de Meta y
 * poco más. Va en la entrada y en la barra lateral.
 */
export function SelectorDeIdioma({ tono = "claro" }: { tono?: "claro" | "oscuro" }) {
  const { idioma, cambiar } = useIdioma();
  const color = tono === "oscuro" ? "#fff" : "currentColor";

  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      data-selector-idioma
      style={{ display: "inline-flex", gap: 2, fontSize: 11.5, color }}
    >
      {OPCIONES.map((o) => {
        const activa = o.id === idioma;
        return (
          <button
            key={o.id}
            type="button"
            title={o.nombre}
            aria-pressed={activa}
            data-idioma={o.id}
            onClick={() => cambiar(o.id)}
            style={{
              padding: "3px 8px",
              borderRadius: 5,
              border: "1px solid currentColor",
              opacity: activa ? 1 : 0.55,
              fontWeight: activa ? 700 : 400,
              background: activa ? "rgba(128,128,128,0.18)" : "transparent",
              color,
              cursor: "pointer",
            }}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
