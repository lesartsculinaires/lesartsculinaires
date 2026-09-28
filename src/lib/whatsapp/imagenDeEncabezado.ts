/**
 * La imagen que lleva una plantilla en el encabezado: subirla, no pegar un enlace.
 *
 * ============================================================================
 * QUÉ PROBLEMA RESUELVE
 * ============================================================================
 *
 * Una plantilla con encabezado de imagen —la del workshop de la escuela— exige
 * la imagen EN CADA ENVÍO. La que se subió al editor de Meta es sólo la muestra
 * para que la revisen: no viaja con la plantilla.
 *
 * La primera versión pedía la dirección de la imagen, escrita a mano. Eso
 * supone tener la foto publicada en algún lado con un enlace directo, que no es
 * algo que una asesora tenga. Ahora se elige el archivo y el CRM se encarga.
 *
 * ============================================================================
 * POR QUÉ SE GUARDA LA RUTA Y NO LA DIRECCIÓN
 * ============================================================================
 *
 * Porque el bucket es privado, y así se queda. Lo que se guarda como valor es
 * la ruta dentro del bucket, marcada con `subida:` para distinguirla de un
 * enlace pegado a mano; los bytes los va a buscar el servidor en el último
 * momento y se los SUBE a Meta —ver `encabezadoParaMeta.ts`—.
 *
 * ESO IMPORTA DE VERDAD EN EL ENVÍO MASIVO. Una campaña de trescientos sale por
 * tandas y puede quedar a medias horas —o días— si Meta corta. Guardar en
 * `envios.valores` algo que caduca —una dirección firmada, o el identificador
 * que devuelve Meta al subir, que dura treinta días— dejaría la campaña muerta
 * a mitad de camino con un error que no menciona ninguna imagen. Con la ruta
 * guardada, cada tanda resuelve la suya.
 */

import { CARPETA_SALIENTE } from "@/lib/whatsapp/adjuntos";

/**
 * La marca que distingue una ruta del bucket de un enlace escrito a mano.
 *
 * Se eligió una marca explícita en vez de adivinar por la forma —«¿empieza con
 * http?»— porque el valor viaja por `envios.valores`, que es una columna de
 * texto libre y vieja: adivinar convertiría en subida cualquier cosa que un
 * día se escribiera distinta.
 */
export const MARCA_DE_SUBIDA = "subida:";

/** Dónde viven, dentro de «saliente/». Una carpeta propia para poder mirarlas. */
export const CARPETA_DE_PLANTILLAS = "plantillas";

/**
 * La carpeta de UNA plantilla, para no tener que subir la imagen cada vez.
 *
 * ============================================================================
 * POR QUÉ UNA CARPETA Y NO UN ARCHIVO CON NOMBRE FIJO
 * ============================================================================
 *
 * Porque un nombre fijo obligaría a PISAR el archivo cuando alguien quisiera
 * cambiar la imagen, y el bucket no deja: las políticas permiten crear y borrar
 * lo propio, no modificar lo ajeno. La asesora que subiera la segunda imagen
 * chocaría con un error de permisos sobre el archivo de la primera.
 *
 * Con una carpeta por plantilla, cada quien agrega el suyo y vale el más
 * nuevo. Nadie pisa nada, no hace falta ninguna política nueva, y queda el
 * rastro de lo que se usó antes.
 *
 * ============================================================================
 * POR QUÉ SE LIMPIA EL IDENTIFICADOR
 * ============================================================================
 *
 * El id de una plantilla lo pone Meta y no hay ninguna promesa sobre qué
 * caracteres trae. Uno con una barra partiría la ruta en dos carpetas y la
 * imagen se guardaría donde no se la busca después —sin fallar, que es lo
 * peor—. Lo que no es letra, número, guion o guion bajo se reemplaza.
 */
export const carpetaDePlantilla = (plantillaId: string): string =>
  `${CARPETA_SALIENTE}/${CARPETA_DE_PLANTILLAS}/${plantillaId.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/**
 * Lo que acepta Meta en el encabezado de una plantilla.
 *
 * Es más angosto que lo que acepta el chat: en un encabezado de plantilla sólo
 * entran JPG y PNG. El webp se puede mandar por el chat pero acá lo rechaza, y
 * el error no dice por qué, así que se filtra antes de subir.
 */
export const IMAGENES_DE_ENCABEZADO = ["image/jpeg", "image/png"];

/** Lo que va en el `accept` del selector. Con extensiones, por Windows. */
export const ACEPTA_ENCABEZADO = [...IMAGENES_DE_ENCABEZADO, ".jpg", ".jpeg", ".png"].join(",");

/**
 * Tope de Meta para la imagen de un encabezado: 5 MB.
 *
 * No es nuestro: es de ellos, y pasarlo hace fallar el envío y no la subida, o
 * sea en el peor momento —con la campaña ya empezada—. Por eso se comprueba en
 * la pantalla, antes de subir nada.
 */
export const TOPE_ENCABEZADO_BYTES = 5 * 1024 * 1024;

/** Marca una ruta del bucket como subida, para guardarla entre los valores. */
export const comoSubida = (ruta: string): string => `${MARCA_DE_SUBIDA}${ruta}`;

/** ¿Este valor es una imagen que se subió, en vez de un enlace pegado? */
export const esSubida = (valor: string | null | undefined): boolean =>
  typeof valor === "string" && valor.startsWith(MARCA_DE_SUBIDA);

/** La ruta dentro del bucket, o null si el valor no es una subida. */
export const rutaDeSubida = (valor: string | null | undefined): string | null =>
  esSubida(valor) ? (valor as string).slice(MARCA_DE_SUBIDA.length) : null;

/**
 * Cómo se nombra una subida en la pantalla.
 *
 * La ruta cruda —«saliente/plantillas/9f3e…»— no le dice nada a nadie y encima
 * se vería dentro de la vista previa del mensaje. Donde haya que mostrar el
 * valor, se muestra esto.
 */
export const comoSeLlama = (valor: string): string =>
  esSubida(valor) ? "la imagen subida" : valor;
