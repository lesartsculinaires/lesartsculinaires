/**
 * ¿Alguna función del CRM borra o actualiza sin decir cuáles filas?
 *
 *     node supabase/pruebas/sqlSeguro.test.mjs
 *
 * ============================================================================
 * EL CASO REAL QUE ROMPIÓ ESTO
 * ============================================================================
 *
 * El botón de borrar una base repetida devolvía, en producción:
 *
 *     DELETE requires a WHERE clause
 *
 * y no borraba nada. El mensaje no viene del CRM ni de PostgREST: lo tira
 * Postgres por la extensión `safeupdate`, que Supabase deja encendida y que
 * prohíbe cualquier `delete` o `update` sin `where`. Es una red de seguridad
 * buenísima —impide que un descuido en el editor de SQL vacíe una tabla— y no
 * hay ninguna razón para apagarla.
 *
 * Lo que la disparaba era una línea de `borrar_base` que parecía inofensiva:
 *
 *     delete from _huerfanos;
 *
 * Vaciar una tabla temporal al empezar. Correcto en intención, prohibido en la
 * forma.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA UNA PRUEBA Y NO ALCANZA CON ACORDARSE
 * ============================================================================
 *
 * Porque esto no falla donde se escribe. La migración se crea sin ningún
 * problema —la función queda instalada, la consulta de verificación dice ✓— y
 * revienta recién el día que alguien la ejecuta, con un mensaje en inglés que
 * habla de cláusulas SQL y no de bases duplicadas. Entre las dos cosas pueden
 * pasar semanas.
 *
 * Y porque el banco de pruebas no tiene `safeupdate`: es una extensión que hay
 * que compilar, así que ahí todo anda y en Supabase no. Leer los archivos es la
 * única manera de atajarlo antes.
 *
 * ============================================================================
 * DÓNDE SÍ Y DÓNDE NO
 * ============================================================================
 *
 * La extensión se enciende para el rol `authenticated`, que es con el que la
 * aplicación habla con la base. NO para el editor de SQL de Supabase, que
 * corre como `postgres`. De ahí la regla exacta que comprueba este archivo:
 *
 *   ADENTRO DE UNA FUNCIÓN    prohibido. Una función se llama desde el CRM, o
 *                             sea desde una sesión `authenticated`, y ahí la
 *                             extensión está cargada. Da igual que sea
 *                             `security definer`: eso cambia los permisos, no
 *                             la sesión.
 *
 *   SUELTO EN LA MIGRACIÓN    permitido. Eso lo corre una persona una vez, en
 *                             el editor. Hay dos así en el repositorio —dan
 *                             vuelta el orden de las etapas— y las dos
 *                             corrieron sin problema en producción.
 *
 * Por eso lo que se lee acá son los cuerpos de las funciones y nada más.
 *
 * ============================================================================
 * QUÉ SE PERMITE ADENTRO
 * ============================================================================
 *
 * `truncate`, que es otra sentencia y la extensión no la mira. Si de verdad
 * hace falta vaciar una tabla entera, ése es el camino y además es más rápido.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const RAIZ = "supabase/migrations";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/**
 * Saca los comentarios para no confundirlos con código.
 *
 * Media migración de este repositorio es explicación, y varias citan el SQL
 * que están arreglando —este archivo mismo lo hace—. Sin esto, la prueba se
 * quejaría de las líneas que documentan el problema.
 */
const sinComentarios = (sql) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") //  bloques /* … */
    .replace(/^\s*--.*$/gm, " ") //        líneas que empiezan con --
    .replace(/--.*$/gm, " "); //           lo que sigue a -- en cualquier línea

/**
 * Los `delete` y `update` que no dicen sobre qué filas.
 *
 * Se buscan por donde empiezan y se lee hasta el punto y coma. No se parte el
 * texto en sentencias primero, y ahí está la diferencia que importa: adentro
 * de una función de plpgsql las sentencias vienen envueltas en `begin … end`,
 * así que el trozo entre puntos y coma empieza con «begin delete from …» y
 * una comprobación que pidiera que arrancara con «delete» no vería ninguna.
 *
 * Es una comprobación de texto y no un analizador de SQL. Alcanza: lo que se
 * busca es una sentencia corta y completa, que es como se escriben las que
 * caen en esta trampa.
 */
