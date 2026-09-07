/**
 * ¿El CRM aguanta desplegarse ANTES de que se corra el SQL de Instagram?
 *
 *     node supabase/pruebas/banco/prueba-sin-migracion-instagram.mjs
 *
 * ============================================================================
 * POR QUÉ ESTA PRUEBA EXISTE
 * ============================================================================
 *
 * Por el orden en que pasan las cosas de verdad. Netlify despliega apenas se
 * sube el código; el SQL lo corre una persona a mano en Supabase, después —a
 * veces horas después, a veces al día siguiente—. Entre una cosa y la otra el
 * CRM corre contra una base que todavía no tiene las columnas nuevas.
 *
 * Y PostgREST no perdona eso: pedirle una columna que no existe no devuelve un
 * hueco, tumba la consulta entera con un 42703. Una sola columna de más en un
 * `select` deja al equipo sin poder contestar NINGÚN mensaje, ni de Instagram
 * ni de WhatsApp, hasta que alguien se acuerde de correr el SQL.
 *
 * ============================================================================
 * QUÉ SE PRUEBA
 * ============================================================================
 *
 * Se le SACAN a la base las columnas que agrega `20261024120000_instagram.sql`
 * —dejándola como está hoy la de producción antes de correrlo— y se comprueba
 * que todo lo de WhatsApp siga andando:
 *
 *   LA BANDEJA CARGA        Los hilos se ven. Es lo primero que se rompería.
 *   SE PUEDE CONTESTAR      Que el cuadro de escribir esté y que al mandar el
 *                           error sea el del token de mentira del banco, y NO
 *                           uno de columna que falta.
 *   ENTRA UN MENSAJE NUEVO  El webhook abre el hilo al modo viejo en vez de
 *                           perder el mensaje.
 *
 * Al terminar vuelve a poner la migración, así el banco queda como estaba.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `sinmig-${process.pid}-${Math.random()}.sql`);
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

/** PostgREST guarda en memoria qué columnas hay; sin esto no se entera. */
const avisarle = () => {
  sql("notify pgrst, 'reload schema';");
  execSync("sleep 2");
};

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const TEL = "50370999111";
const NOMBRE = "Antes De La Migracion PRUEBA";
const TEL_NUEVO = "50370999222";

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono in ('${TEL}', '${TEL_NUEVO}'));
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre like '%PRUEBA%' and nombre like '%Migracion%');
    delete from public.conversaciones where telefono in ('${TEL}', '${TEL_NUEVO}');
    delete from public.clientes where nombre like '%Antes De La Migracion PRUEBA%'
       or telefono = '${TEL_NUEVO}';
  `);

/* ══════════════════════════════════════════════════════════════════════════
 * La base, como está antes de correr el SQL.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Se deshace la migración: se sacan las dos columnas, el índice por canal y el
 * disparador, y vuelve la unicidad por teléfono. Es el estado exacto contra el
 * que va a correr el código recién desplegado.
 */
console.log("── deshaciendo la migración de Instagram en el banco ──");
limpiar();
sql(`
  drop trigger if exists trg_identidad_del_hilo on public.conversaciones;
  drop function if exists public.identidad_del_hilo();
  drop index if exists public.ux_conversaciones_canal_identidad;
  alter table public.conversaciones drop column if exists identificador;
  alter table public.conversaciones drop column if exists usuario;
  alter table public.conversaciones alter column telefono set not null;
  alter table public.conversaciones
    add constraint conversaciones_telefono_key unique (telefono);
`);
avisarle();

es(
  "la base quedó sin `identificador`, como la de producción hoy",
  sql(`select count(*) from information_schema.columns
        where table_schema='public' and table_name='conversaciones'
          and column_name in ('identificador','usuario');`),
  "0",
);

// Un hilo de WhatsApp de los de siempre, insertado al modo viejo.
sql(`
  insert into public.clientes (nombre, telefono) values ('${NOMBRE}', '${TEL}');
  insert into public.conversaciones (telefono, nombre_perfil, canal, cliente_id, ultimo_mensaje_en, ultimo_texto)
  select '${TEL}', '${NOMBRE}', 'whatsapp', c.id, now(), 'Hola, quiero información'
    from public.clientes c where c.nombre = '${NOMBRE}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.SINMIG', 'entrante', 'text', 'Hola, quiero información', now()
    from public.conversaciones v where v.telefono = '${TEL}';
