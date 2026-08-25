/**
 * ¿Cuántos tildes lleva cada estado?
 *
 *     node --experimental-strip-types supabase/pruebas/acuses.test.mjs
 *
 * `mensajes.estado` guarda dos vocabularios mezclados: «enviado», que
 * escribimos nosotros al insertar la fila, y «sent», «delivered», «read» o
 * «failed», que manda Meta en sus acuses y se guardan tal cual. Ese es el
 * motivo de esta prueba: una tabla que sólo contemplara uno de los dos dejaría
 * la mitad de los mensajes sin tilde, y desde afuera se leería como «no salió»
 * sobre mensajes que el cliente ya leyó.
 *
 * Lo otro que se vigila es lo que NO tiene que pasar: que a un estado
 * desconocido se le invente un tilde. Un tilde es una afirmación sobre si un
 * mensaje le llegó a una persona; ante la duda no se dibuja nada.
 */
import { acuseDe, CUANTOS_TILDES, COMO_SE_DICE } from "../../src/lib/acuses.ts";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Los tildes que le tocan a un estado, para leer la prueba de un vistazo. */
const tildes = (estado) => {
  const a = acuseDe(estado);
  if (!a) return "nada";
  if (a === "fallo") return "cruz";
  return "✓".repeat(CUANTOS_TILDES[a]) + (a === "leido" ? " (en color)" : "");
};

console.log("── lo que escribimos nosotros ──");
es("«enviado» lleva UN tilde", tildes("enviado"), "✓");

console.log("\n── lo que manda Meta ──");
es("«sent» lleva UN tilde", tildes("sent"), "✓");
es("«delivered» lleva DOS", tildes("delivered"), "✓✓");
es("«read» lleva DOS EN COLOR", tildes("read"), "✓✓ (en color)");
es("«failed» lleva una cruz", tildes("failed"), "cruz");

console.log("\n── los dos vocabularios dan lo mismo ──");
es("sent = enviado", acuseDe("sent"), acuseDe("enviado"));
es("delivered = entregado", acuseDe("delivered"), acuseDe("entregado"));
es("read = leido", acuseDe("read"), acuseDe("leido"));
es("y con tilde ortográfica también", acuseDe("leído"), "leido");

console.log("\n── da igual cómo venga escrito ──");
es("en mayúsculas", acuseDe("DELIVERED"), "entregado");
es("con espacios de sobra", acuseDe("  read  "), "leido");
es("mezclado", acuseDe("Sent"), "enviado");

console.log("\n── ante la duda, NADA ──");
es("un estado que no existe no dibuja tilde", acuseDe("pendiente-de-algo"), null);
es("vacío tampoco", acuseDe(""), null);
es("nulo tampoco", acuseDe(null), null);
es("indefinido tampoco", acuseDe(undefined), null);

console.log("\n── el orden es el de WhatsApp ──");
{
  // Un mensaje avanza y nunca retrocede: uno, dos, dos en color. Si esto se
  // invirtiera, el asesor vería «entregado» y después «enviado» y creería que
  // algo se deshizo.
  const camino = ["enviado", "delivered", "read"].map((e) => CUANTOS_TILDES[acuseDe(e)]);
  es("los tildes no bajan nunca", camino, [1, 2, 2]);
  es(
    "y el último se distingue por el color, no por la cantidad",
    acuseDe("read") !== acuseDe("delivered") &&
      CUANTOS_TILDES[acuseDe("read")] === CUANTOS_TILDES[acuseDe("delivered")],
    true,
  );
}

console.log("\n── todos tienen cómo decirse en voz alta ──");
for (const estado of ["enviado", "sent", "delivered", "read", "failed"]) {
  const a = acuseDe(estado);
  es(`«${estado}» → «${COMO_SE_DICE[a]}»`, typeof COMO_SE_DICE[a] === "string" && COMO_SE_DICE[a].length > 0, true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
