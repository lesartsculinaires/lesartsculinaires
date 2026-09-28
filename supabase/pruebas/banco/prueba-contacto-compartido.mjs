/**
 * Un contacto compartido: que se vea el número y se pueda usar.
 *
 *     node supabase/pruebas/banco/prueba-contacto-compartido.mjs
 *
 * ============================================================================
 * QUÉ SE ESTABA PERDIENDO
 * ============================================================================
 *
 * Una clienta adjuntó un contacto —«acá le comparto el número»— y en el hilo
 * quedó sólo «Contacto: Mami❤️». El número no aparecía por ningún lado, así que
 * para usarlo había que abrir WhatsApp en el teléfono y copiarlo a mano.
 *
 * Y el dato estaba. Meta lo manda entero en el webhook y el CRM guarda ese
 * cuerpo tal cual en `mensajes.payload` desde el primer día; lo único que se
 * leía era el nombre.
 *
 * ESO IMPORTA PARA CÓMO SE SIEMBRA ESTA PRUEBA. El mensaje se inserta con su
 * `payload` y sin ningún campo nuevo, igual que como quedó guardado el de
 * verdad. Si hiciera falta una columna que no existe, la prueba no podría
 * sembrarlo así y eso ya diría que el arreglo no sirve para lo que ya llegó.
 *
 * ============================================================================
 * POR QUÉ LA PRUEBA REARRANCA LA APLICACIÓN
 * ============================================================================
 *
 * Porque sin eso no prueba nada, y se comprobó: con el lector anulado a
 * propósito, esta prueba pasaba igual. `next start` sirve la compilación que
 * tenía cuando arrancó, así que recompilar mientras corre no cambia lo que
 * contesta —y una prueba que pasa haga lo que haga el código da confianza
 * falsa, que es peor que no tenerla—.
 *
 * Rearrancando acá, lo que se mide es siempre el código de ahora.
 *
 * Necesita el banco armado (`armar.sh`).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-contacto-${process.pid}-${Math.random()}.sql`);
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

const TEL = "50375290099";
/** El de la tarjeta compartida, distinto del de la conversación. */
const EL_COMPARTIDO = "50375290078";
const NOMBRE = "Nine Prueba";

const limpiar = () => {
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono in ('${TEL}', '${EL_COMPARTIDO}'));
    delete from public.conversaciones where telefono in ('${TEL}', '${EL_COMPARTIDO}');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where telefono in ('${TEL}', '${EL_COMPARTIDO}'));
    delete from public.clientes where telefono in ('${TEL}', '${EL_COMPARTIDO}');
  `);
};
limpiar();

/*
 * El mensaje, con el payload tal como lo manda Meta.
 *
 * Se copia la forma —`formatted_name`, `phones[].wa_id`, `type: "CELL"`— y no
 * se simplifica: lo que se está probando es que el CRM lea lo que manda Meta,
 * no lo que yo escribí.
 */
const payload = JSON.stringify({
  from: TEL,
  id: "wamid.CONTACTO.PRUEBA",
  type: "contacts",
  contacts: [
    {
      name: { formatted_name: "Mami❤️", first_name: "Mami" },
      phones: [{ phone: "+503 7529 0078", wa_id: EL_COMPARTIDO, type: "CELL" }],
    },
  ],
});

sql(`
  insert into public.conversaciones (telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto)
  values ('${TEL}', '${NOMBRE}', now(), 'Contacto: Mami');

  insert into public.mensajes
    (conversacion_id, wa_id, direccion, tipo, texto, estado, creado_en, payload)
  select c.id, 'wamid.CONTACTO.PRUEBA', 'entrante', 'contacts', 'Contacto: Mami❤️',
         'recibido', now(), '${payload.replace(/'/g, "''")}'::jsonb
    from public.conversaciones c where c.telefono = '${TEL}';
`);

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`${RAIZ}/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const JEFA = subDe("jwt-jefa.txt");

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
      user: { id: JEFA, email: "jefa@lac.test" },
    }),
  ).toString("base64");

// ── la aplicación, con la compilación de ahora ─────────────────────────────

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
  `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-contacto.log 2>&1 < /dev/null &)`,
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/contacto-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);

await p.getByText(NOMBRE, { exact: false }).first().click();
await p.waitForTimeout(2500);
await foto("1-hilo");

console.log("── 1. EL NÚMERO SE VE ──");
{
  const t = await texto();

  es("está el nombre del contacto", /Mami/.test(t), true);
  /*
   * Lo que faltaba. Sin esto el mensaje dice a quién comparten y no cómo
   * llegarle, que es todo el sentido de compartir un contacto.
   */
  es("Y ESTÁ EL NÚMERO", /\+503 7529 0078/.test(t), true);
  es("con su clase, en castellano", /Celular/.test(t), true);
  es("no dice «CELL»", /CELL/.test(t), false);
}

console.log("\n── 2. Y SE PUEDE USAR ──");
const crear = p.getByRole("button", { name: "Crear ficha y abrir chat", exact: true });
es("hay un botón para darlo de alta", await crear.count(), 1);
es("y uno para copiar el número", await p.getByRole("button", { name: "Copiar", exact: true }).count(), 1);

es(
  "todavía no existe esa ficha",
  sql(`select count(*) from public.clientes where telefono = '${EL_COMPARTIDO}';`),
  "0",
);

await crear.first().click();
await p.waitForTimeout(3500);
await foto("2-creada");

console.log("\n── 3. QUÉ QUEDÓ EN LA BASE ──");
{
  es(
    "SE CREÓ LA FICHA, con el nombre del contacto",
    sql(`select nombre from public.clientes where telefono = '${EL_COMPARTIDO}';`),
    "Mami❤️",
  );

  /*
   * Y su chat, que es la mitad que hace que esto ahorre trabajo: sin el hilo
   * abierto habría que buscarla en Clientes y abrirlo a mano.
   */
  es(
    "y su conversación quedó abierta",
    sql(`select count(*) from public.conversaciones where telefono = '${EL_COMPARTIDO}';`),
    "1",
  );

  es("la pantalla lo dice", /Ficha creada y chat abierto/.test(await texto()), true);
}

console.log("\n── 4. Y NO SE DUPLICA ──");
{
  /*
   * Apretarlo dos veces no puede crear dos fichas con el mismo número: dos
   * fichas de la misma persona parten su historial en dos y nadie se entera.
   */
  await crear.first().click();
  await p.waitForTimeout(3000);

  es(
    "SIGUE HABIENDO UNA SOLA FICHA",
    sql(`select count(*) from public.clientes where telefono = '${EL_COMPARTIDO}';`),
    "1",
  );
  es(
    "y se explica por qué, con el nombre de quien ya está",
    /ya es de Mami|Ya tenía ficha/.test(await texto()),
    true,
  );
  await foto("3-sin-duplicar");
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.clientes where telefono = '${EL_COMPARTIDO}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
