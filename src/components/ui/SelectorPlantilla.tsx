"use client";

import { conValores, huecosDe } from "@/lib/whatsapp/huecos";
import { T } from "@/lib/theme";
import type { Plantilla } from "@/lib/types";

/**
 * Elegir una plantilla y llenarle los huecos.
 *
 * Está aparte porque hacen falta dos veces y por dos motivos distintos, pero
 * el trabajo es el mismo: dentro de una conversación cuando se pasaron las 24
 * horas, y al abrir un chat nuevo, donde la plantilla no es una opción sino el
 * único camino. Con dos copias, la de una pantalla se arreglaría y la de la
 * otra no.
 *
 * Es controlado: quien lo usa guarda qué se eligió y qué se escribió, y pone
 * su propio botón. Lo que sigue después no es lo mismo en los dos lados —uno
 * manda, el otro abre el hilo y recién ahí manda— y meter esa decisión acá
 * adentro obligaría a que este componente supiera de las dos.
 */

/** Las que Meta aprobó. Las demás existen, pero mandarlas falla. */
export const aprobadas = (plantillas: readonly Plantilla[]): Plantilla[] =>
  plantillas.filter((p) => p.estado.toUpperCase() === "APPROVED");

/** ¿Está lista para mandar? Meta rechaza el envío si falta un hueco. */
export const listaParaMandar = (
  plantilla: Plantilla | null,
  valores: readonly string[],
): boolean =>
  plantilla != null &&
  // Del cuerpo y no de `plantilla.variables`: esa columna se llenó al
  // sincronizar con el contador viejo, que sólo veía `{{1}}` y decía cero para
  // las plantillas con nombres. Con cero, el botón se encendía sin pedir nada
  // y el envío fallaba en Meta.
  huecosDe(plantilla.cuerpo).every((_, i) => (valores[i] ?? "").trim() !== "");

/** El cuerpo con lo que se escribió puesto en su lugar. */
export function vistaPrevia(cuerpo: string | null, valores: readonly string[]): string {
  if (!cuerpo) return "(esta plantilla no tiene texto)";
  return conValores(cuerpo, valores);
}

export function SelectorPlantilla({
  plantillas,
  elegida,
  valores,
  rotulo = "Mandar una plantilla…",
  onElegir,
  onValores,
}: {
  plantillas: readonly Plantilla[];
  /** El id de la elegida, o cadena vacía. */
  elegida: string;
  valores: string[];
  /** Lo que dice el desplegable cuando no hay ninguna elegida. */
  rotulo?: string;
  onElegir: (id: string) => void;
  onValores: (valores: string[]) => void;
}) {
  const lista = aprobadas(plantillas);
  const plantilla = lista.find((p) => p.id === elegida) ?? null;

  if (lista.length === 0) {
    return (
      <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#8A5200", lineHeight: 1.5 }}>
        No hay ninguna plantilla aprobada. Se crean en Meta y aparecen en el módulo{" "}
        <strong>Plantillas</strong> cuando quedan aprobadas.
      </p>
    );
  }

  return (
    <div>
      <select
        value={elegida}
        onChange={(e) => {
          onElegir(e.target.value);
          onValores([]);
        }}
        style={{
          width: "100%",
          height: 30,
          padding: "0 7px",
          fontSize: 12.5,
          borderRadius: 6,
          border: `1px solid ${T.border}`,
          background: T.surface,
          color: T.ink,
        }}
      >
        <option value="">{rotulo}</option>
        {lista.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} ({p.idioma})
          </option>
        ))}
      </select>

      {plantilla && (
        <div style={{ marginTop: 7 }}>
          {/* Los huecos, en el orden en que van. Se piden todos: Meta rechaza
              el envío si falta uno, y el error que devuelve no dice cuál. */}
          {huecosDe(plantilla.cuerpo).map((hueco, i) => (
            <input
              key={hueco.clave}
              value={valores[i] ?? ""}
              onChange={(e) => {
                const copia = [...valores];
                copia[i] = e.target.value;
                onValores(copia);
              }}
              // La etiqueta sale del hueco: con posiciones dice «Dato 1», y
              // con nombres dice el nombre que puso quien creó la plantilla,
              // que es lo que de verdad le explica a la asesora qué escribir.
              placeholder={hueco.etiqueta}
              aria-label={hueco.etiqueta}
              style={{
                display: "block",
                width: "100%",
                height: 28,
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
    </div>
  );
}
