/**
 * Los nombres que Meta da TARDE.
 *
 *     node supabase/pruebas/banco/prueba-nombres-tardios.mjs
 *
 * ============================================================================
 * EL CASO REAL QUE OBLIGÓ A ESCRIBIR ESTO
 * ============================================================================
 *
 * La escuela abrió la bandeja y vio treinta y siete hilos de Instagram y
 * Messenger titulados con un número de diecisiete dígitos. Los mensajes
 * entraban bien; los nombres, no.
 *
 * La causa: Meta no manda el nombre junto al mensaje. Hay que pedirlo en una
 * consulta aparte, y mientras la aplicación está en modo desarrollo esa consulta
 * contesta «(#10) Application does not have permission for this action». O sea
 * que TODOS los hilos que entran durante la espera se guardan sin nombre.
 *
 * Eso, solo, estaría bien: vale más guardar el mensaje sin nombre que perderlo.
 *
 * ============================================================================
 * LO QUE ESTABA MAL DE VERDAD
 * ============================================================================
 *
 * Que el nombre se pedía UNA SOLA VEZ, al abrir el hilo. Así que el día que Meta
 * apruebe la revisión, esos treinta y siete se quedaban con el número PARA
 * SIEMPRE: los nuevos entrarían con nombre y los viejos no, sin nada que lo
 * explicara y sin forma de arreglarlo desde la pantalla.
 *
 * Esta prueba es exactamente esa película, en orden:
 *
 *   1. Meta dice que no  →  el hilo entra igual, sin nombre
 *   2. Meta dice que sí  →  el hilo VIEJO se arregla cuando esa persona vuelve
 *   3. y no se le pregunta de nuevo por cada mensaje
 *   4. y un nombre que escribió una persona NO se pisa nunca
 *
 * El punto 4 es el que no se puede aflojar. Si ventas corrigió una ficha a mano,
 * lo que diga Meta después vale menos.
 *
 * Necesita el banco armado (`armar.sh`), el Meta de mentira en 3144 y la
 * aplicación en 3142 con `INSTAGRAM_GRAPH_URL=http://127.0.0.1:3144`,
 * `INSTAGRAM_TOKEN`, `INSTAGRAM_ACCOUNT_ID` y `WHATSAPP_APP_SECRET=secreto-de-prueba`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const SECRETO = "secreto-de-prueba";
const PUERTO_META = 3144;
const RAIZ = "http://127.0.0.1:3142";
const PAGINA = "107321267900000";

const marca = Date.now();

/*
 * Identificadores NUEVOS en cada corrida, terminados en el sufijo que el Meta
 * de mentira sabe contestar.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ NO SON FIJOS
 * ----------------------------------------------------------------------------
 *
 * Porque el CRM se acuerda, mientras la instancia siga viva, de a quién ya le
 * preguntó el perfil: es lo que evita una llamada a Meta por cada mensaje de
 * alguien que todavía no tiene nombre. Con identificadores fijos, correr esta
 * prueba dos veces seguidas sin reiniciar el servidor fallaba en la sección 2
 * por ese recuerdo, o sea por algo que funciona bien.
 *
 * El sufijo decide el nombre —ver `meta-de-mentira.mjs`—. El `0003` a propósito
 * NO tiene @usuario, porque Messenger no lo entrega y el CRM tiene que
 * arreglárselas con el nombre solo.
 */
const cola = String(marca).slice(-11);
const IG = `17${cola}0001`;
const IG_OTRA = `17${cola}0002`;
const MSN = `24${cola}0003`;
/** Sólo para la sección de pantalla, que necesita a alguien todavía sin nombre. */
const IG_TARDE = `17${cola}0004`;

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `nom-${process.pid}-${Math.random()}.sql`);
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

const TODOS = [IG, IG_OTRA, MSN, IG_TARDE];

const limpiar = () => {
  const lista = TODOS.map((i) => `'${i}'`).join(",");
  sql(`
    create temporary table if not exists _nom as
      select cliente_id from public.contactos_canal where identificador in (${lista});
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador in (${lista}));
    delete from public.conversaciones where identificador in (${lista})
       or cliente_id in (select cliente_id from _nom);
    delete from public.contactos_canal where identificador in (${lista});
    delete from public.oportunidades where cliente_id in (select cliente_id from _nom);
    delete from public.clientes where id in (select cliente_id from _nom);
    drop table if exists _nom;
  `);
};
limpiar();

