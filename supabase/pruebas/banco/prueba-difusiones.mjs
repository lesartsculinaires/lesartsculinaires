/**
 * Por qué no llegaron, en porcentajes, y las difusiones en su propia pestaña.
 *
 *     node supabase/pruebas/banco/prueba-difusiones.mjs
 *
 * ============================================================================
 * QUÉ PASÓ, Y QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * Mandaron cinco mensajes y no llegó ninguno. Lo que vieron fue «0 enviados, 5
 * no llegaron» y, al abrir el detalle, esta frase:
 *
 *     «5 no llegaron: el número no tiene WhatsApp o Meta los rechazó.»
 *
 * Esa frase estaba escrita a mano en la pantalla. No la dijo Meta. Meta había
 * contestado algo concreto por cada mensaje, el CRM lo había guardado en
 * `envio_destinatarios.motivo` desde el primer día, y ninguna pantalla lo leía:
 * quien miraba se iba a revisar teléfonos que estaban bien.
 *
 * Y pidieron tres cosas más:
 *
 *   «Que aparezcan como un grupo de chat en el módulo de Inbox, o en otra
 *    pestaña que diga "grupos de whatsapp", para no confundirlos con la lista
 *    de whatsapp.»
 *
 *   «Ver el porcentaje % de cuántos lo vieron y cuántos no, de una manera más
 *    gráfica y visual, para entender si fue efectivo el envío.»
 *
 *   «O también con quiénes tuvo mayor interacción.»
 *
 * ============================================================================
 * QUÉ SE PRUEBA
 * ============================================================================
 *
 *   EL MOTIVO ES EL DE META        Se guardan tres fallos con tres motivos
 *                                  distintos y se comprueba que la pantalla
 *                                  muestre ESOS, con su cuenta, y no la frase
 *                                  inventada de antes.
 *
 *   Y LA LECTURA QUE SIGUE         Cuando fallan todos por lo mismo, no son los
 *                                  números. Eso el CRM lo puede decir y quien
 *                                  mira no tiene por qué saber deducirlo.
 *
 *   LOS PORCENTAJES SOBRE QUIENES  «80 leídos» no dice si el envío fue bueno.
 *   RECIBIERON                     Y medirlos sobre el total mezclaría cuántos
 *                                  teléfonos servían con cuánto interesó el
 *                                  mensaje, que son dos problemas distintos.
 *
 *   LA DIFUSIÓN EN SU PESTAÑA      Que esté, que se abra, y sobre todo que NO
 *                                  aparezca en la lista de conversaciones.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `dif-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(
      `su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`,
      { encoding: "utf8" },
    ).trim();
    if (/^psql:.*ERROR:/m.test(salida)) {
      console.error(`\nLa base rechazó una sentencia de la prueba:\n${salida}\n`);
      process.exit(1);
    }
    return salida;
  } finally {
    fs.rmSync(ruta, { force: true });
  }
};

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const CAIDO = "PRUEBA Envio que no llego";
const BUENO = "PRUEBA Envio que si llego";

/*
 * El motivo que de verdad tumba una campaña entera.
 *
 * Es el texto exacto que devuelve `explicar()` para el error 131042 de Meta,
 * que es el que más aparece al empezar a mandar: WhatsApp cobra los mensajes
 * que inicia la empresa, y sin tarjeta cargada fallan todos.
 */
const PAGO =
  "La cuenta de WhatsApp no tiene forma de pago activa, y Meta cobra los mensajes que " +
  "inicia la empresa —que es lo que es un envío masivo—.";
const SIN_WA = "Ese número no tiene WhatsApp o no puede recibir mensajes.";

const limpiar = () =>
  sql(`
    delete from public.envio_destinatarios where envio_id in
      (select id from public.envios where nombre like 'PRUEBA Envio%');
    delete from public.envios where nombre like 'PRUEBA Envio%';
    delete from public.clientes where nombre like '%Difu PRUEBA%';
  `);
limpiar();

