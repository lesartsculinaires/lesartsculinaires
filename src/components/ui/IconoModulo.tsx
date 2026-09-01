import type { CSSProperties } from "react";

import { MOD_USUARIOS } from "@/lib/modulos";

/**
 * El dibujito de cada módulo de la barra lateral.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ DIBUJADOS Y NO EMOJIS
 * ------------------------------------------------------------------------
 *
 * Un emoji lo dibuja el sistema operativo, así que la misma lista se ve de una
 * manera en la Mac de dirección, de otra en la PC de recepción y de otra en el
 * iPad del stand —distintos colores, distintos tamaños, algunos en 3D—. Estos
 * son trazos: se ven iguales en todas partes y toman el color del módulo
 * activo, que es lo que hace que la barra se lea de un vistazo.
 *
 * ------------------------------------------------------------------------
 * SON UNA AYUDA, NO UN REEMPLAZO
 * ------------------------------------------------------------------------
 *
 * Van al lado del nombre y no en lugar del nombre. Un icono solo obliga a
 * aprenderse doce símbolos antes de poder usar el CRM, y a alguien que entra
 * hoy lo deja adivinando. Con el nombre al lado, el dibujo hace lo que sabe
 * hacer: que el ojo encuentre la fila sin leer las doce.
 *
 * `aria-hidden` porque el nombre ya está escrito ahí mismo: un lector de
 * pantalla que además leyera «imagen» diría dos veces lo mismo.
 */

/** Los trazos de cada uno, en una cuadrícula de 24×24. */
const TRAZOS: Record<string, string> = {
  // Cuatro paneles: el resumen de todo.
  Dashboard: "M4 4h6.5v6.5H4zM13.5 4H20v4.5h-6.5zM4 13.5h6.5V20H4zM13.5 11.5H20V20h-6.5z",

  // Una bandeja con la boca abierta.
  Inbox: "M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4M3.5 13.5 6 5.5h12l2.5 8v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",

  // Un avión de papel: lo que sale hacia afuera, a mucha gente a la vez.
  "Envíos": "M21 3 10.5 13.5M21 3l-6.5 18-4-7.5-7.5-4L21 3Z",

  // Una persona.
  Clientes: "M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM4.5 20c0-3.6 3.4-5.5 7.5-5.5s7.5 1.9 7.5 5.5",

  // El cilindro con que se dibuja una base de datos desde siempre.
  Bases: "M12 3c4.2 0 7 1.1 7 2.5S16.2 8 12 8 5 6.9 5 5.5 7.8 3 12 3ZM5 5.5v13c0 1.4 2.8 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 2.8 2.5 7 2.5s7-1.1 7-2.5",

  // Tres columnas de distinta altura: el tablero.
  Pipeline: "M4.5 4.5h4v15h-4zM10 4.5h4v10h-4zM15.5 4.5h4v6.5h-4z",

  // Una hoja de calendario con sus dos ganchos.
  Calendario: "M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4",

  // Dos personas: el equipo.
  Equipos: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 19.5c0-3.1 2.9-4.8 6.5-4.8s6.5 1.7 6.5 4.8M16.5 5.6a3 3 0 0 1 0 5.8M18 14.9c2 .6 3.5 1.9 3.5 4.1",

  // El birrete: los programas de la escuela.
  Programas: "M12 4 2.5 8.5 12 13l9.5-4.5L12 4ZM6.5 10.8V16c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3v-5.2M21.5 8.5v6",

  // Una tabla con casillas: el formulario.
  Formularios: "M5 3.5h14v17H5zM8.5 8h7M8.5 12h7M8.5 16h4",

  // Un globo de mensaje con renglones: lo que ya está escrito.
  Plantillas: "M4 5.5h16v10.5H9.5L5.5 20v-3.9H4zM8 9h8M8 12.5h5",

  // El reloj, el mismo de la cabecera.
  Recordatorios: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3.2 2",

  // La campana.
  Notificaciones: "M12 3.5a5.5 5.5 0 0 0-5.5 5.5c0 5-2 6.5-2 6.5h15s-2-1.5-2-6.5A5.5 5.5 0 0 0 12 3.5ZM10.3 19a2 2 0 0 0 3.4 0",

  // Una hoja con el visto: lo que dirección aprobó.
  Autorizaciones: "M6 3.5h7.5L18 8v12.5H6zM13.5 3.5V8H18M9 13.5l2 2 4-4",

  // Un escudo: quién puede qué.
  [MOD_USUARIOS]: "M12 3.5 5 6.2v5.4c0 4.2 2.9 7.6 7 8.9 4.1-1.3 7-4.7 7-8.9V6.2L12 3.5ZM9.2 12l2 2 3.6-4",
};

/**
 * Para lo que no esté en la lista: un punto.
 *
 * Existe para que agregar un módulo nuevo y olvidarse del dibujo deje la barra
 * prolija en vez de con un hueco. Un módulo sin icono se nota, pero no rompe
 * la alineación de los demás.
 */
const PUNTO = "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z";

export function IconoModulo({
  nombre,
  color,
  size = 16,
  style,
}: {
  nombre: string;
  color: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ flexShrink: 0, ...style }}
    >
      <path
        d={TRAZOS[nombre] ?? PUNTO}
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
