/**
 * Con Supabase sin contestar, el CRM contesta igual.
 *
 *     node supabase/pruebas/banco/prueba-supabase-sin-contestar.mjs
 *
 * ============================================================================
 * LO QUE VIO LA ESCUELA
 * ============================================================================
 *
 *     This edge function has crashed
 *     the edge function timed out
 *
 * Una pantalla de Netlify, sin nada que se pueda hacer, en lugar del CRM.
 *
 * La «edge function» es `src/middleware.ts`: corre en el borde, antes que
 * cualquier página y en CADA petición, y lo único que hace es preguntarle a
 * Supabase quién es esta persona. Esa espera no tenía plazo. Si Supabase se
 * demoraba —por ejemplo en medio de una campaña masiva, que son miles de
 * consultas contra el mismo Supabase— la función esperaba hasta que Netlify la
 * mataba, y se quedaba sin CRM TODO EL MUNDO, no sólo quien mandaba la campaña.
 *
 * ============================================================================
 * CÓMO SE PRUEBA SIN NETLIFY
 * ============================================================================
 *
 * Poniendo en el 3141 —donde el CRM cree que está Supabase— un servidor que
 * acepta la conexión y NO CONTESTA NUNCA. Es el caso peor y el que se vio: no
 * «conexión rechazada», que falla rápido, sino una espera sin final.
 *
 * Después se mide lo único que importa: cuánto tarda el CRM en contestar algo.
 *
 *     ANTES   no contesta; en Netlify eso es la pantalla de la función muerta
 *     AHORA   contesta en unos tres segundos, que es el plazo del middleware
 *
 * Y se comprueba la otra mitad, que es la que hace que esto sea un arreglo y no
 * un agujero: quien NO trae sesión sigue yendo al login.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación compilada.
 */
import fs from "node:fs";
import http from "node:http";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const BANCO = `${RAIZ}/supabase/pruebas/banco`;

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const subDe = (archivo) => {
  const cuerpo = fs.readFileSync(`${BANCO}/${archivo}`, "utf8").trim().split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};

const galleta = (() => {
  const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
  return (
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "x",
        user: { id: subDe("jwt-jefa.txt"), email: "jefa@lac.test" },
      }),
    ).toString("base64")
  );
})();

/** Pide una página y devuelve el código y cuánto tardó, sin colgarse. */
const pedir = (ruta, conGalleta, tope = 30) => {
  const cabecera = conGalleta ? `-H 'cookie: sb-127-auth-token=${galleta}'` : "";
  const t = Date.now();
  const code = execSync(
    `curl -s -o /dev/null --noproxy '*' --max-time ${tope} -w '%{http_code}' ${cabecera} ` +
      `'http://127.0.0.1:3142${ruta}' || echo TIMEOUT`,
    { encoding: "utf8", shell: "/bin/bash" },
  ).trim();
  return { code: /TIMEOUT/.test(code) ? "TIMEOUT" : code, ms: Date.now() - t };
};

/*
 * La página que se usa para mirar el middleware SOLO.
 *
 * Con `?fin=1` el login no le pregunta a Supabase quién es —es la pantalla de
 * «sesión cerrada»— así que es la única ruta que pasa por el middleware y
 * después NO toca Supabase. Cualquier otra mezclaría dos esperas y no se
 * sabría cuál de las dos se arregló.
 */
const SOLO_MIDDLEWARE = "/login?fin=1";

// ── que la aplicación esté viva antes de romper nada ───────────────────────

