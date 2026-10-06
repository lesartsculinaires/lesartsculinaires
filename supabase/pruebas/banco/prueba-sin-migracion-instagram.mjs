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
 * —dejándola como estaba la de producción antes de correrlo— y se comprueba
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
 * ============================================================================
 * ESTA PRUEBA SE ROMPIÓ, Y ROMPÍA EL BANCO AL ROMPERSE
 * ============================================================================
 *
 * Dos fallas distintas, y la segunda era la grave.
 *
 *   NO PODÍA DESHACER   Deshacer la migración incluye devolverle a `telefono`
 *                       su `not null`. Eso sólo se puede si NINGÚN hilo lo
 *                       tiene vacío, y los de Instagram y Messenger lo tienen
 *                       vacío a propósito —no hay teléfono que guardar—. O sea
 *                       que bastaba con que alguna otra prueba del banco
 *                       hubiera dejado un hilo de esos para que ésta ya no
 *                       pudiera ni empezar.
 *
 *   Y AL FALLAR,        `sql()` cortaba el proceso con `process.exit(1)`. Un
 *   DEJABA EL BANCO     `exit` NO corre el `finally`, así que la migración
 *   INSERVIBLE          nunca se reponía: las columnas ya estaban borradas y
 *                       el banco quedaba sin `identificador`. A partir de ahí
 *                       fallaban otras pruebas, en archivos que nadie había
 *                       tocado, y rearmar con `armar.sh` NO alcanzaba —no
 *                       recrea la base, y la migración no se vuelve a aplicar
 *                       sobre una tabla que ya existe—. Había que borrar la
 *                       base entera.
 *
 * Las dos cosas están arregladas acá abajo, y están comentadas donde pasan.
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

