/**
 * Las llamadas de WhatsApp en pantalla.
 *
 *     node supabase/pruebas/banco/prueba-llamadas.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Acabo de activar la opción de llamadas para WhatsApp API [...] se podrían
 *  hacer llamadas a clientes colocando un botón de llamar y, además, poder
 *  tener la opción de recibir llamadas.
 *
 *  Aquí lo que no quiero es que vayan a afectar las llamadas entrantes al
 *  momento que estén escribiendo o interactuando en el CRM. Me gustaría que
 *  apareciera como pop up la llamada y contestarla, pero en los demás
 *  dispositivos se minimice y se visualice en una esquina.»
 *
 * ============================================================================
 * QUÉ SE PUEDE PROBAR ACÁ Y QUÉ NO
 * ============================================================================
 *
 * SE PRUEBA          Que la llamada aparezca sola, sin recargar; que sea un
 *                    pop-up para quien le toca y una tarjeta chica para los
 *                    demás; que ESCRIBIENDO no interrumpa y suba sola al
 *                    parar; que al terminar desaparezca de todas las
 *                    pantallas; y que el botón «Llamar» esté donde tiene que
 *                    estar.
 *
 * NO SE PRUEBA       Que se escuche. El audio va por WebRTC contra los
 *                    servidores de Meta, con una llamada de verdad a un
 *                    teléfono de verdad: hace falta el número de la escuela y
 *                    alguien del otro lado. Eso queda para la prueba con un
 *                    cliente real.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-ll-${process.pid}-${Math.random()}.sql`);
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

const TEL = "50399887766";
const CALL = "wacid.PRUEBA.1";

const limpiar = () => {
  sql(`delete from public.llamadas where call_id like 'wacid.PRUEBA%';
       delete from public.conversaciones where telefono = '${TEL}';`);
};
limpiar();

/*
 * La prueba corre como ASESORA y no como dirección, a propósito: el pop-up es
 * para quien atiende clientes, y dirección —que no tiene fila de asesora— ve
 * la tarjeta de la esquina siempre. Probándolo con la jefa nunca se vería el
 * caso que la escuela pidió.
 */
const YO = "11111111-0000-0000-0000-000000000001"; // Ale Prueba, vendedora 901

/*
 * El hilo arranca siendo de la OTRA asesora, porque lo primero que hay que
 * comprobar es que a quien no le toca no le salte el pop-up encima.
 */
const OTRA = sql(`select id from public.vendedores where usuario_id <> '${YO}'
                   and usuario_id is not null order by id limit 1;`);
sql(`
  insert into public.conversaciones (telefono, nombre_perfil, vendedor_id, ultimo_texto)
  values ('${TEL}', 'Doña Prueba Llamada', ${OTRA}, 'Hola, quiero información');
`);
const CONV = sql(`select id from public.conversaciones where telefono = '${TEL}';`);

// Con un mensaje adentro, que es como se ve un hilo de verdad: uno vacío no
// existe en la operación —la conversación nace de que alguien escribió—.
sql(`
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  values (${CONV}, 'wamid.PRUEBA.LL.1', 'entrante', 'text', 'Hola, quiero información', now());
`);

/**
 * Hace entrar una llamada, igual que lo haría el webhook.
 *
 * Con el dueño y el nombre COPIADOS en la fila, que es como los escribe el
 * webhook y no un detalle de la prueba: `conversaciones` no se ve entera —una
 * asesora no ve los hilos de otra— así que la llamada tiene que poder decir de
 * quién es sin que haya que ir a buscar el hilo.
 */
