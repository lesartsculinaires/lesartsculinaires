/**
 * El área de interés admite varias, y lo que se escribe abajo no se pierde.
 *
 *     node supabase/pruebas/banco/prueba-formulario-varios-intereses.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En el área de interés principal que se pueda elegir opción múltiple, y en la
 * parte de abajo de esa área colocar una caja de texto para poder escribir.»
 *
 * ============================================================================
 * POR QUÉ ESTO NO SE VE MIRANDO LA PANTALLA
 * ============================================================================
 *
 * Porque lo que puede fallar pasa DESPUÉS de tocar «Guardar el lead», y falla
 * callado.
 *
 *   LAS MARCAS DE MÁS SE      Un lead tiene UN `producto_id` —el que lleva la
 *   TIRAN EN SILENCIO         plata del trato—. Con una pregunta de elegir-una
 *                             eso alcanzaba. Ahora que se pueden marcar tres,
 *                             las otras dos tienen que ir a los programas de la
 *                             oportunidad; si no, alguien interesado en
 *                             Pastelería Y Barismo entra como si sólo hubiera
 *                             preguntado por Pastelería, y nadie se entera.
 *
 *   EL COMENTARIO NO TIENE    La caja de texto no mapea a ninguna columna: va a
 *   COLUMNA                   la nota de la ficha. Si la nota no lo recogiera,
 *                             la persona habría escrito para nadie — y encima
 *                             es justo el campo donde dice lo que de verdad
 *                             quiere.
 *
 * Las dos cosas se miran en la base, que es donde se puede probar que están.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `fvi-${process.pid}-${Math.random()}.sql`);
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

const marca = Date.now();
const NOMBRE = `Feriante Multiple PRUEBA ${marca}`;
const TEL = "50377" + String(marca).slice(-6);
const COMENTARIO = `Me interesan los dos, pero primero pasteleria ${marca}`;

const limpiar = () =>
  sql(`
    delete from public.oportunidad_notas where oportunidad_id in
      (select o.id from public.oportunidades o
        join public.clientes c on c.id = o.cliente_id
       where c.nombre like '%PRUEBA ${marca}%');
    delete from public.oportunidad_programas where oportunidad_id in
      (select o.id from public.oportunidades o
        join public.clientes c on c.id = o.cliente_id
       where c.nombre like '%PRUEBA ${marca}%');
    delete from public.formulario_respuestas where cliente_id in
      (select id from public.clientes where nombre like '%PRUEBA ${marca}%');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre like '%PRUEBA ${marca}%');
    delete from public.clientes where nombre like '%PRUEBA ${marca}%';
  `);
limpiar();

// ══════════════════════════════════════════════════════════════════════════
console.log("── 0. la migración dejó el formulario como se pidió ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "el área de interés es de elegir varias",
    sql(`select tipo from public.formulario_campos
          where etiqueta ilike '%interés principal%' limit 1;`),
    "opciones",
  );
  es(
    "Y JUSTO ABAJO HAY UNA CAJA DE TEXTO",
    sql(`select tipo from public.formulario_campos
          where formulario_id = (select formulario_id from public.formulario_campos
                                  where etiqueta ilike '%interés principal%' limit 1)
            and orden = (select orden + 1 from public.formulario_campos
                          where etiqueta ilike '%interés principal%' limit 1);`),
    "parrafo",
  );
  es(
    "que no es obligatoria",
    sql(`select requerido from public.formulario_campos
          where tipo = 'parrafo'
            and formulario_id = (select formulario_id from public.formulario_campos
                                  where etiqueta ilike '%interés principal%' limit 1)
          limit 1;`),
    "f",
  );
}

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
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

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try { localStorage.setItem("lac.reservas.visto", h); } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/formint-${n}.png`, fullPage: true });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Formularios"]').click();
await p.waitForTimeout(2200);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 1. SE PUEDEN MARCAR VARIAS ──");
// ══════════════════════════════════════════════════════════════════════════

await p.getByRole("button", { name: "Llenar" }).first().click();
await p.waitForTimeout(1800);
await foto("1-formulario");

/*
 * La tarjeta de la pregunta del área, para no confundirla con las otras.
 *
 * Las opciones no son casillas del navegador sino botones con `aria-pressed`,
 * que es lo que deja dibujarlas como las dibuja el CRM. La forma del cuadradito
 * es la que dice cuántas se pueden marcar: redondo para una, cuadrado para
 * varias.
 */