/** Corre SQL y devuelve qué pasó, sin opinar. */
const correr = (q) => {
  const ruta = path.join(os.tmpdir(), `sinmig-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(
      `su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`,
      { encoding: "utf8" },
    ).trim();
    return { ok: !/^psql:.*ERROR:/m.test(salida), salida };
  } catch (e) {
    return { ok: false, salida: String(e?.stdout ?? e?.message ?? e) };
  } finally {
    fs.rmSync(ruta, { force: true });
  }
};

/**
 * Lo mismo, pero LANZA si la base rechaza algo.
 *
 * Lanza y no sale. Es la diferencia entre dejar el banco como estaba y dejarlo
 * roto: un `process.exit` se salta el `finally`, y el `finally` de acá abajo es
 * lo único que vuelve a poner la migración. Ver el encabezado.
 */
const sql = (q) => {
  const r = correr(q);
  if (!r.ok) throw new Error(`la base rechazó una sentencia de la prueba:\n${r.salida}`);
  return r.salida.trim();
};

/** PostgREST guarda en memoria qué columnas hay; sin esto no se entera. */
const avisarle = () => {
  correr("notify pgrst, 'reload schema';");
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
  correr(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono in ('${TEL}', '${TEL_NUEVO}'));
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre like '%PRUEBA%' and nombre like '%Migracion%');
    delete from public.conversaciones where telefono in ('${TEL}', '${TEL_NUEVO}');
    delete from public.clientes where nombre like '%Antes De La Migracion PRUEBA%'
       or telefono = '${TEL_NUEVO}';
  `);

/**
 * Los hilos sin teléfono, apartados mientras dura la prueba.
 *
 * ============================================================================
 * POR QUÉ HAY QUE APARTARLOS, Y POR QUÉ NO SE BORRAN
 * ============================================================================
 *
 * Antes de la migración de Instagram, un hilo sin teléfono no podía existir: el
 * único canal era WhatsApp y `telefono` era obligatorio y único. Hoy el banco
 * puede tener hilos de Instagram o de Messenger, que lo tienen vacío a
 * propósito —Meta no da el número—, y esos hilos bloquean las dos puntas:
 *
 *   AL DESHACER   `alter column telefono set not null` falla si hay alguno.
 *
 *   Y AL REPONER  La migración rellena `identificador` copiándolo de
 *                 `telefono` y después lo pone obligatorio. Con el teléfono
 *                 vacío el relleno deja un nulo, el `set not null` revienta, y
 *                 la transacción entera de la migración se aborta. O sea que
 *                 ni siquiera alcanzaba con omitir la parte del deshacer: lo
 *                 que no se podía era VOLVER.
 *
 * Así que se les presta un teléfono de mentira mientras dura la prueba y se les
 * devuelve el suyo —vacío— al final, junto con su identificador original, que
 * la migración habría pisado al rellenar.
 *
 * No se borran. Son de otras pruebas, no son asunto de ésta, y una prueba que
 * borra datos ajenos para poder correr es exactamente cómo esta misma dejó el
 * banco inservible la primera vez.
 */
let apartados = [];

function apartarLosSinTelefono() {
  const filas = correr(
    `select id || '\u0001' || coalesce(identificador, '')
       from public.conversaciones where telefono is null;`,
  ).salida.trim();

  apartados = filas
    ? filas.split("\n").map((l) => {
        const [id, ident] = l.split("\u0001");
        return { id: id.trim(), ident };
      })
    : [];

  if (apartados.length === 0) return;

  /*
   * El prestado lleva el id adentro para que sea único: el deshacer repone la
   * unicidad por teléfono, y dos prestados iguales la harían fallar.
   */
  sql(`update public.conversaciones
         set telefono = 'SINTEL-' || id
       where telefono is null;`);
}

/** Les devuelve lo suyo: el teléfono vacío y el identificador que tenían. */
function devolverLosSinTelefono() {
  for (const { id, ident } of apartados) {
    correr(`update public.conversaciones
              set telefono = null,
                  identificador = ${ident ? `'${ident.replace(/'/g, "''")}'` : "identificador"}
            where id = ${id};`);
  }
  apartados = [];
}

/**
 * Deja la base como estaba antes de correr el SQL de Instagram.
 *
 * TODO EN UNA TRANSACCIÓN, a propósito. Antes iban las sentencias sueltas: si
 * una fallaba a mitad de camino, las anteriores ya se habían aplicado y la base
 * quedaba en un estado que no es ni el de antes ni el de después. Así, o se
 * deshace entera o no se toca nada.
 */
function deshacerLaMigracion() {
  sql(`
    begin;

    drop trigger if exists trg_identidad_del_hilo on public.conversaciones;
    drop function if exists public.identidad_del_hilo();
    drop index if exists public.ux_conversaciones_canal_identidad;
    alter table public.conversaciones drop column if exists identificador;
    alter table public.conversaciones drop column if exists usuario;

    alter table public.conversaciones alter column telefono set not null;

    do $BLOQUE$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'conversaciones_telefono_key'
      ) then
        alter table public.conversaciones
          add constraint conversaciones_telefono_key unique (telefono);
      end if;
    end
    $BLOQUE$;

    commit;
  `);
  avisarle();
}

/**
 * Vuelve a poner la migración, y comprueba que quedó puesta.
 *
 * Esto NO es cortesía: sin esto el banco queda sin `identificador` y las demás
 * pruebas empiezan a fallar en archivos que nadie tocó. Si no se puede reponer,
 * se dice qué hacer, porque desde el error de otra prueba es indescifrable.
 */
function rehacerLaMigracion() {
  /*
   * ==========================================================================
   * SE REAPLICAN TODAS LAS DE DESPUÉS, NO SÓLO LA DE INSTAGRAM
   * ==========================================================================
   *
   * Y esto costó caro descubrirlo. Reponer sólo `20261024120000_instagram.sql`
   * deja el esquema en pie —las columnas vuelven— pero REVIERTE lo que las
   * migraciones posteriores le cambiaron a los mismos objetos:
   *
   *   `20261024` define `cliente_de_instagram` con su cuerpo propio.
   *   `20261027` la convierte en un envoltorio de `cliente_de_canal`.
   *   `20261107` le agrega a `cliente_de_canal` los últimos cuatro dígitos del
   *              identificador, para que las fichas sin nombre no sean todas
   *              «Contacto de Instagram» e indistinguibles.
   *
   * Reaplicando sólo la primera, el `create or replace` vuelve a poner el
   * cuerpo viejo y se pierden las otras dos. El resultado: `prueba-instagram`
   * empezaba a fallar —esperando «Contacto de Instagram · 5999» y recibiendo
   * «Contacto de Instagram»— en un archivo que nadie había tocado, y sin
   * ninguna pista de que la culpable fuera ESTA prueba.
   *
   * Se replican en orden, que es como las corre `armar.sh`: están escritas para
   * poder volver a correrse.
   */
  const desde = "20261024120000";
  const migraciones = fs
    .readdirSync(`${RAIZ}/supabase/migrations`)
    .filter((n) => n.endsWith(".sql") && n >= desde)
    .sort();

  let salidaDeLaMigracion = "";
  for (const nombre of migraciones) {
    fs.copyFileSync(`${RAIZ}/supabase/migrations/${nombre}`, "/tmp/rehacer-ig.sql");
    fs.chmodSync("/tmp/rehacer-ig.sql", 0o644);
    try {
      execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -q -f /tmp/rehacer-ig.sql" 2>&1`, {
        encoding: "utf8",
      });
    } catch (e) {
      salidaDeLaMigracion += `\n${nombre}: ${String(e?.stdout ?? e?.message ?? e)}`;
    }
  }
  avisarle();

  const columnas = correr(`select count(*) from information_schema.columns
      where table_schema='public' and table_name='conversaciones'
        and column_name in ('identificador','usuario');`).salida.trim();

  if (columnas !== "2") {
    console.error(
      "\n  ⚠ EL BANCO QUEDÓ SIN LA MIGRACIÓN DE INSTAGRAM.\n" +
        "    Las demás pruebas van a fallar sin decir por qué. Para arreglarlo:\n\n" +
        "      su postgres -c \"psql -h /tmp -p 5511 -d postgres -c \\\\\n" +
        "        \\\"select pg_terminate_backend(pid) from pg_stat_activity where datname='crm'\\\"\"\n" +
        "      su postgres -c 'dropdb -h /tmp -p 5511 crm'\n" +
        "      bash supabase/pruebas/banco/armar.sh\n\n" +
        `    (lo que dijo la base: ${salidaDeLaMigracion.trim().slice(-400)})\n`,
    );
  }

  es("el banco quedó como estaba, con la migración puesta", columnas, "2");
}

