/**
 * El botón que completa las fichas de pauta que ya habían entrado.
 *
 *     node supabase/pruebas/banco/prueba-formulario-viejo.mjs
 *
 * ============================================================================
 * POR QUÉ ESTO ES UN BOTÓN Y NO UN SQL
 * ============================================================================
 *
 * Se intentó tres veces con un archivo para pegar en el editor SQL del panel y
 * lo rechazó las tres, cortando el texto en lugares distintos —con funciones,
 * con bloques etiquetados, con tablas temporales—. Ninguna versión tenía un
 * problema de Postgres: las tres corrían bien con psql.
 *
 * Pero el motivo de fondo para hacerlo en la aplicación es mejor que ése, y
 * era cierto desde el principio: ASÍ ES EL MISMO CÓDIGO. El botón llama a la
 * misma función que corre cuando entra un mensaje nuevo, así que no hay una
 * segunda implementación de las reglas que se pueda desincronizar.
 *
 * Y eso cambia lo que esta prueba tiene que comprobar. Antes comparaba dos
 * implementaciones entre sí; ahora eso no hace falta —es la misma— y lo que
 * queda por asegurar es lo que de verdad puede fallar:
 *
 *   QUE LAS ENCUENTRE      Una ficha vieja, con el formulario en el hilo y los
 *                          campos vacíos, tiene que quedar completa.
 *   QUE NO PISE            Una con el correo escrito a mano no se toca.
 *   QUE NO SE CONFUNDA     Un mensaje común no es un formulario.
 *   QUE SEA IDEMPOTENTE    Apretarlo dos veces no cambia nada la segunda.
 *
 * Necesita el banco armado (`armar.sh`).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

const VIEJO = "50361110002";
const CON_DATOS = "50361110003";
const COMUN = "50361110004";
const TODOS = [VIEJO, CON_DATOS, COMUN];
const enComillas = TODOS.map((t) => `'${t}'`).join(",");

const limpiar = () => {
  sql(`delete from mensajes where conversacion_id in (select id from conversaciones where telefono in (${enComillas}))`);
  sql(`delete from conversaciones where telefono in (${enComillas})`);
  sql(`delete from oportunidad_programas where oportunidad_id in (select id from oportunidades where cliente_id in (select id from clientes where telefono in (${enComillas})))`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono in (${enComillas}))`);
  sql(`delete from clientes where telefono in (${enComillas})`);
};
limpiar();

/*
 * Un programa con el que se pueda acertar sin adivinar.
 *
 * El del catálogo se llama «Curso corto Pastelería Saludable» y el formulario
 * dice «Pastelería Saludable»: es el caso que una comparación exacta no
 * juntaría, y el que de verdad hay que resolver.
 */
sql(`insert into productos (nombre) select 'Curso corto Pastelería Saludable' where not exists (select 1 from productos where nombre='Curso corto Pastelería Saludable')`);
sql(`insert into territorios (nombre) select 'Chalatenango' where not exists (select 1 from territorios where nombre='Chalatenango')`);

/** El formulario real de la escuela. */
const EL_FORMULARIO = [
  "¡Hola! Completé el formulario y me gustaría obtener más información sobre el negocio.",
  "Email: magdalenamartinez24@hotmail.com",
  "Full name: Magdalena Martinez",
  "Phone number: 7966 4432",
  "Province: Colon",
  "Curso Corto de tu interés: Pastelería Saludable",
  "City: Chalatenango",
].join("\n");

/*
 * Se siembran como quedaron los viejos: el mensaje en el hilo y la ficha
 * vacía. Es exactamente el estado de los leads que entraron antes del arreglo.
 */
