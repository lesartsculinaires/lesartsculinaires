"use client";

import { T } from "@/lib/theme";

/**
 * Una celda que se puede cambiar sin abrir la ficha.
 *
 * Aparece en las filas marcadas, en las cuatro columnas que se pueden cambiar
 * de a varias: programa, vendedor, etapa y estado. Elegir acá lo aplica a
 * TODAS las marcadas, no sólo a esta fila —por eso el aviso dice a cuántas—.
 *
 * POR QUÉ EN LA CELDA Y NO SÓLO EN UNA BARRA
 *
 * Porque es donde está mirando quien lo va a usar. Con seiscientas fichas se
 * marca a mitad de la lista, y una barra arriba de todo queda fuera de
 * pantalla: se elige, no pasa nada visible, y parece que la función no
 * funciona. La celda está donde ocurre el trabajo.
 */
export function CeldaEnLote({
  valorActual,
  items,
  cuantas,
  campo,
  ocupado,
  onElegir,
}: {
  /** Lo que muestra hoy esta fila, para que no se vea vacía. */
  valorActual: string;
  items: readonly { id: number; nombre: string }[];
  /** Cuántas fichas van a cambiar. Va en el título, para que no sorprenda. */
  cuantas: number;
  campo: string;
  ocupado: boolean;
  onElegir: (id: number) => void;
}) {
  return (
    <select
      value=""
      disabled={ocupado}
      title={
        cuantas > 1
          ? `Se aplica a las ${cuantas} seleccionadas`
          : `Cambiar ${campo} de esta ficha`
      }
      // El clic no tiene que abrir la ficha: quien toca acá está cambiando un
      // dato, no yendo a mirar a nadie.
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        if (e.target.value) onElegir(Number(e.target.value));
      }}
      style={{
        width: "100%",
        maxWidth: 150,
        height: 26,
        padding: "0 4px",
        fontSize: 12,
        border: `1px solid ${T.borderStrong}`,
        borderRadius: 6,
        background: T.surface,
        color: T.ink,
        cursor: ocupado ? "wait" : "pointer",
      }}
    >
      {/* Lo primero que se ve es lo que la ficha tiene hoy, no un hueco. */}
      <option value="">{ocupado ? "Cambiando…" : valorActual}</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>{i.nombre}</option>
      ))}
    </select>
  );
}
