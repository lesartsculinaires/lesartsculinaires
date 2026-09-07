/**
 * El envío masivo que SALE BIEN: ¿queda en el hilo de cada cliente?
 *
 *     node supabase/pruebas/banco/prueba-masivo-en-el-hilo.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Necesito que se pueda seleccionar a cada cliente para enviar el mensaje,
 *  ocupar la plantilla, y al momento que se envíe tiene que salir en mensaje de
 *  WhatsApp del cliente que se envió el masivo, de esa manera podemos darle
 *  seguimiento si contesta el cliente. No es necesario tener una opción de
 *  "Difusiones" en el Inbox: lo importante es que ese mensaje de plantilla que
 *  se envió masivamente aparezca como mensaje en Inbox y también en el módulo
 *  de Enviados.»
 *
 * ============================================================================
 * POR QUÉ ESTA PRUEBA NO EXISTÍA ANTES
 * ============================================================================
 *
 * Porque en el banco no hay Meta. Todo lo que se probaba del envío masivo era
 * el camino del error —token de mentira, Meta rechaza— y lo que pasa DESPUÉS
 * de un envío exitoso no se ejercía nunca.
 *
 * Acá se levanta un Meta de mentira (`meta-de-mentira.mjs`) y el CRM le habla a
 * ése. El código que corre es el mismo de producción; lo único distinto es a
 * dónde apunta, y esa variable sólo acepta direcciones de esta misma máquina.
 *
 * ============================================================================
 * QUÉ SE PRUEBA, Y POR QUÉ NO ALCANZA CON MIRARLO
 * ============================================================================
 *
 *   EL MENSAJE QUEDA EN EL HILO    Con el texto ARMADO —el nombre de cada quien
 *                                  en su lugar—, no la plantilla cruda con
 *                                  «{{1}}». Es lo que va a leer la asesora
 *                                  cuando esa persona conteste.
 *
 *   SE ABRE EL HILO SI NO HABÍA    Antes no se abría ninguno: sólo se escribía
 *                                  en conversaciones que ya existían, así que a
 *                                  quien nunca había escrito no le quedaba
 *                                  rastro. Ése es el caso que la escuela
 *                                  necesita, porque un masivo va justamente a
 *                                  gente que no ha escrito.
 *
 *   CON SU ASESORA                 «Y dependiendo de qué asesor»: el hilo nace
 *                                  con el dueño del lead, o el filtro por
 *                                  asesora de la bandeja no lo agrupa.
 *
 *   NO SUBE EL CONTADOR ROJO       Un mensaje que mandamos nosotros no es un
 *                                  pendiente. Con trescientos, el número de la
 *                                  barra dejaría de significar algo.
 *
 *   Y SI CONTESTA, VA DEBAJO       El cierre de todo esto: la respuesta del
 *                                  cliente cae en el MISMO hilo, debajo de lo
 *                                  que se le mandó. Eso es «darle seguimiento».
 *
 * Necesita el banco armado (`armar.sh`).
 */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const PUERTO_META = 3144;

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `hilo-${process.pid}-${Math.random()}.sql`);
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

const CAMPANA = "PRUEBA Masivo al hilo";
const PLANTILLA = "prueba_masivo_hilo";
const TEL_NUEVO = "50370700001";
const TEL_CON_HILO = "50370700002";

const limpiar = () =>
  sql(`
    delete from public.envio_destinatarios where envio_id in
      (select id from public.envios where nombre like 'PRUEBA Masivo%');
    delete from public.envios where nombre like 'PRUEBA Masivo%';
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono in ('${TEL_NUEVO}', '${TEL_CON_HILO}'));
    delete from public.conversaciones where telefono in ('${TEL_NUEVO}', '${TEL_CON_HILO}');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre like '%Masivo PRUEBA%');
    delete from public.clientes where nombre like '%Masivo PRUEBA%';
    delete from public.plantillas where nombre = '${PLANTILLA}';
  `);
limpiar();

/*
 * Dos personas, y la diferencia entre ellas es el punto.
 *
 * A la PRIMERA nunca le escribió nadie: no tiene hilo. Es el caso que antes se
 * perdía —sólo se escribía en conversaciones existentes— y es el caso normal de
 * un masivo, que va justamente a gente que no ha escrito.
 *
 * La SEGUNDA ya tiene un hilo con un mensaje viejo. Sirve para comprobar que no
 * se abre un segundo hilo al lado del que ya está.
 */