/*
 * Dos envíos: uno que se cayó entero y uno que anduvo.
 *
 * El primero reproduce lo que le pasó a la escuela —todos fallidos, todos por
 * el mismo motivo—. El segundo existe para que los porcentajes tengan algo que
 * medir: sin él, todo daría cero y no se distinguiría «funciona» de «no hay
 * datos».
 */
sql(`
  insert into public.clientes (nombre, telefono) values
    ('Ana Difu PRUEBA',    '50370600001'),
    ('Beto Difu PRUEBA',   '50370600002'),
    ('Carla Difu PRUEBA',  '50370600003'),
    ('Dora Difu PRUEBA',   '50370600004'),
    ('Elmer Difu PRUEBA',  '50370600005');

  insert into public.envios (nombre, plantilla_nombre, idioma, cuerpo, valores, estado, creado_en, terminado_en)
  values
    ('${CAIDO}', 'catalogo_2026', 'es',
     'Hola, buen día, {{1}} — Les Arts Culinaires', '[{"de":"texto","texto":"cocina"}]'::jsonb,
     'terminado', now() - interval '2 hours', now() - interval '2 hours'),
    ('${BUENO}', 'catalogo_2026', 'es',
     'Hola {{1}}, te esperamos', '[{"de":"nombre"}]'::jsonb,
     'terminado', now() - interval '1 hour', now() - interval '1 hour');

  -- El que se cayó: los cinco fallidos, los cinco por lo mismo.
  insert into public.envio_destinatarios (envio_id, cliente_id, telefono, nombre, estado, motivo)
  select (select id from public.envios where nombre = '${CAIDO}'),
         c.id, c.telefono, c.nombre, 'fallido', '${PAGO}'
    from public.clientes c where c.nombre like '%Difu PRUEBA%';

  -- El que anduvo: 4 entregados de 5, 3 leídos, 2 contestaron, 1 sin WhatsApp.
  -- Los estados son el más avanzado al que llegó cada uno.
  insert into public.envio_destinatarios (envio_id, cliente_id, telefono, nombre, estado, motivo, enviado_en)
  select (select id from public.envios where nombre = '${BUENO}'),
         c.id, c.telefono, c.nombre,
         case c.nombre
           when 'Ana Difu PRUEBA'   then 'respondio'
           when 'Beto Difu PRUEBA'  then 'respondio'
           when 'Carla Difu PRUEBA' then 'leido'
           when 'Dora Difu PRUEBA'  then 'entregado'
           else 'fallido'
         end,
         case when c.nombre = 'Elmer Difu PRUEBA' then '${SIN_WA}' else null end,
         now() - interval '1 hour'
    from public.clientes c where c.nombre like '%Difu PRUEBA%';
`);

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
  .trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt,
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      refresh_token: "x",
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/difu-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. EL MOTIVO ES EL DE META, NO UNA SUPOSICIÓN ──");
// ══════════════════════════════════════════════════════════════════════════
await p.locator('aside button[data-mod^="Env"]').click();
await p.waitForTimeout(2200);
await p.getByRole("button", { name: new RegExp(CAIDO) }).first().click();
await p.waitForTimeout(1200);
await foto("1-motivo");

