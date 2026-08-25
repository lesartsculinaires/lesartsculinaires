/**
 * Renombrar un programa: ¿se mueve algo que no debería?
 *
 *     node supabase/pruebas/banco/prueba-renombrar-programa.mjs
 *
 * Cambiarle el nombre a un programa toca una fila, pero de esa fila cuelgan
 * los leads, el formulario de feria y los cortes del Dashboard. Lo que esta
 * prueba vigila es justamente lo que no tiene que pasar:
 *
 *   · que un lead cambie de programa o se quede sin él;
 *   · que se renombre un curso corto por llevar la misma palabra
 *     —«Curso corto Mixología 360» contra el diplomado de Mixología—;
 *   · que el formulario pise una opción con nombre comercial propio;
 *   · que, si una palabra encuentra dos diplomados, elija uno a la suerte.
 *
 * Ese último es el que importa de verdad: adivinar mal manda los leads de un
 * programa a otro y no se nota hasta que alguien cuadra los números.
 *
 * Necesita el banco armado (ver LEEME.md). No necesita la aplicación.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MIGRACION =
  "/home/user/lesartsculinaires/supabase/migrations/20260920120000_diplomados_superiores.sql";

// El `2>&1` no es decorativo: los `raise notice` de la migración salen por
// stderr, y son la única forma de comprobar que avisó antes de no hacer nada.
const correrArchivo = (ruta) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -f ${ruta}" 2>&1`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

/*
 * Todo pasa por un archivo en vez de por `psql -c "…"`.
 *
 * Acá hay jsonb con comillas dobles adentro, y ese texto tiene que sobrevivir
 * a las comillas de JavaScript, a las de `su -c` y a las de `psql -c`. En la
 * primera versión no sobrevivía: el shell partía el JSON por los espacios y
 * psql terminaba intentando conectarse con el usuario «de». Con archivo no hay
 * nada que escapar.
 */
const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-renombrar-${process.pid}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return correrArchivo(ruta).trim();
  } finally {
    fs.rmSync(ruta, { force: true });
  }
};

const correr = () => correrArchivo(MIGRACION);

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

// ---------------------------------------------------------------- preparar

// Se vuelve a los nombres viejos para que la prueba mida el cambio y no el
// estado en que quedó el banco de una corrida anterior.
const VIEJOS = [
  ["cocina", "Diplomado de Cocina"],
  ["pasteleria", "Diplomado de Pasteleria"],
  ["mixologia", "Diplomado de Mixología"],
  ["barismo", "Diplomado de Barismo y Extracción de Café"],
  ["management", "Diplomado Management Gastronómico"],
];
for (const [clave, viejo] of VIEJOS) {
  sql(
    `update productos set nombre='${viejo}'
      where lower(translate(nombre,'áéíóúñ','aeioun')) like 'diplomado%'
        and lower(translate(nombre,'áéíóúñ','aeioun')) like '%${clave}%';`,
  );
}

const idCocina = sql("select id from productos where nombre='Diplomado de Cocina'");
const idPast = sql("select id from productos where nombre='Diplomado de Pasteleria'");

// Un formulario con dos opciones: una que repite el nombre del catálogo y
// otra con nombre comercial propio. Sólo la primera tiene que cambiar.
sql(`
  delete from formulario_campos where etiqueta='PRUEBA renombrar';
  delete from formularios where nombre='PRUEBA renombrar';
  insert into formularios (nombre, activo) values ('PRUEBA renombrar', true);

  insert into formulario_campos (formulario_id, orden, etiqueta, tipo, opciones, mapea_a)
  select f.id, 1, 'PRUEBA renombrar', 'opciones',
         jsonb_build_array(
           -- Repite el nombre del catálogo: tiene que seguirlo.
           jsonb_build_object('texto', 'Diplomado de Cocina', 'valor', ${idCocina}),
           -- Nombre comercial propio: no se toca.
           jsonb_build_object('texto', 'Alta Pastelería', 'valor', ${idPast})),
         'producto_id'
    from formularios f where f.nombre='PRUEBA renombrar';
`);

