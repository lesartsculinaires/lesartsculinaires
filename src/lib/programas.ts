/**
 * Datos del catálogo de programas que necesitan las dos orillas.
 *
 * Vive acá y no junto a la acción del servidor por una razón concreta: un
 * archivo `"use server"` sólo puede exportar funciones asíncronas. Next
 * reemplaza cualquier otra exportación por una referencia al servidor, así que
 * una constante importada desde el navegador deja de ser lo que era —un
 * arreglo pasa a no tener `.map`— y la pantalla revienta al abrirse.
 *
 * Lo peor de ese error es que el compilador no siempre lo ve: acá pasó el
 * build y falló recién al hacer clic.
 */

/** Las categorías que acepta la columna `productos.categoria`. */
export const CATEGORIAS = ["Diplomado", "Curso corto", "Certificación", "Otro"] as const;

export type CategoriaPrograma = (typeof CATEGORIAS)[number];
