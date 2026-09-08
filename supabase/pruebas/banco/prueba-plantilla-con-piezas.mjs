/**
 * La plantilla con encabezado: el error que tumbó la campaña de la escuela.
 *
 *     node supabase/pruebas/banco/prueba-plantilla-con-piezas.mjs
 *
 * ============================================================================
 * QUÉ PASÓ
 * ============================================================================
 *
 * La escuela mandó una campaña y Meta rechazó los cinco mensajes con:
 *
 *     (#131008) Required parameter is missing
 *
 * No era la cuenta —eso da 131042— ni eran los números. El CRM armaba SÓLO el
 * cuerpo de la plantilla, y una plantilla de WhatsApp puede llevar además un
 * encabezado —texto con hueco, o una imagen— y botones con parte variable.
 * Faltando cualquiera de ésos, Meta rechaza el mensaje entero. Y no dice cuál
 * falta: dice «falta un parámetro» y nada más.
 *
 * La definición completa estaba guardada desde el primer día en
 * `plantillas.payload` —el comentario de la migración dice «para no perder los
 * botones y encabezados que hoy no se usan»— y nunca se había leído.
 *
 * ============================================================================
 * QUÉ SE PRUEBA
 * ============================================================================
 *
 *   SE MANDA EL ENCABEZADO       Con una plantilla que lleva encabezado de
 *                                texto con hueco, el envío tiene que incluir el
 *                                componente `header`. El Meta de mentira lo
 *                                EXIGE: si no llega, contesta 131008 igual que
 *                                el de verdad.
 *
 *   Y LOS BOTONES                Un botón de dirección con parte variable pide
 *                                su dato, con el índice que ocupa entre TODOS
 *                                los botones —no entre los variables—.
 *
 *   SE AVISA ANTES DE MANDAR     Con una plantilla que pide una imagen de
 *                                encabezado, el envío se frena y lo dice, en vez
 *                                de gastar trescientas peticiones que van a
 *                                fallar todas y bajarle la calificación al
 *                                número.
 *
 *   Y EL 131008 SE EXPLICA       Si igual llega a pasar, el mensaje dice qué
 *                                mirar, no «Required parameter is missing».
 *
 * Necesita el banco armado (`armar.sh`).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const PUERTO_META = 3145;

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `piezas-${process.pid}-${Math.random()}.sql`);
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

/*
 * Tres plantillas, y cada una prueba una cosa.
 *
 * El nombre lleva la seña que el Meta de mentira mira —ver `meta-de-mentira.mjs`—
 * porque la costura `WHATSAPP_GRAPH_URL` sólo acepta la dirección pelada de esta
 * máquina, sin parámetros. Es lo que impide que esa variable mande el token a
 * ningún lado, así que la seña viaja por donde sí se puede.
 */
const CON_HEADER = "prueba_con_header";
const CON_IMAGEN = "prueba_imagen_con_header";
const SOLO_TEXTO = "prueba_solo_texto";
/*
 * Una persona por campaña, y no una para las tres.
 *
 * El CRM no le vuelve a escribir a alguien que recibió algo en los últimos
 * siete días —es lo que evita que la gente bloquee el número— así que con una
 * sola persona la segunda campaña se quedaría sin destinatarios. La protección
 * está bien; lo que había que arreglar es la prueba.
 */
const GENTE = [
  { nombre: "Ana Piezas PRUEBA", tel: "50370800555" },
  { nombre: "Bea Piezas PRUEBA", tel: "50370800556" },
  { nombre: "Cris Piezas PRUEBA", tel: "50370800557" },
];

const limpiar = () =>
  sql(`
    delete from public.envio_destinatarios where envio_id in
      (select id from public.envios where nombre like 'PRUEBA Piezas%');
    delete from public.envios where nombre like 'PRUEBA Piezas%';
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono like '503708005%');
    delete from public.conversaciones where telefono like '503708005%';
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre like '%Piezas PRUEBA%');
    delete from public.clientes where nombre like '%Piezas PRUEBA%';
    delete from public.plantillas where nombre in
      ('${CON_HEADER}', '${CON_IMAGEN}', '${SOLO_TEXTO}');
  `);