function sinWhere(sql) {
  const limpio = sinComentarios(sql).replace(/\s+/g, " ");
  const malas = [];

  const mirar = (patron) => {
    for (const m of limpio.matchAll(patron)) {
      const sentencia = m[0].trim();
      if (/\swhere\s/i.test(sentencia + " ")) continue;
      malas.push(sentencia.slice(0, 90));
    }
  };

  mirar(/\bdelete\s+from\s[^;]*/gi);
  /*
   * `update tabla set …`, y nada más que eso.
   *
   * Las dos exclusiones de adelante son las que evitan falsos positivos:
   * `select … for update` bloquea filas y no cambia ninguna, y el
   * `on conflict … do update set` de un insert ya está acotado por la fila que
   * chocó.
   */
  mirar(/(?<!\bfor\s)(?<!\bdo\s)\bupdate\s+[a-z_."]+\s+set\s[^;]*/gi);

  return malas;
}

console.log("── la comprobación entiende lo que lee ──");
{
  es("un delete pelado se marca", sinWhere("delete from cosas;"), ["delete from cosas"]);
  es("con where, no", sinWhere("delete from cosas where id = 1;"), []);
  es("un update pelado también", sinWhere("update cosas set a = 1;"), ["update cosas set a = 1"]);
  es("con where, tampoco", sinWhere("update cosas set a = 1 where id = 2;"), []);

  // Lo que NO tiene que marcar, que es donde una comprobación de texto se
  // equivoca fácil.
  es("truncate está permitido", sinWhere("truncate cosas;"), []);
  es("no confunde un create", sinWhere("create or replace function f() returns void as $$ $$;"), []);
  es("ni un select … for update", sinWhere("select * from cosas for update;"), []);
  es("ni un insert con on conflict", sinWhere("insert into c (a) values (1) on conflict (a) do update set a = 1;"), []);
  es("un delete comentado no cuenta", sinWhere("-- delete from cosas;\nselect 1;"), []);
  es("y en bloque tampoco", sinWhere("/* delete from cosas; */ select 1;"), []);
  es("partido en varias líneas se ve igual", sinWhere("delete\n  from cosas\n where id = 1;"), []);
}

/**
 * Los cuerpos de las funciones, sin lo que hay alrededor.
 *
 * Un cuerpo va entre `$$` —o `$loquesea$`— justo después de la firma. Se busca
 * a partir de `create function` a propósito: un bloque `do $$ … $$` suelto en
 * la migración tiene la misma forma pero lo corre una persona en el editor,
 * donde la extensión no está.
 */
function cuerposDeFuncion(sql) {
  const cuerpos = [];
  const patron = /create\s+(?:or\s+replace\s+)?function[\s\S]*?\$([a-zA-Z_]*)\$([\s\S]*?)\$\1\$/gi;
  for (const m of sql.matchAll(patron)) cuerpos.push(m[2]);
  return cuerpos;
}

console.log("\n── se leen los cuerpos y no la migración entera ──");
{
  const conFuncion = `
    do $$ begin update public.etapas set orden = -orden; end $$;
    create or replace function public.f() returns void language plpgsql as $$
    begin delete from tmp; end $$;
  `;
  const cuerpos = cuerposDeFuncion(conFuncion);
  es("encuentra un solo cuerpo", cuerpos.length, 1);
  es("Y ES EL DE LA FUNCIÓN", sinWhere(cuerpos[0]), ["delete from tmp"]);
  es(
    "el bloque suelto queda afuera",
    cuerpos.some((c) => /etapas/.test(c)),
    false,
  );
}

console.log("\n── y ahora, todas las migraciones ──");
{
  const archivos = readdirSync(RAIZ).filter((n) => n.endsWith(".sql")).sort();
  const problemas = [];
  let funciones = 0;

  for (const nombre of archivos) {
    for (const cuerpo of cuerposDeFuncion(readFileSync(join(RAIZ, nombre), "utf8"))) {
      funciones++;
      for (const linea of sinWhere(cuerpo)) problemas.push(`${nombre}: ${linea}`);
    }
  }

  console.log(`   (${archivos.length} archivos, ${funciones} funciones)`);
  es("se leyeron funciones de verdad", funciones > 20, true);

  if (problemas.length > 0) {
    console.log(
      "\n   Llamarlas desde el CRM va a fallar con «DELETE requires a WHERE\n" +
        "   clause». Poné una condición —`where true` alcanza— o usá `truncate`\n" +
        "   si de verdad va la tabla entera:\n",
    );
    for (const p of problemas) console.log(`     ${p}`);
  }
  es("NINGUNA BORRA NI ACTUALIZA SIN CONDICIÓN", problemas, []);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
