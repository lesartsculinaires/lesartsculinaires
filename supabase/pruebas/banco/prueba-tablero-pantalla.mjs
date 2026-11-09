/**
 * El Tablero Comercial en la pantalla (9/11/2026).
 *
 *     node supabase/pruebas/banco/prueba-tablero-pantalla.mjs
 *
 * Dirección entra al módulo, llena una semana de MK y de Ventas, las metas, un
 * grupo, una acción, la actividad de una vendedora y los comentarios, y se
 * comprueba que cada cosa quede en la base y aparezca en la hoja «Tablero».
 * Después, una vendedora: sin permiso no ve el módulo; con «Ventas» abierto ve
 * todo pero sólo escribe en lo de Ventas.
 *
 * Con CAPTURAS=carpeta deja una foto de cada hoja ahí.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const CAPTURAS = process.env.CAPTURAS ?? null;
const JEFA = "cccccccc-0000-0000-0000-000000000003";
const HURI = "44444444-0000-0000-0000-000000000004";
const SEMANA = "2026-11-02";
const MES = "2026-11-01";

// Lo que cambia de una empresa a otra: lo que trae cargado la plantilla.
const PLANTILLA = {
  empresa: "LAC",
  metaVentaNueva: 38200,
  grupos: 16,
  /** Un grupo para escribirle reservas, y cómo quedaba antes de la prueba. */
  grupo: "DSCI-2-2027",
  grupoAntes: "reservas = null, inscritos = null",
};

const sql = (q) =>
  execFileSync("su", ["postgres", "-c", "psql -h /tmp -p 5511 -d crm -A -t -q -F'|' -v ON_ERROR_STOP=1 -f -"], {
    input: q,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const jwt = (q) => fs.readFileSync(`${BANCO}/jwt-${q}.txt`, "utf8").trim();
const galleta = (quien, id) => "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt(quien), token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id, email: `${quien}@lac.test` },
})).toString("base64");

const ROL_HURI = sql(`select rol_id from public.usuarios where id = '${HURI}'`);
const FICHA_ALE = sql(`select id from public.vendedores where usuario_id = '11111111-0000-0000-0000-000000000001'`);
const NOMBRE_ALE = sql(`select nombre from public.vendedores where id = ${FICHA_ALE}`);
const cerrarHuri = () =>
  sql(`update public.rol_permisos set ver = false, crear = false, editar = false, eliminar = false
        where rol_id = ${ROL_HURI} and modulo like 'tablero%';`);
const abrirHuri = (modulo, accion) =>
  sql(`insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
       values (${ROL_HURI}, '${modulo}', ${accion === "ver"}, false, ${accion === "editar"}, false)
       on conflict (rol_id, modulo) do update set ${accion} = true;`);

const limpiar = () =>
  sql(`
    delete from public.tablero_semanal where semana = '${SEMANA}';
    delete from public.tablero_actividad where semana = '${SEMANA}';
    delete from public.tablero_comentarios where mes = '${MES}';
    delete from public.tablero_acciones where accion like 'Prueba:%';
    delete from public.tablero_metas where mes = '${MES}' and clave in ('leads', 'presupuesto_pauta');
    update public.tablero_metas set valor = ${PLANTILLA.metaVentaNueva} where mes = '${MES}' and clave = 'venta_nueva';
    update public.tablero_grupos set ${PLANTILLA.grupoAntes} where grupo = '${PLANTILLA.grupo}';
  `);

limpiar();
cerrarHuri();

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errores = [];

async function entrar(quien, id) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: CAPTURAS ? 2 : 1 });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta(quien, id), domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: "Tablero Comercial", domain: "127.0.0.1", path: "/" },
  ]);
  // Sin esto, el aviso de «Pendientes para hoy» se abre encima y tapa las
  // hojas. Es lo mismo que hacen las demás pruebas de pantalla.
  await ctx.addInitScript(() => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
    try { localStorage.setItem("lac.reservas.visto", hoy); } catch {}
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(APP, { waitUntil: "networkidle" });
  return { ctx, page };
}

