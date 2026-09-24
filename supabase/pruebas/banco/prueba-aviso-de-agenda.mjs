/**
 * El aviso de que falta poco para una llamada agendada.
 *
 *     node supabase/pruebas/banco/prueba-aviso-de-agenda.mjs
 *
 * ============================================================================
 * QUÉ PREGUNTÓ LA ESCUELA
 * ============================================================================
 *
 * «Cuando alguien agende una llamada en el calendario, ¿se le notificará a la
 *  persona que lo hizo unos diez minutos antes?»
 *
 * La respuesta era no: el calendario listaba los eventos y nadie miraba la
 * hora. Esto comprueba que ahora sí, de punta a punta —base, regla y
 * pantalla—, que es lo que la prueba unitaria de `avisoDeEvento.test.mjs` no
 * puede ver.
 *
 * ============================================================================
 * LAS DOS COSAS QUE SE VIGILAN
 * ============================================================================
 *
 *   QUE SALTE CUANDO TIENE QUE SALTAR   A ocho minutos, con el nombre del
 *                                       cliente y del tipo de evento, no un
 *                                       cartel genérico.
 *
 *   Y QUE NO SALTE EL RESTO DEL TIEMPO  Una llamada dentro de dos horas, una
 *                                       ya realizada y una de otra asesora no
 *                                       tienen que aparecer. Un aviso que
 *                                       salta de más se aprende a ignorar, y
 *                                       entonces tampoco sirve el que importa.
 *
 * Y la parte que motivó la columna nueva: que le llegue a QUIEN LA AGENDÓ
 * aunque la atienda otra persona.
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
  const ruta = path.join(os.tmpdir(), `agenda-${process.pid}-${Math.random()}.sql`);
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

if (
  sql(`select count(*) from information_schema.columns
        where table_name = 'eventos' and column_name = 'creado_por';`) !== "1"
) {
  console.error("Falta la columna. Corré 20261103120000_quien_agendo_el_evento.sql.");
  process.exit(1);
}

// ---------------------------------------------------------------- preparar

const subDe = (a) =>
  JSON.parse(
    Buffer.from(fs.readFileSync(`${BANCO}/${a}`, "utf8").trim().split(".")[1], "base64url").toString(),
  ).sub;
const ALE = subDe("jwt-ale.txt");
const JEFA = subDe("jwt-jefa.txt");

const V_ALE = sql(`select id from public.vendedores where usuario_id = '${ALE}';`);
const V_OTRA = sql(
  `select id from public.vendedores where id <> ${V_ALE} and activo order by id limit 1;`,
);

const marca = Date.now();
const CLI_PRONTO = `Agenda Pronto ${marca}`;
const CLI_LEJOS = `Agenda Lejos ${marca}`;
const CLI_AJENA = `Agenda Ajena ${marca}`;
const CLI_HECHA = `Agenda Hecha ${marca}`;

const limpiar = () => {
  sql(`
    delete from public.eventos where oportunidad_id in
      (select id from public.oportunidades where codigo like 'AGD-%');
    delete from public.oportunidades where codigo like 'AGD-%';
    delete from public.clientes where nombre like 'Agenda % 17%';
  `);
};
limpiar();

/** Un lead y su evento, en una sola sentencia. */
const sembrar = (codigo, cliente, minutos, { atiende, agendo, estado = "Pendiente" }) =>
  sql(`
    insert into public.clientes (nombre, telefono) values ('${cliente}', '7099${codigo.slice(-4)}');

    insert into public.oportunidades
      (codigo, cliente_id, vendedor_id, producto_id, etapa_id, fecha_registro, valor_oportunidad)
    select '${codigo}', c.id, ${atiende ?? "null"},
           (select id from public.productos order by id limit 1),
           (select id from public.etapas order by orden limit 1),
           current_date, 495
      from public.clientes c where c.nombre = '${cliente}';

    insert into public.eventos
      (oportunidad_id, tipo_id, vendedor_id, creado_por, inicia_en, duracion_min, canal, estado)
    select o.id, (select id from public.tipos_evento order by id limit 1),
           ${atiende ?? "null"}, ${agendo ?? "null"},
           now() + interval '${minutos} minutes', 30, 'Llamada', '${estado}'
      from public.oportunidades o where o.codigo = '${codigo}';
  `);

// La que TIENE que saltar: en ocho minutos, de Ale y agendada por Ale.
sembrar("AGD-0001", CLI_PRONTO, 8, { atiende: V_ALE, agendo: V_ALE });
// Dentro de dos horas: todavía no.
sembrar("AGD-0002", CLI_LEJOS, 120, { atiende: V_ALE, agendo: V_ALE });
// De otra asesora, y ella no la agendó: no es asunto de Ale.
sembrar("AGD-0003", CLI_AJENA, 6, { atiende: V_OTRA, agendo: V_OTRA });
// Ya realizada: no es un pendiente.
sembrar("AGD-0004", CLI_HECHA, 5, { atiende: V_ALE, agendo: V_ALE, estado: "Realizado" });

// --------------------------------------------------------------- navegador

const galletaDe = (archivo, sub, correo) => {
  const jwt = fs.readFileSync(`${BANCO}/${archivo}`, "utf8").trim();
  return (
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "x",
        user: { id: sub, email: correo },
      }),
    ).toString("base64")
  );
};

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

