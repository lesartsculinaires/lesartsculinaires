/**
 * Un rol que SÓLO ve Canales e Inbox: el del revisor de Meta.
 *
 *     node supabase/pruebas/banco/prueba-rol-revisor.mjs
 *
 * ============================================================================
 * PARA QUÉ EXISTE ESTE ROL
 * ============================================================================
 *
 * Meta aprueba `instagram_manage_messages` después de mandar a una persona a
 * probar el producto, y esa persona tiene que conectar su propia cuenta de
 * Instagram desde el CRM y escribirse un mensaje.
 *
 * La alternativa era darle una cuenta de administrador. Eso funciona y es
 * desproporcionado: un revisor que entra una tarde a probar un botón no tiene
 * por qué ver los clientes, el pipeline ni las conversaciones de la escuela.
 *
 * ============================================================================
 * LO QUE SE PRUEBA, Y POR QUÉ CADA COSA
 * ============================================================================
 *
 *   VE LO JUSTO              Canales para conectar, Inbox para ver llegar el
 *                            mensaje y contestarlo. Nada más.
 *
 *   Y SOBRE TODO: SIN LA     El resto del CRM deja ver por omisión —un rol sin
 *   CASILLA, NO ENTRA        fila para un módulo lo ve igual—. Para Canales eso
 *                            sería regalarle a cualquier rol futuro la llave de
 *                            la mensajería. Acá se comprueba al revés: se le
 *                            quita la fila y la pantalla tiene que desaparecer.
 *
 *   LA PUERTA ESTÁ EN LA     Un botón escondido no protege nada: la dirección
 *   ACCIÓN, NO EN EL BOTÓN   se escribe a mano. Así que se llama a
 *                            `/api/meta/conectar` sin permiso y tiene que
 *                            rebotar.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación compilada.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = "/home/user/lesartsculinaires";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-revisor-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
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

const ROL_VIEJO = sql(`select coalesce(rol_id::text,'null') from usuarios where correo='ale@lac.test'`);

const limpiar = () => {
  sql(`
    update usuarios set rol_id=${ROL_VIEJO === "null" ? "null" : ROL_VIEJO} where correo='ale@lac.test';
    delete from rol_permisos where rol_id in (select id from roles where nombre='PRUEBA Revisor');
    delete from roles where nombre='PRUEBA Revisor';
  `);
};
limpiar();

/*
 * El rol, tal como quedaría en producción.
 *
 * Lo importante es que CADA módulo del catálogo lleve su fila con `ver` en
 * falso. Sin eso, un rol nuevo ve TODO el CRM: la omisión del sistema es
 * permisiva, y un rol que se arma «dejando las casillas vacías» no restringe
 * nada. Es el error que este rol no se puede permitir.
 */