const entraLlamada = (callId = CALL) =>
  sql(`
    insert into public.llamadas
      (call_id, conversacion_id, telefono, vendedor_id, nombre,
       direccion, estado, sdp_remoto, sdp_tipo)
    select
      '${callId}', c.id, c.telefono, c.vendedor_id, c.nombre_perfil,
      'entrante', 'sonando',
      'v=0' || chr(13) || chr(10) || 'o=- 1 1 IN IP4 0.0.0.0', 'offer'
    from public.conversaciones c where c.id = ${CONV};
  `);

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-ale.txt", "utf8")
  .trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt, token_type: "bearer", expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
      user: { id: YO, email: "ale@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  // Sin esto, pedir el micrófono abre un cartel que nadie puede contestar.
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const ctx = await nav.newContext({
  viewport: { width: 1500, height: 1050 },
  permissions: ["microphone"],
});
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try { localStorage.setItem("lac.reservas.visto", h); } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/llamada-${n}.png` });

const tarjeta = p.locator('[aria-label="Llamada de WhatsApp"]');

/** ¿Es pop-up o tarjeta de esquina? Se distingue por dónde está puesta. */
const donde = async () => {
  if ((await tarjeta.count()) === 0) return "nada";
  const caja = await tarjeta.boundingBox();
  const alto = p.viewportSize().height;
  // El pop-up va arriba y al centro; la esquina, abajo a la derecha.
  return caja.y < alto / 2 ? "pop-up" : "esquina";
};

await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
/*
 * El websocket tarda en levantar más que la pantalla. Una llamada insertada
 * antes de que esté conectado no le llega a nadie —el aviso sale una vez y no
 * se guarda—, así que se espera a que el CRM diga «En vivo» antes de empezar.
 * Es la misma carrera que en la vida real, sólo que ahí sobra tiempo.
 */
await p.getByText("En vivo", { exact: false }).first().waitFor({ timeout: 30_000 });
await p.waitForTimeout(2500);

console.log("── sin llamadas no hay nada en pantalla ──");
{
  es("la pantalla está limpia", await tarjeta.count(), 0);
}

console.log("\n── ENTRA UNA QUE NO ES SUYA: A LA ESQUINA ──");
{
  /*
   * El hilo es de otra asesora. Lo que la escuela pidió: «en los demás
   * dispositivos se minimice y se visualice en una esquina».
   */
  entraLlamada();
  await tarjeta.waitFor({ timeout: 15_000 }).catch(() => {});
  await p.waitForTimeout(600);
  await foto("1-esquina");

  es("APARECE SOLA, SIN RECARGAR", await tarjeta.count(), 1);
  es("Y EN LA ESQUINA", await donde(), "esquina");

  const texto = (await tarjeta.innerText()).replace(/\s+/g, " ");
  es("con el nombre de quien llama", texto.includes("Doña Prueba Llamada"), true);
  es("y diciendo de quién es el hilo", /El hilo es de/i.test(texto), true);

  // Se puede atender igual —si la dueña no puede— pero sin taparle la pantalla
  // a nadie.
  es("se puede contestar desde la esquina", await p.getByRole("button", { name: "Contestar" }).count(), 1);
}

console.log("\n── LA MISMA LLAMADA, SIENDO SUYA: POP-UP ──");
{
  /*
   * Se le pasa el hilo a la asesora de esta sesión. La llamada es la misma; lo
   * único que cambia es a quién le toca, y con eso tiene que subir a pop-up.
   */
  sql(`update public.conversaciones
          set vendedor_id = (select v.id from public.vendedores v
                             where v.usuario_id = '${YO}')
        where telefono = '${TEL}';
       update public.llamadas
          set vendedor_id = (select v.id from public.vendedores v
                             where v.usuario_id = '${YO}')
        where call_id = '${CALL}';`);

  // Sin recargar: el cambio de dueño viaja en la misma fila de la llamada y
  // llega por el websocket, que es lo que tiene que pasar cuando alguien
  // reasigna un hilo con el teléfono sonando.
  await p.waitForTimeout(2500);
  await foto("2-popup");

  es("sigue en pantalla después de recargar", await tarjeta.count(), 1);
  es("Y AHORA INTERRUMPE", await donde(), "pop-up");
  es("diciendo que le toca", /Te toca a vos/i.test(await tarjeta.innerText()), true);
}

console.log("\n── ESCRIBIENDO NO INTERRUMPE ──");
{
  /*
   * El corazón del pedido. Se cierra la llamada, se pone a escribir, y entra
   * una nueva mientras los dedos están en el teclado.
   */
  sql(`update public.llamadas set estado = 'terminada' where call_id = '${CALL}';`);
  await p.waitForTimeout(1500);
  es("la anterior se fue", await tarjeta.count(), 0);

  // Se abre la bandeja y se empieza a escribir en el buscador de hilos, que es
  // el campo que hay a mano en cualquier pantalla.
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2000);
  const caja = p.getByPlaceholder(/Buscar/).first();
  await caja.click();
  await caja.type("escribiendo algo", { delay: 60 });

  entraLlamada("wacid.PRUEBA.2");

  // Se sigue escribiendo mientras entra, que es el caso real.
  await caja.type(" y sigo", { delay: 60 });
  await p.waitForTimeout(600);
  await foto("3-escribiendo");

  es("la llamada llegó", await tarjeta.count(), 1);
  es("PERO NO INTERRUMPIÓ", await donde(), "esquina");
  es(
    "y lo dice",
    /Termin[aá] lo que est[aá]s escribiendo/i.test(await tarjeta.innerText()),
    true,
  );

  // Y lo más importante: lo que se estaba escribiendo sigue entero y el foco
  // no se movió.
  es("NO SE PERDIÓ LO ESCRITO", await caja.inputValue(), "escribiendo algo y sigo");
  es("ni se robó el foco", await caja.evaluate((el) => el === document.activeElement), true);
}

console.log("\n── AL PARAR DE ESCRIBIR, SUBE SOLA ──");
{
  /*
   * Sin tocar nada más: se levantan las manos del teclado y el pop-up aparece
   * solo. Sin esto la llamada se quedaría chiquita en la esquina hasta
   * perderse.
   */
  await p.waitForTimeout(4000);
  await foto("4-subio-sola");
  es("AHORA SÍ INTERRUMPE", await donde(), "pop-up");
  es("y sigue sin haber tocado nada", await p.getByPlaceholder(/Buscar/).first().inputValue(), "escribiendo algo y sigo");
}

console.log("\n── se puede rechazar ──");
{
  await p.getByRole("button", { name: "Rechazar" }).click();
  await p.waitForTimeout(2500);

  es("desaparece de la pantalla", await tarjeta.count(), 0);
  es(
    "Y QUEDA ANOTADA COMO RECHAZADA",
    sql(`select estado from public.llamadas where call_id = 'wacid.PRUEBA.2';`),
    "rechazada",
  );
}

console.log("\n── EL BOTÓN DE LLAMAR ESTÁ EN EL HILO ──");
{
  /*
   * «Se podrían hacer llamadas a clientes colocando un botón de llamar.» Va en
   * la cabecera de la conversación, al lado de «Ver ficha», que es donde está
   * mirando quien decide llamar.
   */
  /*
   * Se recarga: el hilo cambió de dueña en el medio de la prueba y la lista de
   * la bandeja la arma el servidor. En la vida real el hilo ya tiene dueña
   * mucho antes de que nadie llame.
   */
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(1800);

  await p.getByPlaceholder(/Buscar/).first().fill("Doña Prueba");
  await p.waitForTimeout(1500);
  await foto("5a-lista");
  await p.locator('button:has-text("Doña Prueba Llamada")').first().click();
  await p.waitForTimeout(2000);
  await foto("5-boton-llamar");

  const llamar = p.getByRole("button", { name: /Llamar/ });
  es("HAY UN BOTÓN DE LLAMAR", await llamar.count(), 1);
  es(
    "que explica que hace falta permiso",
    /permiso/i.test((await llamar.getAttribute("title")) ?? ""),
    true,
  );
}

console.log("\n── una llamada vieja colgada no suena ──");
{
  /*
   * Meta la corta al minuto y avisa por el webhook, pero el aviso puede
   * perderse. Sin tope, al abrir el CRM a la mañana estarían sonando todas las
   * de ayer.
   */
  sql(`
    insert into public.llamadas
      (call_id, conversacion_id, telefono, direccion, estado, sdp_remoto, sdp_tipo, creado_en)
    values
      ('wacid.PRUEBA.3', ${CONV}, '${TEL}', 'entrante', 'sonando', 'v=0', 'offer',
       now() - interval '30 minutes');
  `);
  await p.waitForTimeout(2500);
  await foto("6-vieja");
  es("NO SUENA", await tarjeta.count(), 0);
}

console.log("\n── la llamada queda anotada en el hilo ──");
{
  /*
   * Es lo que hace que una perdida se devuelva: nadie abre una tabla de
   * llamadas, pero la bandeja se mira todo el día.
   */
  sql(`
    insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
    values (${CONV}, 'call:wacid.PRUEBA.9', 'entrante', 'llamada', 'Llamada perdida', now());
  `);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  await p.getByPlaceholder(/Buscar/).first().fill("Doña Prueba");
  await p.waitForTimeout(1200);
  await p.locator('button:has-text("Doña Prueba Llamada")').first().click();
  await p.waitForTimeout(2000);
  await foto("7-en-el-hilo");

  const hilo = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  es("SE VE EN EL CHAT", hilo.includes("Llamada perdida"), true);
  es("y con el teléfono para distinguirla de un mensaje", hilo.includes("📞 Llamada perdida"), true);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();

limpiar();
es(
  "no quedó basura",
  sql(`select count(*) from public.llamadas where call_id like 'wacid.PRUEBA%';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
