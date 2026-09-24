import { aPedazos } from "@/lib/formatoDeWhatsapp";

/**
 * El texto de un mensaje, dibujado como lo dibuja el teléfono.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA
 * ============================================================================
 *
 * WhatsApp manda texto pelado con marcas. Sin esto, la asesora pulsa «negrita»,
 * manda, y en su propia burbuja lee `*Hola*` con los asteriscos a la vista. El
 * mensaje salió bien —el cliente lo ve en negrita— pero en el CRM parece que el
 * botón no funcionó. Son dos lecturas distintas del mismo mensaje.
 *
 * ============================================================================
 * SÓLO DONDE LA RED DE VERDAD LAS DIBUJA
 * ============================================================================
 *
 * Quien lo usa pasa `conMarcas`, que sale de la ficha del canal. En Instagram y
 * Messenger va en `false` y el texto se muestra crudo, porque ahí los
 * asteriscos le llegan al cliente como asteriscos: dibujarlos en negrita acá
 * sería mostrar algo distinto de lo que la persona recibió.
 */
export function TextoConFormato({
  texto,
  conMarcas,
}: {
  texto: string;
  conMarcas: boolean;
}) {
  if (!conMarcas) return <>{texto}</>;

  const pedazos = aPedazos(texto);
  // Nada que dibujar: se devuelve el texto tal cual para no llenar la burbuja
  // de <span> por nada. La bandeja tiene cientos de mensajes a la vez.
  if (pedazos.length === 1 && !pedazos[0].negrita && !pedazos[0].cursiva &&
      !pedazos[0].tachado && !pedazos[0].mono) {
    return <>{texto}</>;
  }

  return (
    <>
      {pedazos.map((p, i) => (
        <span
          key={i}
          style={{
            fontWeight: p.negrita ? 700 : undefined,
            fontStyle: p.cursiva ? "italic" : undefined,
            textDecoration: p.tachado ? "line-through" : undefined,
            fontFamily: p.mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
            fontSize: p.mono ? "0.94em" : undefined,
          }}
        >
          {p.texto}
        </span>
      ))}
    </>
  );
}