sql(`
  insert into public.plantillas (id, nombre, idioma, estado, cuerpo, categoria)
  values ('plt-prueba-hilo', '${PLANTILLA}', 'es', 'APPROVED',
          'Hola {{1}}, te esperamos en Les Arts Culinaires', 'MARKETING')
  on conflict (id) do update set estado = 'APPROVED';

  insert into public.clientes (nombre, telefono) values
    ('Sin Hilo Masivo PRUEBA', '${TEL_NUEVO}'),
    ('Con Hilo Masivo PRUEBA', '${TEL_CON_HILO}');

  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, etapa_id, estado_id, fecha_registro)
  select 'MAS-000' || row_number() over (order by c.id), c.id,
         (select id from public.vendedores order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         (select id from public.estados where nombre = 'Activo'),
         current_date
    from public.clientes c where c.nombre like '%Masivo PRUEBA%';

  -- El hilo que ya existía, con un mensaje de hace una semana.
  insert into public.conversaciones
    (canal, identificador, telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto, sin_leer)
  values ('whatsapp', '${TEL_CON_HILO}', '${TEL_CON_HILO}', 'Con Hilo Masivo PRUEBA',
          now() - interval '7 days', 'Hola, información por favor', 0);

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.VIEJO.MASIVO', 'entrante', 'text',
         'Hola, información por favor', now() - interval '7 days'
    from public.conversaciones v where v.telefono = '${TEL_CON_HILO}';
`);

// La asesora que le tocó, para poder comprobar que el hilo nace con dueño.
const ASESORA = sql(`
  select v.nombre from public.vendedores v
   where v.id = (select o.vendedor_id from public.oportunidades o
                  join public.clientes c on c.id = o.cliente_id
                 where c.nombre = 'Sin Hilo Masivo PRUEBA');
`);

// ── el Meta de mentira y la aplicación apuntándole ─────────────────────────

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
parar(3142);

execSync(
  `cd ${RAIZ} && (setsid node supabase/pruebas/banco/meta-de-mentira.mjs ${PUERTO_META} > /tmp/meta-mentira.log 2>&1 < /dev/null &)`,
  { shell: "/bin/bash" },
);

const env = [
  "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3141",
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/anon.txt`, "utf8").trim()}`,
  `SUPABASE_SERVICE_ROLE_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-servicio.txt`, "utf8").trim()}`,
  "WHATSAPP_APP_SECRET=secreto-de-prueba",
  "WHATSAPP_VERIFY_TOKEN=verifica-prueba",
  "WHATSAPP_TOKEN=token-de-prueba",
  "WHATSAPP_PHONE_NUMBER_ID=111",
  "WHATSAPP_WABA_ID=222",
  /*
   * Instagram configurado, que es como el banco espera quedar.
   *
   * No hace falta para esta prueba —el masivo sale por WhatsApp— pero sí para
   * las que corren después: `prueba-canales-inbox` comprueba que la pestaña de
   * Instagram FILTRE, y sin estas dos variables dice «falta la llave» y no
   * filtra. Es el estado en que lo dejan las demás pruebas y hay que devolverlo
   * igual.
   */
  "INSTAGRAM_TOKEN=token-ig-de-prueba",
  "INSTAGRAM_ACCOUNT_ID=999",
  // La costura: sólo se acepta porque apunta a esta misma máquina.
  `WHATSAPP_GRAPH_URL=http://127.0.0.1:${PUERTO_META}`,
];
fs.writeFileSync(`${RAIZ}/.env.local`, env.join("\n") + "\n", "utf8");

execSync(
  `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-hilo.log 2>&1 < /dev/null &)`,
  { shell: "/bin/bash" },
);

for (let i = 0; i < 40; i++) {
  const code = execSync(
    "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
    { encoding: "utf8", shell: "/bin/bash" },
  ).trim();
  if (code === "200") break;
  execSync("sleep 1");
}

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/hilo-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

