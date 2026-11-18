import type { CSSProperties } from "react";

import { MARCAS, type ClaveMarca } from "@/lib/marcas";

/**
 * Cómo se distingue cada marca en el Tablero Comercial conjunto (12/11/2026).
 *
 * Pedido: que LAC y HC se reconozcan de un vistazo por su paleta y su logo.
 * Cada marca tiene:
 *
 *   color   su tinta: el azul de LAC, el negro de HC (texto y bordes fuertes)
 *   franja  la banda que la marca en tarjetas, columnas y filas: el azul de
 *           LAC y el dorado de HC (el negro solo se confundiría con el texto)
 *   tinte   un fondo muy suave de su color, para sus columnas y tarjetas
 *
 * Los colores salen del registro de marcas (`@/lib/marcas`); sólo los tintes
 * se fijan acá porque son de esta vista.
 */
export const IDENTIDAD: Record<ClaveMarca, { color: string; franja: string; tinte: string; tinteFuerte: string }> = {
  lac: {
    color: MARCAS.lac.paleta.ink,
    franja: MARCAS.lac.paleta.ink,
    tinte: "#F1F4FB",
    tinteFuerte: "#E1E8F6",
  },
  hc: {
    color: MARCAS.hc.paleta.ink,
    franja: MARCAS.hc.paleta.resalte,
    tinte: "#FAF5EC",
    tinteFuerte: "#F1E6D2",
  },
};

/** El símbolo de la marca en un cuadradito, del tamaño que se pida. */
export function SimboloDeMarca({ clave, medida = 18 }: { clave: ClaveMarca; medida?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={MARCAS[clave].simbolo}
      alt=""
      aria-hidden
      width={medida}
      height={medida}
      style={{ width: medida, height: medida, objectFit: "contain", flexShrink: 0, display: "inline-block", verticalAlign: "middle" }}
    />
  );
}

/** Símbolo + nombre (o sigla), en el color de la marca. */
export function SelloDeMarca({
  clave,
  corto = false,
  medida = 18,
  estilo,
}: {
  clave: ClaveMarca;
  corto?: boolean;
  medida?: number;
  estilo?: CSSProperties;
}) {
  return (
    <span
      data-sello={clave}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, color: IDENTIDAD[clave].color, fontWeight: 700, whiteSpace: "nowrap", ...estilo }}
    >
      <SimboloDeMarca clave={clave} medida={medida} />
      {corto ? MARCAS[clave].prefijo : MARCAS[clave].nombre}
    </span>
  );
}

/** El logo completo, a la altura pedida. */
export function LogoDeMarca({ clave, alto = 26 }: { clave: ClaveMarca; alto?: number }) {
  const m = MARCAS[clave];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={m.logo}
      alt={m.nombre}
      height={alto}
      width={Math.round(alto * m.logoProporcion)}
      style={{ height: alto, width: "auto", maxWidth: "100%", objectFit: "contain", display: "block" }}
    />
  );
}
