/**
 * La bandeja: marcar sin leer, fijar arriba, silenciar y los emojis.
 *
 *     node supabase/pruebas/banco/prueba-bandeja-marcas.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ PIDIÓ LA ESCUELA
 * ------------------------------------------------------------------------
 *
 * «Poder colocar un botón de No leído en cada cliente, acciones secundarias y
 * toda la interfaz que WhatsApp ofrece […] y todo el sistema de emojis.»
 *
 * Esto es la parte que no depende de Meta: marcas del CRM y un teclado de
 * emojis. Nada de esto sale a WhatsApp ni gasta cuota de la API.
 *
 * ------------------------------------------------------------------------
 * LO QUE HAY QUE PROBAR CON EL NAVEGADOR Y NO CON SQL
 * ------------------------------------------------------------------------
 *
 *   QUE MARCAR PENDIENTE AGUANTE   Es el que se puede romper solo. Abrir un
 *                                  hilo lo marca leído; si al marcarlo
 *                                  pendiente se quedara abierto, ese efecto lo
 *                                  volvería a apagar en el refresco siguiente
 *                                  y el botón parecería no hacer nada. Sólo se
 *                                  ve corriendo las dos cosas juntas.
 *
 *   QUE FIJAR MUEVA LA FILA        Fijar sin reordenar no sirve de nada, y el
 *                                  orden se arma en la pantalla, no en la
 *                                  consulta.
 *
 *   QUE EL «⋮» EXISTA Y RESPONDA   Va adentro de una fila que era un botón
 *                                  entero. Un botón dentro de un botón se
 *                                  dibuja pero no responde —ya pasó en esta
 *                                  misma pantalla con el aviso de las 24
 *                                  horas— y desde el HTML no se nota.
 *
 *   QUE EL EMOJI CAIGA EN EL CURSOR Y no al final, que es lo que sale gratis.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-marcas-${process.pid}-${Math.random()}.sql`);
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

// Tres hilos, con horas distintas para que el orden por actividad se note.
// «Vieja» es la de más abajo: es la que se va a fijar.
const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono like '5039911%');
    delete from public.conversaciones where telefono like '5039911%';
  `);
limpiar();

sql(`
  insert into public.conversaciones
    (telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto, sin_leer, archivada)
  values
    ('50399110001', 'Marca Reciente', now() - interval '5 minutes', 'Buenas, información', 0, false),
    ('50399110002', 'Marca Media',    now() - interval '3 hours',   'Gracias',            0, false),
    ('50399110003', 'Marca Vieja',    now() - interval '2 days',    'Quedamos así',       0, false);

  insert into public.mensajes (conversacion_id, direccion, tipo, texto, creado_en)
  select c.id, 'entrante', 'text', 'Hola, quiero información del diplomado', now() - interval '5 minutes'
    from public.conversaciones c where c.telefono = '50399110001';
`);

const marcaDe = (tel, col) =>
  sql(`select ${col} from public.conversaciones where telefono = '${tel}';`);

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

const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/marcas-${n}.png` });

const abrirBandeja = async () => {
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2000);
};

/** La fila de un hilo, por el nombre que muestra. */
const fila = (nombre) =>
  p.locator("main div", { has: p.locator(`button.row:has-text("${nombre}")`) }).last();

/** Abre el «⋮» de ese hilo. */
const menuDe = async (nombre) => {
  await p.getByRole("button", { name: `Más acciones de ${nombre}` }).click();
  await p.waitForTimeout(500);
};

/**
 * Los nombres de la lista, en el orden en que se ven.
 *
 * Se saca con una expresión y no con el primer renglón: una fila fijada
 * empieza con el 📌, que va en su propio elemento y por lo tanto en su propia
 * línea del texto.
 */
const orden = async () =>
  (await p.locator("main button.row").allInnerTexts())
    .map((t) => t.match(/Marca \w+/)?.[0])
    .filter((t) => t != null);

await abrirBandeja();

console.log("── el «⋮» está en cada fila y responde ──");
{
  await foto("1-lista");
  es(
    "hay un menú por hilo",
    await p.getByRole("button", { name: /^Más acciones de Marca/ }).count(),
    3,
  );

  await menuDe("Marca Media");
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  await foto("2-menu");
  es("ofrece marcar como no leída", t.includes("Marcar como no leída"), true);
  es("fijar arriba", t.includes("Fijar arriba"), true);
  es("silenciar", t.includes("Silenciar"), true);
  es("y archivar, que antes sólo estaba adentro", t.includes("Archivar"), true);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
}

console.log("\n── marcar como no leída ──");
{
  await menuDe("Marca Media");
  await p.getByRole("menuitem", { name: "● Marcar como no leída" }).click();
  await p.waitForTimeout(2200);
  await foto("3-pendiente");

  es("QUEDÓ MARCADA EN LA BASE", marcaDe("50399110002", "no_leida"), "t");
  es(
    "y pesa como un mensaje sin abrir",
    Number(marcaDe("50399110002", "sin_leer")) >= 1,
    true,
  );

  const enFila = (await fila("Marca Media").innerText()).replace(/\s+/g, " ");
  es("la fila lo dice con todas las letras", enFila.includes("pendiente"), true);
  es(
    "y no con un «1» suelto, que se leería como un mensaje nuevo",
    /\bpendiente\b/.test(enFila) && !/^1$/m.test(enFila),
    true,
  );
}