limpiar();

/*
 * Las plantillas, con el `payload` tal como lo devuelve Meta.
 *
 * Es lo que hace que la prueba valga: si el payload fuera inventado a medida,
 * probaría que el código lee lo que yo escribí, no lo que manda Meta.
 */
const payloadConHeader = JSON.stringify({
  id: "plt-header",
  name: CON_HEADER,
  language: "es",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "TEXT", text: "Novedades de {{mes}}" },
    { type: "BODY", text: "Hola {{nombre}}, te esperamos en Les Arts Culinaires" },
    { type: "FOOTER", text: "Les Arts Culinaires" },
    {
      type: "BUTTONS",
      buttons: [
        // El primero NO lleva dato: está para que el índice del segundo sea 1 y
        // no 0. Numerar sólo los variables pondría el dato en el botón que no es.
        { type: "QUICK_REPLY", text: "No me interesa" },
        { type: "URL", text: "Ver el catálogo", url: "https://lac.edu.sv/{{ruta}}" },
      ],
    },
  ],
});

const payloadConImagen = JSON.stringify({
  id: "plt-imagen",
  name: CON_IMAGEN,
  language: "es",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::aW1n"] } },
    { type: "BODY", text: "Hola {{nombre}}, mirá el catálogo" },
  ],
});

const payloadSoloTexto = JSON.stringify({
  id: "plt-simple",
  name: SOLO_TEXTO,
  language: "es",
  status: "APPROVED",
  components: [{ type: "BODY", text: "Hola {{nombre}}, te esperamos" }],
});

sql(`
  insert into public.plantillas (id, nombre, idioma, estado, categoria, cuerpo, variables, payload)
  values
    ('plt-header', '${CON_HEADER}', 'es', 'APPROVED', 'MARKETING',
     'Hola {{nombre}}, te esperamos en Les Arts Culinaires', 1,
     '${payloadConHeader.replace(/'/g, "''")}'::jsonb),
    ('plt-imagen', '${CON_IMAGEN}', 'es', 'APPROVED', 'MARKETING',
     'Hola {{nombre}}, mirá el catálogo', 1,
     '${payloadConImagen.replace(/'/g, "''")}'::jsonb),
    ('plt-simple', '${SOLO_TEXTO}', 'es', 'APPROVED', 'MARKETING',
     'Hola {{nombre}}, te esperamos', 1,
     '${payloadSoloTexto.replace(/'/g, "''")}'::jsonb)
  on conflict (id) do update set payload = excluded.payload, estado = 'APPROVED';

  insert into public.clientes (nombre, telefono) values
    ${GENTE.map((g) => `('${g.nombre}', '${g.tel}')`).join(",\n    ")};

  -- Clientes lista oportunidades, así que sin lead no aparecerían para marcar.
  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, etapa_id, estado_id, fecha_registro)
  select 'PZA-000' || row_number() over (order by c.id), c.id,
         (select id from public.vendedores order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         (select id from public.estados where nombre = 'Activo'),
         current_date
    from public.clientes c where c.nombre like '%Piezas PRUEBA%';
`);

// ── el Meta de mentira ─────────────────────────────────────────────────────

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
  `cd ${RAIZ} && (setsid node supabase/pruebas/banco/meta-de-mentira.mjs ${PUERTO_META} > /tmp/meta-piezas.log 2>&1 < /dev/null &)`,
  { shell: "/bin/bash" },
);
execSync("sleep 2");

// ── la aplicación, apuntando al Meta de mentira ───────────────────────────

