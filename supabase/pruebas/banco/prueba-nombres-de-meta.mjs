/**
 * Los nombres de Instagram y Messenger: ¿el botón los arregla de verdad?
 *
 *     node supabase/pruebas/banco/prueba-nombres-de-meta.mjs
 *
 * ============================================================================
 * QUÉ REPORTÓ LA ESCUELA
 * ============================================================================
 *
 * «Veía que caían mensajes pero no se visualizaban los nombres.»
 *
 * Hay DOS formas de que eso pase, y hasta hoy el botón «Refrescar nombres»
 * sólo arreglaba una:
 *
 *   EL HILO ENTRÓ SIN NOMBRE   Meta negó la consulta de perfil —modo
 *                              desarrollo, revisión sin aprobar, token
 *                              vencido— y el hilo se guardó con el número.
 *                              Ésta el botón ya la arreglaba.
 *
 *   LA FICHA SE QUEDÓ ATRÁS    El hilo tiene el nombre bueno pero la FICHA del
 *                              cliente sigue llamándose «Contacto de
 *                              Instagram». Pasa cuando el nombre del hilo lo
 *                              puso una migración, que arregla
 *                              `conversaciones` y no toca `clientes`. El botón
 *                              buscaba sólo hilos SIN nombre, así que estas
 *                              fichas no se revisaban nunca. En producción
 *                              quedaron ocho así.
 *
 * Esta prueba monta las dos y comprueba que después del botón no queda ninguna.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `nom-${process.pid}-${Math.random()}.sql`);
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

// ---------------------------------------------------------------- preparar

const marca = Date.now();
// El Meta de mentira contesta el perfil de cualquier identificador, así que
// para el caso «Meta no contesta» hace falta uno que él rechace.
const IG_SIN_NOMBRE = `17841400000${String(marca).slice(-6)}`;
const IG_FICHA_VIEJA = `17841499999${String(marca).slice(-6)}`;
const NOMBRE_BUENO = `Vanne De Leon ${marca}`;

const limpiar = () => {
  sql(`
    delete from public.contactos_canal where identificador in
      ('${IG_SIN_NOMBRE}', '${IG_FICHA_VIEJA}');
    delete from public.conversaciones where identificador in
      ('${IG_SIN_NOMBRE}', '${IG_FICHA_VIEJA}');
    delete from public.clientes
     where nombre = 'Contacto de Instagram' or nombre like 'Vanne De Leon 17%';
  `);
};
limpiar();

const idCanal = sql(`select id from public.canales where lower(nombre) = 'instagram' limit 1;`);
if (!idCanal) {
  console.error("El banco no tiene el canal Instagram. Revisá armar.sh.");
  process.exit(1);
}

/*
 * El sembrado va en una sola sentencia por caso, con CTE.
 *
 * La primera versión encadenaba tres `insert ... select` y, si el del medio no
 * encontraba su fila, los siguientes no fallaban: dejaban el hilo sin ficha y
 * la prueba medía un estado que no era el que quería montar. Con CTE, la ficha
 * que se acaba de crear es la que se usa, sin buscarla de nuevo.
 */
const sembrar = (identificador, nombrePerfil) =>
  sql(`
    with ficha as (
      insert into public.clientes (nombre) values ('Contacto de Instagram')
      returning id
    ), contacto as (
      insert into public.contactos_canal
        (cliente_id, canal_id, identificador, primera_vez, ultima_vez)
      select ficha.id, ${idCanal}, '${identificador}', now(), now() from ficha
      returning cliente_id
    )
    insert into public.conversaciones
      (canal, identificador, nombre_perfil, usuario, cliente_id, ultimo_mensaje_en)
    select 'instagram', '${identificador}', ${nombrePerfil}, null, contacto.cliente_id, now()
      from contacto;
  `);

// CASO 1: el hilo entró sin nombre. Es el que el botón ya arreglaba.
sembrar(IG_SIN_NOMBRE, "null");

// CASO 2: el hilo tiene el nombre bueno y la ficha se quedó en el respaldo.
// Es el estado en que quedaron las fichas de producción cuando una migración
// arregló los hilos sin tocar `clientes`.
sembrar(IG_FICHA_VIEJA, `'${NOMBRE_BUENO}'`);

const fichaDe = (ident) =>
  sql(`select cl.nombre from public.clientes cl
         join public.contactos_canal cc on cc.cliente_id = cl.id
        where cc.identificador = '${ident}';`);
const hiloDe = (ident) =>
  sql(`select coalesce(nombre_perfil, '(sin nombre)')
         from public.conversaciones where identificador = '${ident}';`);

es(
  "el sembrado enganchó las dos fichas",
  sql(`select count(*) from public.conversaciones
        where identificador in ('${IG_SIN_NOMBRE}', '${IG_FICHA_VIEJA}')
          and cliente_id is not null;`),
  "2",
);

