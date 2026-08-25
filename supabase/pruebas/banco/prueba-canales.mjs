/**
 * ¿Se ve en la ficha por dónde llegó la persona?
 *
 *     node supabase/pruebas/banco/prueba-canales.mjs
 *
 * La tabla y la función tienen su prueba en `prueba-fusion.mjs`. Acá se mira
 * lo que el asesor abre: que los dos canales estén, en orden, que el primero
 * lleve la marca de por dónde entró —que es el dato que se perdía al
 * duplicar— y que se vea cuándo escribió por WhatsApp.
 *
 * También se comprueba lo que NO tiene que aparecer: con un solo canal la
 * sección no se dibuja. Repetir abajo la etiqueta que ya está arriba enseña a
 * saltear la sección, y el día que tenga dos canales nadie la mira.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-canales-${process.pid}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
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

const limpiar = `
  delete from contactos_canal where cliente_id in
    (select id from clientes where nombre in ('Dos Canales','Un Canal'));
  delete from oportunidades where cliente_id in
    (select id from clientes where nombre in ('Dos Canales','Un Canal'));
  delete from clientes where nombre in ('Dos Canales','Un Canal');
`;
sql(limpiar);

sql(`
  insert into clientes (nombre, telefono) values ('Dos Canales','70956875');
  insert into clientes (nombre, telefono) values ('Un Canal','70956111');

  insert into oportunidades (codigo, cliente_id, canal_id, etapa_id, fecha_registro, producto_id)
  select 'CRM-7001', c.id, 1, (select id from etapas order by orden limit 1), '2026-07-12',
         (select id from productos limit 1)
    from clientes c where c.nombre='Dos Canales';

  insert into oportunidades (codigo, cliente_id, canal_id, etapa_id, fecha_registro, producto_id)
  select 'CRM-7002', c.id, 1, (select id from etapas order by orden limit 1), '2026-07-12',
         (select id from productos limit 1)
    from clientes c where c.nombre='Un Canal';

  select anotar_canal(c.id, 1, 'katy.g',      '2026-07-12 14:30-06') from clientes c where c.nombre='Dos Canales';
  select anotar_canal(c.id, 3, '50370956875', '2026-07-21 09:03-06') from clientes c where c.nombre='Dos Canales';
  select anotar_canal(c.id, 3, '50370956875', '2026-07-25 16:10-06') from clientes c where c.nombre='Dos Canales';

  select anotar_canal(c.id, 1, 'sola',        '2026-07-12 14:30-06') from clientes c where c.nombre='Un Canal';
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
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

const abrir = async (codigo) => {
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2200);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(1800);
  await p.locator("main table tbody tr").filter({ hasText: codigo }).first().click();
  await p.waitForTimeout(2000);
  // El rótulo va en mayúsculas por CSS, así que `innerText` lo devuelve en
  // mayúsculas: se compara sin distinguir, no con el texto tal cual se escribió.
  return (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
};

console.log("── con dos canales, la sección aparece ──");
{
  const t = await abrir("CRM-7001");
  es("está el rótulo", /POR DÓNDE LLEGÓ/i.test(t), true);
  es("aparece Instagram", /Instagram/.test(t), true);
  es("aparece Whatsapp", /Whatsapp/.test(t), true);
  es("LA MARCA DE POR DÓNDE ENTRÓ", /ENTRÓ POR ACÁ/i.test(t), true);
  es("y que volvió a escribir", /escribió de nuevo/i.test(t), true);

  // El orden es el dato: Instagram fue primero.
  const iIns = t.search(/Instagram/);
  const iWa = t.search(/Whatsapp/);
  es("INSTAGRAM VA ANTES QUE WHATSAPP", iIns >= 0 && iWa > iIns, true);
}

console.log("\n── con un solo canal, no ──");
{
  const t = await abrir("CRM-7002");
  es("no dibuja la sección", /POR DÓNDE LLEGÓ/i.test(t), false);
}

es("sin errores en la página", errores, []);
await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/canales.png" });
await nav.close();

sql(limpiar);
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
