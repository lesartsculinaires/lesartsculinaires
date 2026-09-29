/**
 * La pestaña «Pendientes»: los hilos que esperan algo, juntos.
 *
 *     node supabase/pruebas/banco/prueba-pendientes.mjs
 *
 * ============================================================================
 * QUÉ RESUELVE
 * ============================================================================
 *
 * Para saber qué faltaba contestar había que recorrer red por red buscando el
 * punto azul, y una conversación marcada a mano como no leída no se distinguía
 * de las demás salvo por la negrita del nombre.
 *
 * Son dos cosas distintas y las dos dejan el hilo debiendo:
 *
 *   SIN LEER       Alguien escribió y nadie entró al hilo.
 *   MARCADA        Alguien leyó y volvió a marcarla para contestar después.
 *
 * La segunda es la que se perdía, y por eso acá se siembra una de cada una: una
 * regla que sólo mirara el contador dejaría pasar la marcada, que es justo la
 * que alguien apartó a propósito.
 *
 * Y se siembra también una AL DÍA, porque una pestaña que muestra todo no
 * filtra nada: sin ese tercer hilo, la prueba pasaría con el filtro roto.
 *
 * ============================================================================
 * POR QUÉ LA PRUEBA REARRANCA LA APLICACIÓN
 * ============================================================================
 *
 * `next start` sirve la compilación que tenía al arrancar, así que recompilar
 * mientras corre no cambia lo que contesta. Sin rearrancar, esta prueba mediría
 * el código de antes y pasaría haga lo que haga el de ahora.
 *
 * Necesita el banco armado (`armar.sh`).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-pend-${process.pid}-${Math.random()}.sql`);
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

const SIN_LEER = "Pend Sin Leer PRUEBA";
const MARCADA = "Pend Marcada PRUEBA";
const AL_DIA = "Pend Al Dia PRUEBA";
const ARCHIVADA = "Pend Archivada PRUEBA";
const TELS = ["50370880001", "50370880002", "50370880003", "50370880004"];

const limpiar = () => {
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono in (${TELS.map((t) => `'${t}'`).join(",")}));
    delete from public.conversaciones where telefono in (${TELS.map((t) => `'${t}'`).join(",")});
  `);
};
limpiar();

/*
 * Cuatro hilos, uno por caso. El archivado está para comprobar que NO entra al
 * número de la pestaña: se archiva para sacarlo de la vista, y un número que lo
 * contara mandaría a buscar un hilo que «Activas» no muestra.
 */
sql(`
  insert into public.conversaciones
    (telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto, sin_leer, no_leida, archivada)
  values
    ('${TELS[0]}', '${SIN_LEER}',  now(), 'Hola, información',     3, false, false),
    ('${TELS[1]}', '${MARCADA}',   now(), 'Gracias',               0, true,  false),
    ('${TELS[2]}', '${AL_DIA}',    now(), 'Perfecto, nos vemos',   0, false, false),
    ('${TELS[3]}', '${ARCHIVADA}', now(), 'Quedó cerrado',         5, false, true);
`);

// ── la aplicación, con la compilación de ahora ─────────────────────────────

const parar = (puerto) => {
  try {
    execSync(`fuser -k ${puerto}/tcp 2>/dev/null || true`, { shell: "/bin/bash" });
  } catch {
    // No estaba levantado.
  }
  for (let i = 0; i < 20; i++) {
    const ocupado = execSync(`fuser ${puerto}/tcp 2>/dev/null || true`, {
      encoding: "utf8",
      shell: "/bin/bash",
    }).trim();
    if (!ocupado) return;
    execSync("sleep 1");
  }
};

parar(3142);
execSync(
  `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-pend.log 2>&1 < /dev/null &)`,
  { shell: "/bin/bash" },
);
{
  let vivo = false;
  for (let i = 0; i < 40; i++) {
    const code = execSync(
      "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
      { encoding: "utf8", shell: "/bin/bash" },
    ).trim();
    if (code === "200") {
      vivo = true;
      break;
    }
    execSync("sleep 1");
  }
  if (!vivo) throw new Error("La aplicación no levantó en el 3142.");
}

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`${RAIZ}/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const JEFA = subDe("jwt-jefa.txt");

const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-jefa.txt`, "utf8").trim();
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/pendientes-${n}.png` });
/** Los nombres de los hilos que se ven en la columna de la izquierda. */
const enLaLista = async (nombre) => await p.getByText(nombre, { exact: false }).count();

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2500);
await foto("1-activas");

console.log("── 1. LA PESTAÑA ESTÁ, CON SU NÚMERO ──");
const pestana = p.getByRole("button", { name: /^Pendientes/ });
const hay = (await pestana.count()) >= 1;
es("APARECE LA PESTAÑA «PENDIENTES»", hay, true);

if (!hay) {
  await foto("1-sin-pestana");
  await nav.close();
  limpiar();
  console.log("\nSin la pestaña no hay nada más que probar.");
  process.exit(1);
}

{
  /*
   * El número cuenta los DOS activos —el sin leer y el marcado— y no el
   * archivado. Un número que no cuadra con lo que se ve al apretar es peor que
   * no tener número.
   */
  const dice = (await pestana.first().innerText()).replace(/\s+/g, " ");
  es("y dice 2: el sin leer y el marcado a mano", /\b2\b/.test(dice), true);
  es("no cuenta el archivado", /\b3\b/.test(dice), false);
}

console.log("\n── 2. ANTES DE FILTRAR SE VEN TODOS ──");
{
  es("el que tiene mensajes sin leer", await enLaLista(SIN_LEER), 1);
  es("el marcado a mano", await enLaLista(MARCADA), 1);
  /*
   * Éste es el que hace que la prueba valga. Sin un hilo al día en la lista,
   * «Pendientes» podría no filtrar nada y todo seguiría en verde.
   */
  es("Y EL QUE ESTÁ AL DÍA", await enLaLista(AL_DIA), 1);
}

console.log("\n── 3. CON EL FILTRO, SÓLO LOS QUE DEBEN ──");
await pestana.first().click();
await p.waitForTimeout(1500);
await foto("2-pendientes");

{
  es("sigue el que tiene mensajes sin leer", await enLaLista(SIN_LEER), 1);
  es("SIGUE EL MARCADO A MANO", await enLaLista(MARCADA), 1);
  es("Y DESAPARECIÓ EL QUE ESTÁ AL DÍA", await enLaLista(AL_DIA), 0);
  es("el archivado tampoco está", await enLaLista(ARCHIVADA), 0);
}

console.log("\n── 4. Y SE PUEDE VOLVER ──");
{
  await p.getByRole("button", { name: "Activas", exact: true }).click();
  await p.waitForTimeout(1200);
  es("«Activas» vuelve a mostrar el que está al día", await enLaLista(AL_DIA), 1);
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.conversaciones where telefono = '${TELS[0]}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
