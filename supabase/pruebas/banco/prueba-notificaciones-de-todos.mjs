/**
 * Notificaciones: ¿ve una asesora lo que hacen las demás, y se enciende el globito?
 *
 *     node supabase/pruebas/banco/prueba-notificaciones-de-todos.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ ESTABA ROTO, Y POR QUÉ NO ERA UN PROBLEMA DE DIBUJO
 * ------------------------------------------------------------------------
 *
 * La escuela reportó dos cosas: que el módulo Notificaciones no tiene el
 * número rojo, y que quiere que todos vean lo que hace todo el equipo.
 *
 * Resultaron ser la misma cosa. La política de `actividad` decía «cada quien
 * ve lo suyo, dirección ve todo», y el contador de sin ver excluye a propósito
 * lo que hizo uno mismo. Para cualquiera que no fuera dirección:
 *
 *     lo que puedo ver  = lo que hice yo
 *     lo que se cuenta  = lo que NO hice yo
 *     ------------------------------------
 *     resultado         = 0, siempre
 *
 * O sea que el globito no faltaba: era cero por construcción. Agregarlo sin
 * tocar la política habría dejado exactamente el mismo vacío.
 *
 * ------------------------------------------------------------------------
 * Y LO QUE NO TIENE QUE HABER PASADO AL ABRIRLO
 * ------------------------------------------------------------------------
 *
 * Que abrir el registro abra también los leads. El aislamiento por vendedor se
 * pidió antes y sigue en pie: una asesora se entera de que otra movió un lead,
 * pero no de quién es ese lead. Media prueba es eso.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-notif-${process.pid}-${Math.random()}.sql`);
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

if (sql(`select qual from pg_policies where tablename='actividad' and policyname='actividad_leer';`) !== "true") {
  console.error("Falta abrir la política. Corré 20261009120000_actividad_para_todo_el_equipo.sql.");
  process.exit(1);
}

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};

const ALE = subDe("jwt-ale.txt");   // asesora
const JEFA = subDe("jwt-jefa.txt");

const CLIENTE = "Notif Ajena";
const limpiar = () => {
  sql(`
    delete from public.actividad where oportunidad_id in
      (select id from public.oportunidades where codigo = 'NTF-0001');
    delete from public.oportunidades where codigo = 'NTF-0001';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre = '${CLIENTE}');
    delete from public.clientes where nombre = '${CLIENTE}';
  `);
};
limpiar();

/*
 * Un lead que NO es de la asesora, y un movimiento hecho por otra persona.
 *
 * La actividad se inserta a mano y no moviendo la pantalla porque lo que se
 * prueba acá es quién la LEE, no quién la escribe: el disparador que la genera
 * ya tiene su prueba aparte.
 */
sql(`
  insert into public.clientes (nombre, telefono) values ('${CLIENTE}', '70550001');

  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'NTF-0001', c.id,
         (select id from public.vendedores where nombre ilike '%katya%' limit 1),
         (select id from public.etapas order by orden limit 1), current_date
    from public.clientes c where c.nombre = '${CLIENTE}';

  insert into public.actividad (entidad, accion, entidad_id, oportunidad_id, campos, actor_id, creado_en)
  select 'oportunidad', 'edito', o.id, o.id,
         '{"etapa_id": {"antes": 1, "despues": 2}}'::jsonb,
         '${JEFA}'::uuid, now()
    from public.oportunidades o where o.codigo = 'NTF-0001';
`);

const galletaDe = (archivo, sub, correo) => {
  const jwt = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim();
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

/** Abre el CRM como una persona y devuelve su página. */
const entrarComo = async (archivo, sub, correo) => {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galletaDe(archivo, sub, correo), domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript((h) => {
    try {
      localStorage.setItem("lac.reservas.visto", h);
    } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  return p;
};

const foto = (p, n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/notif-${n}.png` });

console.log("── LA ASESORA, QUE NO HIZO NADA DE ESTO ──");
{
  // Se le borra la marca de «ya lo vi» para que el movimiento cuente como
  // nuevo: sin esto la prueba dependería de si esa fila existía o no.
  sql(`delete from public.actividad_vista where usuario_id = '${ALE}'::uuid;`);

  const p = await entrarComo("jwt-ale.txt", ALE, "ale@lac.test");
  await foto(p, "1-barra");

  const globito = await p.evaluate(() => {
    const b = document.querySelector('aside button[data-mod="Notificaciones"]');
    return b ? b.textContent.replace(/\s+/g, " ").trim() : "(no está el módulo)";
  });
  es("EL MÓDULO LLEVA SU NÚMERO", /Notificaciones\s*\d+/.test(globito), true);

  await p.locator('aside button[data-mod="Notificaciones"]').click();
  await p.waitForTimeout(2500);
  await foto(p, "2-modulo");

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("VE EL MOVIMIENTO DE OTRA PERSONA", /Katya|Jefa/i.test(texto), true);

  /*
   * Y acá lo que NO tiene que verse. El nombre y el código salen de
   * `vw_pipeline`, que sigue filtrando por vendedor: la asesora se entera de
   * que hubo un movimiento sin enterarse de a quién.
   */
  es("PERO NO EL CLIENTE AJENO", texto.includes(CLIENTE), false);
  es("ni su código de lead", texto.includes("NTF-0001"), false);

  console.log("\n── y el globito se apaga al mirarlo ──");
  {
    // Abrir el módulo marca lo visto; al recargar, el número ya no está.
    await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
    await p.waitForTimeout(2800);
    const despues = await p.evaluate(() => {
      const b = document.querySelector('aside button[data-mod="Notificaciones"]');
      return b ? b.textContent.replace(/\s+/g, " ").trim() : "";
    });
    es("SE APAGÓ", /\d/.test(despues), false);
  }

  await p.context().close();
}

console.log("\n── y dirección, que ya veía todo, sigue igual ──");
{
  sql(`delete from public.actividad_vista where usuario_id = '${JEFA}'::uuid;`);
  const p = await entrarComo("jwt-jefa.txt", JEFA, "jefa@lac.test");

  await p.locator('aside button[data-mod="Notificaciones"]').click();
  await p.waitForTimeout(2500);
  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("ve el movimiento", /Katya|Jefa/i.test(texto), true);
  es("y con el lead, porque los ve todos", texto.includes("NTF-0001"), true);
  await foto(p, "3-jefa");
  await p.context().close();
}

console.log("\n── y nadie puede escribir el registro a mano ──");
{
  /*
   * Lo que se abrió es la lectura. Un registro que se puede editar no sirve
   * para controlar nada, así que sigue sin haber política de escritura.
   */
  es(
    "no hay política de insert, update ni delete",
    sql(`select count(*) from pg_policies where tablename='actividad' and cmd in ('INSERT','UPDATE','DELETE');`),
    "0",
  );
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.clientes where nombre = '${CLIENTE}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
