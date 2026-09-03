/**
 * El contacto de WhatsApp que todavía no tiene lead.
 *
 *     node supabase/pruebas/banco/prueba-hilo-sin-lead.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ SE ROMPÍA
 * ------------------------------------------------------------------------
 *
 * El webhook abre el lead cuando entra el primer mensaje de un número nuevo,
 * pero está escrito para no tumbarse si eso falla: guarda el mensaje, abre la
 * conversación y sigue. Cuando falla queda una persona a medio camino —está en
 * la bandeja, no está en Clientes ni en el Pipeline— porque esas pantallas
 * listan oportunidades y ella no tiene ninguna.
 *
 * Apretar «Ver ficha» ahí saltaba a Clientes, donde esa persona TAMPOCO está.
 * Se perdía el hilo abierto y no se ganaba nada: eso es lo que reportó la
 * escuela como «me tira directamente a los clientes y no despliega la ficha
 * del cliente de whatsapp».
 *
 * ------------------------------------------------------------------------
 * QUÉ SE PRUEBA
 * ------------------------------------------------------------------------
 *
 * 1. Sin lead no se ofrece «Ver ficha»: se ofrece «Abrir lead».
 * 2. Apretarlo crea la oportunidad, con su código CRM, y abre la ficha ahí
 *    mismo, SIN salir de la bandeja.
 * 3. Con lead, «Ver ficha» abre exactamente el lead que el hilo viene
 *    mostrando debajo del nombre —no «el primero que aparezca»—, que es la
 *    otra mitad del mismo problema.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `sin-lead-${process.pid}-${Math.random()}.sql`);
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

// ── el que no tiene lead, y el que sí ────────────────────────────────────
const TEL_SIN = "50370555777";
const SIN = "Sin Lead Todavia";
const TEL_CON = "50370555778";
const CON = "Con Dos Leads";

const limpiar = () => {
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono in ('${TEL_SIN}', '${TEL_CON}'));
    delete from public.conversaciones where telefono in ('${TEL_SIN}', '${TEL_CON}');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre in ('${SIN}', '${CON}'));
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre in ('${SIN}', '${CON}'));
    delete from public.clientes where nombre in ('${SIN}', '${CON}');
  `);
};
limpiar();

/*
 * El primero queda como lo deja el webhook cuando el alta del lead falla:
 * cliente y conversación, sin oportunidad.
 *
 * El segundo tiene DOS leads, uno cerrado y otro abierto, y el CERRADO es el
 * más nuevo a propósito. Es lo que separa las dos reglas: la lista llega
 * ordenada por fecha de registro, así que «el primero del arreglo» —como se
 * elegía cuando esto se resolvía afuera de la bandeja— da el cerrado, y «el
 * que está abierto» —la regla del hilo— da el otro. Con el cerrado más viejo
 * las dos darían lo mismo y la prueba no probaría nada.
 */