parar(3142);
const env = [
  "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3141",
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/anon.txt`, "utf8").trim()}`,
  `SUPABASE_SERVICE_ROLE_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-servicio.txt`, "utf8").trim()}`,
  "WHATSAPP_APP_SECRET=secreto-de-prueba",
  "WHATSAPP_VERIFY_TOKEN=verifica-prueba",
  "WHATSAPP_TOKEN=token-de-prueba",
  "WHATSAPP_PHONE_NUMBER_ID=111",
  "WHATSAPP_WABA_ID=222",
  "INSTAGRAM_TOKEN=token-ig-de-prueba",
  "INSTAGRAM_ACCOUNT_ID=999",
  `WHATSAPP_GRAPH_URL=http://127.0.0.1:${PUERTO_META}`,
];

const levantarLaApp = (conCostura) => {
  parar(3142);
  fs.writeFileSync(
    `${RAIZ}/.env.local`,
    (conCostura ? env : env.filter((l) => !l.startsWith("WHATSAPP_GRAPH_URL="))).join("\n") + "\n",
    "utf8",
  );
  execSync(
    `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-piezas.log 2>&1 < /dev/null &)`,
    { shell: "/bin/bash" },
  );
  for (let i = 0; i < 40; i++) {
    const code = execSync(
      "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
      { encoding: "utf8", shell: "/bin/bash" },
    ).trim();
    if (code === "200") return;
    execSync("sleep 1");
  }
  throw new Error("La aplicación no levantó en el 3142.");
};

levantarLaApp(true);

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/piezas-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

/** Lo que el Meta de mentira recibió, para poder mirar adentro del envío. */
const loQueLlegoAMeta = async () =>
  await (await fetch(`http://127.0.0.1:${PUERTO_META}/__recibidos`)).json();

/** Marca al cliente de prueba y abre la ventana de envío con esa plantilla. */
const armarCampana = async (nombreCampana, plantilla, quien) => {
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2200);
  await p.getByPlaceholder(/Buscar/).first().fill(quien);
  await p.waitForTimeout(1600);
  await p.locator('main tbody input[type="checkbox"]').first().check();
  await p.waitForTimeout(500);

  await p.getByRole("button", { name: /Escribirles por WhatsApp/ }).first().click();
  await p.waitForTimeout(1200);

  const dlg = p.getByRole("dialog", { name: "Escribirles por WhatsApp" });
  await dlg.locator("input").first().fill(nombreCampana);
  await p.getByRole("button", { name: "Ver a quiénes les llega" }).click();
  await p.waitForTimeout(2500);
  await dlg.locator("select").first().selectOption({ label: `${plantilla} (es)` });
  await p.waitForTimeout(1000);
  return dlg;
};

