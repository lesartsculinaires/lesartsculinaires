/**
 * ¿Quién refresca cuando otra persona cambia algo?
 *
 *     node supabase/pruebas/banco/prueba-refresco-solo-a-la-vista.mjs
 *
 * ============================================================================
 * POR QUÉ IMPORTA, CON LOS NÚMEROS
 * ============================================================================
 *
 * Cada refresco vuelve a pedir la portada entera: unas veinticinco consultas y
 * el embudo completo, 2,5 MB con los 2600 leads de producción. Y un cambio no
 * refresca una pantalla: refresca TODAS las pestañas abiertas del equipo a la
 * vez. Por eso la carga crece con la gente dos veces —más gente hace más
 * cambios, y cada cambio lo pagan más pestañas—, y por eso el 10 de octubre de
 * 2026, con veinticinco direcciones conectadas, la base se arrastró hasta
 * cortar los refrescos y dejar la pantalla en blanco.
 *
 * Dos desperdicios grandes:
 *
 *   PESTAÑAS QUE NADIE MIRA   Una pestaña minimizada refrescaba igual que la
 *                             que se está usando.
 *
 *   LOS TILDES DE WHATSAPP    Cada mensaje que sale trae tres avisos —enviado,
 *                             entregado, leído— y cada uno actualiza el mensaje
 *                             y su conversación: el equipo entero refrescaba
 *                             seis veces por los tildes de un mensaje que sólo
 *                             se ven en la bandeja.
 *
 * ============================================================================
 * LO QUE SE EXIGE
 * ============================================================================
 *
 *   Un tilde refresca la bandeja, y no el Pipeline.
 *   Un mensaje NUEVO refresca todas (el globito de no leídos).
 *   Un lead movido refresca las que están a la vista, y NO las ocultas.
 *   La oculta refresca UNA vez cuando se la vuelve a mirar.
 *
 * Para correrla contra otra versión: APP_PUERTO=3146.
 */
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};
const espera = (ms) => new Promise((s) => setTimeout(s, ms));

/*
 * El Realtime de mentira, pero con la entrada estándar en la mano: escribiendo
 * «mensajes UPDATE» manda ese aviso a todos. El que deja `armar.sh` corre
 * suelto y no se le puede escribir, así que se lo reemplaza mientras dure la
 * prueba y se lo vuelve a levantar al final.
 */
execSync(`pkill -f "node realtime[.]js" || true`, { cwd: BANCO });
await espera(500);
const rt = spawn("node", ["realtime.js"], { cwd: BANCO, stdio: ["pipe", "ignore", "inherit"] });
/*
 * Un aviso por vez, con aire entre uno y otro: `realtime.js` lee la entrada de
 * a trozos, y dos líneas pegadas en el mismo trozo las toma como un solo aviso
 * con un tipo que no existe.
 */
const avisar = async (tabla, tipo) => {
  rt.stdin.write(`${tabla} ${tipo}\n`);
  await espera(200);
};
await espera(1000);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
    user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
  })).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/** Una pestaña con su contador de refrescos y un interruptor de «a la vista». */
