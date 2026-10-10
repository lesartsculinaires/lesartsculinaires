import { compilar } from "./compilar.mjs";
/**
 * Qué hace la pantalla cuando falla, en vez de quedarse en blanco.
 *
 *     node supabase/pruebas/recuperarse.test.mjs
 *
 * El 10 de octubre de 2026 el CRM se quedó en «Application error: a
 * client-side exception has occurred» y no se movió de ahí hasta que alguien
 * apretó F5. Esto comprueba las tres decisiones de las que depende que ahora
 * se recupere sola: cuándo reintentar, cuándo dejar de insistir y cuándo
 * recargar la página entera. Y que lo que manda el navegador se guarde
 * recortado, porque viene de afuera.
 */

const { queHacerConElError, proximoIntento, limpiarReporte, ESPERAS_MS, VENTANA_MS } =
  await compilar("src/lib/recuperarse.ts");
const { pideRefresco } = await compilar("src/lib/refrescoEnVivo.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

console.log("── 1. UN REFRESCO CORTADO SE REINTENTA; UNA PIEZA QUE YA NO EXISTE, SE RECARGA ──");
es("«network error» —el del refresco cortado— se reintenta", queHacerConElError(new TypeError("network error")), "reintentar");
es("«Connection closed.» también", queHacerConElError(new Error("Connection closed.")), "reintentar");
es("un error cualquiera también", queHacerConElError(new TypeError("Cannot read properties of undefined (reading 'map')")), "reintentar");
const chunk = new Error("Loading chunk 812 failed.\n(error: https://crm/_next/static/chunks/812.js)");
chunk.name = "ChunkLoadError";
es("una pieza de un despliegue viejo se recarga", queHacerConElError(chunk), "recargar");
es("también si sólo lo dice el mensaje", queHacerConElError(new Error("Loading CSS chunk 3 failed")), "recargar");
es("y el import dinámico que falta", queHacerConElError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js")), "recargar");
es("algo que no es un Error no rompe nada", queHacerConElError(undefined), "reintentar");

console.log("\n── 2. INSISTE RÁPIDO, DESPUÉS MÁS DESPACIO, Y AL FINAL SE DETIENE ──");
const T = 1_000_000;
es("primera falla: enseguida", proximoIntento([T], T), ESPERAS_MS[0]);
es("segunda en dos minutos: un poco más", proximoIntento([T - 5_000, T], T), ESPERAS_MS[1]);
es("tercera: más todavía", proximoIntento([T - 9_000, T - 5_000, T], T), ESPERAS_MS[2]);
es("CUARTA EN DOS MINUTOS: YA NO SE INSISTE", proximoIntento([T - 20_000, T - 9_000, T - 5_000, T], T), null);
es("las de hace rato no cuentan: vuelve a ser rápido",
  proximoIntento([T - VENTANA_MS - 1, T - VENTANA_MS - 2, T - VENTANA_MS - 3, T], T), ESPERAS_MS[0]);
es("y las esperas crecen", [...ESPERAS_MS].every((x, i, a) => i === 0 || x > a[i - 1]), true);

console.log("\n── 3. LO QUE MANDA EL NAVEGADOR SE GUARDA RECORTADO ──");
const r = limpiarReporte({
  mensaje: "x".repeat(5000), pila: "p".repeat(9000), nombre: "TypeError",
  modulo: "Inbox", donde: "raiz", intento: 3, url: "/", digest: 42, extra: "ignorar",
});
es("mensaje con tope", r.mensaje.length, 1000);
es("pila con tope", r.pila.length, 4000);
es("lo que no es texto se descarta", r.digest, null);
es("lo que no se pidió no pasa", "extra" in r, false);
es("donde", r.donde, "raiz");
es("donde inventado cae en «pagina»", limpiarReporte({ mensaje: "a", donde: "cualquiera" }).donde, "pagina");
es("intento fuera de rango se recorta", limpiarReporte({ mensaje: "a", intento: 1e9 }).intento, 99);
es("sin mensaje no se guarda", limpiarReporte({ pila: "algo" }), null);
es("basura no se guarda", [limpiarReporte(null), limpiarReporte("hola"), limpiarReporte(7)], [null, null, null]);

console.log("\n── 4. LOS TILDES DE UN MENSAJE NO REFRESCAN AL EQUIPO ENTERO ──");
const tilde = { tabla: "mensajes", evento: "UPDATE", fila: { estado: "leido" } };
const conv = { tabla: "conversaciones", evento: "UPDATE", fila: {} };
const nuevo = { tabla: "mensajes", evento: "INSERT", fila: {} };
const lead = { tabla: "oportunidades", evento: "UPDATE", fila: {} };
es("en el Pipeline, un tilde no refresca", pideRefresco(tilde, "Pipeline"), false);
es("ni la conversación que se actualiza con él", pideRefresco(conv, "Dashboard"), false);
es("en la bandeja sí: muestra los tildes", pideRefresco(tilde, "Inbox"), true);
es("en Envíos sí: cuenta cuántos llegaron", pideRefresco(tilde, "Envíos"), true);
es("UN MENSAJE NUEVO REFRESCA EN TODAS (el globito de no leídos)", pideRefresco(nuevo, "Pipeline"), true);
es("un lead movido refresca en todas", pideRefresco(lead, "Clientes"), true);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