const tarjetaInteres = p.locator("main div", { hasText: /área de interés principal/ }).last();
const areas = tarjetaInteres.locator("button[aria-pressed]");

{
  es("las áreas siguen estando", (await areas.count()) >= 5, true);

  const forma = await areas.first().locator("span[aria-hidden]").evaluate(
    (el) => getComputedStyle(el).borderRadius,
  );
  /*
   * Cuadradas, no redondas.
   *
   * Es la diferencia visible entre elegir-una y elegir-varias, y es lo que la
   * escuela vio mal en su captura: seis redondeles donde tenía que poder marcar
   * más de uno. Un redondel promete que al marcar el segundo se suelta el
   * primero.
   */
  es("Y SON CUADRADAS: se puede marcar más de una", forma, "4px");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. se llena marcando dos y escribiendo abajo ──");
// ══════════════════════════════════════════════════════════════════════════

// Los campos de texto van en el orden del formulario: nombre y teléfono son
// los dos primeros. No se pueden pedir por su etiqueta porque el rótulo no
// envuelve al campo.
await p.locator("main input").nth(0).fill(NOMBRE);
await p.locator("main input").nth(1).fill(TEL);

await areas.nth(0).click();
await areas.nth(1).click();
await p.waitForTimeout(500);

es(
  "las dos quedaron marcadas a la vez",
  await tarjetaInteres.locator('button[aria-pressed="true"]').count(),
  2,
);

const caja = p.locator("main textarea").first();
es("la caja de texto está en la pantalla", await caja.count(), 1);
await caja.fill(COMENTARIO);
await p.waitForTimeout(400);
await foto("2-lleno");

await p.getByRole("button", { name: /Guardar el lead/ }).click();
await p.waitForTimeout(3500);
await foto("3-guardado");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. QUÉ QUEDÓ EN LA BASE ──");
// ══════════════════════════════════════════════════════════════════════════

es(
  "se creó el lead",
  sql(`select count(*) from public.clientes where nombre = '${NOMBRE}';`),
  "1",
);

es(
  "con un programa principal, que es el que lleva la plata",
  sql(`select case when o.producto_id is null then 'sin programa' else 'tiene' end
         from public.oportunidades o
         join public.clientes c on c.id = o.cliente_id
        where c.nombre = '${NOMBRE}';`),
  "tiene",
);

/*
 * La comprobación que justifica todo el archivo.
 *
 * Dos marcas tienen que dejar DOS programas de interés. Con la pregunta de
 * elegir-una esto daba uno, y la segunda área se perdía sin que nadie lo notara
 * hasta que el lead se contactaba por el programa equivocado.
 */
es(
  "Y LAS DOS ÁREAS MARCADAS QUEDARON ANOTADAS",
  sql(`select count(*) from public.oportunidad_programas op
         join public.oportunidades o on o.id = op.oportunidad_id
         join public.clientes c on c.id = o.cliente_id
        where c.nombre = '${NOMBRE}';`),
  "2",
);

es(
  "EL COMENTARIO LLEGÓ A LA NOTA DE LA FICHA",
  sql(`select case when n.nota like '%${COMENTARIO}%' then 'sí' else 'no: ' || left(n.nota, 120) end
         from public.oportunidad_notas n
         join public.oportunidades o on o.id = n.oportunidad_id
         join public.clientes c on c.id = o.cliente_id
        where c.nombre = '${NOMBRE}';`),
  "sí",
);

es(
  "y la respuesta cruda quedó guardada igual",
  sql(`select count(*) from public.formulario_respuestas r
         join public.clientes c on c.id = r.cliente_id
        where c.nombre = '${NOMBRE}';`),
  "1",
);

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", sql(`select count(*) from public.clientes where nombre = '${NOMBRE}';`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
