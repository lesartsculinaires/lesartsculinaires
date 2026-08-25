/**
 * Clientes completo, tablero propio: ¿se cumplen las dos a la vez?
 *
 *     node supabase/pruebas/banco/prueba-pipeline-solo-propios.mjs
 *
 * Es una combinación que no existía: la persona puede buscar a cualquier
 * cliente —para no llamar dos veces a la misma, para ver si ya lo atendió
 * otro— y a la vez su tablero es el suyo, sin los leads de los demás encima.
 *
 * Las dos mitades hay que probarlas juntas porque cada una sola se puede
 * cumplir rompiendo la otra: filtrar de más deja al asesor sin poder buscar, y
 * filtrar de menos le devuelve el tablero de toda la escuela.
 *
 * Y una tercera que es la trampa: si la persona no tiene ficha de vendedor, no
 * se filtra nada. Filtrar contra un vendedor que no existe dejaría el tablero
 * vacío sin explicación, y un tablero vacío se lee como «se perdieron los
 * leads».
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-solo-propios-${process.pid}.sql`);
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

if (sql("select count(*) from information_schema.columns where table_name='roles' and column_name='pipeline_solo_propios';") !== "1") {
  console.error("Falta la columna. Corré 20260929120000_pipeline_solo_propios.sql.");
  process.exit(1);
}

/*
 * Gente propia, no la del banco.
 *
 * Se entra con el token de Ale, así que el usuario tiene que ser Ale: cuando
 * esto se buscaba con un «el primero que no sea admin» y se entraba igual con
 * su token, la prueba le cambiaba el rol a una y miraba la pantalla de otra.
 */
const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const ALE = subDe("jwt-ale.txt");

const ROL_ORIGINAL = sql(`select rol_id from public.usuarios where id='${ALE}';`);
const SU_VENDEDOR = sql(`select id from public.vendedores where usuario_id='${ALE}' limit 1;`);

const limpiar = `
  delete from public.oportunidades where codigo in ('SP-MIO','SP-AJENO');
  delete from public.clientes where nombre like 'SP %';
  delete from public.rol_permisos where rol_id in
    (select id from public.roles where nombre = 'PRUEBA secundario');
  delete from public.roles where nombre = 'PRUEBA secundario';
`;
sql(limpiar);

// Un rol descartable con las dos casillas: ve todo, pero tablero propio.
sql(`
  insert into public.roles (nombre, descripcion, activo, es_admin, ve_todo, pipeline_solo_propios)
  values ('PRUEBA secundario', 'rol de prueba', true, false, true, true);
`);
const ROL = sql("select id from public.roles where nombre='PRUEBA secundario';");

// Otro vendedor, para que exista un lead que no es suyo.
const OTRO = sql(`
  select id from public.vendedores where usuario_id is distinct from '${ALE}'
     and activo limit 1;
`);

sql(`
  insert into public.clientes (nombre, telefono) values ('SP cliente mio','70977001');
  insert into public.clientes (nombre, telefono) values ('SP cliente ajeno','70977002');
  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'SP-MIO', id, ${SU_VENDEDOR}, (select id from public.etapas order by orden limit 1), current_date
    from public.clientes where nombre='SP cliente mio';
  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'SP-AJENO', id, ${OTRO}, (select id from public.etapas order by orden limit 1), current_date
    from public.clientes where nombre='SP cliente ajeno';

  update public.usuarios set rol_id = ${ROL} where id = '${ALE}';
`);

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-ale.txt", "utf8")
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
      user: { id: ALE, email: "ale@lac.test" },
    }),
  ).toString("base64");

const mirar = async (modulo) => {
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
  await p.waitForTimeout(2200);
  await p.locator(`aside button[data-mod="${modulo}"]`).click();
  await p.waitForTimeout(2000);
  const texto = (await p.evaluate(() => document.querySelector("main")?.innerText ?? "")).replace(
    /\s+/g,
    " ",
  );
  await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/solo-propios-${modulo}.png` });
  await nav.close();
  return texto;
};

console.log("── en Clientes: los ve a todos ──");
{
  const t = await mirar("Clientes");
  es("ve el suyo", /SP-MIO/.test(t), true);
  es("Y TAMBIÉN EL AJENO", /SP-AJENO/.test(t), true);
}

console.log("\n── en Pipeline: sólo el suyo ──");
{
  const t = await mirar("Pipeline");
  es("está el suyo", /SP cliente mio/.test(t), true);
  es("Y NO ESTÁ EL AJENO", /SP cliente ajeno/.test(t), false);
}

console.log("\n── sin ficha de vendedor no se filtra nada ──");
{
  // Es el borde peligroso: filtrar contra un vendedor inexistente vaciaría el
  // tablero, y eso se lee como que se perdieron los leads.
  sql(`update public.vendedores set usuario_id = null where id = ${SU_VENDEDOR};`);
  const t = await mirar("Pipeline");
  es("VE TODO, EN VEZ DE VER NADA", /SP cliente ajeno/.test(t), true);
  sql(`update public.vendedores set usuario_id = '${ALE}' where id = ${SU_VENDEDOR};`);
}

console.log("\n── y sin la casilla, el tablero vuelve a ser completo ──");
{
  sql(`update public.roles set pipeline_solo_propios = false where id = ${ROL};`);
  const t = await mirar("Pipeline");
  es("está el ajeno otra vez", /SP cliente ajeno/.test(t), true);
}

// Devolver a Ale a su rol y borrar lo de la prueba.
sql(`update public.usuarios set rol_id = ${ROL_ORIGINAL} where id = '${ALE}';`);
sql(limpiar);
es(
  "el rol de prueba no quedó dando vueltas",
  sql("select count(*) from public.roles where nombre='PRUEBA secundario';"),
  "0",
);
es(
  "y Ale volvió a su rol",
  sql(`select rol_id from public.usuarios where id='${ALE}';`),
  ROL_ORIGINAL,
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
