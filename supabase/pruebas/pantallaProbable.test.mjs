import { compilar } from "./compilar.mjs";
/**
 * Con qué pantalla se va a abrir, antes de saber permisos.
 *
 *     node supabase/pruebas/pantallaProbable.test.mjs
 *
 * ============================================================================
 * EL DEFECTO QUE SE METIÓ, Y POR QUÉ ESTA PRUEBA ES ESPECÍFICA
 * ============================================================================
 *
 * Para no encadenar consultas, el servidor adivina la pantalla mirando sólo la
 * petición, y con eso pide los datos de esa pantalla. La primera versión se creía
 * el `?mod=` de la dirección a ciegas. Y la dirección conserva ese `?mod=`
 * TODA LA SESIÓN, porque cambiar de pantalla no la cambia:
 *
 *     /?mod=admin     quien entra «como administrador»
 *     /?mod=Canales   quien vuelve de conectar una cuenta de Meta
 *
 * Cada refresco pedía esa dirección, el servidor mandaba los datos de OTRA
 * pantalla, y la bandeja de quien estaba trabajando se reemplazaba por
 * «Cargando…»: se perdía el hilo abierto y el texto escrito sin enviar, en cada
 * refresco. Se coló porque las pruebas de unidad del reparto de datos no lo
 * miran —lo atrapó la prueba de la nota interna, que entra con un `?mod=` que no
 * es la pantalla que después abre—.
 *
 * Son dos reglas, y cada una tiene su sección:
 *
 *   1. El `?mod=` sólo vale si nombra una pantalla de verdad.
 *   2. En un REFRESCO manda la galleta: el `?mod=` es una intención de entrada.
 */
const { pantallaProbable } = await compilar("src/lib/ultimoModulo.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const PANTALLAS = ["Dashboard", "Inbox", "Clientes", "Pipeline", "Usuarios y Roles", "Canales"];
const probable = (pedido, guardado, refresco = false) =>
  pantallaProbable(pedido, guardado, "Dashboard", PANTALLAS, refresco);

console.log("── al entrar: lo pedido gana sobre lo guardado, como siempre ──");
{
  es("sin nada, la de siempre", probable(undefined, undefined), "Dashboard");
  es("la guardada", probable(undefined, "Inbox"), "Inbox");
  es("un pedido concreto gana sobre la guardada", probable("Canales", "Inbox"), "Canales");
  es("llega codificada, con tildes", probable(undefined, encodeURIComponent("Usuarios y Roles")), "Usuarios y Roles");
}

console.log("\n── REGLA 1: el `?mod=` sólo vale si nombra una pantalla ──");
{
  /*
   * `?mod=admin` no es una pantalla: es el pedido de abrir el panel de
   * administración, y eso lo resuelve `moduloInicial`, que sí sabe de permisos.
   * Creerlo acá mandaba a pedir los datos de una pantalla que no existe.
   */
  es("«admin» no es una pantalla: se usa la guardada", probable("admin", "Inbox"), "Inbox");
  es("y sin guardada, la de siempre", probable("admin", undefined), "Dashboard");
  es("un nombre inventado, igual", probable("x", "Clientes"), "Clientes");
  es("vacío", probable("", "Pipeline"), "Pipeline");
  // La guardada también se valida: una galleta vieja o tocada a mano.
  es("una galleta que nombra algo que no existe", probable(undefined, "Borrada"), "Dashboard");
  // Un `%` suelto hace lanzar a `decodeURIComponent`: arrancar de cero, no reventar.
  es("una galleta rota no revienta", probable(undefined, "%"), "Dashboard");
  es("ni un pedido roto", probable("%E0%A4%A", "Inbox"), "Inbox");
}

console.log("\n── REGLA 2: en un REFRESCO manda la galleta, NO la dirección ──");
{
  /*
   * Esto es lo que rompió la bandeja. Quien entró con `/?mod=Canales` y después
   * se fue a Inbox sigue teniendo `?mod=Canales` en la dirección; cada refresco
   * lo vuelve a pedir. Si ganara el pedido, el servidor mandaría lo de Canales
   * —nada— y la bandeja se quedaría sin sus datos.
   */
  es("EL CASO REAL: volvió de Meta y trabaja en la bandeja", probable("Canales", "Inbox", true), "Inbox");
  es("y el de «como administrador»", probable("admin", "Clientes", true), "Clientes");
  es("aunque el pedido sea una pantalla válida, en un refresco no cuenta", probable("Pipeline", "Inbox", true), "Inbox");

  // Sin galleta en un refresco no hay nada que contar: la de siempre.
  es("sin galleta, la de siempre", probable("Canales", undefined, true), "Dashboard");

  // Y al ENTRAR, el mismo pedido sí cuenta: la regla no lo apaga, lo acota.
  es("al entrar, el mismo pedido SÍ cuenta", probable("Canales", "Inbox", false), "Canales");
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
