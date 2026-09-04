/**
 * La pantalla de leads fríos, y su filtro por asesora.
 *
 *     node supabase/pruebas/banco/prueba-leads-frios.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * Primero preguntó por un recordatorio automático a los quince días. Con los
 * números de su propia base a la vista —410 de 979 leads vivos llevaban más de
 * quince días sin que nadie los tocara, y ninguno de esos 410 estaba sin
 * asesora— eligió esto: «haz una pantalla aparte de leads fríos con filtro por
 * asesor».
 *
 * ============================================================================
 * QUÉ SE PRUEBA ACÁ, QUE ES LO QUE NO SE VE MIRANDO
 * ============================================================================
 *
 * La regla del corte y del orden ya se prueba sin navegador, en
 * `supabase/pruebas/frios.test.mjs`. Lo que se comprueba acá es lo otro: que
 * la fecha que usa la regla salga de verdad de la vista `vw_ultimo_toque` y
 * llegue hasta la pantalla.
 *
 * Y el caso que da miedo: que ESCRIBIR UNA NOTA saque el lead de la lista. Es
 * la promesa de la pantalla —«un lead sale de acá solo, en cuanto alguien le
 * escribe algo»— y si no se cumpliera, el equipo llamaría dos veces a la misma
 * persona y dejaría de creerle a la lista.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `frios-${process.pid}-${Math.random()}.sql`);
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
  sql("select count(*) from information_schema.views where table_name='vw_ultimo_toque';") !== "1"
) {
  console.error("Falta la vista. Corré 20261023120000_leads_frios.sql.");
  process.exit(1);
}

/*
 * Cuatro leads que cubren las cuatro respuestas posibles.
 *
 * `created_at` es lo que mira la vista cuando no hay ni notas ni actividad,
 * así que atrasándolo se fabrica un lead «sin tocar desde hace tanto» sin
 * tener que inventar filas en el registro.
 */
const CASOS = [
  { codigo: "FRI-0001", nombre: "Frio De Ale", dias: 40, vendedor: 901, estado: "Activo" },
  { codigo: "FRI-0002", nombre: "Frio De Huri", dias: 22, vendedor: 902, estado: "Activo" },
  { codigo: "FRI-0003", nombre: "Reciente De Ale", dias: 3, vendedor: 901, estado: "Activo" },
  { codigo: "FRI-0004", nombre: "Ganado Viejo", dias: 120, vendedor: 901, estado: "Ganado" },
];

const limpiar = () => {
  sql(`
    delete from public.oportunidad_notas where oportunidad_id in
      (select id from public.oportunidades where codigo like 'FRI-%');
    delete from public.actividad where oportunidad_id in
      (select id from public.oportunidades where codigo like 'FRI-%');
    delete from public.oportunidades where codigo like 'FRI-%';
    delete from public.clientes where nombre like '%Prueba Frios%';
  `);
};
limpiar();

for (const c of CASOS) {
  sql(`
    insert into public.clientes (nombre, telefono)
    values ('${c.nombre} Prueba Frios', '503${String(70600000 + CASOS.indexOf(c))}');

    insert into public.oportunidades
      (codigo, cliente_id, vendedor_id, etapa_id, estado_id, fecha_registro,
       valor_oportunidad, created_at)
    select '${c.codigo}', cl.id, ${c.vendedor},
           (select id from public.etapas order by orden limit 1),
           (select id from public.estados where nombre = '${c.estado}'),
           current_date - ${c.dias},
           500,
           now() - interval '${c.dias} days'
      from public.clientes cl where cl.nombre = '${c.nombre} Prueba Frios';
  `);
}

/*
 * El disparador de actividad deja una fila por cada escritura, con la fecha de
 * HOY, y eso volvería «recién tocados» a los cuatro. Se atrasan junto con el
 * alta: en producción esas filas son viejas de verdad.
 */
sql(`
  update public.actividad a
     set creado_en = o.created_at
    from public.oportunidades o
   where o.id = a.oportunidad_id and o.codigo like 'FRI-%';
`);

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const JEFA = subDe("jwt-jefa.txt");
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
      user: { id: JEFA, email: "jefa@lac.test" },
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/frios-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. la pantalla está en la barra ──");
// ══════════════════════════════════════════════════════════════════════════
es("hay un módulo «Fríos»", await p.locator('aside button[data-mod="Fríos"]').count(), 1);
await p.locator('aside button[data-mod="Fríos"]').click();
await p.waitForTimeout(2500);
await foto("1-lista");

