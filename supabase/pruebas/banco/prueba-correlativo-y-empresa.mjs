/**
 * El correlativo, la empresa y el cargo: ¿se escriben y llegan a donde sirven?
 *
 *     node supabase/pruebas/banco/prueba-correlativo-y-empresa.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Poner en la ficha de cada lead una caja de texto en la que se pueda poner el
 *  "Correlativo" y que se refleje cuando se cree el link de registro y aparezca
 *  ese correlativo. También en la ficha de cada lead quiero otra caja de texto
 *  en donde pueda colocar "Nombre de la empresa" y "Cargo".»
 *
 * ============================================================================
 * DÓNDE SE ROMPE ESTO
 * ============================================================================
 *
 * En dos lugares, y ninguno es la casilla.
 *
 * EL PRIMERO es el recibo. Escribir el correlativo en la ficha es la mitad
 * fácil; que aparezca en el link de registro depende de que la columna esté en
 * `vw_pipeline`, que es de donde lee `leerRecibo`. Guardar bien y no salir en
 * el recibo es exactamente el caso que la escuela pidió que no pase, y desde la
 * ficha no se nota: el asesor ve su número guardado y da por hecho lo demás.
 *
 * EL SEGUNDO es todo lo que ya estaba en esa vista. Para sumar tres columnas
 * hay que rehacerla entera —`create or replace view` no admite cambiar la lista
 * de columnas—, y una vista rehecha a la que se le cayó una columna rompe cosas
 * lejos de acá sin decir nada: el horario del diplomado desaparecería de los
 * recibos y nadie lo ataría a este cambio. Por eso la última parte vuelve a
 * mirar el horario y el país, que no son de esta tarea.
 *
 * ============================================================================
 * Y LO OTRO QUE SE MIRA ACÁ
 * ============================================================================
 *
 * De paso van los filtros, que se tocaron en el mismo tirón:
 *
 *   SELECCIÓN MÚLTIPLE     «Poder hacer clic a distintos ítems». Antes elegir
 *                          uno borraba el anterior y cerraba el menú.
 *   NO SE SALE POR LA      Los desplegables de la derecha se cortaban contra el
 *   DERECHA                borde de la pantalla.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `correlativo-${process.pid}-${Math.random()}.sql`);
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

for (const [tabla, col] of [
  ["oportunidades", "correlativo"],
  ["clientes", "empresa"],
  ["clientes", "cargo"],
  ["vw_pipeline", "correlativo"],
]) {
  if (
    sql(`select count(*) from information_schema.columns
          where table_name = '${tabla}' and column_name = '${col}';`) !== "1"
  ) {
    console.error(
      `Falta ${tabla}.${col}. Corré 20261025120000_correlativo_empresa_cargo.sql.`,
    );
    process.exit(1);
  }
}

const CLIENTE = "Correlativo Prueba";
const PROGRAMA = "PRUEBA Diplomado del Correlativo";
const HORARIO = "Jueves de 6:00 a 9:00 pm, del 10/03 al 12/07";

// El correlativo de la escuela, con la forma que ellos usan. No es CRM-####:
// ése lo pone la base sola y sigue existiendo aparte.
const CORRELATIVO = "LAC-2026-0147";
const EMPRESA = "Hotel Real Intercontinental";
const CARGO = "Chef ejecutivo";

/*
 * Tres leads, y los dos de atrás son para los filtros.
 *
 * Para probar que la selección múltiple filtra POR LAS DOS cosas elegidas hace
 * falta saber de antemano qué tiene que quedar en la tabla. Con los datos que
 * ya trae el banco no se sabe: puede que ninguna de las dos etapas que se
 * marquen tenga fichas, y entonces la comprobación fallaría con el código bien.
 *
 * Así que la prueba pone las suyas: uno en la primera etapa, otro en la
 * segunda, y un tercero en la última que NO se va a marcar y que por lo tanto
 * tiene que desaparecer. Sin ese tercero, un filtro roto que devuelve todo
 * pasaría en verde.
 */
const EN_ETAPA_A = "Etapa Uno Prueba";
const EN_ETAPA_B = "Etapa Dos Prueba";
const FUERA = "Etapa Fuera Prueba";
const TODOS = [CLIENTE, EN_ETAPA_A, EN_ETAPA_B, FUERA];

const limpiar = () => {
  sql(`
    delete from public.enlaces_pago where oportunidad_id in
      (select id from public.oportunidades where codigo like 'COR-000%');
    delete from public.oportunidades where codigo like 'COR-000%';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre in (${TODOS.map((n) => `'${n}'`).join(", ")}));
    delete from public.clientes where nombre in (${TODOS.map((n) => `'${n}'`).join(", ")});
    delete from public.productos where nombre = '${PROGRAMA}';
  `);
};
limpiar();

