/**
 * El «Manual CRM» (12/11/2026).
 *
 *     node supabase/pruebas/banco/prueba-manual.mjs
 *
 * Como asesora a la que se le quitó «Equipos»: el manual no le muestra ese
 * capítulo ni el de «Usuarios y Roles»; abre un capítulo, la foto carga con
 * sus números, tocar un número cambia la explicación, la pregunta rápida
 * responde, «Ya lo leí» sube el avance, el buscador encuentra y «Ir a…» lleva
 * al módulo. Como administradora ve todos los capítulos.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const sql = (q) =>
  execFileSync("su", ["postgres", "-c", "psql -h /tmp -p 5511 -d crm -A -t -q -v ON_ERROR_STOP=1 -f -"], {
    input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const leer = (a) => fs.readFileSync(new URL(a, import.meta.url), "utf8").trim();
const sub = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub;
const JWT_ALE = leer("jwt-ale.txt");
const JWT_JEFA = leer("jwt-jefa.txt");
const rol = sql(`select rol_id from public.usuarios where id = '${sub(JWT_ALE)}';`);
const antes = sql(`select ver from public.rol_permisos where rol_id = ${rol} and modulo = 'equipos';`);
sql(`insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar) values (${rol}, 'equipos', false, false, false, false)
     on conflict (rol_id, modulo) do update set ver = false;`);

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
async function entrar(jwt) {
  const galleta = "base64-" + Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: sub(jwt), email: "x@lac.test" },
  })).toString("base64");
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: "Manual CRM", domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
    try { localStorage.setItem("lac.reservas.visto", hoy); localStorage.removeItem("crm.manual.leidos"); } catch {}
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  const boton = p.locator('aside button[data-mod="Manual CRM"]');
  es("el módulo «Manual CRM» está en la barra", await boton.count(), 1);
  await boton.click();
  await p.waitForSelector("[data-manual]");
  return { ctx, p, errores };
}
const foto = (p, n) => process.env.SP && p.screenshot({ path: `${process.env.SP}/manual-${n}.png` });

try {
  console.log("── asesora sin «Equipos» ──");
  {
    const { ctx, p, errores } = await entrar(JWT_ALE);
    const ids = await p.locator("[data-manual-capitulo]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-manual-capitulo")));
    es("empieza por «Primeros pasos»", ids[0], "primeros-pasos");
    es("no le muestra «Equipos»", ids.includes("equipos"), false);
    es("ni «Usuarios y Roles»", ids.includes("usuarios"), false);
    es("pero sí el Inbox y Clientes", ids.includes("inbox") && ids.includes("clientes"), true);
    await foto(p, "1-inicio");

    await p.locator('[data-manual-capitulo="inbox"]').click();
    await p.waitForSelector('[data-manual-abierto="inbox"]');
    const img = p.locator('[data-manual-foto="inbox-chat"] img').first();
    await img.scrollIntoViewIfNeeded();
    await p.waitForTimeout(800);
    es("la foto del chat carga", await img.evaluate((i) => i.complete && i.naturalWidth > 0), true);
    const puntos = p.locator('[data-manual-foto="inbox-chat"] [data-manual-punto]');
    es("con sus 7 números encima", await puntos.count(), 7);
    await puntos.nth(3).click();
    es("tocar el 4 muestra «Nota interna»", /solo ve el equipo/.test(await p.locator('[data-manual-foto="inbox-chat"] ol').innerText()), true);
    await foto(p, "2-capitulo");

    const rapida = p.locator("[data-manual-rapida]");
    await rapida.getByRole("button", { name: /plantilla aprobada/ }).click();
    es("la pregunta rápida dice si está bien", /¡Exacto!/.test(await rapida.innerText()), true);

    await p.locator("[data-manual-leido]").check();
    await p.getByRole("button", { name: "← Todos los capítulos" }).click();
    es("el avance cuenta el capítulo leído", /Llevas 1 de/.test(await p.locator("[data-manual]").innerText()), true);

    await p.locator("[data-manual-buscar]").fill("plantilla");
    es("el buscador encuentra «plantilla»", (await p.locator("[data-manual-resultados] button").count()) >= 3, true);
    await foto(p, "3-busqueda");
    await p.locator("[data-manual-buscar]").fill("");

    await p.locator('[data-manual-capitulo="calendario"]').click();
    await p.getByRole("button", { name: "Ir a Calendario →" }).click();
    await p.waitForTimeout(1200);
    es("«Ir a Calendario» abre el calendario", await p.locator("[data-calendario]").count(), 1);
    es("sin errores en la página", errores, []);
    await ctx.close();
  }

  console.log("\n── administradora ──");
  {
    const { ctx, p, errores } = await entrar(JWT_JEFA);
    const ids = await p.locator("[data-manual-capitulo]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-manual-capitulo")));
    es("ve «Equipos», «Usuarios y Roles» y «Canales»", ["equipos", "usuarios", "canales"].every((x) => ids.includes(x)), true);
    es("sin errores en la página", errores, []);
    await ctx.close();
  }
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  await nav.close();
  sql(antes === ""
    ? `delete from public.rol_permisos where rol_id = ${rol} and modulo = 'equipos';`
    : `update public.rol_permisos set ver = ${antes === "t"} where rol_id = ${rol} and modulo = 'equipos';`);
}
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