{
  const t = await texto();

  es(
    "YA NO DICE LA FRASE INVENTADA",
    /el número no tiene WhatsApp o Meta los rechazó/.test(t),
    false,
  );
  es(
    "DICE LO QUE CONTESTÓ META",
    /no tiene forma de pago activa/.test(t),
    true,
  );
  es("y cuántas veces lo dijo", /5×/.test(t), true);
  /*
   * La lectura que evita perder la tarde.
   *
   * Cinco de cinco por el mismo motivo no es un problema de teléfonos, y
   * decirlo es la diferencia entre arreglarlo hoy o revisar la base entera.
   */
  es(
    "Y SACA LA CONCLUSIÓN: NO SON LOS NÚMEROS",
    /Fallaron todos por lo mismo, así que no son los números/.test(t),
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LOS PORCENTAJES, SOBRE QUIENES RECIBIERON ──");
// ══════════════════════════════════════════════════════════════════════════
await p.getByRole("button", { name: new RegExp(CAIDO) }).first().click();
await p.waitForTimeout(500);
await p.getByRole("button", { name: new RegExp(BUENO) }).first().click();
await p.waitForTimeout(1200);
await foto("2-porcentajes");

{
  const t = await texto();

  // 4 entregados de 5 mandados.
  es("llegaron el 80%", /Llegaron al teléfono 80%/.test(t), true);
  /*
   * 3 leídos sobre los 4 que RECIBIERON, no sobre los 5 que se mandaron.
   *
   * Sobre el total daría 60% y mezclaría dos cosas: cuántos teléfonos servían
   * —problema de la base— con cuánto interesó el mensaje, que es lo que este
   * número tiene que medir.
   */
  es("LO ABRIERON EL 75%, SOBRE LOS QUE RECIBIERON", /Lo abrieron 75%/.test(t), true);
  es("contestaron el 50%", /Contestaron 50%/.test(t), true);

  es(
    "y el que no llegó dice su propio motivo",
    /no tiene WhatsApp o no puede recibir/.test(t),
    true,
  );
  // Uno solo fallido de cinco: acá NO corresponde la conclusión de arriba.
  es(
    "sin la conclusión de «no son los números», que acá sería falsa",
    /Fallaron todos por lo mismo/.test(t),
    false,
  );

  console.log("\n── 3. CON QUIÉNES HUBO INTERACCIÓN ──");
  es("están los que contestaron, por nombre", /Ana Difu PRUEBA/.test(t) && /Beto Difu PRUEBA/.test(t), true);
  es("y no los que sólo lo abrieron", /Contestaron.{0,80}Carla Difu PRUEBA/.test(t), false);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. LA DIFUSIÓN EN SU PROPIA PESTAÑA DE LA BANDEJA ──");
// ══════════════════════════════════════════════════════════════════════════
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2400);

{
  const enChats = (await p.locator("main button.row").allInnerTexts()).join(" ");
  es(
    "NO ENSUCIA LA LISTA DE CONVERSACIONES",
    new RegExp(CAIDO).test(enChats),
    false,
  );
  es("la pestaña está", await p.getByRole("button", { name: /Difusiones/ }).count(), 1);
}

await p.getByRole("button", { name: /Difusiones/ }).click();
await p.waitForTimeout(1200);
await foto("3-pestana");

{
  const t = await texto();
  es("LOS DOS ENVÍOS ESTÁN ACÁ", t.includes(CAIDO) && t.includes(BUENO), true);
  es("el que se cayó se ve que se cayó", /no llegó ninguno/.test(t), true);
  es("y el otro dice cuántos contestaron", /2 contestaron/.test(t), true);
  // Las redes no aplican a una difusión: filtrarlas acá no significaría nada.
  es("la fila de redes se esconde", /Messenger/.test(t), false);
}

await p.getByRole("button", { name: new RegExp(CAIDO) }).first().click();
await p.waitForTimeout(1200);
await foto("4-abierta");

{
  const t = await texto();
  es("SE ABRE Y MUESTRA LO QUE SE MANDÓ", /Hola, buen día, cocina/.test(t), true);
  es("con el motivo de Meta adentro", /no tiene forma de pago activa/.test(t), true);
  /*
   * Y la aclaración que evita la pregunta siguiente.
   *
   * La API de WhatsApp no permite grupos: no se pueden crear, ni escribirles,
   * ni entrar a uno. Decirlo acá es lo que evita que alguien lo busque.
   */
  es(
    "DICE QUE ESTO NO ES UN GRUPO DE WHATSAPP",
    /no es un grupo de WhatsApp/.test(t) && /cada persona recibió el mensaje en su propio chat/i.test(t),
    true,
  );
}

// Y volver a conversaciones deja todo como estaba.
await p.getByRole("button", { name: "Conversaciones" }).click();
await p.waitForTimeout(1200);
{
  const t = await texto();
  es("volviendo a Conversaciones reaparecen las redes", /WhatsApp/.test(t), true);
  es("y la difusión ya no está en la lista", new RegExp(CAIDO).test(t), false);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", sql("select count(*) from public.envios where nombre like 'PRUEBA Envio%';"), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
