/**
 * Destildar un módulo en Roles, ¿se lo saca de la barra a esa gente?
 *
 *     node supabase/pruebas/banco/prueba-modulos-por-rol.mjs
 *
 * La casilla «ver» de Usuarios y Roles se guardaba bien desde siempre, pero
 * nadie la leía: la barra dibujaba los trece módulos para todo el mundo. O
 * sea que se podía destildar Bases para Ventas, guardar, y no pasaba nada. Un
 * control que no hace nada es peor que no tenerlo, porque quien lo usa se
 * queda creyendo que configuró algo.
 *
 * Lo que se comprueba es el circuito entero y los dos bordes que lo hacen
 * seguro:
 *
 *   1. Que destildar saque el módulo de la barra de esa persona.
 *   2. QUE NO SE LO SAQUE A DIRECCIÓN. Si dirección pudiera esconderse
 *      «Usuarios y Roles» a sí misma, se quedaría sin forma de volver a entrar
 *      a arreglarlo.
 *   3. Que un rol sin nada configurado siga viendo todo.
 *
 * Y una cosa que no se prueba acá porque no es cierta: esto no protege datos.
 * Esconder una pantalla ordena la barra; quién puede ver qué información lo
 * deciden las políticas de la base, que no se enteran de esta lista.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-modulos-${process.pid}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
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

/*
 * Quién es cada una sale del propio token con el que se va a entrar.
 *
 * Antes se buscaba «un usuario cuyo rol no sea admin, el primero» y después se
 * entraba siempre con el token de Ale. Cuando esa consulta devolvía a Huri, la
 * prueba le cambiaba el rol a una y miraba la pantalla de la otra: fallaba
 * saltado, sin un patrón, y dejaba a Huri en un rol de prueba que después se
 * borraba. El token es la única fuente que no puede discrepar con la sesión.
 */
const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};

const ASESORA = subDe("jwt-ale.txt");
const DIRECCION = subDe("jwt-jefa.txt");
/*
 * Un rol descartable, en vez de tocar el de Ventas.
 *
 * La primera versión editaba los permisos del rol real y los devolvía al
 * terminar. Andaba sola y fallaba en fila: cualquier corte dejaba a Ventas con
 * módulos en «no ver», y la prueba siguiente —que no tiene nada que ver con
 * esto— se encontraba a la asesora sin la pantalla de Clientes. Una prueba que
 * puede romper a otra no está aislada, y restaurar al final no alcanza porque
 * justamente cuando falla es cuando no restaura.
 *
 * Con un rol propio no hay nada que devolver: se crea, se usa y se borra. Y de
 * paso empieza sin ningún permiso guardado, que es el caso «nadie decidió
 * nada» que hay que probar igual.
 */
const ROL_ASESORA = sql(`
  delete from public.rol_permisos where rol_id in
    (select id from public.roles where nombre = 'PRUEBA modulos');
  delete from public.roles where nombre = 'PRUEBA modulos';
  insert into public.roles (nombre, descripcion, activo, es_admin)
  values ('PRUEBA modulos', 'rol de prueba, se borra solo', true, false);
  select id from public.roles where nombre = 'PRUEBA modulos';
`).split("\n").filter(Boolean).pop();

const ROL_ORIGINAL = sql(`select rol_id from public.usuarios where id='${ASESORA}';`);
sql(`update public.usuarios set rol_id = ${ROL_ASESORA} where id = '${ASESORA}';`);

const ROL_DIRECCION = sql(`select rol_id from public.usuarios where id='${DIRECCION}';`);
const DIR_ANTES = sql(`
  select coalesce(string_agg(modulo || '|' || ver, ';' order by modulo), '')
    from public.rol_permisos where rol_id = ${ROL_DIRECCION};
`);

/** Los módulos que dibuja la barra, en orden. */
const enLaBarra = async (p) =>
  await p.locator("aside nav button[data-mod]").evaluateAll((bs) =>
    bs.map((b) => b.getAttribute("data-mod")),
  );

const abrir = async (quien, archivo, correo) => {
  const jwt = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
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
        user: { id: quien, email: correo },
      }),
    ).toString("base64");

  const nav = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
  await ctx.addInitScript((h) => {
    try {
      localStorage.setItem("lac.reservas.visto", h);
    } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2400);
  return { nav, p };
};