sql(`
  insert into public.productos (nombre, categoria) values ('${PROGRAMA}', 'Diplomado');

  insert into public.clientes (nombre, telefono, pais) values
    ('${CLIENTE}',   '70880002', 'Guatemala'),
    ('${EN_ETAPA_A}', '70880003', null),
    ('${EN_ETAPA_B}', '70880004', null),
    ('${FUERA}',      '70880005', null);

  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, producto_id, etapa_id, fecha_registro,
     valor_oportunidad, horario)
  select 'COR-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.productos where nombre = '${PROGRAMA}'),
         (select id from public.etapas order by orden limit 1),
         current_date, 950, '${HORARIO}'
    from public.clientes c where c.nombre = '${CLIENTE}';

  -- Los tres de los filtros: primera etapa, segunda, y la última.
  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, producto_id, etapa_id, fecha_registro)
  select v.cod, c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.productos where nombre = '${PROGRAMA}'),
         v.etapa, current_date
    from (values
      ('COR-0002', '${EN_ETAPA_A}', (select id from public.etapas order by orden limit 1)),
      ('COR-0003', '${EN_ETAPA_B}', (select id from public.etapas order by orden offset 1 limit 1)),
      ('COR-0004', '${FUERA}',      (select id from public.etapas order by orden desc limit 1))
    ) as v(cod, quien, etapa)
    join public.clientes c on c.nombre = v.quien;
`);

