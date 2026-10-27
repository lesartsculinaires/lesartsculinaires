import { compilar } from "./compilar.mjs";
/**
 * Los hilos que cambiaron, encima de la bandeja que ya está en pantalla.
 *
 *     node supabase/pruebas/parcheBandeja.test.mjs
 *
 * 27/10/2026: cada mensaje que entraba hacía que cada Inbox abierto volviera
 * a pedir la pantalla entera (3,8 MB con mil chats). Ahora se pide el hilo que
 * cambió y se acomoda acá. Si esto se equivoca, un mensaje se ve en el hilo
 * equivocado o un chat se queda abajo de la lista: por eso se prueba solo.
 */
const { conParche, sumarParches, hiloDelAviso } = await compilar("src/lib/parcheBandeja.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const conv = (id, en, extra = {}) => ({ id, ultimoMensajeEn: en, sinLeer: 0, ...extra });
const msj = (id, conversacionId, texto) => ({ id, conversacionId, texto });

const convs = [conv(3, "2026-10-27T10:00:00Z"), conv(2, "2026-10-27T09:00:00Z"), conv(1, "2026-10-27T08:00:00Z")];
const msgs = [msj(10, 1, "a"), msj(11, 2, "b"), msj(12, 3, "c")];

console.log("── sin parche, la misma bandeja ──");
{
  const r = conParche(convs, msgs, null);
  es("mismas conversaciones", r.conversaciones.map((c) => c.id), [3, 2, 1]);
  es("mismos mensajes", r.mensajes.map((m) => m.id), [10, 11, 12]);
}

console.log("\n── entra un mensaje en el hilo de más abajo ──");
{
  const p = { ids: [1], conversaciones: [conv(1, "2026-10-27T11:00:00Z", { sinLeer: 1 })], mensajes: [msj(10, 1, "a"), msj(13, 1, "nuevo")] };
  const r = conParche(convs, msgs, p);
  es("sube arriba de la lista", r.conversaciones.map((c) => c.id), [1, 3, 2]);
  es("con su número sin leer", r.conversaciones[0].sinLeer, 1);
  es("sus mensajes son los nuevos y los demás no se tocan", r.mensajes.map((m) => m.id).sort(), [10, 11, 12, 13]);
  es("ningún mensaje de otro hilo se duplica", r.mensajes.filter((m) => m.id === 10).length, 1);
}

console.log("\n── un hilo nuevo, y uno que ya no se puede ver ──");
{
  const p = { ids: [9, 2], conversaciones: [conv(9, "2026-10-27T12:00:00Z")], mensajes: [msj(20, 9, "hola")] };
  const r = conParche(convs, msgs, p);
  es("el nuevo entra arriba y el reasignado sale", r.conversaciones.map((c) => c.id), [9, 3, 1]);
  es("y se van sus mensajes", r.mensajes.map((m) => m.conversacionId).includes(2), false);
}

console.log("\n── dos parches seguidos ──");
{
  const a = { ids: [1], conversaciones: [conv(1, "2026-10-27T11:00:00Z")], mensajes: [msj(13, 1, "uno")] };
  const b = { ids: [1, 2], conversaciones: [conv(1, "2026-10-27T11:05:00Z"), conv(2, "2026-10-27T11:01:00Z")], mensajes: [msj(13, 1, "uno"), msj(14, 1, "dos"), msj(15, 2, "x")] };
  const s = sumarParches(a, b);
  es("manda el más nuevo", s.conversaciones.find((c) => c.id === 1).ultimoMensajeEn, "2026-10-27T11:05:00Z");
  es("sin repetir mensajes", s.mensajes.map((m) => m.id), [13, 14, 15]);
  es("ids juntos", s.ids.sort(), [1, 2]);
}

console.log("\n── qué hilo dice el aviso ──");
es("un mensaje dice su conversación", hiloDelAviso("mensajes", { id: 99, conversacion_id: 7 }), 7);
es("una conversación dice su id", hiloDelAviso("conversaciones", { id: 7 }), 7);
es("un borrado no dice nada", hiloDelAviso("mensajes", null), null);
es("otra tabla, nada", hiloDelAviso("oportunidades", { id: 7 }), null);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