`);

const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt,
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      refresh_token: "x",
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/sinmig-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

try {
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2400);
  await foto("1-bandeja");

  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── 1. LA BANDEJA CARGA IGUAL ──");
  // ════════════════════════════════════════════════════════════════════════
  {
    const t = await texto();
    es("EL HILO SE VE", t.includes(NOMBRE), true);
    es("y no hay un aviso de migración que falta", /falta correr/i.test(t), false);
  }

  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. SE PUEDE CONTESTAR ──");
  // ════════════════════════════════════════════════════════════════════════
  //
  // Lo que se rompía: el `select` pedía `identificador`, PostgREST tumbaba la
  // consulta entera con un 42703 y contestar fallaba con un error de base de
  // datos que no dice nada.
  {
    await p.locator(`button.row:has-text("${NOMBRE}")`).first().click();
    await p.waitForTimeout(2000);

    const caja = p.locator("main textarea").first();
    es("el cuadro de escribir está", await caja.count(), 1);

    await caja.fill("Contestando sin la migración corrida");
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: /^Enviar$|^Mandar$/ }).first().click();
    await p.waitForTimeout(4000);
    await foto("2-contestando");

    const t = await texto();
    /*
     * En el banco no hay Meta, así que el envío falla igual: el token es de
     * mentira. Lo que importa es POR QUÉ falla.
     *
     * Que diga lo del token quiere decir que llegó hasta Meta, o sea que la
     * consulta a la base anduvo. Un error de columna sería la señal de que
     * volvimos a romperlo.
     */
    es(
      "NO FALLA POR LA COLUMNA QUE FALTA",
      /identificador|42703|column .* does not exist/i.test(t),
      false,
    );
    es(
      "llegó hasta Meta, que es lo que se quería probar",
      /token de WhatsApp|no está configurado|No se pudo contactar/i.test(t),
      true,
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. Y UN MENSAJE NUEVO SIGUE ENTRANDO ──");
  // ════════════════════════════════════════════════════════════════════════
  //
  // El webhook abre el hilo al modo viejo en vez de perder el mensaje. Es la
  // decisión de siempre: un dato de menos se arregla, un mensaje perdido no.
  {
    const crudo = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "222",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "50322334455", phone_number_id: "111" },
                contacts: [{ profile: { name: "Nuevo Sin Migracion PRUEBA" }, wa_id: TEL_NUEVO }],
                messages: [
                  {
                    from: TEL_NUEVO,
                    id: "wamid.SINMIG_NUEVO",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Escribo justo antes de que corran el SQL" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const firma = crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex");
    const r = await fetch("http://127.0.0.1:3142/api/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
      body: crudo,
    });

    es("el webhook contesta 200", r.status, 200);
    es(
      "EL MENSAJE SE GUARDÓ IGUAL",
      sql("select texto from public.mensajes where wa_id = 'wamid.SINMIG_NUEVO';"),
      "Escribo justo antes de que corran el SQL",
    );
    es(
      "y se le abrió su hilo",
      sql(`select count(*) from public.conversaciones where telefono = '${TEL_NUEVO}';`),
      "1",
    );
  }

  es("sin errores en la página", errores, []);
} finally {
  await ctx.close();
  await nav.close();

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── volviendo a poner la migración ──");
  // ══════════════════════════════════════════════════════════════════════
  limpiar();
  const mig = `${RAIZ}/supabase/migrations/20261024120000_instagram.sql`;
  fs.copyFileSync(mig, "/tmp/rehacer-ig.sql");
  fs.chmodSync("/tmp/rehacer-ig.sql", 0o644);
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -q -f /tmp/rehacer-ig.sql"`, {
    encoding: "utf8",
  });
  avisarle();

  es(
    "el banco quedó como estaba, con la migración puesta",
    sql(`select count(*) from information_schema.columns
          where table_schema='public' and table_name='conversaciones'
            and column_name in ('identificador','usuario');`),
    "2",
  );
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
