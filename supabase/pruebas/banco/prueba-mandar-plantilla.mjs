/**
 * El botón «Mandar» de una plantilla, ¿hace algo al apretarlo?
 *
 *     node supabase/pruebas/banco/prueba-mandar-plantilla.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ SE ESTÁ PROBANDO
 * ------------------------------------------------------------------------
 *
 * Que el botón esté enganchado. No que el mensaje llegue a WhatsApp —el banco
 * no habla con Meta y no debe hacerlo— sino algo más básico y que se rompe sin
 * hacer ruido: que al apretarlo pase ALGO.
 *
 * Un botón dibujado pero muerto es el peor de los defectos de pantalla. No hay
 * error, no hay registro, no hay nada que revisar: la persona aprieta, no pasa
 * nada, y lo cuenta como «no me deja enviarla».
 *
 * Acá se aprieta y se exige que aparezca una respuesta. En el banco esa
 * respuesta es «WhatsApp no está configurado en el servidor», que es la
 * correcta: sin token no hay envío. Lo que importa es que la haya.
 *
 * ------------------------------------------------------------------------
 * LO QUE ESTA PRUEBA NO DEMUESTRA
 * ------------------------------------------------------------------------
 *
 * Hubo una versión que además comprobaba el anidado del HTML —el selector
 * estaba metido adentro de un `<p>`, que es inválido— con la sospecha de que
 * eso dejara el botón muerto. No lo dejaba: el navegador acomoda el árbol solo
 * y React se recupera. Se comprobó corriendo esta misma prueba contra el
 * código viejo, y pasaba igual.
 *
 * Aquellas comprobaciones se sacaron en vez de dejarlas en verde: una prueba
 * que pasa haga lo que haga el código no protege nada y encima da confianza
 * falsa. El anidado se arregló porque estaba mal, no porque fuera la causa.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ HAY QUE FORZAR LA VENTANA CERRADA
 * ------------------------------------------------------------------------
 *
 * El selector de plantillas sólo aparece cuando ya no se puede escribir libre:
 * o pasaron 24 horas del último mensaje de la persona, o nunca escribió. Es
 * justo el momento en que hace falta. Así que la prueba arma una conversación
 * sin ningún mensaje entrante, que es el caso de «nunca escribió».
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-plantilla-${process.pid}-${Math.random()}.sql`);
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

const TEL = "50370999001";
const limpiar = () => {
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
    delete from public.plantillas where nombre like 'prueba_%';
  `);
};
limpiar();

/*
 * Una conversación sin ningún mensaje entrante: el caso «nunca escribió», que
 * es cuando el CRM ofrece la plantilla.
 */
sql(`
  insert into public.conversaciones (telefono, nombre_perfil, ultimo_mensaje_en)
  values ('${TEL}', 'Plantilla Prueba', now());
`);

// Una plantilla aprobada y sin huecos, para que el botón se encienda solo.
sql(`
  insert into public.plantillas (id, nombre, idioma, estado, categoria, cuerpo, variables)
  values ('prueba_saludo_es', 'prueba_saludo', 'es', 'APPROVED', 'MARKETING',
          'Hola, te escribimos de Les Arts Culinaires.', 0);
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

const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/plantilla-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);

console.log("── se abre la conversación de alguien que nunca escribió ──");
await p.getByText("Plantilla Prueba", { exact: false }).first().click();
await p.waitForTimeout(1800);

const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
es("avisa que sólo se puede con plantilla", /sólo deja llegarle con una plantilla/i.test(await texto()), true);

console.log("\n── se elige la plantilla y se aprieta Mandar ──");
{
  // El valor de la opción es el id de la plantilla, que es el que sembramos.
  await p.locator("main select").last().selectOption("prueba_saludo_es");
  await p.waitForTimeout(900);

  const boton = p.getByRole("button", { name: "Mandar", exact: true });
  es("aparece el botón", await boton.count(), 1);
  es("y está habilitado", await boton.first().isDisabled(), false);

  await foto("1-antes-de-mandar");
  await boton.first().click();
  await p.waitForTimeout(2500);

  /*
   * Lo que importa: que haya pasado ALGO.
   *
   * En el banco no hay token de WhatsApp, así que la respuesta correcta es
   * decir que no está configurado. Un botón muerto no diría nada.
   */
  const despues = await texto();
  es(
    "APRETARLO HACE ALGO: contesta que falta configurar WhatsApp",
    /no está configurado en el servidor/i.test(despues),
    true,
  );
  await foto("2-despues-de-mandar");
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.conversaciones where telefono = '${TEL}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
