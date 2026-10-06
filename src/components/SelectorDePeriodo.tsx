"use client";

import type { ReactNode } from "react";

import { T } from "@/lib/theme";
import type { Periodo } from "@/lib/periodoDelTablero";

/**
 * La fila de meses que manda sobre una pantalla.
 *
 * ============================================================================
 * POR QUÉ ESTÁ ACÁ Y NO ADENTRO DEL TABLERO
 * ============================================================================
 *
 * Nació adentro del Dashboard. Cuando la escuela pidió lo mismo para Programas
 * —«que los leads que aparecen se vayan actualizando cada mes»— quedaban dos
 * caminos: copiarlo, o sacarlo. Copiado, las dos pantallas empiezan iguales y
 * se separan sin que nadie lo decida: se arregla un detalle en una y la otra se
 * queda con el de antes.
 *
 * Lo que cambia entre pantallas es la explicación de abajo —cada una mide una
 * cosa distinta y tiene que decirla con sus palabras— y si los botones llevan
 * cuenta o no. Eso viaja como props; el comportamiento es uno solo.
 */
export function SelectorDePeriodo({
  periodos,
  elegido,
  accent,
  nota,
  cuenta,
  onElegir,
}: {
  periodos: Periodo[];
  elegido: Periodo;
  accent: string;
  /** Qué significa lo que se está mirando. Lo escribe cada pantalla. */
  nota: ReactNode;
  /**
   * Cuántos leads tiene cada período, si la pantalla los quiere en el botón.
   *
   * Es opcional porque no siempre aportan: en el tablero el número grande ya
   * está debajo. En Programas sí, que es justo lo que se pidió —«que arriba
   * aparezca por mes cuántos leads hay»—.
   */
  cuenta?: (clave: string) => number;
  onElegir: (clave: string) => void;
}) {
  const esMes = (c: string) => /^\d{4}-\d{2}$/.test(c);
  const meses = periodos.filter((p) => esMes(p.clave));
  const resto = periodos.filter((p) => !esMes(p.clave));

  // Los seis más nuevos, más el elegido si quedó fuera de esa ventana.
  const aLaVista = meses.slice(0, 6);
  if (!aLaVista.some((m) => m.clave === elegido.clave) && esMes(elegido.clave)) {
    aLaVista.push(elegido);
  }

  const boton = (p: Periodo) => {
    const puesto = p.clave === elegido.clave;
    const n = cuenta?.(p.clave);
    return (
      <button
        key={p.clave}
        type="button"
        data-periodo={p.clave}
        data-puesto={puesto ? "si" : "no"}
        data-leads={n == null ? undefined : String(n)}
        onClick={() => onElegir(p.clave)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 12px",
          fontSize: 12.5,
          borderRadius: 7,
          border: `1px solid ${puesto ? accent : T.border}`,
          background: puesto ? accent : T.surface,
          color: puesto ? "#fff" : T.muted,
          fontWeight: puesto ? 600 : 400,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {p.etiqueta}
        {n != null && (
          /*
            La cuenta va SIEMPRE, también cuando es cero.
            Un mes sin leads que esconde su número se lee como un mes que
            todavía no se cargó. Escribir el cero dice que ese mes se miró y no
            entró nadie, que es una respuesta y no una ausencia.
          */
          <span
            className="mono"
            style={{ fontSize: 11, color: puesto ? "#FFFFFFB8" : T.faint }}
          >
            {n}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {aLaVista.map(boton)}
        <span style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
        {resto.map(boton)}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
        {nota}
      </p>
    </div>
  );
}
