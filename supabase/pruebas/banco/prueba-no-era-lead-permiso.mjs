/**
 * «No era lead» en manos de una asesora: ¿qué le dice?
 *
 *     node supabase/pruebas/banco/prueba-no-era-lead-permiso.mjs
 *
 * Borrar es de dirección y la base lo hace cumplir. Lo que esta prueba mira es
 * lo otro, que es lo que se rompe en la práctica: cómo se ve desde la pantalla.
 *
 * Un borrado que RLS niega no da error: no toca ninguna fila y devuelve bien.
 * Sin la comprobación en la acción, la asesora apretaba «No era lead», recibía
 * un «listo» y el lead seguía en Prospectos. Un permiso que se niega en
 * silencio se lee como un error del sistema, y lo que hace la gente es apretar
 * otra vez.
 *
 * Entonces lo que se comprueba es que diga la verdad completa: qué sí pasó —la
 * conversación se archivó, que es lo que saca el ruido de la bandeja— y qué
 * queda pendiente y de quién depende.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const TEL = "50377000001";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-noera-${process.pid}.sql`);
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

// La asesora y su ficha de vendedora salen de la base, enlazadas por el
// usuario. Buscarla por nombre no sirve: «Ale%» encuentra también a Alexandra
// Ramos, la subconsulta devuelve dos filas y el sembrado se cae entero.
const ASESORA = sql(`
  select u.id from auth.users u
    join public.usuarios pu on pu.id = u.id
    join public.roles r on r.id = pu.rol_id
   where r.es_admin = false limit 1;
`);
const VENDEDORA = sql(`select id from public.vendedores where usuario_id = '${ASESORA}' limit 1;`);

if (!ASESORA || !VENDEDORA) {
  console.error("El banco no tiene una asesora con ficha de vendedora. Armalo de nuevo.");
  process.exit(1);
}

const limpiar = `
  delete from mensajes where conversacion_id in
    (select id from conversaciones where telefono='${TEL}');
  delete from conversaciones where telefono='${TEL}';
  delete from oportunidades where codigo='NOERA-1';
  delete from clientes where nombre='Numero Equivocado';
`;
sql(limpiar);

sql(`
  insert into clientes (nombre, telefono) values ('Numero Equivocado','${TEL}');

  insert into oportunidades (codigo, cliente_id, etapa_id, fecha_registro, vendedor_id)
  select 'NOERA-1', c.id,
         (select id from public.etapas where nombre ilike 'prospectos'),
         current_date, ${VENDEDORA}
    from clientes c where c.nombre='Numero Equivocado';

  insert into conversaciones (telefono, cliente_id, ultimo_mensaje_en, vendedor_id)
  select '${TEL}', c.id, now(), ${VENDEDORA}
    from clientes c where c.nombre='Numero Equivocado';

  insert into mensajes (conversacion_id, direccion, tipo, texto, estado, creado_en)
  select cv.id, 'entrante', 'text', 'Buenas, vendo tortillas', 'recibido', now()
    from conversaciones cv where cv.telefono='${TEL}';
`);

if (sql(`select count(*) from conversaciones where telefono='${TEL}';`) !== "1") {
  console.error("No se pudo sembrar la conversación de prueba.");
  process.exit(1);
}

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-ale.txt", "utf8")
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
      user: { id: ASESORA, email: "ale@lac.test" },
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

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2200);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(1800);
await p.locator("main button").filter({ hasText: /Numero Equivocado|50377000001/ }).first().click();
await p.waitForTimeout(1500);

console.log("── la asesora aprieta «No era lead» ──");
await p.locator('button:has-text("No era lead")').click();
await p.waitForTimeout(2600);

const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
es("dice que archivar sí se hizo", /quedó archivada/i.test(t), true);
es("Y QUE BORRAR ES DE DIRECCIÓN", /borrarlo es de dirección/i.test(t), true);
es("EL LEAD SIGUE EN EL TABLERO", sql("select count(*) from oportunidades where codigo='NOERA-1';"), "1");
es("y el contacto también", sql("select count(*) from clientes where nombre='Numero Equivocado';"), "1");
es(
  "pero la conversación quedó archivada",
  sql(`select archivada from conversaciones where telefono='${TEL}';`),
  "t",
);
es("sin errores en la página", errores, []);

await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/no-era-lead.png" });
await nav.close();

sql(limpiar);
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
