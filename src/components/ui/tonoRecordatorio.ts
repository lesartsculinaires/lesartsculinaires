import type { Urgencia } from "@/lib/recordatorios";

/**
 * El color de cada urgencia, una sola vez.
 *
 * Lo usan el reloj de la cabecera, el módulo y la ventana emergente. Con tres
 * copias, un rojo retocado en un lado dejaría al mismo aviso de dos colores
 * según dónde se lo mire, y el color acá es información: es lo que distingue
 * «hay que llamar hoy» de «hay tiempo».
 */
export interface Tono {
  /** Para el texto y el borde. */
  fuerte: string;
  /** Para el fondo de la ficha. */
  suave: string;
  /** Cómo se llama esta urgencia en pantalla. */
  rotulo: string;
}

export const TONO: Record<Urgencia, Tono> = {
  vencido: { fuerte: "#B85042", suave: "#FBEDEB", rotulo: "Vencido" },
  hoy: { fuerte: "#C2410C", suave: "#FDF0E7", rotulo: "Vence hoy" },
  pronto: { fuerte: "#A16207", suave: "#FBF3E0", rotulo: "Por vencer" },
  "en curso": { fuerte: "#2F6B4F", suave: "#EAF2ED", rotulo: "En plazo" },
  "sin fecha": { fuerte: "#5B6B8C", suave: "#EEF1F7", rotulo: "Sin fecha" },
};
