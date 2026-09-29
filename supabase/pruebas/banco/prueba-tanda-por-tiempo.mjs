/**
 * Una tanda se corta por TIEMPO, y un envío a medias se puede seguir.
 *
 *     node supabase/pruebas/banco/prueba-tanda-por-tiempo.mjs
 *
 * ============================================================================
 * LO QUE LE PASÓ A LA ESCUELA
 * ============================================================================
 *
 * «Masivo Masterclass Boca Colorada — mandando — 168 destinatarios,
 *  11 entregados, 2 no llegaron, 155 por salir», con la barra girando desde
 * hacía horas.
 *
 * Once y dos son TRECE, y la tanda es de veinte. O sea que la llamada no
 * devolvió un error: se murió a la mitad. Se murió por el reloj —una función de
 * Netlify tiene diez segundos y veinte destinatarios reales no entran— y del
 * lado del navegador no había `catch`, así que la excepción se llevó puesto el
 * resumen y la ventana quedó en «mandando», que es el único paso que no se deja
 * cerrar.
 *
 * Y para rematar: desde la lista de envíos, a una campaña detenida sólo se le
 * podía dar FRENAR. Los 155 estaban bien guardados en «pendiente» y no había
 * ningún botón para seguir.
 *
 * ============================================================================
 * POR QUÉ ESTO NO SE VEÍA EN EL BANCO
 * ============================================================================
 *
 * Porque acá Meta contesta en un milisegundo y la base está en la misma
 * máquina. Veinte destinatarios tardan lo que no tarda nada, así que TODAS las
 * pruebas de envío masivo pasaban —y siguen pasando— sin tocar el problema.
 *
 * Por eso esta prueba le pone a Meta la lentitud de la vida real
 * (`POST /__lento`) antes de mandar nada. Con medio segundo por mensaje, veinte
 * no entran en el presupuesto, y ahí se puede ver si la tanda se corta sola.
 *
 * ============================================================================
 * CÓMO SE MIDE DÓNDE TERMINA UNA TANDA
 * ============================================================================
 *
 * Por el hueco. Dentro de una tanda los mensajes salen cada medio segundo; ENTRE
 * dos tandas hay además la subida de la imagen del encabezado, que acá tarda un
 * segundo y medio a propósito. Así que agrupando los `enviado_en` por saltos
 * grandes se reconstruye cuántos salieron en cada llamada, que es justo el
 * número que el arreglo tiene que cambiar:
 *
 *     ANTES   20, 10           ← contaba destinatarios, y por eso se moría
 *     AHORA   11, 11, 8        ← cuenta segundos
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación compilada.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = "/home/user/lesartsculinaires";
const PUERTO_META = 3149;
const ID = "prueba-tanda-lenta";
const CUANTOS = 30;

/** Medio segundo por mensaje: lo que tarda Meta de verdad, más o menos. */
const DEMORA_MENSAJE = 500;
/** Y segundo y medio la subida de la imagen, que es una vez por tanda. */
const DEMORA_MEDIA = 1500;

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-tanda-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
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

const limpiar = () => {
  sql(`
    delete from public.envio_destinatarios where envio_id in
      (select id from public.envios where nombre like 'PRUEBA tanda%');
    delete from public.envios where nombre like 'PRUEBA tanda%';
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono like '5037400%');
    delete from public.conversaciones where telefono like '5037400%';
    delete from public.oportunidades where codigo like 'TND-%';
    delete from public.clientes where nombre like 'Tanda %';
    delete from public.plantillas where id = '${ID}';
  `);
};
limpiar();

// ── la campaña, ya empezada y detenida a la mitad ──────────────────────────

/*
 * La plantilla con encabezado de imagen y el nombre en el cuerpo: la forma de
 * las que manda la escuela de verdad.
 */
const payload = JSON.stringify({
  id: ID,
  name: "prueba_tanda_con_header",
  language: "es",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::aW1n"] } },
    { type: "BODY", text: "Hola {{1}}, te esperamos en la masterclass." },
  ],
});

sql(`
  insert into public.plantillas (id, nombre, idioma, estado, categoria, cuerpo, variables, payload)
  values ('${ID}', 'prueba_tanda_con_header', 'es', 'APPROVED', 'MARKETING',
          'Hola {{1}}, te esperamos en la masterclass.', 1,
          '${payload.replace(/'/g, "''")}'::jsonb);
`);