try {
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);

  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. SE SELECCIONA A CADA CLIENTE Y SE MANDA LA PLANTILLA ──");
  // ══════════════════════════════════════════════════════════════════════
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2200);
  await p.getByPlaceholder(/Buscar/).first().fill("Masivo PRUEBA");
  await p.waitForTimeout(1600);

  for (const codigo of ["MAS-0001", "MAS-0002"]) {
    await p.locator(`main tbody tr:has-text("${codigo}") input[type=checkbox]`).first().check();
    await p.waitForTimeout(400);
  }
  await foto("1-marcados");

  await p.getByRole("button", { name: /Escribirles por WhatsApp/ }).first().click();
  await p.waitForTimeout(1400);

  const dlg = p.getByRole("dialog", { name: "Escribirles por WhatsApp" });
  await dlg.locator("input").first().fill(CAMPANA);
  await p.getByRole("button", { name: "Ver a quiénes les llega" }).click();
  await p.waitForTimeout(2500);

  // La plantilla. Su único hueco se propone con el nombre de cada quien, que
  // es lo que hace que el mensaje del hilo diga «Hola Sin» y no «Hola {{1}}».
  await dlg.locator("select").first().selectOption({ label: `${PLANTILLA} (es)` });
  await p.waitForTimeout(900);
  await foto("2-plantilla");

  es(
    "propone poner el nombre del cliente en el hueco",
    /El nombre del cliente/i.test((await dlg.innerText()).replace(/\s+/g, " ")),
    true,
  );

  await p.getByRole("button", { name: /^Mandar a 2$/ }).click();
  await p.waitForTimeout(7000);
  await foto("3-mandado");

  {
    const t = await texto();
    es("LOS DOS SALIERON", /2 enviados/.test(t), true);
    es("y ninguno falló", /[1-9]\d* no llegaron/.test(t), false);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. EL MENSAJE QUEDÓ EN EL HILO DE CADA CLIENTE ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // Lo central de lo que pidió la escuela. Y con el texto ARMADO: la plantilla
  // cruda con «{{1}}» no le sirve a nadie que abra la conversación.
  es(
    "SE ABRIÓ EL HILO DEL QUE NO TENÍA NINGUNO",
    sql(`select count(*) from public.conversaciones where telefono = '${TEL_NUEVO}';`),
    "1",
  );
  es(
    "CON EL MENSAJE ADENTRO, Y CON SU NOMBRE PUESTO",
    sql(`
      select m.texto from public.mensajes m
       join public.conversaciones v on v.id = m.conversacion_id
       where v.telefono = '${TEL_NUEVO}' and m.direccion = 'saliente';
    `),
    "Hola Sin, te esperamos en Les Arts Culinaires",
  );
  es(
    "el hilo quedó marcado como de WhatsApp, con su identidad",
    sql(`
      select case when canal = 'whatsapp' and identificador = telefono then 'bien' else 'mal' end
        from public.conversaciones where telefono = '${TEL_NUEVO}';
    `),
    "bien",
  );

  es(
    "Y AL QUE YA TENÍA HILO NO SE LE ABRIÓ OTRO",
    sql(`select count(*) from public.conversaciones where telefono = '${TEL_CON_HILO}';`),
    "1",
  );
  es(
    "el masivo se sumó abajo de lo que ya había",
    sql(`
      select count(*) from public.mensajes m
       join public.conversaciones v on v.id = m.conversacion_id
       where v.telefono = '${TEL_CON_HILO}';
    `),
    "2",
  );

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 3. CON SU ASESORA, Y SIN PONER EL CONTADOR EN ROJO ──");
  // ══════════════════════════════════════════════════════════════════════
  es(
    "EL HILO NUEVO NACIÓ CON LA ASESORA DEL LEAD",
    sql(`
      select coalesce(ve.nombre, '(sin asignar)') from public.conversaciones v
       left join public.vendedores ve on ve.id = v.vendedor_id
       where v.telefono = '${TEL_NUEVO}';
    `),
    ASESORA,
  );
  es(
    "y NO cuenta como pendiente: lo mandamos nosotros",
    sql(`select sin_leer::text from public.conversaciones where telefono = '${TEL_NUEVO}';`),
    "0",
  );
  /*
   * Y al hilo VIEJO, que estaba sin asignar, también se le pone la asesora.
   *
   * Es el caso más común en una base importada: el hilo existe porque alguien
   * escribió una vez, nadie lo tomó, y el lead sí tiene asesora. Sin esto el
   * mensaje de la campaña cae en un hilo que el filtro por asesora no agrupa.
   */
  es(
    "AL HILO VIEJO SIN ASIGNAR TAMBIÉN SE LE PUSO SU ASESORA",
    sql(`
      select coalesce(ve.nombre, '(sin asignar)') from public.conversaciones v
       left join public.vendedores ve on ve.id = v.vendedor_id
       where v.telefono = '${TEL_CON_HILO}';
    `),
    ASESORA,
  );

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 4. SE VE EN LA BANDEJA, COMO UN CHAT MÁS ──");
  // ══════════════════════════════════════════════════════════════════════
  // La ventana del envío queda abierta al terminar —muestra el resumen— y su
  // fondo tapa la barra de módulos. Se cierra como lo haría una persona.
  await p.getByRole("button", { name: "Cerrar", exact: true }).click();
  await p.waitForTimeout(1500);

  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2600);
  await foto("4-bandeja");

  {
    const t = await texto();
    es("EL HILO ESTÁ EN LA LISTA", /Sin Hilo Masivo PRUEBA/.test(t), true);
    // La pestaña de Difusiones se sacó: la escuela pidió que el masivo se vea
    // como un mensaje más y no en una sección aparte.
    es("y ya no hay pestaña de Difusiones", /Difusiones/.test(t), false);
  }

  await p.locator('button.row:has-text("Sin Hilo Masivo PRUEBA")').first().click();
  await p.waitForTimeout(2200);
  await foto("5-hilo-abierto");

  es(
    "AL ABRIRLO SE LEE LO QUE SE LE MANDÓ",
    /Hola Sin, te esperamos en Les Arts Culinaires/.test(await texto()),
    true,
  );

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 5. Y SI EL CLIENTE CONTESTA, CAE EN EL MISMO HILO ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // El cierre de todo esto: para eso se pidió que el masivo quede en el hilo.
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
                contacts: [{ profile: { name: "Sin Hilo Masivo PRUEBA" }, wa_id: TEL_NUEVO }],
                messages: [
                  {
                    from: TEL_NUEVO,
                    id: "wamid.RESPUESTA.MASIVO",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Sí, me interesa el diplomado" },
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
    es("el webhook lo recibe", r.status, 200);

    es(
      "LA RESPUESTA CAYÓ EN EL MISMO HILO, NO EN UNO NUEVO",
      sql(`select count(*) from public.conversaciones where telefono = '${TEL_NUEVO}';`),
      "1",
    );
    es(
      "debajo de lo que se le mandó",
      sql(`
        select string_agg(m.direccion, ',' order by m.creado_en) from public.mensajes m
         join public.conversaciones v on v.id = m.conversacion_id
         where v.telefono = '${TEL_NUEVO}';
      `),
      "saliente,entrante",
    );
    es(
      "y AHORA SÍ se pone en rojo: hay algo que contestar",
      sql(`select sin_leer::text from public.conversaciones where telefono = '${TEL_NUEVO}';`),
      "1",
    );
    // La métrica que la escuela pidió hace tiempo: quién contestó la campaña.
    es(
      "el envío lo cuenta como que CONTESTÓ",
      sql(`
        select d.estado from public.envio_destinatarios d
         join public.envios e on e.id = d.envio_id
         where e.nombre = '${CAMPANA}' and d.telefono = '${TEL_NUEVO}';
      `),
      "respondio",
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 6. Y SIGUE ESTANDO EN EL MÓDULO DE ENVÍOS ──");
  // ══════════════════════════════════════════════════════════════════════
  /*
   * Se recarga antes de mirar.
   *
   * La pantalla trae los envíos al cargar la página, y la respuesta del cliente
   * entró DESPUÉS por el webhook —que corre en el servidor y no le avisa a esta
   * pestaña—. Sin recargar, «contestaron» seguiría en cero: sería un problema
   * de la prueba y no del CRM, que en uso real lo refresca solo.
   */
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod^="Env"]').click();
  await p.waitForTimeout(2400);
  await foto("6-envios");

  {
    const t = await texto();
    es("LA CAMPAÑA ESTÁ", t.includes(CAMPANA), true);
    es("con su plantilla", t.includes(PLANTILLA), true);
    es("y cuenta a quien contestó", /1 contestaron|Contestaron/.test(t), true);
  }

  es("sin errores en la página", errores, []);
} finally {
  await ctx.close();
  await nav.close();
  parar(PUERTO_META);
  limpiar();

  /*
   * Y se devuelve el banco como estaba.
   *
   * Sin esto, `.env.local` queda apuntando al Meta de mentira —que esta misma
   * prueba acaba de apagar— y todo lo que se corra después falla con un error
   * de conexión en vez del que espera. Pasó: tres archivos en rojo por culpa de
   * éste, y ninguno tenía nada malo.
   */
  fs.writeFileSync(
    `${RAIZ}/.env.local`,
    env.filter((l) => !l.startsWith("WHATSAPP_GRAPH_URL=")).join("\n") + "\n",
    "utf8",
  );
  parar(3142);
  execSync(
    `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-hilo.log 2>&1 < /dev/null &)`,
    { shell: "/bin/bash" },
  );
  for (let i = 0; i < 40; i++) {
    const code = execSync(
      "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
      { encoding: "utf8", shell: "/bin/bash" },
    ).trim();
    if (code === "200") break;
    execSync("sleep 1");
  }
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