sql(`
  insert into public.clientes (nombre, telefono) values ('${SIN}', '${TEL_SIN}'), ('${CON}', '${TEL_CON}');

  insert into public.conversaciones (telefono, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select '${TEL_SIN}', '${SIN}', c.id, now() from public.clientes c where c.nombre = '${SIN}';

  insert into public.conversaciones (telefono, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select '${TEL_CON}', '${CON}', c.id, now() - interval '1 minute'
    from public.clientes c where c.nombre = '${CON}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.SL1', 'entrante', 'text', 'Hola, quiero informacion del curso', now()
    from public.conversaciones v where v.telefono = '${TEL_SIN}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.CL1', 'entrante', 'text', 'Buenas, consulta por otro diplomado', now()
    from public.conversaciones v where v.telefono = '${TEL_CON}';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, fecha_cierre)
  select 'SLD-9001', c.id, (select id from public.etapas order by orden limit 1),
         current_date, current_date
    from public.clientes c where c.nombre = '${CON}';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, fecha_cierre)
  select 'SLD-9002', c.id, (select id from public.etapas order by orden limit 1),
         current_date - 200, null
    from public.clientes c where c.nombre = '${CON}';
`);

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const JEFA = subDe("jwt-jefa.txt");
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
      user: { id: JEFA, email: "jefa@lac.test" },
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/sin-lead-${n}.png` });

const moduloActual = async () =>
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("aside nav button[data-mod]")].find(
      (x) => getComputedStyle(x).backgroundColor !== "rgba(0, 0, 0, 0)",
    );
    return b?.getAttribute("data-mod") ?? null;
  });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. sin lead no hay ficha que ver: hay lead que abrir ──");
// ══════════════════════════════════════════════════════════════════════════
await p.getByText(SIN, { exact: false }).first().click();
await p.waitForTimeout(1800);

es(
  "no se ofrece «Ver ficha»",
  await p.getByRole("button", { name: "Ver ficha", exact: true }).count(),
  0,
);
es(
  "SE OFRECE «ABRIR LEAD»",
  await p.getByRole("button", { name: /Abrir lead/ }).count(),
  1,
);
await foto("1-sin-lead");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. abrirlo crea el lead y muestra la ficha, sin irse ──");
// ══════════════════════════════════════════════════════════════════════════
await p.getByRole("button", { name: /Abrir lead/ }).first().click();
await p.waitForTimeout(3500);

const codigo = sql(`
  select o.codigo from public.oportunidades o
  join public.clientes c on c.id = o.cliente_id
  where c.nombre = '${SIN}';
`);
es("SE CREÓ LA OPORTUNIDAD, CON CÓDIGO CRM", /^CRM-\d{4}$/.test(codigo), true);

es(
  "se abrió su ficha",
  await p.locator("aside").filter({ hasText: codigo }).count(),
  1,
);
es("Y SEGUIMOS EN INBOX, NO EN CLIENTES", await moduloActual(), "Inbox");
es(
  "el hilo sigue detrás",
  await p.evaluate(() =>
    /quiero informacion del curso/.test(document.querySelector("main")?.innerText ?? ""),
  ),
  true,
);
await foto("2-lead-abierto");

// La conversación tiene que quedar apuntando al mismo cliente de siempre: si
// el botón hubiera creado una persona nueva al lado, acá habría dos.
es(
  "no se duplicó la persona",
  sql(`select count(*) from public.clientes where nombre = '${SIN}';`),
  "1",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. con lead, se abre EL QUE MUESTRA EL HILO ──");
// ══════════════════════════════════════════════════════════════════════════
//
// El hilo muestra debajo del nombre la etapa del lead abierto (SLD-9002).
// «Ver ficha» tiene que abrir ése y no el cerrado, que es el que quedaba
// primero cuando la búsqueda se hacía afuera de la bandeja.
await p.locator('aside button[aria-label="Cerrar"]').first().click();
await p.waitForTimeout(1200);
await p.getByText(CON, { exact: false }).first().click();
await p.waitForTimeout(1800);
await p.getByRole("button", { name: "Ver ficha", exact: true }).first().click();
await p.waitForTimeout(2000);

const ficha = p.locator("aside").filter({ hasText: "SLD-900" });
es("se abrió una ficha", await ficha.count(), 1);
es(
  "Y ES LA DEL LEAD ABIERTO, NO LA DEL CERRADO",
  await p.evaluate(() =>
    [...document.querySelectorAll("aside")].some((a) => /SLD-9002/.test(a.innerText)),
  ),
  true,
);
es("y tampoco se fue de la bandeja", await moduloActual(), "Inbox");
await foto("3-el-lead-abierto");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── lo que quedó en la base ──");
// ══════════════════════════════════════════════════════════════════════════
es(
  "el lead nuevo quedó colgado de su conversación",
  sql(`
    select count(*) from public.conversaciones v
    join public.oportunidades o on o.cliente_id = v.cliente_id
    where v.telefono = '${TEL_SIN}';
  `),
  "1",
);

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.clientes where nombre in ('${SIN}', '${CON}');`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
