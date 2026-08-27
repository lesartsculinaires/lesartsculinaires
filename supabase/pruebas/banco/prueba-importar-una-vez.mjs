/**
 * Un doble clic en «Importar», ¿carga el archivo dos veces?
 *
 *     node supabase/pruebas/banco/prueba-importar-una-vez.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ PASÓ EN LA ESCUELA
 * ------------------------------------------------------------------------
 *
 * «Asalariados 2025-2026 CRM.xlsx» apareció DOS veces en el módulo de Bases,
 * las dos del mismo minuto y las dos con las mismas 326 filas. No era un
 * problema de cómo se muestran: eran dos importaciones de verdad, con sus 326
 * fichas cada una.
 *
 * El botón «Importar» sólo se apagaba cuando no había nada que importar, no
 * mientras la carga corría. Con trescientas filas eso son varios segundos con
 * el botón encendido y el mismo texto de siempre; apretarlo otra vez arrancaba
 * la importación desde cero, y como la segunda vuelta empieza sin base abierta,
 * abría otra y volvía a cargar todo.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ EL CLIC VA CON `dispatchEvent` Y NO CON `click()`
 * ------------------------------------------------------------------------
 *
 * Playwright espera a que el botón esté estable y habilitado antes de cada
 * clic, así que su segundo clic llegaría después de que la pantalla ya se
 * apagó: nunca reproduciría el caso. Los dos eventos se disparan desde el
 * navegador, en el mismo tick, que es lo que hace una tablet cuando un toque
 * se cuenta dos veces.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-importar-${process.pid}-${Math.random()}.sql`);
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

const ARCHIVO = "PRUEBA doble clic.csv";
const limpiar = () => {
  sql(`
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre like 'Dobleclic %');
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre like 'Dobleclic %');
    delete from public.clientes where nombre like 'Dobleclic %';
    delete from public.importaciones where archivo like 'PRUEBA %';
  `);
};
limpiar();

// Un archivo chico: alcanza para probar el doble disparo y la carga es rápida.
const FILAS = 12;
const csv =
  "nombre,telefono\n" +
  Array.from({ length: FILAS }, (_, i) => `Dobleclic ${i + 1},7099${String(i).padStart(4, "0")}`).join("\n");
const RUTA_CSV = path.join(os.tmpdir(), ARCHIVO);
fs.writeFileSync(RUTA_CSV, csv, "utf8");

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/importar-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Bases"]').click();
await p.waitForTimeout(1800);

console.log("── se sube el archivo y se llega al repaso ──");
await p.getByRole("button", { name: /Subir base/ }).click();
await p.waitForTimeout(1200);
await p.locator('input[type="file"]').setInputFiles(RUTA_CSV);
await p.waitForTimeout(2500);

const revisar = p.getByRole("button", { name: /Revisar e importar/ });
es("el archivo se leyó y ofrece revisar", await revisar.count(), 1);
await revisar.click();
await p.waitForTimeout(1500);
await foto("1-repaso");

console.log("\n── DOS CLICS EN EL MISMO INSTANTE ──");
{
  /*
   * Los dos eventos salen del navegador seguidos, sin darle tiempo a React de
   * repintar. Es lo que hace una tablet cuando un toque se cuenta dos veces, y
   * es el caso que Playwright no puede reproducir con `click()`.
   */
  const disparados = await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /^Importar \d+/.test(x.textContent ?? ""),
    );
    if (!b) return "no se encontró el botón";
    b.click();
    b.click();
    return 2;
  });
  es("se dispararon los dos clics", disparados, 2);

  // La importación de doce filas es un solo lote; se le da margen igual.
  await p.waitForTimeout(6000);
  await foto("2-despues");
}

console.log("\n── lo que quedó en la base ──");
{
  es(
    "UNA SOLA BASE, NO DOS",
    sql(`select count(*) from public.importaciones where archivo = '${ARCHIVO}';`),
    "1",
  );
  es(
    "y las filas entraron una sola vez",
    sql("select count(*) from public.clientes where nombre like 'Dobleclic %';"),
    String(FILAS),
  );
  es(
    "con un lead cada una",
    sql(`
      select count(*) from public.oportunidades o
        join public.clientes c on c.id = o.cliente_id
       where c.nombre like 'Dobleclic %';
    `),
    String(FILAS),
  );
}

await nav.close();
limpiar();
fs.rmSync(RUTA_CSV, { force: true });
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.importaciones where archivo like 'PRUEBA %';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
