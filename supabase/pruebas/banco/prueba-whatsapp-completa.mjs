/**
 * Cuando WhatsApp cae en una ficha que ya existe, ¿le completa lo que falta?
 *
 *     node supabase/pruebas/banco/prueba-whatsapp-completa.mjs
 *
 * ------------------------------------------------------------------------
 * EL HUECO QUE TAPA
 * ------------------------------------------------------------------------
 *
 * Unificar dejó de duplicar leads, que era el problema grande. Pero unificar
 * también tiene que COMPLETAR, y por WhatsApp no lo hacía: `cliente_de_whatsapp`
 * encontraba la ficha del número, devolvía el id y no escribía nada.
 *
 * El resultado se ve en producción: fichas que se llaman «50377972598» porque
 * el primer mensaje llegó sin nombre de perfil, y que se siguen llamando así
 * diez mensajes después, con el nombre de la persona a la vista en el chat.
 *
 * ------------------------------------------------------------------------
 * Y EL RIESGO QUE NO PUEDE CORRER
 * ------------------------------------------------------------------------
 *
 * El nombre de perfil de WhatsApp es lo que la persona quiso poner: «Mami ❤»,
 * «Chef», una sola letra. Si eso pisara el nombre que escribió la asesora,
 * completar sería una forma elegante de romper la base. Por eso la mitad de
 * esta prueba es lo que NO tiene que cambiar.
 *
 * Necesita el banco armado (`armar.sh`). No usa el navegador: es SQL contra la
 * función, que es donde vive la regla.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-wa-${process.pid}-${Math.random()}.sql`);
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

const NUMS = ["50370999111", "50370999222", "50370999333", "50370999444", "50370999555"];
const enLista = NUMS.map((n) => `'${n}'`).join(", ");

const limpiar = () => sql(`delete from public.clientes where telefono in (${enLista});`);
limpiar();

sql(`
  insert into public.clientes (nombre, telefono) values
    -- La dejó el propio webhook cuando el mensaje vino sin nombre de perfil.
    ('50370999111', '50370999111'),
    -- La escribió una asesora, con el nombre bien puesto.
    ('Andrea Melara', '50370999222'),
    -- De una base vieja que traía la columna del nombre vacía.
    ('  ', '50370999333'),
    -- Otra del webhook, pero el perfil que llega ahora tampoco es un nombre.
    ('50370999444', '50370999444'),
    -- Ésta se llama con el número escrito «bonito», que es lo mismo.
    ('+503 7099-9555', '50370999555');
`);

const nombreDe = (tel) =>
  sql(`select coalesce(nullif(btrim(nombre), ''), '(vacío)') from public.clientes where telefono = '${tel}';`);

const llega = (tel, perfil) =>
  sql(`select public.cliente_de_whatsapp('${tel}', '${perfil}') is not null;`);

console.log("── llegan cinco mensajes ──");
{
  es("todos encuentran su ficha", [
    llega(NUMS[0], "Chef Andrea"),
    llega(NUMS[1], "Mami ❤"),
    llega(NUMS[2], "Luis Pérez"),
    llega(NUMS[3], "7099-9444"),
    llega(NUMS[4], "Sofía Campos"),
  ], ["t", "t", "t", "t", "t"]);

  es(
    "y no se creó ninguna ficha de más",
    sql(`select count(*) from public.clientes where telefono in (${enLista});`),
    "5",
  );
}

console.log("\n── LO QUE SE COMPLETÓ ──");
{
  es("la que se llamaba como su número, ahora tiene nombre", nombreDe(NUMS[0]), "Chef Andrea");
  es("la que no tenía nombre, también", nombreDe(NUMS[2]), "Luis Pérez");
  es("y la del número escrito bonito, igual", nombreDe(NUMS[4]), "Sofía Campos");
}

console.log("\n── LO QUE NO SE TOCÓ ──");
{
  /*
   * Éstas son las que importan. Un «completar» que pisa deja de ser completar.
   */
  es("EL NOMBRE QUE ESCRIBIÓ LA ASESORA SE QUEDA", nombreDe(NUMS[1]), "Andrea Melara");
  es(
    "y un perfil que es otro número no completa nada",
    nombreDe(NUMS[3]),
    "50370999444",
  );
}

console.log("\n── y el segundo mensaje no vuelve a escribir ──");
{
  // Idempotencia: la ficha ya tiene nombre de verdad, así que el mismo mensaje
  // otra vez no la cambia. Es lo que va a pasar cien veces por día.
  llega(NUMS[0], "Chef Andrea Melara");
  es("sigue como quedó", nombreDe(NUMS[0]), "Chef Andrea");
}

console.log("\n── un número que no existe entra como siempre ──");
{
  const nuevo = "50370999666";
  sql(`delete from public.clientes where telefono = '${nuevo}';`);
  es("se crea la ficha", sql(`select public.cliente_de_whatsapp('${nuevo}', 'Nuevo Contacto') is not null;`), "t");
  es(
    "con su nombre de perfil",
    sql(`select nombre from public.clientes where telefono = '${nuevo}';`),
    "Nuevo Contacto",
  );
  sql(`delete from public.clientes where telefono = '${nuevo}';`);
}

console.log("\n── y sin nombre de perfil, el teléfono, como antes ──");
{
  const mudo = "50370999777";
  sql(`delete from public.clientes where telefono = '${mudo}';`);
  sql(`select public.cliente_de_whatsapp('${mudo}', null);`);
  es(
    "queda el número, que al menos se puede buscar",
    sql(`select nombre from public.clientes where telefono = '${mudo}';`),
    mudo,
  );
  sql(`delete from public.clientes where telefono = '${mudo}';`);
}

limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.clientes where telefono in (${enLista});`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
