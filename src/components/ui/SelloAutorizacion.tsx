import { T } from "@/lib/theme";

/**
 * El estado de un pedido de autorización, en una palabra y un color.
 *
 * Está en un archivo propio porque lo dibujan las dos pantallas —la ficha del
 * cliente y el módulo— y tienen que decir exactamente lo mismo. Cuando el
 * asesor ve «Pendiente» en la ficha y dirección ve otra cosa en su lista, la
 * conversación que sigue es sobre el CRM y no sobre el descuento.
 *
 * Los colores no son decorativos: verde y rojo son los únicos dos que la gente
 * lee sin pensar, y este es un dato que se mira de reojo entre veinte filas.
 * El pendiente va en el ámbar de avisos del tema, que es el que ya significa
 * «esto espera algo».
 */
export function SelloAutorizacion({
  estado,
}: {
  estado: "pendiente" | "autorizada" | "rechazada";
}) {
  const [fg, bg, texto] =
    estado === "autorizada"
      ? ["#2F6B4F", "#E6F0E9", "Autorizada"]
      : estado === "rechazada"
        ? ["#A33", "#F6E7E5", "Rechazada"]
        : [T.warn, "#F6EEDC", "Pendiente"];

  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 20,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
      }}
    >
      {texto}
    </span>
  );
}
