"use client";

import { conValores } from "@/lib/whatsapp/huecos";
import { pedidosDe, repartirValores } from "@/lib/whatsapp/piezas";
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

/**
 * ¿Está lista para mandar? Meta rechaza el envío si falta una sola pieza.
 *
 * ----------------------------------------------------------------------------
 * TODAS LAS PIEZAS, NO SÓLO LOS HUECOS DEL TEXTO
 * ----------------------------------------------------------------------------
 *
 * Acá se miraba `huecosDe(plantilla.cuerpo)`: sólo el cuerpo. Con una
 * plantilla que lleva imagen de encabezado —la del workshop de la escuela— eso
 * daba «lista» sin haber pedido la imagen, el envío salía incompleto y el CRM
 * contestaba que faltaba la dirección de la imagen sin ofrecer dónde ponerla.
 *
 * `pedidosDe` devuelve todo lo que hay que llenar, en el orden en que Meta lo
 * espera: encabezado, cuerpo y botones. Es lo mismo que ya usaba el envío
 * masivo, que sí podía mandar estas plantillas.
 */
export const listaParaMandar = (
  plantilla: Plantilla | null,
  valores: readonly string[],
): boolean =>
  plantilla != null &&
  pedidosDe(plantilla.pide).every((_, i) => (valores[i] ?? "").trim() !== "");

/**
 * El cuerpo con lo que se escribió puesto en su lugar.
 *
 * `valores` viene con TODAS las piezas —la dirección de la imagen primero, si
 * la hay—, así que se reparte antes de mirar el texto. Sin eso, la vista previa
 * mostraba el enlace de la imagen metido dentro de la primera frase.
 */
export function vistaPrevia(
  cuerpo: string | null,
  valores: readonly string[],
  pide?: Plantilla["pide"],
): string {
  if (!cuerpo) return "(esta plantilla no tiene texto)";
  const delCuerpo = pide ? repartirValores(pide, valores).cuerpo : valores;
  return conValores(cuerpo, delCuerpo);
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
          {/*
            TODO lo que la plantilla pide, no sólo los huecos del texto.
            ------------------------------------------------------------------
            Acá se dibujaban únicamente los `{{1}}` del cuerpo. Una plantilla
            con imagen de encabezado —la del workshop— no tenía dónde poner la
            imagen, así que el CRM avisaba que hacía falta su dirección y no
            ofrecía ninguna casilla para dársela: no se podía mandar.

            `pedidosDe` las devuelve todas en el orden en que Meta las espera,
            y `repartirValores` las vuelve a separar del otro lado.
          */}
          {pedidosDe(plantilla.pide).map((pedido, i) => (
            <input
              key={`${pedido.pieza}-${i}`}
              value={valores[i] ?? ""}
              onChange={(e) => {
                const copia = [...valores];
                copia[i] = e.target.value;
                onValores(copia);
              }}
              /*
               * En una dirección de archivo se pide un enlace, no una palabra.
               *
               * Es la misma distinción que hace el envío masivo: «el nombre del
               * cliente» no significa nada en el enlace de una imagen.
               */
              type={pedido.esArchivo ? "url" : "text"}
              placeholder={pedido.esArchivo ? "https://… (enlace de la imagen)" : pedido.etiqueta}
              aria-label={pedido.etiqueta}
              title={pedido.etiqueta}
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

          {/*
            Cómo va a quedar.
            ------------------------------------------------------------------
            Una plantilla se manda a ciegas si no se ve armada, y el nombre solo
            no dice qué le llega a la persona.

            LA ALTURA ESTÁ ATADA A PROPÓSITO. Sin tope, la vista previa crece
            tanto como el texto de la plantilla, y las de la escuela son largas
            —el saludo inicial lista los cinco diplomados y los cursos cortos—.
            Eso empujaba el cuadro entero más allá de la pantalla: el botón de
            enviar quedaba abajo del borde y no había forma de llegar a él ni de
            ver lo que estaba tapando. Acotada, la plantilla se lee rodando
            acá adentro y el resto del cuadro no se mueve.
          */}
          <p style={{ margin: "7px 0 3px", fontSize: 10.5, color: T.faint }}>
            Así le va a llegar
          </p>
          <div
            style={{
              padding: "7px 9px",
              maxHeight: 190,
              overflowY: "auto",
              overscrollBehavior: "contain",
              fontSize: 11.5,
              lineHeight: 1.5,
              color: T.ink,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              whiteSpace: "pre-wrap",
            }}
          >
            {vistaPrevia(plantilla.cuerpo, valores, plantilla.pide)}
          </div>
        </div>
      )}
    </div>
  );
}