/*
 * La imagen se pone como DIRECCIÓN al Meta de mentira.
 *
 * Es el camino que obliga a bajarla y subirla en cada tanda, que es lo que hace
 * visible dónde termina una llamada y empieza la siguiente. Y de paso prueba
 * que una campaña con imagen en el encabezado sale entera, que hasta ahora no
 * se había probado más que de a un mensaje.
 */
const valores = JSON.stringify([
  { de: "texto", texto: `http://127.0.0.1:${PUERTO_META}/cdn/masterclass.png` },
  { de: "nombre" },
]);

sql(`
  insert into public.envios
    (nombre, plantilla_id, plantilla_nombre, idioma, cuerpo, valores, estado, empezado_en)
  values ('PRUEBA tanda lenta', '${ID}', 'prueba_tanda_con_header', 'es',
          'Hola {{1}}, te esperamos en la masterclass.',
          '${valores.replace(/'/g, "''")}'::jsonb, 'enviando', now());

  insert into public.clientes (nombre, telefono)
  select 'Tanda ' || g, '503740' || lpad(g::text, 5, '0')
  from generate_series(1, ${CUANTOS}) g;

  insert into public.oportunidades (codigo, cliente_id)
  select 'TND-' || c.id, c.id
  from public.clientes c where c.nombre like 'Tanda %';

  insert into public.envio_destinatarios (envio_id, cliente_id, oportunidad_id, telefono, nombre)
  select e.id, c.id, o.id, c.telefono, c.nombre
  from public.envios e
  join public.clientes c on c.nombre like 'Tanda %'
  join public.oportunidades o on o.cliente_id = c.id
  where e.nombre = 'PRUEBA tanda lenta';
`);

es(
  `la campaña arranca con ${CUANTOS} pendientes`,
  sql(`select count(*) from public.envio_destinatarios where estado='pendiente'
       and envio_id in (select id from public.envios where nombre='PRUEBA tanda lenta')`),
  String(CUANTOS),
);

// ── el Meta de mentira, lento como el de verdad ────────────────────────────

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

parar(PUERTO_META);
execSync(
  `cd ${RAIZ} && (setsid node supabase/pruebas/banco/meta-de-mentira.mjs ${PUERTO_META} > /tmp/meta-tanda.log 2>&1 < /dev/null &)`,
  { shell: "/bin/bash" },
);
execSync("sleep 2");

execSync(
  `curl -s -X POST http://127.0.0.1:${PUERTO_META}/__lento ` +
    `-H 'content-type: application/json' ` +
    `-d '{"mensaje": ${DEMORA_MENSAJE}, "media": ${DEMORA_MEDIA}}' > /dev/null`,
  { shell: "/bin/bash" },
);

/*
 * La aplicación, apuntando a ese Meta y recompilada por quien corre la prueba.
 *
 * `next start` sirve la compilación que tenía al arrancar, así que se reinicia
 * para medir el código de ahora y no el de la última vez.
 */
/*
 * El entorno de antes se guarda para devolverlo al terminar.
 *
 * Esta prueba apunta la aplicación a SU Meta de mentira, en un puerto propio, y
 * al terminar lo mata. Sin devolver el entorno, la siguiente prueba que no
 * levante la aplicación por su cuenta —hay varias— se quedaría hablándole a un
 * puerto muerto y fallaría por algo que no es suyo.
 */
const ENV = `${RAIZ}/.env.local`;
const entornoDeAntes = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : null;

