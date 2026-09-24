import { T } from "@/lib/theme";

/**
 * Los campos del alta y los del cambio de programa, escritos una vez.
 *
 * Son dos cuadros de diálogo que editan lo mismo y se abren desde la misma
 * pantalla, uno al lado del otro. Con los estilos copiados en cada archivo, el
 * día que alguien toque uno quedan dos formularios del mismo catálogo que se
 * ven distinto, y eso se lee como que uno de los dos está mal.
 */
export const CAMPO: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 9px",
  fontSize: 13,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

export const ETIQUETA: React.CSSProperties = {
  display: "block",
  marginBottom: 3,
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.faint,
};
