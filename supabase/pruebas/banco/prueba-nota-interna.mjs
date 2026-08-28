/**
 * La nota interna de la bandeja, ¿llega a la ficha y deja el recordatorio?
 *
 *     node supabase/pruebas/banco/prueba-nota-interna.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ SE ESTÁ PROBANDO
 * ------------------------------------------------------------------------
 *
 * Dos cosas que la escuela pidió juntas y que se prueban en el mismo camino:
 *
 *   LA NOTA VA A LOS DOS LADOS   se escribe en el chat y queda también en la
 *                                bitácora del lead. Antes vivía sólo en el
 *                                hilo: quien abría la ficha para ver qué se
 *                                había hablado no encontraba nada.
 *
 *   Y HEREDA LOS RECORDATORIOS   una nota interna que dice «recuperación»
 *                                deja su llamada agendada para dentro de una
 *                                semana, igual que si se hubiera escrito
 *                                desde la ficha. Antes eso no pasaba y el
 *                                asesor se quedaba sin el aviso.
 *
 * ------------------------------------------------------------------------
 * Y LO QUE NO TIENE QUE PASAR
 * ------------------------------------------------------------------------
 *
 * Que la nota interna salga a WhatsApp. Es del equipo: si se escapara, el
 * cliente leería lo que se dijo de él. Se comprueba que el mensaje quede
 * marcado como privado y sin id de Meta.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-nota-${process.pid}-${Math.random()}.sql`);
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
  sql(`select count(*) from pg_constraint
        where conname = 'seguimientos_tipo_check'
          and pg_get_constraintdef(oid) like '%recuperacion%';`) !== "1"
) {
  console.error("Falta el tipo. Corré 20261006120000_seguimiento_recuperacion.sql.");
  process.exit(1);
}

const TEL = "50370666001";
const CLIENTE = "Nota Interna Prueba";
const NOTA = "RECUPERACION: no contestó dos veces, hay que insistir.";

const limpiar = () => {
  sql(`
    delete from public.seguimientos where oportunidad_id in
      (select o.id from public.oportunidades o
         join public.clientes c on c.id = o.cliente_id
        where c.nombre = '${CLIENTE}');
    delete from public.oportunidad_notas where oportunidad_id in
      (select o.id from public.oportunidades o
         join public.clientes c on c.id = o.cliente_id
        where c.nombre = '${CLIENTE}');
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
    delete from public.oportunidades where codigo = 'NOT-0001';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre = '${CLIENTE}');
    delete from public.clientes where nombre = '${CLIENTE}';
  `);
};
limpiar();

sql(`
  insert into public.clientes (nombre, telefono) values ('${CLIENTE}', '${TEL}');

  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'NOT-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         current_date
    from public.clientes c where c.nombre = '${CLIENTE}';

  insert into public.conversaciones (telefono, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select '${TEL}', '${CLIENTE}', c.id, now()
    from public.clientes c where c.nombre = '${CLIENTE}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.NOT1', 'entrante', 'text', 'Hola', now()
    from public.conversaciones v where v.telefono = '${TEL}';
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/nota-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);

console.log("── se escribe una nota interna en el chat ──");
await p.getByText(CLIENTE, { exact: false }).first().click();
await p.waitForTimeout(1800);

// La casilla que convierte el cuadro de texto en nota interna.
const casilla = p.locator('main input[type="checkbox"]').first();
es("está la casilla de nota interna", await casilla.count(), 1);
await casilla.check();
await p.waitForTimeout(600);

await p.locator("main textarea").first().fill(NOTA);
await p.waitForTimeout(400);
await foto("1-escrita");

await p.getByRole("button", { name: /Guardar nota|Enviar|Mandar/ }).first().click();
await p.waitForTimeout(3000);
await foto("2-guardada");

console.log("\n── qué quedó en la base ──");
{
  es(
    "la nota está en el hilo, marcada como privada",
    sql(`
      select count(*) from public.mensajes m
        join public.conversaciones v on v.id = m.conversacion_id
       where v.telefono = '${TEL}' and m.privado and m.texto like 'RECUPERACION:%';
    `),
    "1",
  );
  es(
    "y NO salió a WhatsApp: no tiene id de Meta",
    sql(`
      select count(*) from public.mensajes m
        join public.conversaciones v on v.id = m.conversacion_id
       where v.telefono = '${TEL}' and m.privado and m.wa_id is not null;
    `),
    "0",
  );

  es(
    "LA MISMA NOTA QUEDÓ EN LA FICHA",
    sql(`
      select count(*) from public.oportunidad_notas n
        join public.oportunidades o on o.id = n.oportunidad_id
       where o.codigo = 'NOT-0001' and n.nota like 'RECUPERACION:%';
    `),
    "1",
  );
  es(
    "y se sabe que vino del chat",
    sql(`
      select n.origen from public.oportunidad_notas n
        join public.oportunidades o on o.id = n.oportunidad_id
       where o.codigo = 'NOT-0001' and n.nota like 'RECUPERACION:%';
    `),
    "inbox",
  );

  es(
    "Y DEJÓ EL RECORDATORIO DE RECUPERACIÓN",
    sql(`
      select s.tipo from public.seguimientos s
        join public.oportunidades o on o.id = s.oportunidad_id
       where o.codigo = 'NOT-0001';
    `),
    "recuperacion",
  );
  es(
    "para dentro de una semana",
    sql(`
      select (s.proxima - current_date)::text from public.seguimientos s
        join public.oportunidades o on o.id = s.oportunidad_id
       where o.codigo = 'NOT-0001';
    `),
    "7",
  );
}

console.log("\n── y se ve en la ficha ──");
{
  await p.getByRole("button", { name: /Ver ficha|Ficha/ }).first().click();
  await p.waitForTimeout(2400);
  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("la bitácora la muestra", texto.includes("no contestó dos veces"), true);
  await foto("3-en-la-ficha");
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