let deshecha = false;
let nav = null;
let ctx = null;

try {
  // ══════════════════════════════════════════════════════════════════════════
  console.log("── deshaciendo la migración de Instagram en el banco ──");
  // ══════════════════════════════════════════════════════════════════════════
  limpiar();
  apartarLosSinTelefono();
  if (apartados.length > 0) {
    console.log(
      `   (${apartados.length} hilo(s) de Instagram o Messenger apartados: antes de la` +
        " migración no podían existir. Se les devuelve lo suyo al final.)",
    );
  }
  deshacerLaMigracion();
  deshecha = true;

  es(
    "la base quedó sin `identificador`, como la de producción antes del SQL",
    sql(`select count(*) from information_schema.columns
          where table_schema='public' and table_name='conversaciones'
            and column_name in ('identificador','usuario');`),
    "0",
  );

  /*
   * El esquema viejo tiene que quedar ENTERO, no a medias. Si esto fallara
   * querría decir que el deshacer se quedó corto, y la prueba estaría corriendo
   * contra algo que no es ni el esquema de antes ni el de ahora —y entonces no
   * probaría lo que dice que prueba—.
   */
  es(
    "Y CON LA UNICIDAD POR TELÉFONO: el esquema viejo, entero",
    sql(`select count(*) from pg_constraint where conname = 'conversaciones_telefono_key';`),
    "1",
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

  nav = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
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

    const RESPUESTA = "Contestando sin la migración corrida";
    await caja.fill(RESPUESTA);
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: /^Enviar$|^Mandar$/ }).first().click();
    await p.waitForTimeout(4000);
    await foto("2-contestando");

    const t = await texto();
    es(
      "NO FALLA POR LA COLUMNA QUE FALTA",
      /identificador|42703|column .* does not exist/i.test(t),
      false,
    );

    /*
     * Y QUE LA RESPUESTA HAYA SALIDO DE VERDAD.
     *
     * Acá antes decía otra cosa: se daba por hecho que el envío iba a fallar
     * «porque en el banco no hay Meta» y se comprobaba que el error fuera el
     * del token y no uno de columna. Esa premisa envejeció —el banco ahora
     * levanta un Meta de mentira en 3144 y el envío SÍ funciona—, así que la
     * prueba buscaba un error que ya no ocurre y se ponía roja sin que nada
     * estuviera mal.
     *
     * Mirar la fila saliente es mejor de las dos maneras: no depende de que
     * algo falle, y comprueba el camino entero en vez de un texto de error.
     */
    es(
      "LA RESPUESTA SALIÓ, con la migración sin correr",
      sql(`select count(*) from public.mensajes
            where direccion = 'saliente' and texto = '${RESPUESTA}';`),
      "1",
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
} catch (e) {
  /*
   * Se anota como una falla más y se sigue al `finally`. Antes esto cortaba el
   * proceso y la migración no volvía nunca.
   */
  f++;
  console.log(`✗ la prueba se cortó: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  if (ctx) await ctx.close().catch(() => {});
  if (nav) await nav.close().catch(() => {});

  limpiar();

  if (deshecha) {
    // ══════════════════════════════════════════════════════════════════════
    console.log("\n── volviendo a poner la migración ──");
    // ══════════════════════════════════════════════════════════════════════
    /*
     * El orden importa: primero la migración, que rellena `identificador`
     * copiándolo de `telefono` —por eso los apartados todavía tienen el
     * prestado—, y recién después se les devuelve lo suyo.
     */
    rehacerLaMigracion();
    devolverLosSinTelefono();
  }
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