const sembrarViejo = (tel, nombre, texto, correo = null) => {
  const esc = (s) => s.replace(/'/g, "''");
  sql(
    `insert into clientes (nombre, telefono, correo) values ('${esc(nombre)}', '${tel}', ${
      correo ? `'${esc(correo)}'` : "null"
    })`,
  );
  sql(
    `insert into oportunidades (codigo, cliente_id, fecha_registro) ` +
      `select 'PAUTA-${tel}', id, current_date from clientes where telefono='${tel}'`,
  );
  sql(
    `insert into conversaciones (canal, identificador, telefono, ultimo_mensaje_en, cliente_id) ` +
      `select 'whatsapp', '${tel}', '${tel}', now(), id from clientes where telefono='${tel}'`,
  );

  const ruta = path.join(os.tmpdir(), `siembra-${tel}.sql`);
  fs.writeFileSync(
    ruta,
    `insert into mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)\n` +
      `select id, 'wamid.SEM.${tel}', 'entrante', 'text', $sem$${texto}$sem$, now()\n` +
      `  from conversaciones where telefono = '${tel}';\n`,
    "utf8",
  );
  fs.chmodSync(ruta, 0o644);
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -q -f ${ruta}" 2>&1`);
  fs.rmSync(ruta, { force: true });
};

// El de siempre: ficha llamada como el teléfono, sin correo.
sembrarViejo(VIEJO, VIEJO, EL_FORMULARIO);
// Uno al que alguien ya le escribió los datos a mano: NO se pueden pisar.
sembrarViejo(CON_DATOS, "Nombre Escrito A Mano", EL_FORMULARIO, "loescribio@unapersona.com");
// Y un mensaje común, que no es un formulario.
sembrarViejo(COMUN, "Ana Común", "Hola: quisiera información del curso de pastelería");

// ── la aplicación, con la compilación de ahora ─────────────────────────────
//
// `next start` sirve la compilación que tenía al arrancar, así que sin
// rearrancar esto mediría el código de antes y pasaría haga lo que haga el de
// ahora. Se comprobó: con el lector anulado, la prueba pasaba igual.

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
  `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-pauta.log 2>&1 < /dev/null &)`,
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

const galletaDe = (archivo, correo) => {
  const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/${archivo}`, "utf8").trim();
  return (
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "x",
        user: { id: subDe(archivo), email: correo },
      }),
    ).toString("base64")
  );
};

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/** Abre el módulo de Clientes con la sesión que se le diga. */
const abrirClientes = async (galleta) => {
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
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2200);
  return { ctx, p };
};

const foto = (p, n) =>
  p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/pauta-vieja-${n}.png` });

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. EL BOTÓN SIGUE LA CASILLA «EDITAR» DE CLIENTES ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Esto decía «sólo dirección», que fue la primera versión. Atarlo al rol
   * repetía el problema que la escuela reportó: «Jefe de Ventas» tenía las
   * casillas marcadas y no le aparecía ningún botón. Ahora lo decide la misma
   * casilla que permite corregir una ficha a mano.
   *
   * Se prueba quitándosela a Ale: sin «editar clientes», no hay botón.
   */
  const rol = sql(`select rol_id from usuarios where correo='ale@lac.test'`);
  const antes = sql(
    `select coalesce(editar::text,'-') from rol_permisos where rol_id=${rol} and modulo='clientes'`,
  );
  sql(
    `insert into rol_permisos (rol_id, modulo, ver, crear, editar, eliminar) ` +
      `values (${rol}, 'clientes', true, false, false, false) ` +
      `on conflict (rol_id, modulo) do update set editar=false`,
  );

  const sinCasilla = await abrirClientes(galletaDe("jwt-ale.txt", "ale@lac.test"));
  es("sin «editar clientes», no aparece", await sinCasilla.p.locator("[data-completar-pauta]").count(), 0);
  await sinCasilla.ctx.close();

  // Y con la casilla puesta, sí. Es la mitad que de verdad se pidió.
  sql(`update rol_permisos set editar=true where rol_id=${rol} and modulo='clientes'`);
  const conCasilla = await abrirClientes(galletaDe("jwt-ale.txt", "ale@lac.test"));
  es("CON LA CASILLA, SÍ", await conCasilla.p.locator("[data-completar-pauta]").count(), 1);
  await conCasilla.ctx.close();

  if (antes === "-") {
    sql(`delete from rol_permisos where rol_id=${rol} and modulo='clientes'`);
  } else {
    sql(`update rol_permisos set editar=${antes} where rol_id=${rol} and modulo='clientes'`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. Y DIRECCIÓN LO APRIETA ──");
// ══════════════════════════════════════════════════════════════════════════
const { ctx, p } = await abrirClientes(galletaDe("jwt-jefa.txt", "jefa@lac.test"));
{
  const boton = p.locator("[data-completar-pauta]");
  es("está el botón", await boton.count(), 1);
  await foto(p, "1-antes");

  await boton.click();
  await p.waitForTimeout(6000);
  await foto(p, "2-despues");

  const dicho = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("y dice qué hizo", /Se completaron \d+ de \d+/.test(dicho), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. LA FICHA VIEJA QUEDÓ COMPLETA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const ficha = sql(
    `select coalesce(cl.nombre,'-') || ' | ' || coalesce(cl.correo,'-') || ' | ' || ` +
      `coalesce(p.nombre,'-') || ' | ' || coalesce(t.nombre,'-') ` +
      `from clientes cl ` +
      `left join lateral (select * from oportunidades o where o.cliente_id=cl.id order by o.id desc limit 1) o on true ` +
      `left join productos p on p.id=o.producto_id ` +
      `left join territorios t on t.id=o.territorio_id ` +
      `where cl.telefono='${VIEJO}'`,
  );

  console.log(`   ${ficha}`);
  es(
    "NOMBRE, CORREO, PROGRAMA Y TERRITORIO",
    ficha,
    "Magdalena Martinez | magdalenamartinez24@hotmail.com | Curso corto Pastelería Saludable | Chalatenango",
  );
  es(
    "y quedó entre los programas por los que preguntó",
    sql(
      `select count(*) from oportunidad_programas op ` +
        `join oportunidades o on o.id=op.oportunidad_id ` +
        `where o.cliente_id=(select id from clientes where telefono='${VIEJO}')`,
    ),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. NO PISA NI SE CONFUNDE ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "EL CORREO ESCRITO A MANO SIGUE INTACTO",
    sql(`select correo from clientes where telefono='${CON_DATOS}'`),
    "loescribio@unapersona.com",
  );
  es(
    "y el nombre escrito a mano también",
    sql(`select nombre from clientes where telefono='${CON_DATOS}'`),
    "Nombre Escrito A Mano",
  );
  es(
    "EL MENSAJE COMÚN NO LLENÓ NADA",
    sql(`select coalesce(correo,'(vacío)') from clientes where telefono='${COMUN}'`),
    "(vacío)",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. APRETARLO DOS VECES NO CAMBIA NADA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const antes = sql(
    `select string_agg(coalesce(nombre,'-') || coalesce(correo,'-'), '|' order by telefono) ` +
      `from clientes where telefono in (${enComillas})`,
  );

  await p.locator("[data-completar-pauta]").click();
  await p.waitForTimeout(6000);

  es(
    "las fichas quedaron igual",
    sql(
      `select string_agg(coalesce(nombre,'-') || coalesce(correo,'-'), '|' order by telefono) ` +
        `from clientes where telefono in (${enComillas})`,
    ),
    antes,
  );

  const dicho = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es(
    "y lo dice, en vez de parecer que falló",
    /ya estaban completas|No hay formularios/.test(dicho),
    true,
  );
  await foto(p, "3-segunda-vez");
}

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura de la prueba", sql(`select count(*) from clientes where telefono='${VIEJO}'`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
