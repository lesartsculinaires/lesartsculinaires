/**
 * ¿La carpeta «saliente/» está bien cercada?
 *
 *     node supabase/pruebas/banco/prueba-saliente.mjs
 *
 * Para poder mandar documentos de 50 MB hubo que dejar que el navegador
 * escriba en el bucket del chat, cosa que antes no podía nadie. Esa es la
 * concesión, y todo lo que la hace segura está en una política de tres
 * condiciones. Si esa política se afloja, lo que se pierde es serio: debajo de
 * «wa/» viven las capturas de transferencia y las fotos de documentos que
 * mandaron los clientes, y eso es prueba de lo que pasó.
 *
 * Lo que se comprueba, con la sesión de una asesora de verdad:
 *
 *   1. que pueda subir bajo «saliente/» —si no, no se puede mandar nada—;
 *   2. QUE NO PUEDA ESCRIBIR EN «wa/», ni creando ni pisando;
 *   3. que no pueda dejar un archivo a nombre de otra persona;
 *   4. que no le sirva un nombre parecido, tipo «salientefalso/»;
 *   5. que pueda borrar lo suyo —hace falta para limpiar cuando falla el
 *      envío— y no lo de la carpeta del cliente.
 *
 * Necesita el banco armado (ver LEEME.md). No necesita la aplicación.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const ALE = "cccccccc-0000-0000-0000-000000000001";
const OTRA = "cccccccc-0000-0000-0000-000000000002";

const sqlCrudo = (q) => {
  const ruta = `/tmp/prueba-saliente-${process.pid}.sql`;
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
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
 * Se prueba contra Postgres, no contra la API de Storage.
 *
 * El banco no corre el servicio de Storage de Supabase —es el Postgres con su
 * esquema— y no hace falta, porque lo que decide si una subida entra o rebota
 * no es el servicio sino la política sobre `storage.objects`. Ponerse el rol
 * `authenticated` con el `sub` de una persona en los claims es exactamente lo
 * que hace Supabase antes de tocar la tabla, así que lo que pase acá es lo que
 * va a pasar en producción.
 *
 * `set local` dentro de una transacción que después se cierra: nada de esto
 * queda pegado para la consulta siguiente.
 */
const comoAsesora = (quien, sentencia) =>
  sqlCrudo(`
    begin;
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${quien}","role":"authenticated"}';
    ${sentencia}
    commit;
  `);

/** «entra» si la política la dejó pasar, «rebota» si no. */
function intentarSubir(name, owner = ALE, quien = ALE) {
  const salida = comoAsesora(
    quien,
    `insert into storage.objects (bucket_id, name, owner)
     values ('whatsapp', '${name}', '${owner}');`,
  );
  if (/violates row-level security/.test(salida)) return "rebota";
  if (/INSERT 0 1/.test(salida)) return "entra";
  return `raro: ${salida.replace(/\s+/g, " ").slice(0, 90)}`;
}

/** Cuántas filas se llevó el borrado. */
function intentarBorrar(name) {
  const salida = comoAsesora(ALE, `delete from storage.objects where name='${name}';`);
  const m = /DELETE (\d+)/.exec(salida);
  return m ? Number(m[1]) : -1;
}

// Un archivo del cliente, puesto como lo pone el webhook: con la llave de
// servicio, que se saltea las políticas.
sqlCrudo(`
  delete from storage.objects where bucket_id='whatsapp';
  insert into storage.objects (bucket_id, name, owner)
  values ('whatsapp', 'wa/1/comprobante-del-cliente.jpg', null);
`);

console.log("── lo que sí tiene que poder ──");
es("subir bajo «saliente/»", intentarSubir("saliente/1/documento.pdf"), "entra");

console.log("\n── lo que NO ──");
es("NO puede crear en «wa/»", intentarSubir("wa/1/inventado.jpg"), "rebota");
es(
  "NO PUEDE PISAR EL COMPROBANTE DEL CLIENTE",
  intentarSubir("wa/1/comprobante-del-cliente.jpg"),
  "rebota",
);
es("no puede subir en la raíz", intentarSubir("suelto.pdf"), "rebota");
es(
  "no le sirve un nombre parecido",
  intentarSubir("salientefalso/1/x.pdf"),
  "rebota",
);
es(
  "no puede dejarlo a nombre de otra",
  intentarSubir("saliente/1/de-otra.pdf", OTRA),
  "rebota",
);

console.log("\n── borrar ──");
es("puede borrar lo suyo", intentarBorrar("saliente/1/documento.pdf"), 1);
es(
  "NO PUEDE BORRAR EL COMPROBANTE DEL CLIENTE",
  intentarBorrar("wa/1/comprobante-del-cliente.jpg"),
  0,
);
es(
  "y el comprobante sigue ahí",
  sqlCrudo(
    "select count(*) from storage.objects where name='wa/1/comprobante-del-cliente.jpg';",
  ),
  "1",
);

console.log("\n── el tope del bucket ──");
es(
  "son 50 MB",
  sqlCrudo("select file_size_limit from storage.buckets where id='whatsapp';"),
  String(50 * 1024 * 1024),
);
es(
  "y PowerPoint está permitido",
  sqlCrudo(
    "select 'application/vnd.openxmlformats-officedocument.presentationml.presentation' = " +
      "any(allowed_mime_types) from storage.buckets where id='whatsapp';",
  ),
  "t",
);

sqlCrudo("delete from storage.objects where bucket_id='whatsapp';");
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
