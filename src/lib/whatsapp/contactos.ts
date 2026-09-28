/**
 * El contacto que alguien comparte por WhatsApp, con su número a la vista.
 *
 * ============================================================================
 * QUÉ SE ESTABA PERDIENDO
 * ============================================================================
 *
 * Cuando un cliente adjunta un contacto —«acá le comparto el número»— el hilo
 * mostraba sólo «Contacto: Mami❤️». El número no aparecía por ningún lado, así
 * que para usarlo había que abrir WhatsApp en el teléfono y copiarlo a mano.
 *
 * Y el dato estaba. Meta lo manda entero en el webhook y el CRM guarda ese
 * cuerpo tal cual en `mensajes.payload` desde el primer día; lo único que se
 * leía era el nombre. Por eso esto no necesita migración ni esperar a que
 * llegue otro contacto: los que ya están en la base se pueden leer igual.
 *
 * ============================================================================
 * QUÉ MANDA META, EXACTAMENTE
 * ============================================================================
 *
 *     "contacts": [{
 *       "name":   { "formatted_name": "Mami❤️", "first_name": "Mami" },
 *       "phones": [{ "phone": "+503 7529 0078", "wa_id": "50375290078",
 *                    "type": "CELL" }]
 *     }]
 *
 * Un contacto puede traer VARIOS números —casa, celular, trabajo— y un mensaje
 * puede traer varios contactos. Los dos casos se respetan: quedarse con el
 * primero perdería justo el que hacía falta sin avisar.
 *
 * `wa_id` es el número tal como lo conoce WhatsApp, sin signos. Puede faltar
 * —cuando esa persona no tiene WhatsApp— y por eso, cuando no está, se arma
 * desde los dígitos del teléfono.
 */

export interface TelefonoCompartido {
  /** Como lo escribió quien lo compartió: «+503 7529 0078». Para mostrarlo. */
  comoSeVe: string;
  /** Sólo dígitos, listo para abrir un chat: «50375290078». */
  paraMarcar: string;
  /** «CELL», «HOME»… Puede no venir. */
  clase: string | null;
}

export interface ContactoCompartido {
  nombre: string;
  telefonos: TelefonoCompartido[];
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * El país de la escuela, para completar un número local.
 *
 * Un contacto guardado en El Salvador suele venir sin código de país —«7529
 * 0078»—, y ocho dígitos no sirven para abrir un chat: WhatsApp identifica a
 * todo el mundo con el país adelante. Se completa sólo cuando son exactamente
 * ocho dígitos, que es el largo de un número salvadoreño; con cualquier otro
 * largo se deja como vino, porque adivinar ahí sería escribirle a otra persona.
 */
const SALVADOR = "503";

export function paraMarcar(crudo: string, waId?: string | null): string {
  const delWa = (waId ?? "").replace(/\D/g, "");
  if (delWa.length >= 8) return delWa;

  const digitos = crudo.replace(/\D/g, "");
  return digitos.length === 8 ? `${SALVADOR}${digitos}` : digitos;
}

/**
 * Lee los contactos de un mensaje, o devuelve una lista vacía.
 *
 * Nunca lanza: esto se dibuja dentro del hilo, y un payload con una forma
 * inesperada no puede tumbar la conversación entera. Lo que no se entiende se
 * omite y el resto se muestra.
 */
export function leerContactos(payload: unknown): ContactoCompartido[] {
  const p = obj(payload);
  if (!p) return [];

  const salida: ContactoCompartido[] = [];

  for (const c of lista(p.contacts)) {
    const contacto = obj(c);
    if (!contacto) continue;

    const nombre =
      texto(obj(contacto.name)?.formatted_name) ??
      texto(obj(contacto.name)?.first_name) ??
      "Contacto sin nombre";

    const telefonos: TelefonoCompartido[] = [];

    for (const t of lista(contacto.phones)) {
      const tel = obj(t);
      const crudo = texto(tel?.phone);
      const waId = texto(tel?.wa_id);
      if (!crudo && !waId) continue;

      const marcable = paraMarcar(crudo ?? "", waId);
      // Un «número» de menos de ocho dígitos no sirve para nada: ni se puede
      // marcar ni se puede buscar. Mostrarlo sería ofrecer un botón muerto.
      if (marcable.length < 8) continue;

      telefonos.push({
        comoSeVe: crudo ?? marcable,
        paraMarcar: marcable,
        clase: texto(tel?.type),
      });
    }

    salida.push({ nombre, telefonos });
  }

  return salida;
}

/** Cómo se dice la clase de un número, para no mostrar «CELL» en una pantalla en español. */
export function comoSeDice(clase: string | null): string | null {
  if (!clase) return null;
  const como: Record<string, string> = {
    CELL: "Celular",
    MOBILE: "Celular",
    HOME: "Casa",
    WORK: "Trabajo",
    MAIN: "Principal",
  };
  return como[clase.toUpperCase()] ?? clase;
}
