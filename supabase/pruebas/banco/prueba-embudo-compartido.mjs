/**
 * El embudo armado una vez y compartido, ¿es el mismo, está al día y no se
 * le da a quien no corresponde?
 *
 *     node supabase/pruebas/banco/prueba-embudo-compartido.mjs
 *
 * ============================================================================
 * EL CASO REAL
 * ============================================================================
 *
 * El 12 de octubre de 2026 el CRM se cayó tres veces en la mañana con poca gente
 * conectada. Las tres empezaron con cinco o seis cargas completas de la portada
 * en los mismos veinte segundos: cada una armaba de cero el embudo entero —2592
 * leads, 2,3 MB, trece consultas—, y la base del tamaño Micro pasó de 0,07 s a
 * 17 s por consulta.
 *
 * Ahora la base lo arma una vez, lo guarda con una huella de los datos, y lo
 * devuelve en una sola consulta mientras la huella no cambie.
 *
 * ============================================================================
 * LO QUE SE EXIGE
 * ============================================================================
 *
 *   ES EL MISMO        Idéntico, fila por fila y columna por columna, a lo que
 *                      la aplicación arma consulta por consulta.
 *   ESTÁ AL DÍA        Cualquier cambio de lo que el embudo muestra se ve en la
 *                      carga siguiente: etapa, cliente, programas, etiquetas,
 *                      notas, actividad, nombres del catálogo, altas y bajas.
 *   SE COMPARTE        Seis cargas juntas lo arman UNA vez.
 *   NO SE FILTRA       A quien no ve todo no se le da; nadie lee lo guardado
 *                      directo; sin sesión, nada.
 *   LA PORTADA LO USA  Una carga de la portada ya no pide el embudo tanda por
 *                      tanda.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const API = "http://127.0.0.1:3141/rest/v1";
const APP = "http://127.0.0.1:3142";
const ANON = fs.readFileSync(`${BANCO}/anon.txt`, "utf8").trim();
const JWT = {
  jefa: fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim(),
  ale: fs.readFileSync(`${BANCO}/jwt-ale.txt`, "utf8").trim(),
};

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" })
    .split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r).slice(0, 300)}, esperaba ${JSON.stringify(e).slice(0, 300)}`);
  } else console.log(`✓ ${t}`);
};

const cabeceras = (quien) => ({
  apikey: ANON,
  "content-type": "application/json",
  ...(quien ? { authorization: `Bearer ${JWT[quien]}` } : {}),
});

/** Lo que devuelve la función nueva. */
async function compartido(quien = "jefa") {
  const r = await fetch(`${API}/rpc/embudo_compartido`, { method: "POST", headers: cabeceras(quien), body: "{}" });
  const cuerpo = await r.text();
  return { estado: r.status, datos: r.ok ? JSON.parse(cuerpo) : null, crudo: cuerpo };
}

/** Lo que arma la aplicación consulta por consulta, como antes. */
async function todo(ruta, quien = "jefa") {
  const filas = [];
  for (let desde = 0; ; desde += 900) {
    const r = await fetch(`${API}/${ruta}&limit=900&offset=${desde}`, { headers: cabeceras(quien) });
    const tanda = await r.json();
    filas.push(...tanda);
    if (tanda.length < 900) return filas;
  }
}
async function comoAntes(quien = "jefa") {
  const [embudo, programas, etiquetas, toques] = await Promise.all([
    todo("vw_pipeline?select=*&order=fecha_registro.desc,id.desc", quien),
    todo("oportunidad_programas?select=oportunidad_id,producto_id&order=oportunidad_id,producto_id", quien),
    todo("oportunidad_etiquetas?select=oportunidad_id,etiqueta_id&order=oportunidad_id,etiqueta_id", quien),
    todo("vw_ultimo_toque?select=oportunidad_id,ultimo_toque&order=oportunidad_id", quien),
  ]);
  return { embudo, programas, etiquetas, toques };
}

/** Compara lista por lista y dice dónde difiere, en vez de un «no es igual» sin pistas. */
async function igualAComoAntes(titulo) {
  const [a, b] = await Promise.all([compartido(), comoAntes()]);
  const listas = ["embudo", "programas", "etiquetas", "toques"];
  const distintas = listas.filter((l) => JSON.stringify(a.datos?.[l]) !== JSON.stringify(b[l]));
  es(titulo, distintas, []);
  return a.datos;
}
const armados = () => Number(sql("select coalesce(max(armados), 0) from embudo_guardado"));
const fila = (d, id) => d.embudo.find((o) => o.id === Number(id));