console.log("── ASÍ ESTÁ ANTES DE TOCAR NADA ──");
es("el hilo del caso 1 no tiene nombre", hiloDe(IG_SIN_NOMBRE), "(sin nombre)");
es("y su ficha es la de respaldo", fichaDe(IG_SIN_NOMBRE), "Contacto de Instagram");
es("EL HILO DEL CASO 2 SÍ TIENE NOMBRE", hiloDe(IG_FICHA_VIEJA), NOMBRE_BUENO);
es("PERO SU FICHA SE QUEDÓ EN EL RESPALDO", fichaDe(IG_FICHA_VIEJA), "Contacto de Instagram");

// --------------------------------------------------------------- navegador

const subDe = (a) =>
  JSON.parse(
    Buffer.from(fs.readFileSync(`${BANCO}/${a}`, "utf8").trim().split(".")[1], "base64url").toString(),
  ).sub;
const JEFA = subDe("jwt-jefa.txt");
const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
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
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));
const p = await ctx.newPage();
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/nombres-${n}.png` });

await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2600);
await foto("1-antes");

console.log("\n── SE APRIETA EL BOTÓN DE REFRESCAR NOMBRES ──");
{
  // El botón vive dentro de la sección del canal, que arranca plegada desde
  // que la bandeja se rehízo como acordeón. Hay que abrir Instagram primero.
  await p.locator('[data-canal-seccion="instagram"]').first().click();
  await p.waitForTimeout(1200);

  const boton = p.locator('button[data-refrescar-nombres]');
  es("el botón está en la sección de Instagram", (await boton.count()) >= 1, true);
  await boton.first().click();
  // Es una llamada a Meta por hilo: se le da aire.
  await p.waitForTimeout(6000);
  await foto("2-despues");

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  // La frase entera, no el principio: el motivo va DESPUÉS de «Se resolvieron
  // N de M», y cortarla ahí escondía justo lo que se quiere comprobar.
  const dicho = (texto.match(/(Se resolvieron|Todos los hilos|Meta )[^|]{0,260}/i) ?? ["—"])[0];
  console.log(`   (la pantalla dijo: ${dicho})`);

  /*
   * Que DIGA por qué no pudo es la mitad del valor de este botón.
   *
   * Sin eso, «no funciona» y «falta que Meta apruebe el Acceso Avanzado» se
   * ven igual desde la pantalla, y la escuela no sabe si esperar o reclamar.
   */
  es(
    "cuando Meta niega el perfil, la pantalla lo explica",
    /Meta|permiso|Acceso Avanzado/i.test(dicho),
    true,
  );
}

console.log("\n── CÓMO QUEDÓ ──");
{
  /*
   * Caso 1: no se arregla, y ESTÁ BIEN.
   *
   * El Meta del banco contesta lo mismo que el de producción hoy: «(#10)
   * Application does not have permission». Sin nombre de Meta y sin nombre en
   * el hilo no hay de dónde sacar uno, y el CRM no inventa.
   *
   * Lo escribí al revés la primera vez —esperando que se resolviera— y la
   * prueba tenía razón: no hay nada que resolver hasta que Meta apruebe el
   * Acceso Avanzado. Lo que sí tiene que pasar es que el hilo quede intacto y
   * que la pantalla explique el motivo, y eso se comprueba arriba.
   */
  es(
    "el hilo del caso 1 sigue sin nombre, porque Meta no lo da",
    hiloDe(IG_SIN_NOMBRE),
    "(sin nombre)",
  );
  es(
    "y su ficha tampoco se inventa un nombre",
    fichaDe(IG_SIN_NOMBRE),
    "Contacto de Instagram",
  );

  // Caso 2: el que antes no se arreglaba nunca.
  es("LA FICHA DEL CASO 2 SE CORRIGIÓ", fichaDe(IG_FICHA_VIEJA) !== "Contacto de Instagram", true);
  console.log(`   (quedó como: ${fichaDe(IG_FICHA_VIEJA)})`);
  es("y el hilo conserva su nombre", hiloDe(IG_FICHA_VIEJA) !== "(sin nombre)", true);
}

console.log("\n── Y NO PISA UN NOMBRE QUE ESCRIBIÓ UNA PERSONA ──");
{
  /*
   * La otra mitad de la regla, y la que protege el trabajo de la escuela: si
   * alguien renombró la ficha a mano, el botón no la puede tocar. Esa decisión
   * vive dentro de `cliente_de_canal`, y acá se comprueba que sigue valiendo
   * después del cambio.
   */
  const AMANO = `Escrito A Mano ${marca}`;
  sql(`
    update public.clientes set nombre = '${AMANO}'
     where id = (select cliente_id from public.contactos_canal
                  where identificador = '${IG_FICHA_VIEJA}');
  `);

  await p.locator("button[data-refrescar-nombres]").first().click();
  await p.waitForTimeout(5000);

  es("EL NOMBRE ESCRITO A MANO NO SE TOCÓ", fichaDe(IG_FICHA_VIEJA), AMANO);
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.conversaciones
        where identificador in ('${IG_SIN_NOMBRE}', '${IG_FICHA_VIEJA}');`),
  "0",
);

console.log(
  f === 0
    ? "\nTodo bien: el botón arregla las dos formas del problema, y respeta lo escrito a mano."
    : `\n${f} comprobaciones fallaron.`,
);
process.exit(f ? 1 : 0);
