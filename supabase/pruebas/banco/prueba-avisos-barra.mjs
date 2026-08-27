/**
 * Los globitos rojos de la barra, en la pantalla de verdad.
 *
 *     node supabase/pruebas/banco/prueba-avisos-barra.mjs
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ADEMÁS DE LA PRUEBA DE LA REGLA
 * ------------------------------------------------------------------------
 *
 * `avisos.test.mjs` comprueba qué se cuenta. Esto comprueba que lo contado
 * llegue a la barra, que es un camino distinto y con sus propias formas de
 * romperse: la cuenta se arma en el servidor, viaja como propiedad, la barra
 * la busca por NOMBRE DE MÓDULO y dibuja el globito. Alcanza con que alguien
 * renombre «Recordatorios» en un lado y no en el otro para que el número
 * desaparezca sin que nada falle.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-avisos-${process.pid}-${Math.random()}.sql`);
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

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const JEFA = subDe("jwt-jefa.txt");

const limpiar = () => {
  sql(`
    delete from public.autorizaciones where descripcion like 'AVISO %';
    delete from public.seguimientos where detalle like 'AVISO %';
  `);
};
limpiar();

const abrir = async () => {
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
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  return { nav, p };
};

/** El número del globito de un módulo, o null si no tiene. */
const globito = async (p, modulo) =>
  await p.evaluate((m) => {
    const b = document.querySelector(`aside nav button[data-mod="${m}"]`);
    if (!b) return "sin botón";
    // El globito es el último hijo y sólo existe cuando hay algo que avisar.
    const texto = b.textContent ?? "";
    const n = texto.replace(m, "").trim();
    return n === "" ? null : n;
  }, modulo);

/*
 * ------------------------------------------------------------------------
 * SE MIDE LA DIFERENCIA, NO EL NÚMERO
 * ------------------------------------------------------------------------
 *
 * El banco viene con reservas ya vencidas entre sus fichas de mentira, así que
 * Recordatorios arranca con un número puesto. La primera versión de esta
 * prueba lo ignoraba y exigía que empezara limpio: fallaba por la forma del
 * banco y no por el CRM, que estaba contando bien.
 *
 * Se anota cuánto hay antes de tocar nada y después se comprueba cuánto subió.
 * Así la prueba sigue sirviendo el día que alguien agregue una ficha más a
 * `datos.sql`.
 */
let ANTES_RECORDATORIOS = 0;

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. lo que hay antes de tocar nada ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const { nav, p } = await abrir();
  const n = await globito(p, "Recordatorios");
  ANTES_RECORDATORIOS = n == null ? 0 : Number(n);
  console.log(`   (Recordatorios arranca en ${ANTES_RECORDATORIOS})`);

  es("Autorizaciones arranca limpio", await globito(p, "Autorizaciones"), null);
  await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/avisos-1-limpio.png" });
  await nav.close();
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. con cosas de hoy y atrasadas, sí ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const op = sql("select id from public.oportunidades order by id limit 1;");

  /*
   * Tres seguimientos: uno vencido, uno de hoy y uno de la semana que viene.
   * El tercero es el que importa: no tiene que contarse.
   */
  sql(`
    insert into public.seguimientos (oportunidad_id, tipo, detalle, proxima)
    values (${op}, 'pago',   'AVISO vencido', current_date - 3),
           (${op}, 'cierre', 'AVISO de hoy',  current_date),
           (${op}, 'pago',   'AVISO futuro',  current_date + 7);
  `);

  // Dos pedidos de autorización sin resolver, y uno ya resuelto.
  sql(`
    insert into public.autorizaciones (nombre, descripcion, estado, oportunidad_id)
    values ('AVISO uno', 'AVISO pendiente uno', 'pendiente', ${op}),
           ('AVISO dos', 'AVISO pendiente dos', 'pendiente', ${op}),
           ('AVISO tres', 'AVISO ya resuelta',  'autorizada', ${op});
  `);

  const { nav, p } = await abrir();

  /*
   * Se agregaron tres seguimientos y sólo dos apremian, así que el número
   * tiene que subir exactamente dos. Si el de la semana que viene contara,
   * subiría tres.
   */
  const ahora = Number(await globito(p, "Recordatorios"));
  es("RECORDATORIOS SUBIÓ POR LO VENCIDO Y LO DE HOY", ahora, ANTES_RECORDATORIOS + 2);
  es("y NO contó lo de la semana que viene", ahora === ANTES_RECORDATORIOS + 3, false);
  es("AUTORIZACIONES CUENTA LOS PENDIENTES", await globito(p, "Autorizaciones"), "2");

  await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/avisos-2-con-numeros.png" });
  await nav.close();
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. al resolverlos, el número baja ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(`
    update public.autorizaciones set estado = 'autorizada'
     where descripcion = 'AVISO pendiente uno';
  `);
  const { nav, p } = await abrir();
  es("queda uno solo", await globito(p, "Autorizaciones"), "1");
  await nav.close();
}

limpiar();
{
  const { nav, p } = await abrir();
  es("y limpiando todo, Autorizaciones se apaga", await globito(p, "Autorizaciones"), null);
  const vuelta = await globito(p, "Recordatorios");
  es(
    "y Recordatorios vuelve a como estaba",
    vuelta == null ? 0 : Number(vuelta),
    ANTES_RECORDATORIOS,
  );
  await nav.close();
}

es(
  "no quedó basura de la prueba",
  sql("select count(*) from public.autorizaciones where descripcion like 'AVISO %';"),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