try {
  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. LA VENTANA PIDE TODAS LAS PIEZAS, NO SÓLO EL TEXTO ──");
  // ══════════════════════════════════════════════════════════════════════
  {
    const dlg = await armarCampana("PRUEBA Piezas con header", CON_HEADER, GENTE[0].nombre);
    await foto("1-pide-todo");
    const t = (await dlg.innerText()).replace(/\s+/g, " ");

    es("PIDE EL DATO DEL ENCABEZADO", /Encabezado —/.test(t), true);
    es("el del texto", /nombre \(va donde dice/.test(t), true);
    es("Y EL DEL BOTÓN", /Botón «Ver el catálogo»/.test(t), true);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. Y EL ENVÍO LLEVA LAS TRES PIEZAS ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // Acá está el fallo original. El Meta de mentira EXIGE el `header` para las
  // plantillas cuyo nombre lleva `_con_header`: si el CRM no lo manda, contesta
  // 131008, igual que el de verdad le contestó a la escuela.
  {
    const dlg = p.getByRole("dialog", { name: "Escribirles por WhatsApp" });
    const casillas = dlg.locator('input[placeholder="Lo que va en este hueco"]');

    await casillas.nth(0).fill("septiembre");
    await casillas.nth(1).fill("catalogo-2026");
    await p.waitForTimeout(500);
    await foto("2-lleno");

    await p.getByRole("button", { name: /^Mandar a 1$/ }).click();
    await p.waitForTimeout(7000);
    await foto("3-mandado");

    const t = await texto();
    es("EL ENVÍO SALE", /1 enviados/.test(t), true);
    es("y Meta no lo rechaza", /131008|Required parameter/.test(t), false);

    const recibidos = await loQueLlegoAMeta();
    const ultimo = recibidos[recibidos.length - 1];
    const piezas = ultimo?.cuerpo?.template?.components ?? [];

    es("A META LE LLEGARON LAS TRES PIEZAS", piezas.map((c) => c.type), [
      "header",
      "body",
      "button",
    ]);
    /*
     * El índice del botón: 1, no 0.
     *
     * Es el segundo botón de la plantilla; el primero es una respuesta rápida
     * que no lleva dato. Meta los cuenta a todos, así que numerar sólo los
     * variables pondría el dato en el botón equivocado y el enlace saldría roto.
     */
    es(
      "EL BOTÓN CON SU ÍNDICE REAL, NO EL DE LOS VARIABLES",
      piezas.find((c) => c.type === "button")?.index,
      "1",
    );
    es("el encabezado con su dato", piezas[0].parameters[0].text, "septiembre");
    es(
      "y con el nombre del hueco, que esta plantilla usa",
      piezas[0].parameters[0].parameter_name,
      "mes",
    );
    es("el cuerpo con el nombre de pila del cliente", piezas[1].parameters[0].text, "Ana");
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 3. LO QUE NECESITA UNA IMAGEN, LA PIDE ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // Una plantilla con imagen de encabezado necesita esa imagen en cada envío.
  // La pantalla pide la dirección en vez de dejar mandar algo que Meta va a
  // rechazar trescientas veces seguidas.
  {
    const dlg = await armarCampana("PRUEBA Piezas con imagen", CON_IMAGEN, GENTE[1].nombre);
    await foto("4-imagen");
    const t = (await dlg.innerText()).replace(/\s+/g, " ");

    es("PIDE LA DIRECCIÓN DE LA IMAGEN", /Dirección de la imagen del encabezado/.test(t), true);
    es(
      "con una casilla de enlace, no un selector",
      await dlg.locator('input[placeholder="https://…"]').count(),
      1,
    );
    es(
      "y no deja mandar hasta que se llene",
      await p.getByRole("button", { name: /^Mandar a 1$/ }).isDisabled(),
      true,
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 4. Y UNA DE SÓLO TEXTO SIGUE COMO SIEMPRE ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // La mayoría de las plantillas de la escuela son sólo texto: lo que ya andaba
  // tiene que seguir andando exactamente igual.
  {
    const dlg = await armarCampana("PRUEBA Piezas solo texto", SOLO_TEXTO, GENTE[2].nombre);
    await foto("5-solo-texto");
    const t = (await dlg.innerText()).replace(/\s+/g, " ");

    es("no pide encabezado", /Encabezado —/.test(t), false);
    es("ni botones", /Botón «/.test(t), false);
    es("sólo el hueco del texto", /nombre \(va donde dice/.test(t), true);

    await p.getByRole("button", { name: /^Mandar a 1$/ }).click();
    await p.waitForTimeout(7000);
    es("Y SALE", /1 enviados/.test(await texto()), true);

    const recibidos = await loQueLlegoAMeta();
    const ultimo = recibidos[recibidos.length - 1];
    es(
      "MANDANDO SÓLO EL CUERPO, COMO ANTES",
      (ultimo?.cuerpo?.template?.components ?? []).map((c) => c.type),
      ["body"],
    );
  }

  es("sin errores en la página", errores, []);
} finally {
  await ctx.close();
  await nav.close();
  parar(PUERTO_META);
  limpiar();
  // El banco queda como lo esperan las demás pruebas: sin la costura.
  levantarLaApp(false);
}

es(
  "no quedó basura",
  sql(`select count(*) from public.plantillas where nombre like 'prueba_%';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
