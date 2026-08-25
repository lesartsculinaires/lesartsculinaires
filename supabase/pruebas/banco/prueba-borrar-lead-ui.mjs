/**
 * El botón de borrar leads en Clientes: ¿lo ve quien debe, y confirma antes?
 *
 *     node supabase/pruebas/banco/prueba-borrar-lead-ui.mjs
 *
 * Borrar es lo único de esta pantalla que no se puede deshacer, así que hay
 * tres cosas que tienen que ser ciertas a la vez:
 *
 *   1. Que la asesora NO vea el botón. No alcanza con que la base lo niegue:
 *      un botón que aparece y rebota enseña a desconfiar de los botones.
 *   2. Que dirección lo vea, y que no borre sin preguntar. La ventana muestra
 *      qué leads son, porque «¿borrar 3?» no se puede contestar.
 *   3. QUE CANCELAR NO BORRE NADA. Es la mitad que se olvida de probar, y es
 *      la que decide si la ventana sirve de algo.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-borrar-ui-${process.pid}.sql`);
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
 * Quién es cada una sale del token con el que se va a entrar.
 *
 * Buscarlas con «la primera que no sea admin» y entrar igual con el token de
 * Ale es una trampa que ya mordió tres veces: cuando la consulta devuelve a
 * Huri, la prueba le asigna los leads a una y mira la pantalla de la otra, que
 * por supuesto no los ve. Falla saltado y culpando al código.
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
const VENDEDORA = sql(`select id from public.vendedores where usuario_id='${ASESORA}' limit 1;`);

const limpiar = `
  delete from oportunidades where codigo in ('UI-DEL-1','UI-DEL-2');
  delete from clientes where nombre in ('Borrame Uno','Borrame Dos');
`;
sql(limpiar);
sql(`
  insert into clientes (nombre, telefono) values ('Borrame Uno','70955001');
  insert into clientes (nombre, telefono) values ('Borrame Dos','70955002');
  insert into oportunidades (codigo, cliente_id, etapa_id, fecha_registro, vendedor_id)
  select 'UI-DEL-1', id, (select id from public.etapas order by orden limit 1), current_date, ${VENDEDORA}
    from clientes where nombre='Borrame Uno';
  insert into oportunidades (codigo, cliente_id, etapa_id, fecha_registro, vendedor_id, reserva)
  select 'UI-DEL-2', id, (select id from public.etapas order by orden limit 1), current_date, ${VENDEDORA}, 100
    from clientes where nombre='Borrame Dos';
`);

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
  await p.waitForTimeout(2200);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(1800);
  return { nav, p };
};

/** Marca las casillas de esos códigos. */
const marcar = async (p, codigos) => {
  for (const c of codigos) {
    await p.locator("main table tbody tr").filter({ hasText: c })
      .first().locator('input[type="checkbox"]').check();
    await p.waitForTimeout(300);
  }
};

console.log("── la asesora ──");
{
  const { nav, p } = await abrir(ASESORA, "jwt-ale.txt", "ale@lac.test");
  await marcar(p, ["UI-DEL-1"]);
  es("ve la barra de selección", await p.locator('text=/1 seleccionada/').count(), 1);
  es("PERO NO VE EL BOTÓN DE BORRAR", await p.locator('button:has-text("Borrar")').count(), 0);
  await nav.close();
}

console.log("\n── dirección: cancelar ──");
{
  const { nav, p } = await abrir(DIRECCION, "jwt-jefa.txt", "jefa@lac.test");
  await marcar(p, ["UI-DEL-1", "UI-DEL-2"]);
  es("SÍ VE EL BOTÓN", await p.locator('button:has-text("Borrar")').first().count(), 1);

  await p.locator('button:has-text("Borrar")').first().click();
  await p.waitForTimeout(900);

  const v = p.locator('div[role="dialog"][aria-label*="Confirmar borrado"]');
  es("NO BORRA SOLO: PIDE CONFIRMAR", await v.count(), 1);
  const t = (await v.innerText()).replace(/\s+/g, " ");
  es("dice cuántos son", /Borrar estos 2 leads/.test(t), true);
  es("y nombra cada uno", /UI-DEL-1/.test(t) && /UI-DEL-2/.test(t), true);
  es("avisa que no se puede deshacer", /no se puede deshacer/i.test(t), true);
  es("Y MARCA EL QUE TIENE PLATA", /con plata/.test(t), true);

  await v.locator('button:has-text("Cancelar")').click();
  await p.waitForTimeout(800);
  es("cancelar cierra la ventana", await p.locator('div[role="dialog"][aria-label*="Confirmar borrado"]').count(), 0);
  es(
    "Y NO BORRÓ NADA",
    sql("select count(*) from oportunidades where codigo in ('UI-DEL-1','UI-DEL-2');"),
    "2",
  );
  await nav.close();
}

console.log("\n── dirección: confirmar ──");
{
  const { nav, p } = await abrir(DIRECCION, "jwt-jefa.txt", "jefa@lac.test");
  await marcar(p, ["UI-DEL-1"]);
  await p.locator('button:has-text("Borrar")').first().click();
  await p.waitForTimeout(900);

  const v = p.locator('div[role="dialog"][aria-label*="Confirmar borrado"]');
  es("con uno solo lo dice en singular", /Borrar este lead/.test(await v.innerText()), true);
  await v.locator('button:has-text("Borrar")').click();
  await p.waitForTimeout(3000);

  es("EL LEAD SE BORRÓ", sql("select count(*) from oportunidades where codigo='UI-DEL-1';"), "0");
  es("el otro no se tocó", sql("select count(*) from oportunidades where codigo='UI-DEL-2';"), "1");
  es(
    "LA FICHA DEL CLIENTE QUEDA",
    sql("select count(*) from clientes where nombre='Borrame Uno';"),
    "1",
  );
  es("y lo dice", /1 lead borrado/.test((await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ")), true);
  await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/borrar-lead.png" });
  await nav.close();
}

sql(limpiar);
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