/** Escribe en una celda y sale de ella, que es cuando se guarda. */
async function llenar(page, etiqueta, valor) {
  const celda = page.getByLabel(etiqueta, { exact: true });
  await celda.fill(String(valor));
  await celda.press("Enter");
  await page.waitForTimeout(350);
}
const hoja = async (page, nombre) => {
  await page.click(`button[data-hoja="${nombre}"]`);
  await page.waitForSelector(`[data-hoja-abierta="${nombre}"]`);
};
const foto = async (page, nombre) => {
  if (!CAPTURAS) return;
  fs.mkdirSync(CAPTURAS, { recursive: true });
  // Cada tabla, desde su primera columna, y sin la última celda resaltada.
  await page.mouse.move(5, 5);
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    for (const el of document.querySelectorAll("[data-hoja-abierta] div")) if (el.scrollLeft) el.scrollLeft = 0;
  });
  await page.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: true });
};
const enBase = (tabla, donde, columna = "valor") => sql(`select ${columna} from public.${tabla} where ${donde}`);

try {
  console.log("── 1. Dirección abre el módulo ──");
  const { ctx: ctxJefa, page } = await entrar("jefa", JEFA);
  await page.waitForSelector('[data-hoja-abierta="Tablero"]', { timeout: 20000 });
  es("abre en la hoja «Tablero»", await page.locator("[data-hoja-abierta]").getAttribute("data-hoja-abierta"), "Tablero");
  es("las once hojas de la plantilla, en orden",
    await page.locator("button[data-hoja]").evaluateAll((b) => b.map((x) => x.getAttribute("data-hoja"))),
    ["Guía", "Tablero", "MK semanal", "Ventas semanal", "Grupos en venta", "Plan de acciones", "Actividad de ventas", "Ventas por persona", "Metas", "Resumen mensual", "Evolución"]);

  console.log("\n── 2. Metas ──");
  await hoja(page, "Metas");
  es("la meta de venta nueva de la plantilla ya está cargada",
    await page.getByLabel("META DE VENTA NUEVA $ (la define Dirección), noviembre 2026", { exact: true }).inputValue(), String(PLANTILLA.metaVentaNueva));
  es("y las metas fijas (conversión 10%)", await page.getByLabel("Conversión lead → inscrito (mín.)", { exact: true }).inputValue(), "10%");
  await llenar(page, "Meta de leads, noviembre 2026", 120);
  await llenar(page, "Presupuesto de pauta $, noviembre 2026", 1500);
  await llenar(page, "META DE VENTA NUEVA $ (la define Dirección), noviembre 2026", 40000);
  es("la meta de leads queda guardada", enBase("tablero_metas", `mes = '${MES}' and clave = 'leads'`), "120");
  es("y la de venta nueva se cambió", enBase("tablero_metas", `mes = '${MES}' and clave = 'venta_nueva'`), "40000");
  await foto(page, "09-metas");

  console.log("\n── 3. MK semanal ──");
  await hoja(page, "MK semanal");
  es("una fila por semana de noviembre (con la regla del jueves)",
    await page.locator("tr[data-semana]").evaluateAll((r) => r.map((x) => x.getAttribute("data-semana"))),
    ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
  const mk = {
    "Pauta Meta (FB/IG) $": 350, "Pauta TikTok $": 100, "Pauta Google $": 0, "Otros (influencers, impresos) $": 50,
    "Alcance (personas)": 18000, "Seguidores nuevos (todas las redes)": 140, "Publicaciones hechas": 4,
    "Visitas a colegios / ferias hechas": 1, "Clases muestra / open house hechas": 1,
    "Leads Colegios y ferias": 6, "Reseñas nuevas Google": 3, "Calificación Google (al domingo)": 4.7,
  };
  for (const [c, v] of Object.entries(mk)) await llenar(page, `${c}, semana del ${SEMANA}`, v);
  es("lo escrito queda en la base", enBase("tablero_semanal", `semana = '${SEMANA}' and campo = 'mk.pauta_meta'`), "350");
  es("la inversión total se calcula en la fila",
    (await page.locator(`tr[data-semana="${SEMANA}"] td`).nth(6).innerText()).trim(), "$500");
  es("la semana queda cargada para MK",
    (await page.locator(`tr[data-semana="${SEMANA}"] td`).last().innerText()).trim(), "Sí");
  await page.getByLabel("Comentario de Marketing").fill("Semana de arranque: se priorizó la feria del Colegio X.");
  await page.getByRole("button", { name: "Guardar comentario" }).click();
  await page.waitForTimeout(400);
  es("el comentario de MK queda guardado", enBase("tablero_comentarios", `mes = '${MES}' and hoja = 'mk'`, "texto"), "Semana de arranque: se priorizó la feria del Colegio X.");
  await foto(page, "03-mk-semanal");

  console.log("\n── 4. Ventas semanal ──");
  await hoja(page, "Ventas semanal");
  const ventas = {
    "Cotizaciones corporativas enviadas": 2, "Contratos corporativos cerrados": 1,
    "Cobrado a alumnos nuevos $ (matrícula + 1ª cuota)": 2800, "Cursos cortos $": 450, "Corporativo $": 600,
    "Descuentos y becas otorgados $": 300,
  };
  for (const [c, v] of Object.entries(ventas)) await llenar(page, `${c}, semana del ${SEMANA}`, v);
  es("la venta nueva total de la semana", (await page.locator(`tr[data-semana="${SEMANA}"] td`).filter({ hasText: "$3,850" }).count()) > 0, true);
  // Los 6 de colegios que escribió MK, más lo que el CRM contó en los demás
  // canales (el banco ya trae leads de esa semana).
  const delCrm = Number(sql(`set role authenticated; set request.jwt.claims = '{"sub":"${JEFA}","role":"authenticated"}';
    select coalesce(sum(valor), 0) from public.tablero_crm_semanal('${SEMANA}', '2026-11-08')
     where semana = '${SEMANA}' and campo like 'mk.leads_%' and campo <> 'mk.leads_colegios';`));
  es("«Leads que entregó MK» trae los de MK sin escribirlos (escritos + CRM)",
    (await page.locator(`tr[data-semana="${SEMANA}"] td`).nth(2).innerText()).trim(), String(6 + delCrm));
  await foto(page, "04-ventas-semanal");

  console.log("\n── 5. Grupos en venta ──");
  await hoja(page, "Grupos en venta");
  es(`los ${PLANTILLA.grupos} grupos de ${PLANTILLA.empresa} de la plantilla`, await page.locator("tr[data-grupo]").count(), PLANTILLA.grupos);
  await llenar(page, `Reservas con precio de preventa (#), ${PLANTILLA.grupo}`, 6);
  await llenar(page, `Inscritos a precio regular (#), ${PLANTILLA.grupo}`, 2);
  es("reservas e inscritos en la base", enBase("tablero_grupos", `grupo = '${PLANTILLA.grupo}'`, "reservas || '/' || inscritos"), "6/2");
  es("la alerta se recalcula", await page.locator(`tr[data-grupo="${PLANTILLA.grupo}"] [data-alerta]`).getAttribute("data-alerta"), "En venta");
  await foto(page, "05-grupos");

  console.log("\n── 6. Plan de acciones ──");
  await hoja(page, "Plan de acciones");
  await page.getByLabel("Tipo de la acción nueva").selectOption("Visita a colegio o universidad");
  await page.getByLabel("Qué se hará").fill("Prueba: charla de cocina en Colegio X, 5º y 6º año");
  await page.getByLabel("Responsable de la acción nueva").selectOption("MK");
  await page.getByLabel("Fecha de la acción nueva").fill("2026-11-05");
  await page.getByRole("button", { name: "Agregar" }).click();
  await page.waitForSelector('tr[data-accion^="Prueba:"]');
  await page.getByLabel("Estado", { exact: true }).last().selectOption("Hecha");
  await page.waitForTimeout(350);
  const accion = "Prueba: charla de cocina en Colegio X, 5º y 6º año";
  for (const [c, v] of [["Costo", 40], ["Leads esperados", 25], ["Leads obtenidos", 30], ["Inscritos / ventas cerradas", 2], ["Venta generada", 1200]]) {
    await llenar(page, `${c}, ${accion}`, v);
  }
  es("la acción queda en la base, hecha y con resultados",
    enBase("tablero_acciones", "accion like 'Prueba:%'", "estado || '/' || leads_obtenidos || '/' || venta"), "Hecha/30/1200");
  es("la lectura dice que cumplió", await page.locator('tr[data-accion^="Prueba:"] [data-lectura]').getAttribute("data-lectura"), "Cumplió lo esperado");
  await foto(page, "06-plan-de-acciones");

  console.log("\n── 7. Actividad de ventas ──");
  await hoja(page, "Actividad de ventas");
  await llenar(page, `Llamadas hechas, ${NOMBRE_ALE}, semana del ${SEMANA}`, 35);
  await llenar(page, `Salidas de campo (empresas, colegios, calle), ${NOMBRE_ALE}, semana del ${SEMANA}`, 2);
  es("la actividad de la vendedora queda en la base",
    enBase("tablero_actividad", `semana = '${SEMANA}' and vendedor_id = ${FICHA_ALE} and campo = 'llamadas'`), "35");
  await foto(page, "07-actividad");

  console.log("\n── 8. Ventas por persona ──");
  await hoja(page, "Ventas por persona");
  await page.getByLabel(`Puesto de ${NOMBRE_ALE}`).selectOption("Gerente");
  await page.waitForTimeout(400);
  es("al marcarla Gerente aparecen sus columnas", await page.getByLabel(`SOLO GERENTE: venta de diplomados $, ${NOMBRE_ALE}`, { exact: true }).count(), 1);
  await page.getByLabel(`Puesto de ${NOMBRE_ALE}`).selectOption("Ejecutiva");
  await page.waitForTimeout(400);
  es("y vuelve a Ejecutiva", enBase("tablero_ventas_persona", `mes = '${MES}' and vendedor_id = ${FICHA_ALE} and campo = 'es_gerente'`, "count(*)"), "0");
  await foto(page, "08-ventas-por-persona");

  console.log("\n── 9. La hoja «Tablero» suma todo ──");
  await hoja(page, "Tablero");
  await page.getByLabel("Comentario de Dirección").fill("Buen arranque de mes. Ventas: priorizar los grupos de enero.");
  await page.getByRole("button", { name: "Guardar comentario" }).click();
  await page.waitForTimeout(400);
  const kpi = async (clave, col) => (await page.locator(`tr[data-kpi="${clave}"] td`).nth(col).innerText()).trim();
  es("inversión en pauta del mes", await kpi("inversion", 3), "$500");
  es("venta nueva del mes", await kpi("venta_nueva", 3), "$3,850");
  es("el retorno de las acciones (1200 ÷ 40)", await kpi("retorno_acciones", 3), "30.0");
  es("falta por vender = 40 000 − 3 850",
    (await page.locator('[data-falta-vender="FALTA POR VENDER"]').innerText()).trim(), "$36,150");
  await foto(page, "02-tablero");

  console.log("\n── 10. Al volver a entrar, todo sigue ahí ──");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-hoja-abierta="Tablero"]');
  es("la venta nueva sigue", await kpi("venta_nueva", 3), "$3,850");

  for (const [n, archivo] of [["Guía", "01-guia"], ["Resumen mensual", "10-resumen-mensual"], ["Evolución", "11-evolucion"]]) {
    await hoja(page, n);
    await foto(page, archivo);
  }
  es("Evolución muestra trece meses", await page.locator('table[data-evolucion] thead th').count() - 3, 13);
  await ctxJefa.close();

  console.log("\n── 11. Una vendedora sin permiso ──");
  {
    const { ctx, page: p } = await entrar("huri", HURI);
    await p.waitForTimeout(1500);
    es("no ve el módulo aunque lo pida", await p.locator("[data-tablero-comercial]").count(), 0);
    es("ni aparece en la barra", await p.getByText("Tablero Comercial", { exact: true }).count(), 0);
    await ctx.close();
  }

  console.log("\n── 12. Con «Ventas» abierto, escribe sólo lo de Ventas ──");
  abrirHuri("tablero", "ver");
  abrirHuri("tablero.ventas", "editar");
  {
    const { ctx, page: p } = await entrar("huri", HURI);
    await p.waitForSelector('[data-hoja-abierta="Tablero"]', { timeout: 20000 });
    es("ahora ve el Tablero", await p.locator("[data-tablero-comercial]").count(), 1);
    await hoja(p, "MK semanal");
    es("lo de MK lo ve pero no lo puede escribir", await p.locator('table[data-hoja-semanal="mk"] input').count(), 0);
    es("y ve lo que cargó MK", (await p.locator(`tr[data-semana="${SEMANA}"] td`).nth(2).innerText()).trim(), "$350");
    await hoja(p, "Ventas semanal");
    es("lo de Ventas sí", (await p.locator('table[data-hoja-semanal="ventas"] input').count()) > 0, true);
    await hoja(p, "Metas");
    es("las metas no", await p.locator("table[data-metas-del-mes] input").count(), 0);
    await foto(p, "12-vista-de-ventas-metas");
    await ctx.close();
  }
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  cerrarHuri();
  if (!process.env.DEJAR_DATOS) limpiar();
  await nav.close();
}

if (errores.length) {
  f++;
  console.log("\n✗ errores en el navegador:", errores);
}
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
