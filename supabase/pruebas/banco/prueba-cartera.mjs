/**
 * La cartera de cada integrante: el chat sigue al lead, el traspaso entero y
 * la revisión del equipo en Equipos.
 *
 *     node supabase/pruebas/banco/prueba-cartera.mjs
 *
 * Pedido el 14/10/2026 por el caso de Estefany (leads pasados a mano, chats
 * que no los acompañaron) y el de Katya (de baja con trabajo a su nombre). Se
 * arma una Katya de baja con un lead abierto, uno ganado, dos chats y dos
 * citas, más un chat que no está con la dueña de su lead, y se comprueba que
 * dirección lo vea en Equipos y lo arregle con un clic cada cosa.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const REST = "http://127.0.0.1:3140";
const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const KATYA = 4;
const ALE = 901;
const HURI = 902;
const jwt = (q) => fs.readFileSync(`${BANCO}/jwt-${q}.txt`, "utf8").trim();
const rpc = async (quien, fn, body = {}) => {
  const r = await fetch(`${REST}/rpc/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt(quien)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, cuerpo: await r.json().catch(() => null) };
};
const vendedorDe = (tabla, id) => Number(sql(`select vendedor_id from ${tabla} where id=${id}`));

// ------------------------------------------------------------- lo armado
const inicio = sql("select now()");
const respaldo = sql("select string_agg(id||':'||coalesce(vendedor_id::text,'')||':'||coalesce(etapa_id::text,'')||':'||estado_id||':'||coalesce(fecha_cierre::text,''), ',') from oportunidades");
const tipo = sql("select id from tipos_evento order by id limit 1");

sql(`update oportunidades set vendedor_id=${KATYA} where id in (914, 915)`);
sql("update oportunidades set estado_id=(select id from estados where nombre='Ganado') where id=914");
sql(`update vendedores set activo=false where id=${KATYA}`);
const conv = (cliente, vendedor, tel) =>
  Number(sql(`insert into conversaciones (identificador, telefono, canal, cliente_id, vendedor_id, ultimo_mensaje_en) values ('${tel}', '${tel}', 'whatsapp', ${cliente}, ${vendedor}, now()) returning id`).split("\n")[0]);
const c1 = conv(915, KATYA, "50379991001"); // su lead abierto
const c2 = conv(914, KATYA, "50379991002"); // cliente con el lead ya ganado
const c3 = conv(917, ALE, "50379991003"); // chat de Ale, lead de Huri
const c4 = conv(911, ALE, "50379991004"); // para el disparador
const evento = (cuando) =>
  Number(sql(`insert into eventos (oportunidad_id, tipo_id, vendedor_id, inicia_en) values (915, ${tipo}, ${KATYA}, now() ${cuando}) returning id`).split("\n")[0]);
const citaQueViene = evento("+ interval '2 days'");
const citaPasada = evento("- interval '2 days'");

const limpiar = () => {
  sql(`delete from eventos where id in (${citaQueViene}, ${citaPasada})`);
  sql(`delete from conversaciones where id in (${c1}, ${c2}, ${c3}, ${c4})`);
  sql(`update vendedores set activo=true where id=${KATYA}`);
  for (const par of respaldo.split(",")) {
    const [id, ven, et, st, cie] = par.split(":");
    sql(`update oportunidades set vendedor_id=${ven || "null"}, etapa_id=${et || "null"}, estado_id=${st}, fecha_cierre=${cie ? `'${cie}'` : "null"} where id=${id}`);
  }
};

const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt("jefa"), token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
})).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errores = [];

try {
  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. EL CHAT SIGUE AL LEAD ──");
  // ══════════════════════════════════════════════════════════════════════
  sql(`update oportunidades set vendedor_id=${HURI} where id=911`);
  es("pasar el lead a Huri se lleva el chat de ese cliente", vendedorDe("conversaciones", c4), HURI);
  sql(`update oportunidades set vendedor_id=${ALE} where id=911`);
  es("y de vuelta a Ale, vuelve con ella", vendedorDe("conversaciones", c4), ALE);
  sql(`update conversaciones set vendedor_id=${HURI} where id=${c4}`);
  sql("update oportunidades set updated_at=now() where id=911");
  es("cambiar otra cosa del lead no toca el chat", vendedorDe("conversaciones", c4), HURI);
  sql(`update conversaciones set vendedor_id=${ALE} where id=${c4}`);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. LA REVISIÓN DEL EQUIPO ──");
  // ══════════════════════════════════════════════════════════════════════
  const rev = (await rpc("jefa", "revision_del_equipo")).cuerpo;
  const de = (tipo, v) => rev.find((x) => x.tipo === tipo && x.vendedor_id === v)?.cantidad ?? 0;
  es("Katya de baja con 1 lead abierto (el ganado no cuenta)", de("baja_con_leads", KATYA), 1);
  es("y con 2 chats", de("baja_con_chats", KATYA), 2);
  es("1 chat de Ale cuyo lead lleva Huri", de("chat_de_otra", ALE), 1);
  es("a quien no es de dirección no le devuelve nada", (await rpc("ale", "revision_del_equipo")).cuerpo, []);

  const ajeno = await rpc("ale", "traspasar_cartera", { p_de: HURI, p_a: ALE });
  es("una asesora no puede traspasar carteras", [ajeno.status, ajeno.cuerpo?.code], [403, "42501"]);
  es("y no se movió nada", vendedorDe("oportunidades", 917), HURI);
  const aBaja = await rpc("jefa", "traspasar_cartera", { p_de: ALE, p_a: KATYA });
  es("no se le puede pasar a alguien de baja", aBaja.status, 400);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 3. EN EQUIPOS, DIRECCIÓN LO VE Y LO ARREGLA ──");
  // ══════════════════════════════════════════════════════════════════════
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: "Equipos", domain: "127.0.0.1", path: "/" },
  ]);
  // El aviso de pendientes del día, que se abre encima de todo, ya visto.
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, hoy);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.locator("[data-revision-equipo]").waitFor({ timeout: 20000 });
  const textoKatya = await p.locator('[data-problema="baja_con_leads"]').innerText();
  es("el aviso nombra a Katya y su lead", /Katya.*1 lead abierto/.test(textoKatya), true);
  es("y avisa del chat que no está con la dueña de su lead",
    /1 chat de Ale Prueba es de clientes cuyo lead lleva otra asesora/.test(await p.locator('[data-problema="chat_de_otra"]').innerText()), true);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/equipos-revision.png` });

  await p.locator("[data-alinear-chats]").click();
  await p.locator('[data-problema="chat_de_otra"]').waitFor({ state: "detached", timeout: 15000 });
  es("«Pasar cada chat a la dueña de su lead» deja el chat con Huri", vendedorDe("conversaciones", c3), HURI);

  await p.locator('[data-problema="baja_con_leads"] button').click();
  await p.locator("[data-cartera]").waitFor({ timeout: 15000 });
  es("la vista previa cuenta lo que se va a mover",
    (await p.locator("[data-cartera]").innerText()).split("\n").map((x) => x.trim()),
    ["1 lead abierto", "2 chats del Inbox", "1 cita por venir"]);
  es("Katya no aparece entre a quién pasársela",
    await p.locator("#traspaso-a option", { hasText: "Katya" }).count(), 0);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/equipos-traspaso.png` });
  await p.locator("#traspaso-a").selectOption(String(ALE));
  await p.locator("[data-traspasar]").click();
  await p.locator("[data-traspaso-listo]").waitFor({ timeout: 15000 });
  es("el aviso dice lo que se movió",
    /Ale Prueba recibió 1 lead abierto, 2 chats y 1 cita/.test(await p.locator("[data-traspaso-listo]").innerText()), true);

  es("el lead abierto ahora es de Ale", vendedorDe("oportunidades", 915), ALE);
  es("el ganado sigue siendo de Katya", vendedorDe("oportunidades", 914), KATYA);
  es("los dos chats son de Ale", [vendedorDe("conversaciones", c1), vendedorDe("conversaciones", c2)], [ALE, ALE]);
  es("la cita que viene es de Ale", vendedorDe("eventos", citaQueViene), ALE);
  es("la pasada sigue con Katya", vendedorDe("eventos", citaPasada), KATYA);
  es("el cambio quedó en el historial del lead, con quien lo hizo",
    sql(`select count(*) from actividad where entidad='oportunidad' and entidad_id::text='915' and actor_id='cccccccc-0000-0000-0000-000000000003' and campos ? 'vendedor_id' and creado_en > '${inicio}'`), "1");

  await p.getByRole("button", { name: "Cerrar", exact: true }).click();
  await p.waitForTimeout(2500);
  es("y la revisión queda limpia de Katya",
    await p.locator('[data-problema="baja_con_leads"], [data-problema="baja_con_chats"]').count(), 0);
  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  await nav.close();
  limpiar();
}

console.log(f ? `\n${f} cosa(s) mal.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