parar(3142);
fs.writeFileSync(
  `${RAIZ}/.env.local`,
  [
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3141",
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/anon.txt`, "utf8").trim()}`,
    `SUPABASE_SERVICE_ROLE_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-servicio.txt`, "utf8").trim()}`,
    "WHATSAPP_APP_SECRET=secreto-de-prueba",
    "WHATSAPP_VERIFY_TOKEN=verifica-prueba",
    "WHATSAPP_TOKEN=token-de-prueba",
    "WHATSAPP_PHONE_NUMBER_ID=111",
    "WHATSAPP_WABA_ID=222",
    `WHATSAPP_GRAPH_URL=http://127.0.0.1:${PUERTO_META}`,
  ].join("\n") + "\n",
  "utf8",
);
execSync(`cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-tanda.log 2>&1 < /dev/null &)`, {
  shell: "/bin/bash",
});
{
  let vivo = false;
  for (let i = 0; i < 40; i++) {
    const code = execSync("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true", {
      encoding: "utf8",
      shell: "/bin/bash",
    }).trim();
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/tanda-${n}.png` });

await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 1. UNA CAMPAÑA DETENIDA SE PUEDE SEGUIR, NO SÓLO FRENAR ──");
// ══════════════════════════════════════════════════════════════════════════
await p.locator('aside button[data-mod="Envíos"]').click();
await p.waitForTimeout(2200);
await p.getByText("PRUEBA tanda lenta").first().click();
await p.waitForTimeout(1200);
await foto("1-detenida");

const seguir = p.locator("[data-seguir-envio]");
es("APARECE EL BOTÓN DE SEGUIR", await seguir.count(), 1);
es(
  "y dice cuántos faltan",
  /faltan 30/.test((await seguir.first().innerText()).replace(/\s+/g, " ")),
  true,
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. Y MANDA LOS 30, EN VARIAS TANDAS ──");
// ══════════════════════════════════════════════════════════════════════════
await seguir.first().click();

{
  let listo = false;
  // 30 mensajes a medio segundo, más una imagen por tanda: veinticinco
  // segundos largos. El doble de margen para una máquina cargada.
  for (let i = 0; i < 120; i++) {
    const faltan = sql(`select count(*) from public.envio_destinatarios where estado='pendiente'
                        and envio_id in (select id from public.envios where nombre='PRUEBA tanda lenta')`);
    if (faltan === "0") {
      listo = true;
      break;
    }
    await p.waitForTimeout(1000);
  }
  es("NO QUEDÓ NINGUNO PENDIENTE", listo, true);
}

await p.waitForTimeout(2500);
await foto("2-terminada");

es(
  "los 30 salieron",
  sql(`select count(*) from public.envio_destinatarios where estado in ('enviado','entregado')
       and envio_id in (select id from public.envios where nombre='PRUEBA tanda lenta')`),
  String(CUANTOS),
);
es(
  "ninguno quedó marcado como fallido",
  sql(`select count(*) from public.envio_destinatarios where estado='fallido'
       and envio_id in (select id from public.envios where nombre='PRUEBA tanda lenta')`),
  "0",
);
es(
  "y la campaña quedó terminada, no «mandando»",
  sql(`select estado from public.envios where nombre='PRUEBA tanda lenta'`),
  "terminado",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. NINGUNA TANDA LLEGÓ A LOS VEINTE: SE CORTÓ POR TIEMPO ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * Es LA prueba del arreglo. Sin el corte por tiempo, las tandas son de veinte
 * destinatarios pase lo que pase con el reloj, que es exactamente lo que hacía
 * que la llamada se muriera en producción a los trece.
 */
{
  const crudos = sql(`
    select extract(epoch from enviado_en) * 1000
    from public.envio_destinatarios
    where envio_id in (select id from public.envios where nombre='PRUEBA tanda lenta')
      and enviado_en is not null
    order by enviado_en
  `)
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map(Number);

  /*
   * El salto entre dos tandas es la subida de la imagen —segundo y medio— y el
   * de adentro es medio segundo. Un segundo separa las dos cosas con holgura.
   */
  const CORTE_MS = 1000;
  const tandas = [];
  for (let i = 0; i < crudos.length; i++) {
    if (i === 0 || crudos[i] - crudos[i - 1] > CORTE_MS) tandas.push(1);
    else tandas[tandas.length - 1] += 1;
  }

  console.log(`   tandas: ${tandas.join(", ")}`);

  es("salieron todos, contando por tandas", tandas.reduce((a, b) => a + b, 0), CUANTOS);
  es("hubo más de una tanda", tandas.length > 1, true);
  es(
    "NINGUNA TANDA LLEGÓ A LOS 20 QUE PERMITE EL TOPE DE DESTINATARIOS",
    Math.max(...tandas) < 20,
    true,
  );
}

await nav.close();
limpiar();
parar(PUERTO_META);

// El banco, como estaba: entorno de antes y la aplicación levantada con él.
if (entornoDeAntes != null) {
  fs.writeFileSync(ENV, entornoDeAntes, "utf8");
  parar(3142);
  execSync(
    `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-tanda-vuelta.log 2>&1 < /dev/null &)`,
    { shell: "/bin/bash" },
  );
  for (let i = 0; i < 40; i++) {
    const code = execSync("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true", {
      encoding: "utf8",
      shell: "/bin/bash",
    }).trim();
    if (code === "200") break;
    execSync("sleep 1");
  }
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