{
  const r = pedir("/login", false);
  if (r.code !== "200") {
    throw new Error(`La aplicación no está andando en el 3142 (dio ${r.code}). Armá el banco.`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. CON SUPABASE SANO, TODO COMO SIEMPRE ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const sinSesion = pedir("/", false);
  es("sin sesión, al login", [sinSesion.code, sinSesion.ms < 8000], ["307", true]);

  const conSesion = pedir("/", true);
  es("con sesión, entra al CRM", [conSesion.code, conSesion.ms < 15000], ["200", true]);
}

// ── ahora Supabase deja de contestar ───────────────────────────────────────

/*
 * El proxy del banco se apaga y en su lugar queda un servidor mudo: acepta la
 * conexión, se queda con ella, y no contesta jamás.
 */
execSync('pkill -f "node [p]xv.js" 2>/dev/null || true', { shell: "/bin/bash" });
execSync("sleep 1");

const colgadas = [];
const mudo = http.createServer((req, res) => {
  // Ni responder ni cerrar: exactamente lo que hace un servidor saturado.
  colgadas.push(res);
});
await new Promise((listo) => mudo.listen(3141, "127.0.0.1", listo));

let falloDuro = null;
try {
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. SUPABASE MUDO: EL CRM TIENE QUE CONTESTAR IGUAL ──");
  // ════════════════════════════════════════════════════════════════════════
  /*
   * ES LA PRUEBA DEL ARREGLO. Sin el plazo, esto no contesta nunca —acá se
   * agota el `--max-time` de curl y en Netlify sale la pantalla de la función
   * muerta—. Con el plazo, contesta en unos tres segundos.
   */
  {
    const r = pedir(SOLO_MIDDLEWARE, true);
    console.log(`   tardó ${r.ms} ms y devolvió ${r.code}`);
    es("CONTESTA, NO SE CUELGA", r.code !== "TIMEOUT", true);
    es("y contesta pasado el plazo, no antes", r.ms >= 2500 && r.ms < 12000, true);
    es("con una página de verdad", r.code, "200");
  }

  /*
   * Y a quien traía sesión no lo manda al login.
   *
   * Se mira al revés, y es la única forma honesta de mirarlo: un redirect al
   * login llegaría ENSEGUIDA —pasado el plazo del middleware— así que si a los
   * ocho segundos no llegó nada es porque lo dejó pasar y la espera que sigue
   * ya es de la página.
   *
   * QUE LA PÁGINA TAMPOCO PUEDA ES OTRO ASUNTO, y esta prueba no pretende
   * arreglarlo: con Supabase muerto del todo no hay CRM para nadie, haga lo que
   * haga el middleware. Lo que se arregla acá es que la caída se vea como lo
   * que es y no como una función del borde estrellada, que no menciona ni la
   * sesión ni Supabase y no deja nada que hacer.
   */
  {
    const r = pedir("/", true, 8);
    console.log(`   tardó ${r.ms} ms y devolvió ${r.code}`);
    es("NO LO ECHA AL LOGIN: lo deja pasar", r.code !== "307", true);
  }

  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. Y SIN SESIÓN NO SE LE ABRE A NADIE ──");
  // ════════════════════════════════════════════════════════════════════════
  /*
   * La otra mitad. Dejar pasar a quien ya venía trabajando es razonable —las
   * políticas de la base siguen decidiendo qué ve, y con Supabase caído no ve
   * nada—; dejar pasar a quien nunca entró sería otra cosa.
   */
  {
    const r = pedir("/", false);
    console.log(`   tardó ${r.ms} ms y devolvió ${r.code}`);
    es("sin galleta, sigue yendo al login", r.code, "307");
  }
} catch (e) {
  falloDuro = e;
} finally {
  // ── devolver el banco como estaba ────────────────────────────────────────
  for (const res of colgadas) {
    try {
      res.destroy();
    } catch {
      // Ya estaba cerrada.
    }
  }
  await new Promise((listo) => mudo.close(listo));

  execSync(`cd ${BANCO} && (setsid node pxv.js > pxv.log 2>&1 < /dev/null &)`, {
    shell: "/bin/bash",
  });
  for (let i = 0; i < 20; i++) {
    const code = execSync(
      "curl -s -o /dev/null -w '%{http_code}' --noproxy '*' --max-time 5 " +
        "'http://127.0.0.1:3141/rest/v1/vendedores?select=id&limit=1' || true",
      { encoding: "utf8", shell: "/bin/bash" },
    ).trim();
    if (code === "200") break;
    execSync("sleep 1");
  }
}

if (falloDuro) throw falloDuro;

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. Y CUANDO SUPABASE VUELVE, TODO VUELVE ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const r = pedir("/", true);
  es("el CRM anda de nuevo", r.code, "200");
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