// Un lead propio de la prueba, para no tocar los de nadie.
const TEL = "50379" + String(Date.now()).slice(-6);
const cliente = sql(`insert into clientes (nombre, telefono) values ('Embudo Prueba', '${TEL}') returning id`);
const lead = sql(`insert into oportunidades (codigo, cliente_id, etapa_id, estado_id) values ('EMB-${TEL}', ${cliente}, 1, 1) returning id`);
const etiqueta = sql(`insert into etiquetas (nombre) values ('Embudo ${TEL}') returning id`);
const producto = sql("select id from productos order by id limit 1");
const vendedor = sql("select id from vendedores order by id limit 1");
const nombreVendedor = sql(`select nombre from vendedores where id = ${vendedor}`);
const horarioProducto = sql(`select coalesce(horario, '') from productos where id = ${producto}`);

try {
  // ══════════════════════════════════════════════════════════════════════════
  console.log("── 1. ES EL MISMO EMBUDO ──");
  // ══════════════════════════════════════════════════════════════════════════
  const d0 = await igualAComoAntes("idéntico a lo que se armaba consulta por consulta");
  console.log(`   (${d0.embudo.length} leads, ${d0.programas.length} programas, ${d0.toques.length} toques)`);
  es("trae el lead de la prueba", Boolean(fila(d0, lead)), true);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. ESTÁ AL DÍA: CADA CAMBIO SE VE EN LA CARGA SIGUIENTE ──");
  // ══════════════════════════════════════════════════════════════════════════
  const cambios = [
    ["la etapa del lead", `update oportunidades set etapa_id = 2 where id = ${lead}`,
      (d) => fila(d, lead)?.etapa_id === 2],
    ["el nombre del cliente", `update clientes set nombre = 'Embudo Renombrado' where id = ${cliente}`,
      (d) => fila(d, lead)?.cliente === "Embudo Renombrado"],
    ["un programa de interés", `insert into oportunidad_programas (oportunidad_id, producto_id) values (${lead}, ${producto})`,
      (d) => d.programas.some((p) => p.oportunidad_id === Number(lead))],
    ["una etiqueta", `insert into oportunidad_etiquetas (oportunidad_id, etiqueta_id) values (${lead}, ${etiqueta})`,
      (d) => d.etiquetas.some((e) => e.oportunidad_id === Number(lead))],
    ["una nota (último toque)", `insert into oportunidad_notas (oportunidad_id, nota, created_at) values (${lead}, 'nota de prueba', now() + interval '1 day')`,
      (d) => new Date(d.toques.find((t) => t.oportunidad_id === Number(lead))?.ultimo_toque) > new Date(Date.now() + 3600e3)],
    ["una actividad (último toque)", `insert into actividad (entidad, accion, entidad_id, oportunidad_id, creado_en) values ('oportunidad', 'edito', ${lead}, ${lead}, now() + interval '2 days')`,
      (d) => new Date(d.toques.find((t) => t.oportunidad_id === Number(lead))?.ultimo_toque) > new Date(Date.now() + 36 * 3600e3)],
    ["el nombre de un vendedor", `update oportunidades set vendedor_id = ${vendedor} where id = ${lead}; update vendedores set nombre = nombre || ' (prueba)' where id = ${vendedor}`,
      (d) => fila(d, lead)?.vendedor === `${nombreVendedor} (prueba)`],
    ["el horario de un programa", `update oportunidades set producto_id = ${producto} where id = ${lead}; update productos set horario = 'Sábados de prueba' where id = ${producto}`,
      (d) => fila(d, lead)?.horario_programa === "Sábados de prueba"],
  ];
  for (const [que, cambio, seVe] of cambios) {
    await compartido(); // que quede guardado lo de antes del cambio
    sql(cambio);
    const d = await compartido();
    es(`SE VE ${que.toUpperCase()}`, seVe(d.datos), true);
  }
  await igualAComoAntes("y después de todos los cambios sigue idéntico");

  const otro = sql(`insert into oportunidades (codigo, cliente_id) values ('EMB2-${TEL}', ${cliente}) returning id`);
  es("UN LEAD NUEVO APARECE", Boolean(fila((await compartido()).datos, otro)), true);
  sql(`delete from actividad where oportunidad_id = ${otro}`);
  sql(`delete from oportunidades where id = ${otro}`);
  es("Y AL BORRARLO DESAPARECE", Boolean(fila((await compartido()).datos, otro)), false);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. SE COMPARTE: SEIS CARGAS JUNTAS LO ARMAN UNA VEZ ──");
  // ══════════════════════════════════════════════════════════════════════════
  sql(`update oportunidades set etapa_id = 3 where id = ${lead}`);
  const antes = armados();
  const juntas = await Promise.all(Array.from({ length: 6 }, () => compartido()));
  es("las seis contestaron", juntas.every((r) => r.estado === 200 && r.datos), true);
  es("LO ARMÓ UNA SOLA VEZ", armados() - antes, 1);
  es("y las seis ven el cambio", juntas.every((r) => fila(r.datos, lead)?.etapa_id === 3), true);
  const sinCambios = armados();
  await Promise.all(Array.from({ length: 6 }, () => compartido()));
  es("sin cambios, seis cargas más no arman nada", armados() - sinCambios, 0);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 4. NO SE LE DA A QUIEN NO CORRESPONDE ──");
  // ══════════════════════════════════════════════════════════════════════════
  const ale = await compartido("ale");
  es("a quien no ve todo: nada (arma el suyo con su RLS)", [ale.estado, ale.datos], [200, null]);
  const anon = await compartido(null);
  es("sin sesión: no puede ni llamarla", anon.estado >= 400, true);
  const directo = await fetch(`${API}/embudo_guardado?select=huella`, { headers: cabeceras("jefa") });
  es("NADIE LEE LO GUARDADO DIRECTO", directo.status >= 400, true);
  const escribir = await fetch(`${API}/embudo_guardado`, {
    method: "POST", headers: cabeceras("jefa"), body: JSON.stringify({ alcance: "todo", huella: "x", datos: {} }),
  });
  es("NI LO ESCRIBE (no se puede envenenar el embudo de todos)", escribir.status >= 400, true);
  for (const fn of ["armar_embudo", "huella_del_embudo"]) {
    const r = await fetch(`${API}/rpc/${fn}`, { method: "POST", headers: cabeceras("jefa"), body: "{}" });
    es(`${fn} no se puede llamar desde afuera`, r.status >= 400, true);
  }

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 5. LA PORTADA LO USA ──");
  // ══════════════════════════════════════════════════════════════════════════
  const galleta = (quien, id, correo) =>
    "base64-" + Buffer.from(JSON.stringify({
      access_token: JWT[quien], token_type: "bearer", expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
      user: { id, email: correo },
    })).toString("base64");
  const contarPedidos = async (quien, id, correo) => {
    const log = `${BANCO}/pxv.log`;
    const antesLineas = fs.readFileSync(log, "utf8").split("\n").length;
    const r = await fetch(`${APP}/`, {
      headers: {
        cookie: `sb-127-auth-token=${galleta(quien, id, correo)}; lac.mod=Dashboard`,
        rsc: "1", "sec-fetch-dest": "empty",
      },
    });
    await r.text();
    await new Promise((s) => setTimeout(s, 300));
    const nuevas = fs.readFileSync(log, "utf8").split("\n").slice(antesLineas - 1);
    return {
      pipeline: nuevas.filter((l) => l.includes("/vw_pipeline")).length,
      compartido: nuevas.filter((l) => l.includes("/rpc/embudo_compartido")).length,
    };
  };
  const jefa = await contarPedidos("jefa", "cccccccc-0000-0000-0000-000000000003", "jefa@lac.test");
  es("la portada de quien ve todo pide el embudo compartido", jefa.compartido, 1);
  es("Y NO PIDE EL EMBUDO TANDA POR TANDA", jefa.pipeline, 0);
  const deAle = await contarPedidos("ale", "11111111-0000-0000-0000-000000000001", "ale@lac.test");
  es("la de quien no ve todo lo arma como siempre", deAle.pipeline > 0, true);
} finally {
  sql(`update vendedores set nombre = replace(nombre, ' (prueba)', '') where id = ${vendedor}`);
  sql(`update productos set horario = nullif('${horarioProducto}', '') where id = ${producto}`);
  sql(`delete from oportunidad_notas where oportunidad_id = ${lead}`);
  sql(`delete from oportunidad_etiquetas where oportunidad_id = ${lead}`);
  sql(`delete from oportunidad_programas where oportunidad_id = ${lead}`);
  sql(`delete from actividad where oportunidad_id = ${lead} or entidad_id = ${lead}`);
  sql(`delete from oportunidades where cliente_id = ${cliente}`);
  sql(`delete from clientes where id = ${cliente}`);
  sql(`delete from etiquetas where id = ${etiqueta}`);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