const filas = () => p.locator("main tbody tr[data-frio]");
const codigos = async () =>
  (await filas().evaluateAll((rs) => rs.map((r) => r.getAttribute("data-frio")))).filter(
    (c) => c?.startsWith("FRI-"),
  );

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. QUIÉNES ESTÁN Y QUIÉNES NO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const c = await codigos();
  es("EL DE 40 DÍAS ESTÁ", c.includes("FRI-0001"), true);
  es("y el de 22 también", c.includes("FRI-0002"), true);
  es("EL DE 3 DÍAS NO", c.includes("FRI-0003"), false);
  es("Y EL GANADO TAMPOCO, POR VIEJO QUE SEA", c.includes("FRI-0004"), false);

  // El orden: el que más lleva esperando, arriba.
  es(
    "el de 40 va antes que el de 22",
    c.indexOf("FRI-0001") < c.indexOf("FRI-0002"),
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. EL FILTRO POR ASESORA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "hay botones por asesora",
    await p.locator("main button[data-asesor]").count() > 1,
    true,
  );

  await p.locator('main button[data-asesor="Ale Prueba"]').first().click();
  await p.waitForTimeout(1200);

  const c = await codigos();
  es("QUEDA EL DE ALE", c.includes("FRI-0001"), true);
  es("Y NO EL DE LA OTRA ASESORA", c.includes("FRI-0002"), false);
  await foto("2-por-asesora");

  // Y se puede volver a ver todo.
  await p.locator('main button[data-asesor="Todo el equipo"]').first().click();
  await p.waitForTimeout(1200);
  es("volviendo a todos, están los dos", (await codigos()).length >= 2, true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. ESCRIBIRLE UNA NOTA LO SACA DE LA LISTA ──");
// ══════════════════════════════════════════════════════════════════════════
//
// La promesa de la pantalla. Si no se cumpliera, el equipo llamaría dos veces
// a la misma persona y dejaría de creerle a la lista.
{
  sql(`
    insert into public.oportunidad_notas (oportunidad_id, nota, origen)
    select id, 'La llamé, quedó en avisar la otra semana.', 'prueba'
      from public.oportunidades where codigo = 'FRI-0001';
  `);

  es(
    "la vista ya lo da por tocado hoy",
    sql(`
      select case when t.ultimo_toque::date = current_date then 'sí' else 'no' end
        from public.vw_ultimo_toque t
        join public.oportunidades o on o.id = t.oportunidad_id
       where o.codigo = 'FRI-0001';
    `),
    "sí",
  );

  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(3000);

  const c = await codigos();
  es("SALIÓ DE LA LISTA", c.includes("FRI-0001"), false);
  es("y el otro sigue estando", c.includes("FRI-0002"), true);
  await foto("3-despues-de-la-nota");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. la ficha se abre encima, sin salir de la lista ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Se entra a repasar una cartera de cuarenta leads. Si abrir el primero
// cambiara de pantalla habría que volver a Fríos y buscar dónde se iba
// después de cada uno.
{
  await p.locator('main tbody tr[data-frio="FRI-0002"]').click();
  await p.waitForTimeout(2200);

  es(
    "se abrió la ficha",
    await p.locator("aside").filter({ hasText: "FRI-0002" }).count(),
    1,
  );
  es(
    "Y SEGUIMOS EN FRÍOS",
    await p.evaluate(() => {
      const b = [...document.querySelectorAll("aside nav button[data-mod]")].find(
        (x) => getComputedStyle(x).backgroundColor !== "rgba(0, 0, 0, 0)",
      );
      return b?.getAttribute("data-mod") ?? null;
    }),
    "Fríos",
  );
  await foto("4-ficha-encima");
}

es("sin errores en la página", errores, []);

await nav.close();
limpiar();
es(
  "no quedó basura",
  sql("select count(*) from public.oportunidades where codigo like 'FRI-%';"),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