/** Los nombres de las dos primeras etapas, que son las que se van a marcar. */
const [ETAPA_A, ETAPA_B] = sql(
  `select string_agg(nombre, '|' order by orden)
     from (select nombre, orden from public.etapas order by orden limit 2) t;`,
).split("|");

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
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
      user: { id: subDe("jwt-jefa.txt"), email: "jefa@lac.test" },
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
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) =>
  p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/correlativo-${n}.png` });

/** Guardar la ficha: el botón, y después el repaso de cambios que confirma. */
const guardarFicha = async () => {
  await p.getByRole("button", { name: /Guardar cambios/ }).first().click();
  await p.waitForTimeout(1200);
  const confirmar = p.getByRole("button", { name: /^Guardar$|Confirmar|Aceptar/ });
  if (await confirmar.count()) await confirmar.first().click();
  await p.waitForTimeout(2500);
};

try {
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2000);

  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. LAS TRES CASILLAS ESTÁN EN LA FICHA ──");
  // ══════════════════════════════════════════════════════════════════════
  {
    await p.getByText(CLIENTE, { exact: false }).first().click();
    await p.waitForTimeout(2000);
    await foto("1-ficha");

    const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    es("está «Correlativo»", texto.includes("Correlativo"), true);
    es("está «Nombre de la empresa»", texto.includes("Nombre de la empresa"), true);
    es("está «Cargo»", texto.includes("Cargo"), true);

    /*
     * Y el código del CRM sigue estando.
     *
     * No es un detalle: el correlativo es OTRA numeración, no un reemplazo. Si
     * al agregarlo se hubiera pisado `codigo`, esta ficha dejaría de tener el
     * número con el que todo el equipo la busca —y con el que la buscan la
     * bitácora, el calendario y los seguimientos—.
     */
    es("y el código del CRM sigue estando aparte", texto.includes("COR-0001"), true);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. SE ESCRIBEN Y SE GUARDAN ──");
  // ══════════════════════════════════════════════════════════════════════
  {
    /*
     * Se busca por el texto en gris de cada casilla, como hace la prueba del
     * horario. Es lo único estable: los campos de la ficha no llevan `label`
     * atado por `for`, y buscar por posición se rompería en cuanto alguien
     * agregue un campo arriba.
     */
    for (const [pista, valor] of [
      ["El número de la escuela, si ya lo tiene", CORRELATIVO],
      ["Dónde trabaja, si trabaja", EMPRESA],
      ["Qué puesto ocupa", CARGO],
    ]) {
      const caja = p.getByPlaceholder(pista, { exact: true });
      es(`la casilla de «${pista}» está una sola vez`, await caja.count(), 1);
      await caja.fill(valor);
      await caja.blur();
      await p.waitForTimeout(400);
    }
    await foto("2-escrito");

    await guardarFicha();
    await foto("3-guardado");

    es(
      "EL CORRELATIVO QUEDÓ EN EL LEAD",
      sql(`select coalesce(correlativo, '(vacío)') from public.oportunidades
            where codigo = 'COR-0001';`),
      CORRELATIVO,
    );
    /*
     * Empresa y cargo van en `clientes` y no en `oportunidades`: son de la
     * persona. Quien es «Chef ejecutivo en Hotel Real» lo sigue siendo cuando
     * pregunta por el segundo diplomado, y guardarlo por lead terminaría con la
     * misma persona diciendo dos empresas según qué ficha se abra.
     */
    es(
      "LA EMPRESA Y EL CARGO QUEDARON EN EL CLIENTE",
      sql(`select coalesce(empresa, '(vacío)') || ' / ' || coalesce(cargo, '(vacío)')
             from public.clientes where nombre = '${CLIENTE}';`),
      `${EMPRESA} / ${CARGO}`,
    );
    es(
      "y el código del CRM no se tocó",
      sql(`select codigo from public.oportunidades where codigo = 'COR-0001';`),
      "COR-0001",
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 3. Y SALE EN EL LINK DE REGISTRO ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // Lo que de verdad pidió la escuela. Guardar bien y no salir acá es el caso
  // que no se nota desde la ficha: el asesor ve su número y da por hecho todo
  // lo demás.
  {
    const token = "prueba" + "K".repeat(30);
    sql(`
      insert into public.enlaces_pago (token, oportunidad_id, vence_en)
      select '${token}', id, now() + interval '30 days'
        from public.oportunidades where codigo = 'COR-0001';
    `);

    const recibo = await ctx.newPage();
    await recibo.goto(`http://127.0.0.1:3142/registro/${token}`, {
      waitUntil: "networkidle",
    });
    await recibo.waitForTimeout(1200);
    const texto = (await recibo.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    await recibo.screenshot({
      path: (process.env.SP ?? os.tmpdir()) + "/correlativo-4-recibo.png",
    });

    es("el recibo dice «Correlativo»", texto.includes("Correlativo"), true);
    es("Y ES EL NÚMERO DE LA ESCUELA", texto.includes(CORRELATIVO), true);
    es("y el código del CRM sigue arriba, aparte", texto.includes("COR-0001"), true);

    /*
     * ----------------------------------------------------------------------
     * LO QUE NO ES DE ESTA TAREA, Y POR ESO SE MIRA
     * ----------------------------------------------------------------------
     *
     * Para sumar tres columnas hubo que REHACER `vw_pipeline` entera. Si en el
     * camino se hubiera caído una columna, el daño aparecería lejos de acá y
     * nadie lo ataría a este cambio: los recibos ya emitidos empezarían a salir
     * sin el horario del diplomado, y académica inscribiría gente sin saber qué
     * días le prometieron.
     */
    es("EL HORARIO SIGUE SALIENDO EN EL RECIBO", texto.includes(HORARIO), true);
    es("y el país también", texto.includes("Guatemala"), true);
    await recibo.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 4. EL CORRELATIVO SE PUEDE BUSCAR ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // Un número que archiva y no se puede buscar sirve la mitad: «buscame el
  // LAC-2026-0147» es exactamente lo que va a pedir académica.
  {
    /*
     * Primero se cierra la ficha DE VERDAD, con su botón.
     *
     * No es un detalle de forma. Con la ficha abierta, el nombre del cliente
     * está en la pantalla porque lo muestra la ficha, y entonces «buscar el
     * correlativo y ver el nombre» pasa en verde aunque el buscador no
     * funcione. La ficha además deja una capa a pantalla completa que se come
     * los clics de todo lo que venga después.
     */
    await p.locator('aside button[aria-label="Cerrar"]').first().click();
    await p.waitForTimeout(1500);
    es("la ficha se cerró", await p.locator('aside button[aria-label="Cerrar"]').count(), 0);

    /*
     * Y se mira sobre la LISTA, no sobre la pantalla entera, contando filas.
     *
     * Buscar un texto suelto en el `body` diría que sí con sólo que el nombre
     * aparezca en cualquier lado. Lo que se quiere saber es otra cosa: que
     * buscando el correlativo quede esta ficha y se vayan las demás.
     */
    const cuantasFilas = async () =>
      await p.locator("tbody tr, button.row").count();

    const buscador = p.getByPlaceholder(/Buscar/).first();
    await buscador.fill("");
    await p.waitForTimeout(1200);
    const todas = await cuantasFilas();
    es("hay varias fichas sin filtrar", todas > 1, true);

    await buscador.fill(CORRELATIVO);
    await p.waitForTimeout(1600);
    await foto("5-buscado");

    const conCorrelativo = await cuantasFilas();
    const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    es("BUSCANDO EL CORRELATIVO QUEDA LA FICHA", texto.includes(CLIENTE), true);
    es("Y SE FUERON LAS DEMÁS", conCorrelativo < todas, true);

    await buscador.fill(EMPRESA);
    await p.waitForTimeout(1600);
    es(
      "y buscando por empresa queda la misma",
      (await p.evaluate(() => document.body.innerText)).includes(CLIENTE) &&
        (await cuantasFilas()) < todas,
      true,
    );

    /*
     * La otra cara: algo que no existe no puede devolver nada. Sin esto, un
     * buscador roto que devuelve siempre todo pasaría las dos de arriba.
     */
    await buscador.fill("LAC-9999-XXXX");
    await p.waitForTimeout(1600);
    es("y un correlativo que no existe no devuelve nada", await cuantasFilas(), 0);

    await buscador.fill("");
    await p.waitForTimeout(1300);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 5. LOS FILTROS: VARIOS ÍTEMS A LA VEZ ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // «Poder hacer clic a distintos ítems». Antes cada clic reemplazaba lo
  // anterior y cerraba el menú, así que elegir dos etapas era imposible.
  {
    // La clave del desplegable es `f:` más el campo. Si eso cambiara, esta
    // parte dejaría de probar nada, así que se falla en vez de saltearla.
    const menu = p.locator('[data-filtro="f:etapa"]');
    es("se encontró el desplegable de Etapa", await menu.count(), 1);

    await menu.click();
    await p.waitForTimeout(800);
    await foto("6-menu");

    const opciones = p.locator('[data-menu] button[aria-pressed]');
    es("el menú abre con opciones", (await opciones.count()) > 2, true);

    // Se marcan por nombre, no por posición: las dos etapas donde la prueba
    // dejó una ficha cada una.
    for (const etapa of [ETAPA_A, ETAPA_B]) {
      await p
        .locator('[data-menu] button[aria-pressed]')
        .filter({ hasText: new RegExp(`^${etapa}$`) })
        .first()
        .click();
      await p.waitForTimeout(500);
      es(`marcar «${etapa}» NO CIERRA EL MENÚ`, (await p.locator("[data-menu]").count()) > 0, true);
    }
    await foto("7-dos-elegidos");

    es(
      "QUEDAN DOS ÍTEMS MARCADOS A LA VEZ",
      await p.locator('[data-menu] button[aria-pressed="true"]').count(),
      2,
    );

    /*
     * Y filtra por las dos, no por la última.
     *
     * Es lo único que prueba que la selección múltiple sirve para algo: dos
     * casillas marcadas y una sola etapa en la tabla sería el error viejo con
     * la interfaz nueva, y desde el menú se vería idéntico.
     *
     * El tercero —el de la etapa que no se marcó— tiene que irse. Sin mirarlo,
     * un filtro que devuelve todo pasaría esta comprobación igual.
     */
    await p.keyboard.press("Escape");
    await p.waitForTimeout(1400);
    await foto("7b-tabla-filtrada");

    const enLaTabla = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    es("LA TABLA MUESTRA LA FICHA DE LA PRIMERA ETAPA", enLaTabla.includes(EN_ETAPA_A), true);
    es("Y TAMBIÉN LA DE LA SEGUNDA", enLaTabla.includes(EN_ETAPA_B), true);
    es("y la de la etapa que no se marcó no está", enLaTabla.includes(FUERA), false);

    /*
     * Y el rótulo del botón lo dice.
     *
     * Con dos elegidos no puede seguir diciendo el nombre de uno: quien mire la
     * pantalla de reojo creería que está filtrando por uno solo y leería mal
     * los números que tiene delante.
     */
    const rotulo = (await menu.innerText()).replace(/\s+/g, " ");
    es("y el botón dice cuántos hay elegidos", /2 elegidos/.test(rotulo), true);

    // Se deja como estaba: los filtros viven en la URL y se pegarían a lo que
    // venga después.
    await menu.click();
    await p.waitForTimeout(400);
    await p.locator('[data-menu] button[aria-pressed]').first().click();
    await p.waitForTimeout(400);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(800);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 6. NINGÚN DESPLEGABLE SE SALE DE LA PANTALLA ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // El de más a la derecha era el que se cortaba: se dibujaba siempre hacia la
  // derecha desde su botón, y el último no tiene lugar hacia ese lado.
  {
    const botones = p.locator("[data-filtro]");
    const cuantos = await botones.count();
    es("hay desplegables de filtro", cuantos > 0, true);

    let seSalen = [];
    for (let i = 0; i < cuantos; i++) {
      const b = botones.nth(i);
      await b.click();
      await p.waitForTimeout(500);
      const caja = p.locator("[data-menu]").first();
      if (await caja.count()) {
        const r = await caja.boundingBox();
        const ancho = await p.evaluate(() => window.innerWidth);
        if (r && (r.x + r.width > ancho + 1 || r.x < -1)) {
          seSalen.push(`${await b.getAttribute("data-filtro")} (x=${Math.round(r.x)}, ancho=${Math.round(r.width)}, pantalla=${ancho})`);
        }
      }
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
    }
    await foto("8-ultimo-menu");
    es("NINGUNO SE SALE DEL BORDE DERECHO", seSalen, []);
  }

  es("sin errores en la página", errores, []);
} finally {
  await ctx.close();
  await nav.close();
  limpiar();
}

es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.productos where nombre = '${PROGRAMA}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
