/**
 * Un solo lead por persona, aunque escriba tres veces en el mismo segundo.
 *
 *     node supabase/pruebas/banco/prueba-lead-unico.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ SE ESTÁ PROBANDO
 * ------------------------------------------------------------------------
 *
 * Que el CRM no vuelva a abrir dos leads para el mismo cliente cuando llegan
 * varios mensajes de WhatsApp a la vez. Eso pasaba de verdad: en la lista de
 * clientes aparecía el mismo nombre y el mismo teléfono dos veces, el mismo
 * día, con dos vendedoras distintas.
 *
 * La prueba corre las llamadas EN PARALELO de verdad, con procesos separados,
 * porque el problema sólo existe en paralelo. Una prueba secuencial pasaría
 * igual con el código roto y no serviría para nada.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ADEMÁS SE PRUEBA EL MODO VIEJO
 * ------------------------------------------------------------------------
 *
 * Antes de comprobar que el arreglo funciona hay que comprobar que la prueba
 * sabe fallar. Si el paralelismo de acá no alcanzara para abrir la ventana, el
 * bloque del arreglo pasaría por casualidad y estaríamos mirando un verde que
 * no significa nada.
 *
 * Así que primero se reproduce el defecto —preguntar y después insertar, en
 * dos pasos— y se exige que duplique. Recién si duplicó tiene sentido lo que
 * viene abajo.
 *
 * Necesita el banco armado: bash supabase/pruebas/banco/armar.sh
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, exec } from "node:child_process";

// `-q` es importante: sin él psql imprime «INSERT 0 1» además del resultado, y
// eso se cuela en el id que después se interpola en la consulta siguiente.
const PSQL = "psql -h /tmp -p 5511 -d crm -A -t -q";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `lead-unico-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return execSync(`su postgres -c "${PSQL} -f ${ruta}" 2>&1`, { encoding: "utf8" }).trim();
  } finally {
    fs.rmSync(ruta, { force: true });
  }
};

/** Corre una consulta en su propio proceso, sin esperar a las otras. */
const enParalelo = (q) =>
  new Promise((listo) => {
    const ruta = path.join(os.tmpdir(), `lead-par-${process.pid}-${Math.random()}.sql`);
    fs.writeFileSync(ruta, q, "utf8");
    fs.chmodSync(ruta, 0o644);
    exec(`su postgres -c "${PSQL} -f ${ruta}" 2>&1`, (_e, salida) => {
      fs.rmSync(ruta, { force: true });
      listo((salida ?? "").trim());
    });
  });

let fallaron = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    fallaron++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/*
 * Los números que inventa esta prueba, y nada más.
 *
 * Se buscan por los dígitos y no con `like '%7797259%'`: uno de los casos que
 * se prueba es justamente el teléfono guardado como «7797-2591», y el guión en
 * el medio hace que ese `like` no lo encuentre. La primera versión de esto
 * dejaba esa ficha viva entre corrida y corrida y la prueba siguiente fallaba
 * contra su propia basura.
 */
const MIOS = "('77972590','77972591','77972592','77972593')";
const soloLosMios = `right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 8) in ${MIOS}`;

const limpiar = `
  delete from public.oportunidades where cliente_id in
    (select id from public.clientes where ${soloLosMios});
  delete from public.contactos_canal where cliente_id in
    (select id from public.clientes where ${soloLosMios});
  delete from public.clientes where ${soloLosMios};
`;

