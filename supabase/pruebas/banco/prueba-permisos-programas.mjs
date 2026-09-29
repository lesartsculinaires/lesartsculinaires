/**
 * Las casillas de Programas ahora mandan de verdad.
 *
 *     node supabase/pruebas/banco/prueba-permisos-programas.mjs
 *
 * ============================================================================
 * LO QUE REPORTÓ LA ESCUELA, DOS VECES
 * ============================================================================
 *
 * «Jefe de Ventas tiene los permisos de Programas marcados y no puede crear ni
 * editar.» La primera respuesta fue quitar las casillas, porque mentían: la
 * política de la base —`productos_administrar`— pide `es_admin()` y no mira
 * `rol_permisos`, así que marcarlas no habilitaba nada.
 *
 * Ésta es la respuesta de verdad. El permiso se comprueba en el servidor y la
 * escritura va con la llave de servicio, así que la casilla vale.
 *
 * ESO MUEVE EL GUARDIÁN DE LA BASE AL SERVIDOR, y por eso esta prueba no mira
 * sólo si el botón aparece. Un botón escondido no protege nada —la acción se
 * puede invocar sin pasar por la pantalla— así que lo que hay que asegurar es
 * que la ACCIÓN diga que no.
 *
 * ============================================================================
 * Y LO QUE NO SE HABILITÓ
 * ============================================================================
 *
 * Dar de baja sigue siendo de dirección, por decisión de la escuela al
 * habilitar las otras dos: renombrar cambia cómo se lee un programa, darlo de
 * baja lo saca de todos los desplegables y desde ahí nadie puede asignarlo.
 *
 * Viajan en el mismo formulario y en el mismo `update`, así que es justo el
 * caso que se rompe solo al tocar el código.
 *
 * Necesita el banco armado (`armar.sh`).
 */
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = "/home/user/lesartsculinaires";

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {
    encoding: "utf8",
  }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const PROGRAMA = "PRUEBA Permisos Programa";
const RENOMBRADO = "PRUEBA Permisos Renombrado";

/** El rol que reportó la escuela, que existe en el banco y no es admin. */
const ROL = sql(`select id from roles where nombre ilike 'jefe de ventas' limit 1`);
const ROL_VIEJO = sql(`select rol_id from usuarios where correo='ale@lac.test'`);

const limpiar = () => {
  sql(`delete from productos where nombre in ('${PROGRAMA}', '${RENOMBRADO}')`);
  sql(`update usuarios set rol_id=${ROL_VIEJO || "null"} where correo='ale@lac.test'`);
  sql(`delete from rol_permisos where rol_id=${ROL} and modulo in ('programas','clientes')`);
};
limpiar();

sql(`insert into productos (nombre, categoria) values ('${PROGRAMA}', 'Curso corto')`);

/*
 * El rol con las casillas marcadas, tal como lo dejó la escuela: crear y
 * editar sí, eliminar no. Y Ale pasa a tenerlo, para mirar con sus ojos.
 */
sql(
  `insert into rol_permisos (rol_id, modulo, ver, crear, editar, eliminar) values ` +
    `(${ROL}, 'programas', true, true, true, false), ` +
    `(${ROL}, 'clientes', true, true, true, false) ` +
    `on conflict (rol_id, modulo) do update set ver=excluded.ver, crear=excluded.crear, ` +
    `editar=excluded.editar, eliminar=excluded.eliminar`,
);
sql(`update usuarios set rol_id=${ROL} where correo='ale@lac.test'`);

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
  `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-permisos.log 2>&1 < /dev/null &)`,
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

const galleta = (() => {
  const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-ale.txt`, "utf8").trim();
  return (
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "x",
        user: { id: subDe("jwt-ale.txt"), email: "ale@lac.test" },
      }),
    ).toString("base64")
  );
})();

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/permisos-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. CON LA CASILLA MARCADA, LOS BOTONES ESTÁN ──");
// ══════════════════════════════════════════════════════════════════════════
await p.locator('aside button[data-mod="Programas"]').click();
await p.waitForTimeout(2200);
await foto("1-programas");

{
  const crear = p.getByRole("button", { name: /Nuevo programa|\+ Programa/i });
  es("APARECE EL BOTÓN DE CREAR", (await crear.count()) >= 1, true);
  es(
    "y el lápiz de editar en cada programa",
    (await p.getByRole("button", { name: `Editar ${PROGRAMA}` }).count()) >= 1,
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. Y EDITAR FUNCIONA DE VERDAD ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * Que el botón aparezca no prueba nada: hasta ayer aparecía para dirección y
 * la base rechazaba a los demás. Lo que importa es que el cambio ENTRE.
 */
{
  await p.getByRole("button", { name: `Editar ${PROGRAMA}` }).first().click();
  await p.waitForTimeout(1200);

  const nombre = p.locator('input[value="' + PROGRAMA + '"]');
  await nombre.first().fill(RENOMBRADO);
  await p.waitForTimeout(400);
  await foto("2-editando");

  await p.getByRole("button", { name: /^Guardar/ }).first().click();
  await p.waitForTimeout(3000);

  es(
    "EL CAMBIO QUEDÓ EN LA BASE",
    sql(`select count(*) from productos where nombre='${RENOMBRADO}'`),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. PERO DAR DE BAJA NO ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * Es el caso que se rompe solo: viaja en el mismo formulario y en el mismo
 * `update` que el nombre. Sin una comprobación aparte, habilitar «editar»
 * regalaría «dar de baja».
 */
{
  await p.getByRole("button", { name: `Editar ${RENOMBRADO}` }).first().click();
  await p.waitForTimeout(1200);

  await p.getByRole("checkbox", { name: /Dar de baja/i }).first().check();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /^Guardar/ }).first().click();
  await p.waitForTimeout(3000);
  await foto("3-baja-rechazada");

  es(
    "EL PROGRAMA SIGUE ACTIVO",
    sql(`select activo from productos where nombre='${RENOMBRADO}'`),
    "t",
  );

  const dicho = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("y se dice por qué, no falla en silencio", /permiso para dar de baja/i.test(dicho), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. SIN LA CASILLA, NO HAY NADA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(`update rol_permisos set crear=false, editar=false where rol_id=${ROL} and modulo='programas'`);

  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod="Programas"]').click();
  await p.waitForTimeout(2200);
  await foto("4-sin-permiso");

  es(
    "no hay botón de crear",
    await p.getByRole("button", { name: /Nuevo programa|\+ Programa/i }).count(),
    0,
  );
  es(
    "ni lápiz de editar",
    await p.getByRole("button", { name: `Editar ${RENOMBRADO}` }).count(),
    0,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. Y EL BOTÓN DE FICHAS DE PAUTA SIGUE LA MISMA REGLA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2200);
  es(
    "con «editar clientes» marcado, aparece",
    await p.locator("[data-completar-pauta]").count(),
    1,
  );

  sql(`update rol_permisos set editar=false where rol_id=${ROL} and modulo='clientes'`);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2200);

  es("y sin la casilla, no", await p.locator("[data-completar-pauta]").count(), 0);
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from productos where nombre in ('${PROGRAMA}','${RENOMBRADO}')`),
  "0",
);
es(
  "y Ale volvió a su rol",
  sql(`select coalesce(rol_id::text,'-') from usuarios where correo='ale@lac.test'`),
  ROL_VIEJO || "-",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