const comoMeta = async (ruta, carga) => {
  const cuerpo = JSON.stringify(carga);
  const firma = "sha256=" + crypto.createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
  const r = await fetch(`${RAIZ}${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": firma },
    body: cuerpo,
  });
  return r.status;
};

/** Una carga de Meta con un mensaje de texto. `page` para Messenger, `instagram` para IG. */
const unMensaje = (objeto, quien, mid, texto) => ({
  object: objeto,
  entry: [
    {
      id: PAGINA,
      time: Date.now(),
      messaging: [
        {
          sender: { id: quien },
          recipient: { id: PAGINA },
          timestamp: Date.now(),
          message: { mid, text: texto },
        },
      ],
    },
  ],
});

/** Le dice al Meta de mentira si deja leer perfiles o no. */
const metaPermite = async (permite) => {
  const r = await fetch(`http://127.0.0.1:${PUERTO_META}/__perfiles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permite }),
  });
  return (await r.json()).permite;
};

const cuantasConsultas = async () =>
  (await (await fetch(`http://127.0.0.1:${PUERTO_META}/__perfiles-pedidos`)).json()).length;

/** Lo que quedó guardado del hilo y de la ficha. */
const hilo = (canal, quien) =>
  sql(`
    select coalesce(c.nombre_perfil,'-') || '|' || coalesce(c.usuario,'-')
        || '|' || coalesce(p.nombre,'-')
      from public.conversaciones c
      left join public.clientes p on p.id = c.cliente_id
     where c.canal = '${canal}' and c.identificador = '${quien}';
  `);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. Meta dice que no: el mensaje entra igual, sin nombre ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es("el Meta de mentira arranca negando perfiles", await metaPermite(false), false);

  es(
    "el mensaje de Instagram entra",
    await comoMeta("/api/instagram/webhook", unMensaje("instagram", IG, `m_a${marca}`, "Hola")),
    200,
  );

  es("y el hilo quedó sin nombre, sin @usuario, con la ficha de respaldo",
    hilo("instagram", IG), "-|-|Contacto de Instagram");

  es(
    "el de Messenger igual",
    await comoMeta("/api/messenger/webhook", unMensaje("page", MSN, `m_b${marca}`, "Buenas")),
    200,
  );

  es("y su ficha también es la de respaldo, con el nombre del canal",
    hilo("messenger", MSN), "-|-|Contacto de Messenger");

  /*
   * Esto es lo que se veía en la bandeja, y es el punto de partida.
   *
   * Sin el arreglo, acá terminaba la historia: el hilo se quedaba así aunque
   * después Meta cambiara de opinión.
   */
  es(
    "el mensaje sí se guardó, que es lo que no se podía perder",
    sql(`select texto from public.mensajes m
           join public.conversaciones c on c.id = m.conversacion_id
          where c.identificador = '${IG}';`),
    "Hola",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. Meta dice que sí: el hilo viejo se arregla al volver a escribir ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es("ahora Meta permite leer perfiles", await metaPermite(true), true);

  es(
    "la persona vuelve a escribir",
    await comoMeta("/api/instagram/webhook", unMensaje("instagram", IG, `m_c${marca}`, "¿Precio?")),
    200,
  );

  // El hilo YA existía sin nombre: este es el caso que antes no se arreglaba nunca.
  es("el hilo viejo quedó con nombre, @usuario y la ficha renombrada",
    hilo("instagram", IG), "Ana Beltrán|anabeltran|Ana Beltrán");

  es(
    "un hilo NUEVO entra con nombre de una",
    await comoMeta(
      "/api/instagram/webhook",
      unMensaje("instagram", IG_OTRA, `m_d${marca}`, "Consulta"),
    ),
    200,
  );
  es("y también en la ficha", hilo("instagram", IG_OTRA), "Rosa Mejía|rosamejia|Rosa Mejía");

  es(
    "Messenger vuelve a escribir",
    await comoMeta("/api/messenger/webhook", unMensaje("page", MSN, `m_e${marca}`, "Gracias")),
    200,
  );

  /*
   * El @usuario queda en `-`, y es lo correcto.
   *
   * Messenger no entrega @usuario. Poner uno inventado —o repetir el nombre con
   * una arroba adelante— sería mostrar en la bandeja algo que no existe y que
   * nadie va a poder buscar en Facebook.
   */
  es("Messenger se arregla con el nombre solo, sin inventar un @usuario",
    hilo("messenger", MSN), "Carlos Núñez|-|Carlos Núñez");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. con el nombre puesto, no se le pregunta más a Meta ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const antes = await cuantasConsultas();

  for (let i = 0; i < 3; i++) {
    await comoMeta(
      "/api/instagram/webhook",
      unMensaje("instagram", IG, `m_f${marca}_${i}`, `mensaje ${i}`),
    );
  }

  /*
   * Cero consultas, no «pocas».
   *
   * La consulta de perfil cuesta una llamada a Meta DENTRO del webhook, o sea
   * que se la paga en el tiempo que tarda en entrar cada mensaje. Preguntar el
   * nombre de alguien que ya tiene nombre es tiempo regalado en el peor lugar.
   */
  es("tres mensajes más y ninguna consulta de perfil", (await cuantasConsultas()) - antes, 0);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. lo que escribió una persona no se pisa ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(`
    update public.clientes set nombre = 'Sra. Beltrán (la de los brownies)'
     where id = (select cliente_id from public.conversaciones
                  where canal='instagram' and identificador='${IG}');
  `);

  await comoMeta(
    "/api/instagram/webhook",
    unMensaje("instagram", IG, `m_g${marca}`, "¿Sigue abierto?"),
  );

  es(
    "el nombre corregido a mano sigue ahí después de otro mensaje",
    sql(`select p.nombre from public.clientes p
           join public.conversaciones c on c.cliente_id = p.id
          where c.canal='instagram' and c.identificador='${IG}';`),
    "Sra. Beltrán (la de los brownies)",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. los canales no se cruzan, con nombres o sin ellos ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Lo mismo que vigila `prueba-messenger.mjs`, pero sobre el camino nuevo.
   *
   * `completarPerfilSiFalta` busca y escribe por `(canal, identificador)`. Si
   * algún día alguien saca el canal de esa búsqueda para «simplificar», el
   * nombre de una persona de Instagram terminaría pisando el hilo de otra de
   * Messenger que por casualidad tenga el mismo número. Esto se pondría rojo.
   */
  es(
    "cada canal tiene su hilo y su ficha",
    sql(`select count(distinct c.id) || '/' || count(distinct c.cliente_id)
           from public.conversaciones c
          where c.identificador in ('${IG}','${IG_OTRA}','${MSN}');`),
    "3/3",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. el botón de la bandeja dice qué pasó, en castellano ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Esta sección es la respuesta a «¿por qué sale el número?».
   *
   * Que el CRM se arregle solo está probado arriba. Lo que se prueba acá es lo
   * otro que hacía falta: que cuando NO se puede, quien está mirando la pantalla
   * se entere de que el problema es un permiso pendiente en Meta y no el CRM.
   * Sin eso, la única forma de saberlo era leer los registros del servidor.
   */
  await metaPermite(false);

  // Un hilo nuevo sin nombre, para que el botón tenga algo que intentar.
  await comoMeta(
    "/api/instagram/webhook",
    unMensaje("instagram", IG_TARDE, `m_h${marca}`, "¿Hay cupo?"),
  );
  es("el hilo de prueba está sin nombre", hilo("instagram", IG_TARDE), "-|-|Contacto de Instagram");

  const jwt = fs
    .readFileSync(path.join(import.meta.dirname, "jwt-jefa.txt"), "utf8")
    .trim();
  const galleta =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt, token_type: "bearer", expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
        user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
      }),
    ).toString("base64");

  const { chromium } = await import("playwright");
  const nav = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
  ]);
  // Sin esto, el aviso de «Pendientes para hoy» se abre encima y tapa la
  // bandeja. Es lo mismo que hacen las demás pruebas de pantalla.
  await ctx.addInitScript((h) => {
    try { localStorage.setItem("lac.reservas.visto", h); } catch {}
  }, new Date().toISOString().slice(0, 10));

  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));

  await p.goto(`${RAIZ}/?mod=x`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2200);

  // Abrir el cuadro de Instagram, que es donde vive el botón.
  await p.locator('main button[title*="Instagram"]').first().click();
  await p.waitForTimeout(700);

  const boton = p.locator("[data-refrescar-nombres]").first();
  es("el botón está en el cuadro del canal", await boton.count(), 1);

  await boton.click();
  await p.waitForTimeout(4000);

  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  /*
   * Se mira que diga el porqué, no la frase exacta.
   *
   * La traducción está en `lib/meta/perfil.ts` y va a cambiar de palabras. Lo
   * que no puede cambiar es que nombre a Meta y al permiso: si un día esto
   * vuelve a decir «no se pudo», la prueba se pone roja.
   */
  es("dice que el permiso lo tiene que dar Meta", /Meta todav[íi]a no le permite/.test(t), true);
  es("y nombra el modo Live con Acceso Avanzado", /Acceso Avanzado/.test(t), true);

  // Ahora Meta deja, y el mismo botón tiene que resolverlo.
  await metaPermite(true);
  await boton.click();
  await p.waitForTimeout(4000);

  es("con el permiso puesto, el hilo queda con nombre",
    hilo("instagram", IG_TARDE), "Lucía Paz|luciapaz|Lucía Paz");

  const t2 = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("y lo dice", /Se resolvieron \d+ de \d+/.test(t2), true);

  es("sin errores en la página", errores, []);
  await nav.close();
}

limpiar();
await metaPermite(false);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallas.`);
process.exit(f === 0 ? 0 : 1);
