/**
 * Las reglas del equipo en el Inbox (12/11/2026).
 *
 *     node supabase/pruebas/banco/prueba-reglas-del-equipo.mjs
 *
 * Con la casilla «inbox.reglas» en su rol, una vendedora ve:
 *   - el botón «Reglas del equipo», que abre la lista;
 *   - en un chat de otra vendedora, el aviso con su nombre y el botón
 *     «Dejar en «No leído» y salir», que lo deja pendiente y cierra el chat;
 *   - en un chat sin asignar, el aviso de asignarlo antes de contestar.
 * Sin la casilla —aunque sea administradora— no ve nada de eso.
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

const leer = (archivo) => fs.readFileSync(new URL(archivo, import.meta.url), "utf8").trim();
const sub = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub;

const TEL_OTRA = "50399550001";
const TEL_SUELTO = "50399550002";
const limpiar = () => sql(`
  delete from public.mensajes where conversacion_id in
    (select id from public.conversaciones where telefono in ('${TEL_OTRA}', '${TEL_SUELTO}'));
  delete from public.conversaciones where telefono in ('${TEL_OTRA}', '${TEL_SUELTO}');
`);

const JWT_ALE = leer("jwt-ale.txt");
const JWT_JEFA = leer("jwt-jefa.txt");
const ALE = sub(JWT_ALE);
const rolDeAle = sql(`select rol_id from public.usuarios where id = '${ALE}';`);
const miFicha = sql(`select id from public.vendedores where usuario_id = '${ALE}';`);
// Otra vendedora de ventas: una académica no sirve, su chat es de otra área y
// no sale en esta bandeja.
const otraFicha = sql(`select id from public.vendedores where id <> ${miFicha} and activo and not coalesce(academico, false) order by id limit 1;`);
const nombreOtra = sql(`select nombre from public.vendedores where id = ${otraFicha};`);
const antes = sql(`select ver from public.rol_permisos where rol_id = ${rolDeAle} and modulo = 'inbox.reglas';`);
// Para ver el chat de otra vendedora el rol tiene que ver todo, como el equipo
// de ventas real. Se vuelve a dejar como estaba al final.
const veTodoAntes = sql(`select ve_todo from public.roles where id = ${rolDeAle};`);

limpiar();
sql(`
  update public.roles set ve_todo = true where id = ${rolDeAle};
  insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
  values (${rolDeAle}, 'inbox.reglas', true, false, false, false)
  on conflict (rol_id, modulo) do update set ver = true;
  insert into public.conversaciones (telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto, vendedor_id)
  values ('${TEL_OTRA}', 'Regla De Otra', now(), 'Hola', ${otraFicha}),
         ('${TEL_SUELTO}', 'Regla Sin Duena', now() - interval '1 minute', 'Buenas', null);
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select c.id, 'wamid.REGLA.' || c.telefono, 'entrante', 'text', c.ultimo_texto, c.ultimo_mensaje_en
    from public.conversaciones c where c.telefono in ('${TEL_OTRA}', '${TEL_SUELTO}');
`);

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });

async function entrar(jwt) {
  const galleta = "base64-" + Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
    user: { id: sub(jwt), email: "x@lac.test" },
  })).toString("base64");
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: "Inbox", domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
    try { localStorage.setItem("lac.reservas.visto", hoy); } catch {}
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  return { ctx, p, errores };
}

try {
  console.log("── vendedora con la casilla ──");
  {
    const { ctx, p, errores } = await entrar(JWT_ALE);
    // Con SP=<carpeta> deja fotos de cómo se ve, para mostrarlo.
    const foto = (n) => process.env.SP && p.screenshot({ path: `${process.env.SP}/reglas-${n}.png` });
    const boton = p.locator("[data-reglas-del-equipo]");
    await foto("1-boton");
    es("aparece el botón «Reglas del equipo»", await boton.count(), 1);
    es("destacado la primera vez del día", /léelas/.test(await boton.innerText()), true);
    await boton.click();
    const dialogo = p.getByRole("dialog", { name: "Reglas del equipo" });
    es("abre la lista de reglas", await dialogo.count(), 1);
    es("con las 8 reglas", await dialogo.locator("li").count(), 8);
    await foto("2-lista");
    await dialogo.getByRole("button", { name: "Entendido" }).click();
    es("se cierra con «Entendido»", await dialogo.count(), 0);
    es("ya no dice «léelas»", /léelas/.test(await boton.innerText()), false);

    await p.locator('button.row:has-text("Regla De Otra")').click();
    await p.waitForTimeout(1500);
    const aviso = p.locator('[data-aviso-de-reglas="de-otra-persona"]');
    es("chat de otra: aparece el aviso", await aviso.count(), 1);
    es("y dice de quién es", (await aviso.innerText()).includes(nombreOtra), true);
    es("abrirlo lo dejó leído", sql(`select no_leida from public.conversaciones where telefono = '${TEL_OTRA}';`), "f");
    await foto("3-chat-de-otra");
    await aviso.getByRole("button").click();
    await p.waitForTimeout(1500);
    es("«Dejar en No leído» lo marca pendiente",
      sql(`select no_leida || '/' || sin_leer from public.conversaciones where telefono = '${TEL_OTRA}';`), "true/1");
    es("y sale del chat", await aviso.count(), 0);

    await p.locator('button.row:has-text("Regla Sin Duena")').click();
    await p.waitForTimeout(1500);
    es("chat sin asignar: aparece el aviso de asignarlo",
      await p.locator('[data-aviso-de-reglas="sin-asignar"]').count(), 1);
    es("sin errores en la página", errores, []);
    await ctx.close();
  }

  console.log("\n── administradora sin la casilla ──");
  {
    const { ctx, p, errores } = await entrar(JWT_JEFA);
    es("no ve el botón", await p.locator("[data-reglas-del-equipo]").count(), 0);
    await p.locator('button.row:has-text("Regla Sin Duena")').click();
    await p.waitForTimeout(1500);
    es("ni los avisos", await p.locator("[data-aviso-de-reglas]").count(), 0);
    es("sin errores en la página", errores, []);
    await ctx.close();
  }
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  await nav.close();
  limpiar();
  sql(`update public.roles set ve_todo = ${veTodoAntes === "t"} where id = ${rolDeAle};`);
  sql(antes === ""
    ? `delete from public.rol_permisos where rol_id = ${rolDeAle} and modulo = 'inbox.reglas';`
    : `update public.rol_permisos set ver = ${antes === "t"} where rol_id = ${rolDeAle} and modulo = 'inbox.reglas';`);
}
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
