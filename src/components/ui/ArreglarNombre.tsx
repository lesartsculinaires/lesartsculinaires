"use client";

import { acomodarNombre, seAcomoda } from "@/lib/texto";
import { conTildes } from "@/lib/tildes";
import { T } from "@/lib/theme";

interface Props {
  /** Lo que hay escrito ahora mismo. */
  valor: string;
  /** Lo reemplaza. Sólo se llama si la persona aprieta una pastilla. */
  onCambio: (v: string) => void;
  accent: string;
}

/**
 * Cómo quedaría el nombre bien escrito, para aplicarlo con un clic.
 *
 * ============================================================================
 * POR QUÉ SE MUESTRA EL RESULTADO Y NO EL PROBLEMA
 * ============================================================================
 *
 * Hasta ahora el CRM decía «Está todo en mayúsculas» y dejaba a quien escribía
 * con el trabajo de arreglarlo, o de encontrar el botón «Aa» perdido entre las
 * teclas de acentos. Un aviso que no trae la solución al lado se ignora, y con
 * razón: leerlo cuesta lo mismo que la letra que iba a corregir.
 *
 * Acá se ve el nombre YA arreglado. Apretarlo lo pone. No hay que entender
 * ninguna regla ni decidir nada: se compara lo escrito con lo propuesto y se
 * elige. Y si lo propuesto está mal, no se aprieta y no pasa nada.
 *
 * ============================================================================
 * DOS PASTILLAS DISTINTAS, Y NO UNA
 * ============================================================================
 *
 * Porque son dos operaciones con riesgos muy distintos y hay que poder aceptar
 * una sin la otra.
 *
 *   ACOMODAR   mayúsculas y espacios. No inventa nada: las mismas letras en
 *              otro caso. Es seguro de aceptar siempre.
 *
 *   TILDES     cambia letras, aunque sea de una lista corta y conocida. Acierta
 *              casi siempre y por eso vale ofrecerla, pero hay gente que se
 *              apellida «Perez» sin tilde y para esa persona la propuesta está
 *              mal. Va aparte para que aceptar lo primero no arrastre lo
 *              segundo.
 *
 * Se dibujan sólo cuando hay algo que proponer, y sólo con el campo enfocado:
 * un cartel permanente al lado del nombre de alguien que se escribe así de
 * verdad sería un reproche eterno por un dato que está bien.
 */
export function ArreglarNombre({ valor, onCambio, accent }: Props) {
  const acomodado = seAcomoda(valor) ? acomodarNombre(valor) : null;

  // Las tildes se proponen sobre el nombre ya acomodado: si no, alguien que
  // escribió «JOSE PEREZ» vería «JOSÉ PÉREZ» en mayúsculas, que arregla una
  // cosa y deja la otra.
  const base = acomodado ?? valor;
  const conAcentos = conTildes(base);

  const opciones: { texto: string; etiqueta: string; ayuda: string }[] = [];

  if (acomodado) {
    opciones.push({
      texto: acomodado,
      etiqueta: acomodado,
      ayuda: "Mismas letras, bien capitalizadas y sin espacios de más.",
    });
  }
  if (conAcentos && conAcentos !== acomodado) {
    opciones.push({
      texto: conAcentos,
      etiqueta: conAcentos,
      ayuda:
        "Con las tildes que llevan normalmente estos nombres. Es una sugerencia: " +
        "si la persona se escribe sin tilde, no la apliques.",
    });
  }

  if (opciones.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: T.faint, marginRight: 2 }}>¿Así?</span>
      {opciones.map((o) => (
        <button
          key={o.texto}
          type="button"
          // Sin robar el foco: en la ficha el campo guarda al perderlo, y un
          // clic que primero desenfoca dispararía un guardado a medio camino.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCambio(o.texto)}
          title={o.ayuda}
          style={{
            padding: "3px 9px",
            fontSize: 11.5,
            lineHeight: 1.35,
            borderRadius: 20,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: accent,
            maxWidth: 280,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}
