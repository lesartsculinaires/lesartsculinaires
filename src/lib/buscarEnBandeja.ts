/**
 * Buscar un hilo en la bandeja.
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En el módulo de Inbox quiero que haya una barra de búsqueda para buscar un
 * cliente en el inbox, en todos los canales.»
 *
 * ============================================================================
 * «EN TODOS LOS CANALES» ES LA PARTE IMPORTANTE
 * ============================================================================
 *
 * Y no sólo por las redes. La bandeja tiene cuatro filtros encima —red,
 * etiqueta, archivadas, sin asignar— y si la búsqueda respetara todos, buscar
 * a alguien y no encontrarlo no querría decir que no está: querría decir que
 * está detrás de un filtro que nadie recuerda haber puesto.
 *
 * Eso es peor que no tener buscador, porque da una respuesta falsa a una
 * pregunta que se hace con el cliente al teléfono. Así que mientras hay algo
 * escrito, la búsqueda mira TODO: las cuatro redes, las archivadas y las de
 * cualquier asesora. Al borrar el texto, los filtros vuelven a mandar.
 *
 * ============================================================================
 * POR DÓNDE SE BUSCA
 * ============================================================================
 *
 *   EL NOMBRE DE WHATSAPP    Es el que se ve en la lista.
 *
 *   EL NOMBRE DEL CRM        Y es el que hace falta más seguido: en el CRM
 *                            está «María José Retana Hernández» y su WhatsApp
 *                            dice «Majo». Quien busca escribe el del CRM,
 *                            porque es el que tiene a la vista en la ficha.
 *
 *   EL TELÉFONO              Por dígitos, así que da igual cómo esté escrito:
 *                            «7100-0001», «+503 7100 0001» y «71000001» son el
 *                            mismo número y los tres tienen que encontrarlo.
 *
 *   EL ÚLTIMO MENSAJE        Para el caso de «¿dónde estaba el que preguntó
 *                            por el horario del sábado?».
 */

import { normalizarTexto } from "@/lib/duplicados";

/** Lo único que hace falta de un hilo para buscarlo. */
export interface HiloBuscable {
  telefono: string;
  nombrePerfil: string | null;
  clienteId: number | null;
  ultimoTexto: string | null;
}

/** Sólo los dígitos, para comparar teléfonos escritos de cualquier forma. */
const soloDigitos = (s: string): string => s.replace(/\D/g, "");

/**
 * ¿Este hilo responde a lo que se escribió?
 *
 * `nombreEnElCrm` lo resuelve quien llama, porque la bandeja no conoce a los
 * clientes: los tiene la pantalla, que ya recibe las oportunidades.
 */
export function coincideHilo(
  hilo: HiloBuscable,
  termino: string,
  nombreEnElCrm?: string | null,
): boolean {
  const q = normalizarTexto(termino);
  if (q === "") return true;

  /*
   * Si lo escrito tiene dígitos, se prueba también como teléfono.
   *
   * Se prueba ADEMÁS y no EN VEZ: alguien que se llama «Chef 2000» tiene que
   * seguir apareciendo al escribir su nombre, y un teléfono no deja de ser un
   * teléfono porque el nombre también tenga números.
   */
  const digitos = soloDigitos(termino);
  if (digitos.length >= 3 && soloDigitos(hilo.telefono).includes(digitos)) {
    return true;
  }

  const donde = [hilo.nombrePerfil, nombreEnElCrm, hilo.ultimoTexto];
  return donde.some((t) => t != null && normalizarTexto(t).includes(q));
}

/**
 * Los hilos que responden a lo escrito.
 *
 * Devuelve la lista entera cuando no hay nada escrito, para que quien llama
 * pueda usar siempre lo mismo sin preguntar antes si hay búsqueda.
 */
export function filtrarHilos<T extends HiloBuscable>(
  hilos: readonly T[],
  termino: string,
  nombreDelCliente: (clienteId: number | null) => string | null,
): T[] {
  if (normalizarTexto(termino) === "") return [...hilos];
  return hilos.filter((h) => coincideHilo(h, termino, nombreDelCliente(h.clienteId)));
}

/** ¿Hay algo escrito que valga como búsqueda? */
export const hayBusqueda = (termino: string): boolean =>
  normalizarTexto(termino) !== "";