console.log("── un rol sin nada configurado ──");
{
  const { nav, p } = await abrir(ASESORA, "jwt-ale.txt", "ale@lac.test");
  const barra = await enLaBarra(p);
  es("la asesora ve Bases", barra.includes("Bases"), true);
  es("y Programas", barra.includes("Programas"), true);
  es("pero no Usuarios y Roles, que es de dirección", barra.includes("Usuarios y Roles"), false);
  await nav.close();
}

console.log("\n── dirección destilda Bases y Programas para Ventas ──");
sql(`
  insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
  values (${ROL_ASESORA}, 'bases', false, false, false, false),
         (${ROL_ASESORA}, 'programas', false, false, false, false)
      on conflict (rol_id, modulo) do update set ver = excluded.ver;
`);
{
  const { nav, p } = await abrir(ASESORA, "jwt-ale.txt", "ale@lac.test");
  const barra = await enLaBarra(p);
  console.log(`   (barra: ${barra.join(", ")})`);
  es("YA NO VE BASES", barra.includes("Bases"), false);
  es("NI PROGRAMAS", barra.includes("Programas"), false);
  es("pero sigue viendo Clientes", barra.includes("Clientes"), true);
  es("y Pipeline", barra.includes("Pipeline"), true);
  await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/modulos-rol.png" });
  await nav.close();
}

console.log("\n── y si estaba parada en el módulo que le sacaron ──");
{
  const { nav, p } = await abrir(ASESORA, "jwt-ale.txt", "ale@lac.test");
  await p.goto("http://127.0.0.1:3142/?mod=Bases", { waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  const t = (await p.evaluate(() => document.querySelector("main")?.innerText ?? "")).slice(0, 60);
  es("NO SE QUEDA EN UNA PANTALLA QUE YA NO TIENE", /Bases/.test(t.split("\n")[0] ?? ""), false);
  console.log(`   (cayó en: ${t.split("\n").filter(Boolean)[1] ?? t.slice(0, 30)})`);
  await nav.close();
}

console.log("\n── dirección, aunque se lo destilden a su propio rol ──");
sql(`
  insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
  values (${ROL_DIRECCION}, 'usuarios', false, false, false, false),
         (${ROL_DIRECCION}, 'bases', false, false, false, false)
      on conflict (rol_id, modulo) do update set ver = excluded.ver;
`);
{
  const { nav, p } = await abrir(DIRECCION, "jwt-jefa.txt", "jefa@lac.test");
  const barra = await enLaBarra(p);
  es("SIGUE VIENDO USUARIOS Y ROLES", barra.includes("Usuarios y Roles"), true);
  es("y Bases", barra.includes("Bases"), true);
  await nav.close();
}

// Devolver a la asesora a su rol y borrar el descartable.
sql(`
  update public.usuarios set rol_id = ${ROL_ORIGINAL} where id = '${ASESORA}';
  delete from public.rol_permisos where rol_id = ${ROL_ASESORA};
  delete from public.roles where id = ${ROL_ASESORA};
`);

// Y lo de dirección, que sí es un rol de verdad, tal cual estaba.
sql(`delete from public.rol_permisos where rol_id = ${ROL_DIRECCION};`);
if (DIR_ANTES) {
  const filas = DIR_ANTES.split(";").filter(Boolean).map((l) => {
    const [modulo, ver] = l.split("|");
    // «true», no «t»: al concatenar con `||`, Postgres rinde el booleano
    // entero. Comparando contra «t» todo daba falso y la restauración dejaba a
    // dirección sin ver nada, que es justo lo contrario de restaurar.
    return `(${ROL_DIRECCION}, '${modulo}', ${ver === "true"}, false, false, false)`;
  });
  sql(`insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
       values ${filas.join(",")};`);
}

es(
  "LOS PERMISOS DE DIRECCIÓN QUEDARON COMO ESTABAN",
  sql(`select coalesce(string_agg(modulo || '|' || ver, ';' order by modulo), '')
         from public.rol_permisos where rol_id = ${ROL_DIRECCION};`),
  DIR_ANTES,
);
es(
  "y el rol de prueba no quedó dando vueltas",
  sql("select count(*) from public.roles where nombre = 'PRUEBA modulos';"),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