const CANAL = sql("select id from public.canales order by id limit 1;");
const ETAPA = sql("select id from public.etapas order by orden limit 1;");
const V1 = sql("select id from public.vendedores where activo order by id limit 1;");
const V2 = sql("select id from public.vendedores where activo order by id desc limit 1;");

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. el defecto: preguntar y después insertar ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(limpiar);
  const cliente = sql(`
    insert into public.clientes (nombre, telefono)
    values ('Dup Prueba', '50377972590') returning id;
  `);

  /*
   * El modo viejo, tal cual estaba: contar, esperar, insertar. La espera es lo
   * que hace visible la ventana que en producción abría la red.
   */
  const modoViejo = (vendedor) => `
    begin;
    select count(*) from public.oportunidades where cliente_id = ${cliente};
    select pg_sleep(0.4);
    insert into public.oportunidades (cliente_id, vendedor_id, canal_id, etapa_id, fecha_registro)
    select ${cliente}, ${vendedor}, ${CANAL}, ${ETAPA}, current_date
     where not exists (select 1 from public.oportunidades where cliente_id = ${cliente});
    commit;
  `;

  await Promise.all([enParalelo(modoViejo(V1)), enParalelo(modoViejo(V2))]);

  const cuantos = sql(`select count(*) from public.oportunidades where cliente_id = ${cliente};`);
  es("el modo viejo SÍ duplica (si no, la prueba no probaría nada)", cuantos, "2");
  sql(limpiar);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. el arreglo: una sola llamada, con candado ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(limpiar);
  const cliente = sql(`
    insert into public.clientes (nombre, telefono)
    values ('Dup Prueba', '50377972590') returning id;
  `);

  // Cinco mensajes del mismo número en el mismo instante, cada uno con su
  // sorteo, como en la ráfaga real de «Hola / buenas / quiero información».
  const llamada = (vendedor) => `
    select se_creo from public.abrir_lead_de_whatsapp(
      ${cliente}, ${vendedor}, ${CANAL}, ${ETAPA}, current_date);
  `;

  const respuestas = await Promise.all([
    enParalelo(llamada(V1)),
    enParalelo(llamada(V2)),
    enParalelo(llamada(V1)),
    enParalelo(llamada(V2)),
    enParalelo(llamada(V1)),
  ]);

  const cuantos = sql(`select count(*) from public.oportunidades where cliente_id = ${cliente};`);
  es("cinco mensajes a la vez dejan UN solo lead", cuantos, "1");

  // Y sólo una de las cinco llamadas dice haberlo creado: las otras cuatro
  // encontraron el que ya estaba.
  const creadas = respuestas.filter((r) => r === "t").length;
  es("una sola llamada dice «lo creé yo»", creadas, 1);

  // Todas devuelven el mismo dueño, que es lo que necesita la bandeja para no
  // decir «sin asignar» sobre un lead que sí tiene asesor.
  const dueno = sql(`
    select count(distinct vendedor_id) from public.oportunidades where cliente_id = ${cliente};
  `);
  es("y el lead tiene un dueño solo", dueno, "1");

  sql(limpiar);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. el segundo agujero: el teléfono con guiones ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(limpiar);

  /*
   * La ficha cargada a mano, con el formato que usa la gente. El webhook la
   * busca con el número que manda Meta, que viene pegado y con código de país.
   * Antes no se encontraban y se abría una ficha nueva.
   */
  const aMano = sql(`
    insert into public.clientes (nombre, telefono)
    values ('Alex de Antes', '7797-2591') returning id;
  `);

  const encontrado = sql(
    `select public.cliente_de_whatsapp('50377972591', 'Alex Spencer');`,
  );
  es("«7797-2591» y «50377972591» son la misma persona", encontrado, aMano);

  const fichas = sql(`
    select count(*) from public.clientes
     where right(regexp_replace(coalesce(telefono,''), '\\D', '', 'g'), 8) = '77972591';
  `);
  es("no se abrió una ficha nueva al lado", fichas, "1");

  // Y el número que no está todavía sí crea ficha, una sola vez aunque se
  // pregunte cinco veces a la vez.
  const nuevas = await Promise.all(
    Array.from({ length: 5 }, () =>
      enParalelo(`select public.cliente_de_whatsapp('50377972592', 'Nadie Conocido');`),
    ),
  );
  es("un número nuevo abre UNA ficha, no cinco", new Set(nuevas).size, 1);

  const cuantas = sql(`
    select count(*) from public.clientes
     where right(regexp_replace(coalesce(telefono,''), '\\D', '', 'g'), 8) = '77972592';
  `);
  es("y en la base quedó una sola", cuantas, "1");

  sql(limpiar);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. quien ya tiene lead no recibe otro ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(limpiar);
  const cliente = sql(`
    insert into public.clientes (nombre, telefono)
    values ('Ex Alumno', '50377972593') returning id;
  `);
  // Su lead de siempre, del vendedor 1. Es el ex-alumno que vuelve a escribir.
  sql(`
    insert into public.oportunidades (cliente_id, vendedor_id, canal_id, etapa_id, fecha_registro)
    values (${cliente}, ${V1}, ${CANAL}, ${ETAPA}, current_date - 200);
  `);

  const salida = sql(`
    select se_creo || '|' || id_vendedor from public.abrir_lead_de_whatsapp(
      ${cliente}, ${V2}, ${CANAL}, ${ETAPA}, current_date);
  `);
  es("no se abre otro, y el dueño sigue siendo el de siempre", salida, `false|${V1}`);

  const cuantos = sql(`select count(*) from public.oportunidades where cliente_id = ${cliente};`);
  es("sigue habiendo un solo lead", cuantos, "1");

  sql(limpiar);
}

console.log(fallaron === 0 ? "\nTodo bien." : `\n${fallaron} fallaron.`);
process.exit(fallaron ? 1 : 0);
