/**
 * La barra de formato, y que el cuadro de plantilla no tape los botones.
 *
 *     node supabase/pruebas/banco/prueba-formato-y-cuadro.mjs
 *
 * ============================================================================
 * LAS DOS COSAS QUE PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Cuando se despliega esa sección no me deja visualizar lo que está atrás;
 *  que se pueda hacer scroll, o que se quite lo demás, o una ventana más
 *  ancha.»  Y: «en el Inbox necesito herramientas de edición de texto como
 *  bold, itálica, subrayado o herramientas estándar.»
 *
 * Lo primero no era un problema de ancho: el cuadro de «Nuevo chat» no tenía
 * ninguna zona que rodara. Con una plantilla elegida —las de la escuela listan
 * los cinco diplomados— el contenido pasaba el alto del cuadro y lo que se
 * salía por abajo eran los botones. No se podía enviar ni cancelar. Por eso la
 * comprobación de acá no es «se ve lindo» sino LOS BOTONES ESTÁN DENTRO DE LA
 * PANTALLA con la plantilla más larga que haya.
 *
 * ============================================================================
 * Y LO QUE NO SE PUEDE, DICHO
 * ============================================================================
 *
 * Subrayado no hay: WhatsApp no tiene una marca para subrayar. Un botón de
 * subrayado mandaría un símbolo suelto en medio de la frase. Acá se comprueba
 * que NO está y que la pantalla explica por qué, que es lo que evita que
 * alguien lo reporte como un botón que falta.
 *
 * Y que la barra no aparezca en Instagram ni Messenger, donde los asteriscos
 * le llegan al cliente como asteriscos.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `fmt-${process.pid}-${Math.random()}.sql`);
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

// ---------------------------------------------------------------- preparar

const marca = Date.now();
const TEL = `503${String(marca).slice(-8)}`;
const IGID = `ig.fmt.${marca}`;
const CLIENTE = `Formato De Prueba ${marca}`;

// Una plantilla larga de verdad: es la que rompía el cuadro. Sin este largo la
// prueba pasaría sin probar nada.
const CUERPO_LARGO = Array.from(
  { length: 26 },
  (_, i) => `Línea ${i + 1} del pensum: diplomado, horario, requisitos y forma de pago.`,
).join("\\n");

const limpiar = () => {
  sql(`
    -- Por patrón y no sólo por esta corrida: una prueba que se corta a la
    -- mitad deja su hilo puesto, y la siguiente lo encuentra en la lista de al
    -- lado y mide mal. Ya pasó.
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones
        where nombre_perfil like 'Formato De Prueba 17%' or nombre_perfil like 'MSN 17%');
    delete from public.conversaciones
      where nombre_perfil like 'Formato De Prueba 17%' or nombre_perfil like 'MSN 17%';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre like 'Formato De Prueba 17%');
    delete from public.oportunidades where codigo = 'FMT-0001';
    delete from public.clientes where nombre like 'Formato De Prueba 17%';
    delete from public.plantillas where nombre = 'prueba_formato_larga';
  `);
};
limpiar();

sql(`
  insert into public.clientes (nombre, telefono) values ('${CLIENTE}', '${TEL}');

  -- Con oportunidad: el buscador de «Nuevo chat» busca entre los leads, no
  -- entre las fichas sueltas.
  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, producto_id, etapa_id, fecha_registro, valor_oportunidad)
  select 'FMT-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.productos order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         current_date, 495
    from public.clientes c where c.nombre = '${CLIENTE}';

  insert into public.plantillas (id, nombre, idioma, estado, cuerpo, categoria)
  values ('prueba-fmt-${marca}', 'prueba_formato_larga', 'es', 'APPROVED',
          E'Hola {{1}}!\\n${CUERPO_LARGO}', 'MARKETING')
  on conflict (id) do nothing;

  -- Un hilo de WhatsApp con un mensaje que ya trae marcas, para ver si la
  -- burbuja las dibuja.
  insert into public.conversaciones (canal, telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto)
  values ('whatsapp', '${TEL}', '${CLIENTE}', now(), '*Hola* y _gracias_');

  insert into public.mensajes (conversacion_id, direccion, texto, tipo, creado_en)
  select id, 'entrante', '*Hola* y _gracias_ ~por todo~', 'texto', now()
    from public.conversaciones where telefono = '${TEL}';

  -- Y uno de Messenger con los MISMOS asteriscos, que ahí son literales.
  insert into public.conversaciones (canal, identificador, nombre_perfil, ultimo_mensaje_en, ultimo_texto)
  values ('messenger', '${IGID}', 'MSN ${marca}', now(), '*Hola* literal');

  insert into public.mensajes (conversacion_id, direccion, texto, tipo, creado_en)
  select id, 'entrante', '*Hola* literal', 'texto', now()
    from public.conversaciones where identificador = '${IGID}';
`);

// --------------------------------------------------------------- navegador

const subDe = (a) =>
  JSON.parse(
    Buffer.from(fs.readFileSync(`${BANCO}/${a}`, "utf8").trim().split(".")[1], "base64url").toString(),
  ).sub;
const JEFA = subDe("jwt-jefa.txt");
const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
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
const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));
const p = await ctx.newPage();
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/fmt-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2600);
await foto("0-bandeja");

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. EL CUADRO DE NUEVO CHAT NO SE COME LOS BOTONES ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await p.getByRole("button", { name: /Nuevo chat|\+ Chat|Nuevo/ }).first().click();
  await p.waitForTimeout(1200);

  const cuadro = p.getByRole("dialog");
  await cuadro.locator("input").first().fill("FMT-0001");
  await p.waitForTimeout(1600);
  await foto("1a-buscando");

  // Elegir a la persona de la lista.
  await cuadro.getByText(CLIENTE, { exact: false }).first().click();
  await p.waitForTimeout(1000);

  // Y la plantilla larga, que es la que rompía el cuadro.
  const combo = cuadro.locator("select").first();
  await combo.selectOption({ label: "prueba_formato_larga (es)" });
  await p.waitForTimeout(900);
  await foto("1-cuadro-con-plantilla");

  const alto = p.viewportSize().height;

  // LA COMPROBACIÓN QUE IMPORTA: el botón de enviar tiene que estar DENTRO de
  // la pantalla. Antes se salía por abajo y no había forma de llegar.
  const botones = cuadro.getByRole("button", { name: /Abrir|Cancelar/ });
  const n = await botones.count();
  es("los botones del pie siguen ahí", n >= 2, true);

  let todosDentro = true;
  for (let i = 0; i < n; i++) {
    const caja = await botones.nth(i).boundingBox();
    if (!caja || caja.y + caja.height > alto) todosDentro = false;
  }
  es("Y ESTÁN DENTRO DE LA PANTALLA, con la plantilla más larga", todosDentro, true);

  // El cuadro entero tampoco se sale.
  const caja = await cuadro.locator("> div").first().boundingBox();
  es("el cuadro no se sale por abajo", caja.y + caja.height <= alto + 1, true);
  es("ni por arriba", caja.y >= -1, true);

  // Y la vista previa se lee rodando, en vez de empujar todo.
  const rueda = await cuadro.evaluate((d) => {
    const cajas = [...d.querySelectorAll("div")].filter(
      (e) => e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY === "auto",
    );
    return cajas.length;
  });
  es("HAY POR DÓNDE RODAR para leer lo que quedó tapado", rueda >= 1, true);

  await cuadro.getByRole("button", { name: /Cancelar/ }).click();
  await p.waitForTimeout(700);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LA BARRA DE FORMATO EN WHATSAPP ──");
// ══════════════════════════════════════════════════════════════════════════
await p.getByText(CLIENTE, { exact: false }).first().click();
await p.waitForTimeout(2000);
await foto("2-hilo-whatsapp");

{
  for (const m of ["negrita", "cursiva", "tachado", "mono"]) {
    es(`está el botón de ${m}`, await p.locator(`button[data-formato="${m}"]`).count(), 1);
  }

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("NO HAY SUBRAYADO", /data-formato="subrayado"/.test(await p.content()), false);
  es("y se dice por qué, para que no lo reporten como que falta",
     /WhatsApp no tiene subrayado/.test(texto), true);
}

console.log("\n   · el botón envuelve lo seleccionado");
{
  const caja = p.locator('textarea[placeholder*="Escribí tu respuesta"]');
  await caja.fill("Hola Cory");
  // Seleccionar «Cory».
  await caja.evaluate((el) => el.setSelectionRange(5, 9));
  await p.locator('button[data-formato="negrita"]').click();
  await p.waitForTimeout(400);
  es("quedó *Cory*", await caja.inputValue(), "Hola *Cory*");

  // Y el mismo botón lo deshace: la selección tiene que haber sobrevivido.
  await p.locator('button[data-formato="negrita"]').click();
  await p.waitForTimeout(400);
  es("EL MISMO BOTÓN LO DESHACE, sin volver a marcar con el ratón",
     await caja.inputValue(), "Hola Cory");
}

console.log("\n   · Ctrl+B, que es lo que la mano ya sabe");
{
  const caja = p.locator('textarea[placeholder*="Escribí tu respuesta"]');
  await caja.evaluate((el) => el.setSelectionRange(0, 4));
  await caja.press("Control+b");
  await p.waitForTimeout(400);
  es("el atajo también", await caja.inputValue(), "*Hola* Cory");
  await caja.fill("");
}

console.log("\n   · y la burbuja lo dibuja, en vez de mostrar los asteriscos");
{
  const negritas = await p.evaluate(() => {
    const spans = [...document.querySelectorAll("span")];
    return spans.filter(
      (s) => s.textContent === "Hola" && Number(getComputedStyle(s).fontWeight) >= 700,
    ).length;
  });
  es("«Hola» se ve en negrita de verdad", negritas >= 1, true);

  /*
   * Mirando SÓLO el mensaje, no la pantalla entera.
   *
   * La primera versión de esta comprobación buscaba «*Hola*» en todo el
   * `body` y fallaba: lo encontraba en la fila de Messenger de la lista de al
   * lado, donde los asteriscos TIENEN que verse. La prueba estaba mal, no el
   * código, y la lección es que acá hay que preguntarle a la burbuja.
   */
  const cuerpo = await p.evaluate(() => {
    // El elemento MÁS CHICO que contiene la frase: cualquier otro criterio
    // termina agarrando un contenedor de arriba —la primera versión de esto se
    // trajo la página entera, barra lateral incluida— y entonces la
    // comprobación mide cualquier cosa menos la burbuja.
    // Con las TRES partes: ahora que el texto viene partido en tramos —uno
    // por marca— el más chico que dice «por todo» es el <span> del tachado, y
    // ése no tiene el resto de la frase. El que las contiene a las tres es la
    // burbuja.
    const todos = [...document.querySelectorAll("*")].filter((e) => {
      const t = e.textContent ?? "";
      return t.includes("Hola") && t.includes("gracias") && t.includes("por todo");
    });
    todos.sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length);
    return todos[0]?.textContent ?? "";
  });
  es("la burbuja tiene el texto entero",
     cuerpo.includes("Hola") && cuerpo.includes("gracias") && cuerpo.includes("por todo"), true);
  es("Y NINGUNA MARCA A LA VISTA", /[*_~]/.test(cuerpo), false);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. EN MESSENGER NO, PORQUE AHÍ NO SE DIBUJAN ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await p.getByText(`MSN ${marca}`, { exact: false }).first().click();
  await p.waitForTimeout(2000);
  await foto("3-hilo-messenger");

  es("no hay barra de formato", await p.locator("button[data-formato]").count(), 0);

  // Y los asteriscos se ven, porque ahí son asteriscos de verdad: es lo que
  // recibe el cliente.
  const cuerpo = await p.evaluate(() => document.body.innerText);
  es("LOS ASTERISCOS SE MUESTRAN, que es lo que le llegó a la persona",
     cuerpo.includes("*Hola* literal"), true);
}

await nav.close();
limpiar();

console.log(
  f === 0
    ? "\nTodo bien: el cuadro se lee entero y el formato sólo está donde se dibuja."
    : `\n${f} comprobaciones fallaron.`,
);
process.exit(f ? 1 : 0);
