/**
 * Autorizaciones: la asesora pide desde la ficha, dirección resuelve.
 *
 *     node supabase/pruebas/banco/prueba-autorizaciones.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ SE ESTÁ PROBANDO
 * ------------------------------------------------------------------------
 *
 * El circuito entero, con las dos personas de verdad y en dos navegadores
 * distintos, porque las dos mitades sólo tienen sentido juntas: un pedido que
 * dirección no ve no sirve, y una aprobación que la asesora no ve tampoco.
 *
 * Y las tres reglas de quién ve qué, que son la parte que si se rompe no se
 * nota mirando la pantalla propia:
 *
 *   la asesora NO ve el módulo         la lista es de dirección
 *   la asesora SÍ ve lo suyo en la     si no, el pedido cae en un pozo y
 *     ficha, con el resultado          termina preguntando por WhatsApp
 *   la asesora NO puede aprobar        ni desde la pantalla ni llamando a
 *                                      la base por su cuenta
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-autoriz-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`, {
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

if (sql("select count(*) from information_schema.tables where table_name='autorizaciones_tipo';") !== "1") {
  console.error("Falta la tabla. Corré 20261001120000_autorizaciones.sql.");
  process.exit(1);
}

/*
 * Quién es quién sale del token, no de una consulta.
 *
 * Es la lección de las pruebas anteriores: cuando la persona se buscaba con un
 * «el primero que no sea admin» y se entraba igual con el token de Ale, la
 * prueba le sembraba los datos a una y miraba la pantalla de otra.
 */
const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const ALE = subDe("jwt-ale.txt");
const JEFA = subDe("jwt-jefa.txt");

const MOTIVO = "PRUEBA: pide 15% porque se inscribe con una amiga.";
const TIPO_NUEVO = "PRUEBA autorización nueva";

const limpiar = `
  delete from public.autorizaciones where descripcion like 'PRUEBA:%';
  delete from public.autorizaciones_tipo where nombre like 'PRUEBA %';
`;
sql(limpiar);

// El lead sobre el que se va a pedir: uno de Ale, para que lo tenga a mano.
const LEAD = sql(`
  select o.id from public.oportunidades o
    join public.vendedores v on v.id = o.vendedor_id
   where v.usuario_id = '${ALE}'
   order by o.id limit 1;
`);
const CLIENTE = sql(`
  select c.nombre from public.oportunidades o
    join public.clientes c on c.id = o.cliente_id where o.id = ${LEAD};
`);
console.log(`   (lead ${LEAD} · ${CLIENTE})`);

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
  await p.waitForTimeout(2400);
  return { nav, p };
};

const enLaBarra = async (p) =>
  await p
    .locator("aside nav button[data-mod]")
    .evaluateAll((bs) => bs.map((b) => b.getAttribute("data-mod")));