async function pestaña(mod) {
  const ctx = await nav.newContext({ viewport: { width: 1300, height: 850 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: encodeURIComponent(mod), domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript((h) => {
    try { localStorage.setItem("lac.reservas.visto", h); } catch {}
    // Playwright no minimiza ventanas: se le hace creer a la página que no está a la vista.
    window.__oculta = false;
    Object.defineProperty(Document.prototype, "visibilityState", {
      configurable: true, get: () => (window.__oculta ? "hidden" : "visible"),
    });
    Object.defineProperty(Document.prototype, "hidden", {
      configurable: true, get: () => window.__oculta,
    });
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  const t = { mod, p, refrescos: 0 };
  p.on("request", (r) => {
    if (r.method() === "GET" && r.headers()["rsc"] === "1" && new URL(r.url()).pathname === "/") t.refrescos++;
  });
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  return t;
}
const ocultar = (t, si) =>
  t.p.evaluate((s) => {
    window.__oculta = s;
    document.dispatchEvent(new Event("visibilitychange"));
  }, si);

try {
  const pipeline = await pestaña("Pipeline");
  const oculta = await pestaña("Pipeline");
  const bandeja = await pestaña("Inbox");
  const todas = [pipeline, oculta, bandeja];
  await espera(2500);
  await ocultar(oculta, true);
  await espera(500);
  const contar = () => todas.map((t) => t.refrescos);
  const cero = () => todas.forEach((t) => (t.refrescos = 0));

  // ══════════════════════════════════════════════════════════════════════════
  console.log("── 1. LOS TILDES DE UN MENSAJE: SÓLO LA BANDEJA ──");
  // ══════════════════════════════════════════════════════════════════════════
  cero();
  await avisar("mensajes", "UPDATE");
  await avisar("conversaciones", "UPDATE");
  await espera(4000);
  const [p1, o1, b1] = contar();
  es("EL PIPELINE NO REFRESCÓ POR UN TILDE", p1, 0);
  es("la oculta tampoco", o1, 0);
  es("la bandeja sí, una vez", b1, 1);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. UN MENSAJE NUEVO: TODAS LAS QUE ESTÁN A LA VISTA ──");
  // ══════════════════════════════════════════════════════════════════════════
  cero();
  await avisar("mensajes", "INSERT");
  await espera(4000);
  const [p2, o2, b2] = contar();
  es("el Pipeline refrescó (el globito de no leídos)", p2, 1);
  es("la bandeja refrescó", b2, 1);
  es("LA OCULTA NO", o2, 0);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. UN LEAD MOVIDO: IGUAL ──");
  // ══════════════════════════════════════════════════════════════════════════
  cero();
  await avisar("oportunidades", "UPDATE");
  await espera(4000);
  const [p3, o3, b3] = contar();
  es("el Pipeline refrescó", p3, 1);
  es("la bandeja refrescó", b3, 1);
  es("LA OCULTA NO", o3, 0);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 4. LA OCULTA, AL VOLVER A MIRARLA, SE PONE AL DÍA UNA VEZ ──");
  // ══════════════════════════════════════════════════════════════════════════
  cero();
  await ocultar(oculta, false);
  await espera(3500);
  es("refrescó una vez, no una por cada cambio que se perdió", oculta.refrescos, 1);
  es("y las otras no", [pipeline.refrescos, bandeja.refrescos], [0, 0]);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 5. NO TODAS EN EL MISMO INSTANTE ──");
  // ══════════════════════════════════════════════════════════════════════════
  // Diez avisos sueltos; se mira cuánto se separan los refrescos de las dos a la vista.
  const momentos = { a: [], b: [] };
  const mirar = (t, l) => t.p.on("request", (r) => {
    if (r.headers()["rsc"] === "1" && new URL(r.url()).pathname === "/") l.push(Date.now());
  });
  mirar(pipeline, momentos.a);
  mirar(bandeja, momentos.b);
  for (let i = 0; i < 6; i++) {
    await avisar("oportunidades", "UPDATE");
    await espera(2500);
  }
  const pares = Math.min(momentos.a.length, momentos.b.length);
  const separaciones = Array.from({ length: pares }, (_, i) => Math.abs(momentos.a[i] - momentos.b[i]));
  console.log(`   separación entre las dos, en ms: ${separaciones.join(", ")}`);
  es("se reparten: no salen siempre en el mismo instante", separaciones.some((s) => s > 150), true);
} finally {
  await nav.close();
  rt.kill();
  await espera(300);
  // Se deja el banco como estaba.
  spawn("sh", ["-c", "nohup node realtime.js > realtime.log 2>&1 &"], { cwd: BANCO, detached: true, stdio: "ignore" }).unref();
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