sql(`
  insert into roles (nombre, descripcion, activo, es_admin, ve_todo, recibe_leads)
  values ('PRUEBA Revisor', 'Sólo conecta canales. Para la revisión de Meta.', true, false, false, false);

  insert into rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
  select r.id, m.clave, false, false, false, false
  from roles r, modulos m
  where r.nombre = 'PRUEBA Revisor';

  update rol_permisos set ver=true, crear=true
  where modulo in ('inbox','canales')
    and rol_id = (select id from roles where nombre='PRUEBA Revisor');

  update usuarios set rol_id=(select id from roles where nombre='PRUEBA Revisor')
  where correo='ale@lac.test';
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
execSync(`cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-revisor.log 2>&1 < /dev/null &)`, {
  shell: "/bin/bash",
});
{
  let vivo = false;
  for (let i = 0; i < 40; i++) {
    const code = execSync(
      "curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
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

let falloDuro = null;
try {
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
  const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/revisor-${n}.png` });

  const pantallas = async () =>
    (await p.locator("aside button[data-mod]").evaluateAll((bs) =>
      bs.map((b) => b.getAttribute("data-mod")),
    )) ?? [];

  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. EL REVISOR VE CANALES E INBOX, Y NADA MÁS ──");
  // ══════════════════════════════════════════════════════════════════════
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });

  await p.waitForTimeout(2800);
  await foto("1-barra");

  {
    const ve = await pantallas();
    console.log(`   ve: ${ve.join(", ")}`);
    es("VE INBOX", ve.includes("Inbox"), true);
    es("VE CANALES", ve.includes("Canales"), true);
    es("y no ve Clientes", ve.includes("Clientes"), false);
    es("ni Pipeline", ve.includes("Pipeline"), false);
    es("ni Programas", ve.includes("Programas"), false);
    es("ni Usuarios y Roles", ve.includes("Usuarios y Roles"), false);
    es("ni Fríos, que era la que se escapaba", ve.includes("Fríos"), false);
    es("SON SÓLO DOS PANTALLAS", ve.length, 2);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. Y PUEDE CONECTAR, QUE ES A LO QUE ENTRA ──");
  // ══════════════════════════════════════════════════════════════════════
  {
    await p.locator('aside button[data-mod="Canales"]').click();
    await p.waitForTimeout(2400);
    await foto("2-canales");

    es(
      "la pantalla carga para él",
      await p.locator('[data-canal="instagram"]').count(),
      1,
    );
    es(
      "con el botón de conectar",
      await p.locator('[data-conectar-meta="instagram"]').count(),
      1,
    );
    es(
      "y no se le ofrece desconectar lo de la escuela",
      await p.locator("[data-desconectar]").count(),
      0,
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 3. SIN LA CASILLA NO ENTRA, AUNQUE NO HAYA FILA ──");
  // ══════════════════════════════════════════════════════════════════════
  /*
   * Se BORRA la fila en vez de ponerla en falso, que es el caso que importa:
   * el resto del CRM, sin fila, deja ver. Si Canales se comportara igual,
   * cualquier rol creado mañana aparecería con la llave de la mensajería.
   */
  {
    sql(`
      delete from rol_permisos
      where modulo='canales' and rol_id=(select id from roles where nombre='PRUEBA Revisor');
    `);

    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(2800);
    await foto("3-sin-casilla");

    const ve = await pantallas();
    es("DESAPARECIÓ CANALES", ve.includes("Canales"), false);
    es("y sigue viendo Inbox", ve.includes("Inbox"), true);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 4. Y LA PUERTA ESTÁ EN LA ACCIÓN, NO EN EL BOTÓN ──");
  // ══════════════════════════════════════════════════════════════════════
  /*
   * Esconder el botón no protege nada: la dirección se puede escribir a mano.
   * Con el permiso quitado, entrar directo a `/api/meta/conectar` tiene que
   * rebotar sin mandar a nadie al diálogo de Facebook.
   */
  {
    const salida = execSync(
      `curl -s --noproxy '*' -o /dev/null -D - -b 'sb-127-auth-token=${galleta}' 'http://127.0.0.1:3142/api/meta/conectar'`,
      { encoding: "utf8", shell: "/bin/bash", maxBuffer: 10 * 1024 * 1024 },
    );
    const destino = /^location:\s*(.+)$/im.exec(salida)?.[1]?.trim() ?? "";
    console.log(`   lo mandó a: ${destino.slice(0, 90)}`);
    es("NO LLEGA AL DIÁLOGO DE FACEBOOK", /dialog\/oauth/.test(destino), false);
    es("y se le dice que no tiene permiso", /conectar=sin_permiso/.test(destino), true);
  }
} catch (e) {
  falloDuro = e;
} finally {
  await nav.close();
  limpiar();
}

if (falloDuro) throw falloDuro;

es(
  "Ale volvió a su rol",
  sql(`select coalesce(rol_id::text,'null') from usuarios where correo='ale@lac.test'`),
  ROL_VIEJO,
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