const abrir = async (archivo, sub, correo) => {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galletaDe(archivo, sub, correo), domain: "127.0.0.1", path: "/" },
  ]);
  // El aviso diario de reservas taparía el cartel que se está midiendo.
  await ctx.addInitScript((h) => {
    try {
      localStorage.setItem("lac.reservas.visto", h);
    } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(3200);
  return { ctx, p };
};

const foto = (p, n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/agenda-${n}.png` });

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. A OCHO MINUTOS, EL AVISO SALTA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const { ctx, p } = await abrir("jwt-ale.txt", ALE, "ale@lac.test");
  await foto(p, "1-ale");

  const carteles = p.locator("[data-aviso-agenda]");
  es("hay un aviso en pantalla", await carteles.count(), 1);

  const texto = (await carteles.first().innerText()).replace(/\s+/g, " ");
  console.log(`   (decía: ${texto})`);

  es("DICE DE QUIÉN ES LA LLAMADA", texto.includes(CLI_PRONTO), true);
  es("y cuánto falta, en palabras", /En \d+ minutos?/.test(texto), true);
  es("con el botón para ir al lead", /Abrir el lead/.test(texto), true);

  console.log("\n   · y no salta por lo que no corresponde");
  const todo = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  // Cada uno de los tres se comprueba por separado: si se juntaran en una
  // sola aserción, un fallo no diría cuál de las tres reglas se rompió.
  const enCarteles = (await carteles.allInnerTexts()).join(" ");
  es("NO la de dentro de dos horas", enCarteles.includes(CLI_LEJOS), false);
  es("NI la de otra asesora", enCarteles.includes(CLI_AJENA), false);
  es("NI una que ya se realizó", enCarteles.includes(CLI_HECHA), false);
  es("la pantalla cargó bien igual", todo.includes("Dashboard"), true);

  console.log("\n   · se puede cerrar, y no vuelve");
  await carteles.first().getByRole("button", { name: /Descartar/ }).click();
  await p.waitForTimeout(600);
  es("se fue de la pantalla", await p.locator("[data-aviso-agenda]").count(), 0);
  await foto(p, "2-descartado");

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LE LLEGA A QUIEN LA AGENDÓ, AUNQUE LA ATIENDA OTRA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Es el caso que motivó la columna nueva.
   *
   * La jefa agenda una llamada para otra asesora. Antes no quedaba rastro de
   * la jefa en la fila, así que no había a quién avisarle; ahora `creado_por`
   * lo guarda solo y el aviso le llega a las dos personas.
   */
  /*
   * La ficha de vendedora de la jefa se monta acá si no la tiene.
   *
   * La primera versión de este tramo se salteaba cuando la jefa del banco no
   * estaba enlazada con ninguna ficha —que es el caso—, y entonces la
   * comprobación que motivó toda la columna no se hacía nunca. Un tramo que se
   * saltea en silencio es peor que no tenerlo: se lee como que pasó.
   *
   * De paso deja dicho algo que vale para la escuela: quien entra al CRM sin
   * ficha de vendedor NO recibe avisos de agenda, porque no hay con qué
   * compararlo.
   */
  const yaTenia = sql(
    `select coalesce((select v.id::text from public.vendedores v
                       where v.usuario_id = '${JEFA}'), 'NO');`,
  );
  if (yaTenia === "NO") {
    sql(`
      insert into public.vendedores (nombre, activo, usuario_id)
      values ('PRUEBA Jefa Agenda', true, '${JEFA}');
    `);
  }
  const V_JEFA = sql(`select v.id from public.vendedores v where v.usuario_id = '${JEFA}';`);

  // La jefa agenda para OTRA asesora: ella no la atiende, pero la pidió.
  sql(`
    update public.eventos e
       set creado_por = ${V_JEFA}
      from public.oportunidades o
     where o.id = e.oportunidad_id and o.codigo = 'AGD-0003';
  `);

  es(
    "la llamada la atiende otra y la agendó la jefa",
    sql(`select (e.vendedor_id <> ${V_JEFA} and e.creado_por = ${V_JEFA})::text
           from public.eventos e join public.oportunidades o on o.id = e.oportunidad_id
          where o.codigo = 'AGD-0003';`),
    "true",
  );

  const { ctx, p } = await abrir("jwt-jefa.txt", JEFA, "jefa@lac.test");
  await foto(p, "3-jefa");
  const enCarteles = (await p.locator("[data-aviso-agenda]").allInnerTexts()).join(" ");
  console.log(`   (veía: ${enCarteles.replace(/\s+/g, " ").slice(0, 110)})`);
  es("LA JEFA VE LA LLAMADA QUE AGENDÓ PARA OTRA", enCarteles.includes(CLI_AJENA), true);
  await ctx.close();

  // La ficha de más se va, para no dejar una vendedora inventada en el banco.
  if (yaTenia === "NO") {
    sql(`
      update public.eventos set creado_por = null where creado_por = ${V_JEFA};
      delete from public.vendedores where id = ${V_JEFA};
    `);
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. SE LLENA SOLO AL AGENDAR, SIN QUE LA APP LO MANDE ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * El valor por omisión de la columna es `mi_vendedor_id()`. Es lo que hace
   * que el próximo lugar que cree un evento no se pueda olvidar del dato.
   */
  sql(`
    set role authenticated;
    set request.jwt.claims to '{"sub":"${ALE}","role":"authenticated"}';
    insert into public.eventos (oportunidad_id, tipo_id, inicia_en)
    select o.id, (select id from public.tipos_evento order by id limit 1),
           now() + interval '3 hours'
      from public.oportunidades o where o.codigo = 'AGD-0001';
  `);

  es(
    "quedó anotado quién lo agendó, sin mandarlo",
    sql(`select creado_por::text from public.eventos order by id desc limit 1;`),
    V_ALE,
  );
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.oportunidades where codigo like 'AGD-%';`),
  "0",
);

console.log(
  f === 0
    ? "\nTodo bien: avisa diez minutos antes, a quien atiende y a quien agendó."
    : `\n${f} comprobaciones fallaron.`,
);
process.exit(f ? 1 : 0);