const foto = (p, n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/autoriz-${n}.png` });

/** Abre la ficha del lead de la prueba desde Clientes. */
const abrirLaFicha = async (p) => {
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(1600);
  await p.getByText(CLIENTE, { exact: false }).first().click();
  await p.waitForTimeout(1800);
};

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 1. la asesora no ve el módulo, pero sí el botón en la ficha ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const { nav, p } = await abrir(ALE, "jwt-ale.txt", "ale@lac.test");

  const barra = await enLaBarra(p);
  es("NO ve Autorizaciones en la barra", barra.includes("Autorizaciones"), false);
  es("pero sigue viendo Clientes", barra.includes("Clientes"), true);

  await abrirLaFicha(p);
  const boton = p.getByRole("button", { name: "Solicitar autorización" });
  es("y en la ficha sí está el botón", await boton.count(), 1);

  // Pedirla: elegir el tipo, escribir el motivo, mandar.
  await boton.click();
  await p.waitForTimeout(900);

  const cuadro = p.getByRole("dialog", { name: "Solicitar autorización" });
  es("se abre el cuadro", await cuadro.count(), 1);

  // Las dos clases van agrupadas, que es como se pidió que se vieran.
  const grupos = await cuadro.locator("optgroup").evaluateAll((gs) =>
    gs.map((g) => g.getAttribute("label")),
  );
  es("con las generales y las específicas separadas", grupos, ["Generales", "Específicas"]);

  await cuadro.locator("textarea").fill(MOTIVO);
  await cuadro.getByRole("button", { name: "Enviar solicitud" }).click();
  await p.waitForTimeout(2000);
  await foto(p, "1-pidio");

  const fila = sql(`
    select estado || '|' || coalesce(oportunidad_id::text, 'sin lead')
      from public.autorizaciones where descripcion = '${MOTIVO}';
  `);
  es("QUEDÓ PEDIDA, PENDIENTE Y SOBRE ESE LEAD", fila, `pendiente|${LEAD}`);

  es(
    "y a nombre de quien la pidió, no de otro",
    sql(`select solicitado_por from public.autorizaciones where descripcion = '${MOTIVO}';`),
    ALE,
  );

  /*
   * Ya se ve en la ficha, con su sello. Sin esto no sabría si se mandó.
   *
   * La comparación va sin distinguir mayúsculas porque el sello se dibuja en
   * versalitas con CSS y `innerText` devuelve lo que se ve —«PENDIENTE»—, no
   * lo que dice el código.
   */
  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("y la ve en la ficha, pendiente", /pendiente/i.test(texto), true);

  await nav.close();
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. dirección la ve, sabe de quién es, y la aprueba ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const { nav, p } = await abrir(JEFA, "jwt-jefa.txt", "jefa@lac.test");

  const barra = await enLaBarra(p);
  es("SÍ ve Autorizaciones en la barra", barra.includes("Autorizaciones"), true);

  await p.locator('aside button[data-mod="Autorizaciones"]').click();
  await p.waitForTimeout(2000);

  const pantalla = (await p.evaluate(() => document.querySelector("main")?.innerText ?? "")).replace(
    /\s+/g,
    " ",
  );
  es("el pedido está en la lista", pantalla.includes(MOTIVO), true);
  es("DICE DE QUÉ CLIENTE ES", pantalla.includes(CLIENTE), true);
  es("y las dos listas del catálogo están", /Generales/.test(pantalla) && /Específicas/.test(pantalla), true);
  await foto(p, "2-lista");

  // Crear una autorización nueva, que es el otro botón que se pidió.
  await p.getByRole("button", { name: "Crear autorización" }).click();
  await p.waitForTimeout(800);
  const alta = p.getByRole("dialog", { name: "Crear autorización" });
  await alta.locator("input").first().fill(TIPO_NUEVO);
  await alta.locator("select").selectOption("especifica");
  await alta.getByRole("button", { name: "Crear autorización" }).click();
  await p.waitForTimeout(2000);

  es(
    "la autorización nueva quedó creada, y específica",
    sql(`select clase from public.autorizaciones_tipo where nombre = '${TIPO_NUEVO}';`),
    "especifica",
  );

  // Aprobarla, con comentario.
  await p.locator('input[placeholder^="Comentario"]').first().fill("PRUEBA: dale, hasta 15%.");
  await p.getByRole("button", { name: "Autorizar" }).first().click();
  await p.waitForTimeout(2200);
  await foto(p, "3-aprobada");

  es(
    "QUEDÓ AUTORIZADA, POR DIRECCIÓN",
    sql(`select estado || '|' || resuelto_por from public.autorizaciones where descripcion = '${MOTIVO}';`),
    `autorizada|${JEFA}`,
  );
  es(
    "y con el comentario",
    sql(`select comentario from public.autorizaciones where descripcion = '${MOTIVO}';`),
    "PRUEBA: dale, hasta 15%.",
  );

  await nav.close();
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. la asesora se entera en la ficha, y no puede aprobar ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const { nav, p } = await abrir(ALE, "jwt-ale.txt", "ale@lac.test");
  await abrirLaFicha(p);

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("VE QUE SE LA AUTORIZARON", /Autorizada/.test(texto), true);
  es("y lee lo que le contestaron", texto.includes("dale, hasta 15%"), true);
  es("sin que le aparezca ningún botón de aprobar",
     await p.getByRole("button", { name: "Autorizar" }).count(), 0);
  await foto(p, "4-la-asesora-lo-ve");

  await nav.close();
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. y la base no la deja aprobar aunque se lo pida directo ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Esconder el botón acomoda la pantalla; no protege nada. Lo que protege es
   * la política, y esto es lo que la ejerce: se pide el cambio con la sesión de
   * la asesora, saltándose la pantalla entera.
   */
  const pedido = sql(`select id from public.autorizaciones where descripcion = '${MOTIVO}';`);
  sql(`
    insert into public.autorizaciones (nombre, descripcion, estado, solicitado_por)
    values ('PRUEBA suelta', 'PRUEBA: una pendiente para intentar aprobarla', 'pendiente', '${ALE}');
  `);
  const suelta = sql(`
    select id from public.autorizaciones
     where descripcion = 'PRUEBA: una pendiente para intentar aprobarla';
  `);

  /*
   * `set role` y no `set local role`.
   *
   * Con `local` la primera versión de esta prueba pasó por buenas razones
   * equivocadas: psql corre cada sentencia en su propia transacción, así que el
   * `set local` se deshacía antes del `update` y el `update` terminaba
   * corriendo como superusuario, que se salta las políticas. La prueba decía
   * que la asesora pudo autorizarse sola cuando en realidad quien lo hizo fue
   * postgres.
   */
  sql(`
    set role authenticated;
    set request.jwt.claims = '{"sub":"${ALE}","role":"authenticated"}';
    update public.autorizaciones set estado = 'autorizada' where id = ${suelta};
    reset role;
  `);

  es(
    "LA ASESORA NO PUDO AUTORIZARSE SOLA",
    sql(`select estado from public.autorizaciones where id = ${suelta};`),
    "pendiente",
  );

  // Y lo ya resuelto no se puede reabrir ni siquiera desde dirección por la vía
  // de la aplicación: la acción exige que siga pendiente.
  es(
    "lo resuelto quedó resuelto",
    sql(`select estado from public.autorizaciones where id = ${pedido};`),
    "autorizada",
  );
}

sql(limpiar);
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.autorizaciones where descripcion like 'PRUEBA:%';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
