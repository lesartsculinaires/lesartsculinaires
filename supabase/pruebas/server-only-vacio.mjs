/*
 * Reemplazo de `server-only` para las pruebas.
 *
 * `server-only` no es un paquete instalado: lo resuelve el empaquetador de
 * Next, y su único trabajo es romper el build si alguien importa un módulo de
 * servidor desde el navegador. esbuild no sabe resolverlo, y fuera de Next no
 * hace falta que haga nada: estas pruebas corren en Node, que es justamente
 * donde ese módulo sí puede estar.
 *
 * Se apunta acá con `--alias:server-only=...` al empaquetar.
 */
export {};