// Foto de los leads antes de tocar nada.
const antes = sql(
  "select coalesce(producto_id,0)||'x'||count(*) from oportunidades group by producto_id order by producto_id",
);
const cursosAntes = sql(
  "select string_agg(nombre, '|' order by id) from productos where categoria <> 'Diplomado'",
);

// ------------------------------------------------------------- el renombre

console.log("── los cinco quedan con el nombre nuevo ──");
correr();

const NUEVOS = [
  "Diplomado Superior de Cocina Internacional",
  "Diplomado Superior de Pastelería Internacional",
  "Diplomado Superior de Mixología Internacional",
  "Diplomado Superior de Barismo y Extracción de Café",
  "Diplomado Superior de Management Gastronómico",
];
for (const n of NUEVOS) {
  es(`«${n}»`, sql(`select count(*) from productos where nombre='${n}'`), "1");
}

console.log("\n── y nada más se movió ──");
es(
  "cada lead sigue en su programa",
  sql("select coalesce(producto_id,0)||'x'||count(*) from oportunidades group by producto_id order by producto_id"),
  antes,
);
es("ningún lead quedó sin programa", sql("select count(*) from oportunidades where producto_id is null"), sql("select count(*) from oportunidades where producto_id is null"));
es(
  "los cursos cortos intactos",
  sql("select string_agg(nombre, '|' order by id) from productos where categoria <> 'Diplomado'"),
  cursosAntes,
);
es(
  "«Suprême Diplôme» no se tocó",
  sql("select count(*) from productos where nombre='Suprême Diplôme'"),
  "1",
);

console.log("\n── el formulario de feria ──");
const opciones = () =>
  sql(`select opciones::text from formulario_campos where etiqueta='PRUEBA renombrar'`);
es(
  "la opción que repetía el nombre del catálogo se actualizó",
  /Diplomado Superior de Cocina Internacional/.test(opciones()),
  true,
);
es(
  "LA OPCIÓN CON NOMBRE COMERCIAL PROPIO SE RESPETÓ",
  /Alta Pastelería/.test(opciones()),
  true,
);
es(
  "y sigue apuntando al mismo programa",
  sql(`select count(*) from formulario_campos
        where etiqueta='PRUEBA renombrar'
          and opciones @> jsonb_build_array(jsonb_build_object('valor', ${idCocina}));`),
  "1",
);

console.log("\n── correrlo de nuevo no cambia nada ──");
const foto = sql("select string_agg(nombre, '|' order by id) from productos");
correr();
es("los nombres quedan igual", sql("select string_agg(nombre, '|' order by id) from productos"), foto);

console.log("\n── si la palabra encuentra dos, no elige ──");
{
  // Un segundo diplomado que también dice «cocina». Ante la duda tiene que
  // dejar los dos como están, no renombrar el que le quede más a mano.
  sql(
    "insert into productos (nombre, categoria, activo) values ('Diplomado de Cocina Vegana','Diplomado',true)",
  );
  sql(
    `update productos set nombre='Diplomado de Cocina' where id=${idCocina}`,
  );
  const salida = correr();
  es("avisa que hay más de uno", /encuentra 2 programas/.test(salida), true);
  es(
    "Y NO RENOMBRA NINGUNO",
    sql("select count(*) from productos where nombre in ('Diplomado de Cocina','Diplomado de Cocina Vegana')"),
    "2",
  );
  sql("delete from productos where nombre='Diplomado de Cocina Vegana'");
}

// ---------------------------------------------------------------- limpiar

sql("delete from formulario_campos where etiqueta='PRUEBA renombrar'");
sql("delete from formularios where nombre='PRUEBA renombrar'");
correr(); // deja el banco con los nombres nuevos

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