console.log("\n── y abrirla la atiende ──");
{
  /*
   * Éste es el que importa: sin la marca, abrir un hilo ya lo dejaba leído.
   * Lo que se prueba es que la marca puesta a mano también se apague al
   * entrar, y no quede un punto encendido para siempre sobre algo que la
   * persona está mirando.
   */
  await p.locator('button.row:has-text("Marca Media")').click();
  await p.waitForTimeout(2500);
  es("SE APAGÓ SOLA AL ENTRAR", marcaDe("50399110002", "no_leida"), "f");
  es("y el contador vuelve a cero", marcaDe("50399110002", "sin_leer"), "0");
}

console.log("\n── marcarla pendiente con el hilo abierto lo cierra ──");
{
  /*
   * Si se quedara abierto, el efecto de «abrirla es haberla leído» la
   * apagaría en el refresco siguiente y el botón parecería roto. Cerrarla es
   * lo que hace que la marca aguante.
   */
  await menuDe("Marca Media");
  await p.getByRole("menuitem", { name: "● Marcar como no leída" }).click();
  await p.waitForTimeout(2500);
  await foto("4-cerrada");

  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("se cerró la conversación", t.includes("Elegí una conversación de la izquierda"), true);
  es("Y LA MARCA AGUANTÓ", marcaDe("50399110002", "no_leida"), "t");
}

console.log("\n── fijar sube la fila ──");
{
  const antes = await orden();
  console.log(`   (antes: ${antes.join(" · ")})`);
  es("la vieja está última", antes[antes.length - 1], "Marca Vieja");

  await menuDe("Marca Vieja");
  await p.getByRole("menuitem", { name: "📌 Fijar arriba" }).click();
  await p.waitForTimeout(2200);
  await foto("5-fijada");

  const despues = await orden();
  console.log(`   (después: ${despues.join(" · ")})`);
  es("AHORA ESTÁ PRIMERA", despues[0], "Marca Vieja");
  es("y se ve el pin", (await fila("Marca Vieja").innerText()).includes("📌"), true);
  es("sin haber tocado su fecha", marcaDe("50399110003", "fijada"), "t");
}

console.log("\n── silenciar saca del número rojo ──");
{
  /*
   * Cuatro sin abrir en un solo hilo, y el resto en cero.
   *
   * Lo segundo hace falta: «Marca Media» quedó pendiente del paso anterior y
   * eso pesa uno —así se pensó, una conversación marcada cuenta como algo por
   * atender—. Sin limpiarla, el número de la barra sería cinco y la prueba
   * estaría midiendo dos cosas a la vez.
   */
  sql(`
    update public.conversaciones set sin_leer = 4, no_leida = false
      where telefono = '50399110001';
    update public.conversaciones set sin_leer = 0, no_leida = false
      where telefono in ('50399110002', '50399110003');
  `);
  await abrirBandeja();

  const conRuido = await p.locator('aside button[data-mod="Inbox"]').getAttribute("aria-label");
  console.log(`   (barra: ${conRuido})`);
  es("los cuatro cuentan", /4 sin leer/.test(conRuido ?? ""), true);

  await menuDe("Marca Reciente");
  await p.getByRole("menuitem", { name: "🔕 Silenciar" }).click();
  await p.waitForTimeout(2200);
  await abrirBandeja();
  await foto("6-silenciada");

  const callada = await p.locator('aside button[data-mod="Inbox"]').getAttribute("aria-label");
  console.log(`   (barra: ${callada ?? "sin número"})`);
  // Sin globito: era el único hilo con mensajes sin abrir.
  es("YA NO CUENTAN", /sin leer/.test(callada ?? ""), false);
  es("pero el hilo sigue en la lista", (await orden()).includes("Marca Reciente"), true);
  es("con su campana tachada", (await fila("Marca Reciente").innerText()).includes("🔕"), true);
  es("y sus mensajes intactos", marcaDe("50399110001", "sin_leer"), "4");
}

console.log("\n── los emojis ──");
{
  await p.locator('button.row:has-text("Marca Reciente")').click();
  await p.waitForTimeout(2000);

  // Por la nota interna: no hace falta token de WhatsApp para escribir, y es
  // el mismo cuadro de texto.
  await p.locator('main label:has-text("Nota interna") input[type="checkbox"]').check();
  await p.waitForTimeout(400);

  const caja = p.locator("main textarea");
  await caja.fill("Hola, gracias por escribir");
  // El cursor después de «Hola,», que es donde iría la carita.
  await caja.evaluate((el) => el.setSelectionRange(5, 5));

  await p.getByRole("button", { name: "Emojis" }).click();
  await p.waitForTimeout(600);
  await foto("7-emojis");

  const panel = p.getByRole("dialog", { name: "Elegir un emoji" });
  es("se abre el teclado", await panel.count(), 1);
  es("con grupos", (await panel.locator("button").count()) > 30, true);

  console.log("\n   ── se busca en castellano ──");
  await panel.getByRole("textbox", { name: "Buscar un emoji" }).fill("pastel");
  await p.waitForTimeout(500);
  await foto("8-buscando");
  es("«pastel» encuentra el pastel", await panel.getByRole("button", { name: /pastel/ }).count() > 0, true);

  await panel.getByRole("button", { name: /pastel cumpleanos/ }).first().click();
  await p.waitForTimeout(500);

  es("CAYÓ DONDE ESTABA EL CURSOR", await caja.inputValue(), "Hola,🎂 gracias por escribir");

  console.log("\n   ── y se queda abierto para poner otro ──");
  es("sigue abierto", await panel.count(), 1);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  es("Escape lo cierra", await panel.count(), 0);
}

console.log("\n── nada reventó por el camino ──");
es("sin errores de la página", errores, []);

await ctx.close();
await nav.close();
limpiar();

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
