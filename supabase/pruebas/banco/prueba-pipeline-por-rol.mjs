/**
 * ¿Qué pipeline ve y toca cada rol?
 *
 *     node supabase/pruebas/banco/prueba-pipeline-por-rol.mjs
 *
 * Es la regla que separa el trabajo de una asesora del de la escuela entera, y
 * la que más caro sale equivocar en las dos direcciones: de menos, alguien no
 * ve sus propios leads y cree que se perdieron; de más, ve —o peor, mueve— los
 * de otro.
 *
 * Se prueba contra la base y no contra la pantalla a propósito. Esconder una
 * fila en la interfaz no es lo mismo que negarla: lo que decide de verdad es
 * la política de `oportunidades`, y lo que hay que comprobar es que un usuario
 * de Ventas no obtenga el lead ajeno ni sabiendo su id.
 *
 * Los cinco casos, uno por rol:
 *
 *   Administrador, Gerente de ventas, Jefe de ventas   todo, y lo pueden mover.
 *   Ventas, Asesores                                   sólo lo suyo.
 *
 * Necesita el banco armado. No necesita la aplicación.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-pipeline-${process.pid}.sql`);
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
 * Gente de prueba, creada acá y borrada al final.
 *
 * No se reutilizan las cuentas del banco ni se les cambia el rol: una prueba
 * que muta los roles reales deja el banco distinto si se corta, y la de al
 * lado se encuentra a una asesora sin sus pantallas. Ya pasó.
 */
const limpiar = `
  delete from public.oportunidades where codigo in ('PIPE-A','PIPE-B','PIPE-NADIE');
  delete from public.clientes where nombre like 'PIPE %';
  delete from public.usuarios where correo like '%@pipe.test';
  delete from auth.users where email like '%@pipe.test';
  delete from public.vendedores where nombre like 'PIPE %';
`;

// Ojo: acá NO se borra el rol «Asesores». Es un rol de verdad, lo crea su
// migración, y la primera versión de esta prueba lo borraba «porque no lo usa
// nadie» —justo antes de comprobar que existiera—. Una limpieza sólo puede
// llevarse lo que ella misma creó.

/** Crea una cuenta con ese rol y su ficha de vendedor. Devuelve los ids. */
const persona = (etiqueta, rol) => {
  // El id se pide con un `select` aparte y no con `returning`: psql imprime
  // después la línea «INSERT 0 1», y quedarse con la última línea devolvía eso
  // en vez del uuid. Todo lo que venía después usaba «INSERT 0 1» como id.
  sql(`insert into auth.users (id, email)
       values (gen_random_uuid(), '${etiqueta}@pipe.test');`);
  const uid = sql(`select id from auth.users where email = '${etiqueta}@pipe.test';`);
  sql(`
    insert into public.usuarios (id, nombre, correo, rol_id, activo)
    values ('${uid}', 'PIPE ${etiqueta}', '${etiqueta}@pipe.test',
            (select id from public.roles where nombre = '${rol}'), true);
    insert into public.vendedores (nombre, usuario_id, activo)
    values ('PIPE ${etiqueta}', '${uid}', true);
  `);
  const vend = sql(`select id from public.vendedores where usuario_id = '${uid}';`);
  return { uid, vend };
};

sql(limpiar);

// El rol Asesores tiene que existir; lo crea su migración.
if (sql("select count(*) from public.roles where nombre='Asesores';") !== "1") {
  console.error("Falta el rol «Asesores». Corré 20260928120000_pipeline_por_rol.sql.");
  process.exit(1);
}

const ana = persona("ana", "Ventas");
const beto = persona("beto", "Ventas");
const ceci = persona("ceci", "Asesores");
const dire = persona("dire", "Administrador");
const gere = persona("gere", "Gerente de ventas");

sql(`
  insert into public.clientes (nombre, telefono) values ('PIPE cliente A','70988001');
  insert into public.clientes (nombre, telefono) values ('PIPE cliente B','70988002');
  insert into public.clientes (nombre, telefono) values ('PIPE cliente C','70988003');

  insert into public.oportunidades (codigo, cliente_id, vendedor_id, fecha_registro, valor_oportunidad)
  select 'PIPE-A', id, ${ana.vend}, current_date, 100 from public.clientes where nombre='PIPE cliente A';
  insert into public.oportunidades (codigo, cliente_id, vendedor_id, fecha_registro, valor_oportunidad)
  select 'PIPE-B', id, ${beto.vend}, current_date, 200 from public.clientes where nombre='PIPE cliente B';
  insert into public.oportunidades (codigo, cliente_id, vendedor_id, fecha_registro, valor_oportunidad)
  select 'PIPE-NADIE', id, null, current_date, 300 from public.clientes where nombre='PIPE cliente C';
`);

/*
 * Qué códigos de los tres ve esa persona.
 *
 * Sin `reset role` al final: cada llamada abre su propio psql, así que el rol
 * se va con la sesión. Estaba de más y encima estorbaba —la salida terminaba
 * en «RESET» y eso era lo que se leía como resultado de la consulta—.
 */
const ve = (uid) =>
  sql(`
    set role authenticated;
    set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
    select coalesce(string_agg(codigo, ',' order by codigo), '(ninguno)')
      from public.oportunidades where codigo like 'PIPE-%';
  `).split("\n").filter(Boolean).pop();

/** ¿Pudo cambiarle el monto a ese lead? */
const puedeMover = (uid, codigo) => {
  const antes = sql(`select valor_oportunidad::int from public.oportunidades where codigo='${codigo}';`);
  sql(`
    set role authenticated;
    set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
    update public.oportunidades set valor_oportunidad = 999 where codigo='${codigo}';
  `);
  const despues = sql(`select valor_oportunidad::int from public.oportunidades where codigo='${codigo}';`);
  sql(`update public.oportunidades set valor_oportunidad = ${antes} where codigo='${codigo}';`);
  return despues === "999";
};

console.log("── Ventas: Ana ──");
es("VE EL SUYO Y NO EL DE BETO", ve(ana.uid), "PIPE-A,PIPE-NADIE");
es("puede mover el suyo", puedeMover(ana.uid, "PIPE-A"), true);
es("NO PUEDE MOVER EL DE BETO", puedeMover(ana.uid, "PIPE-B"), false);

console.log("\n── Asesores: Ceci ──");
es("NO VE NI EL DE ANA NI EL DE BETO", ve(ceci.uid), "PIPE-NADIE");
es("y no puede mover el de Ana", puedeMover(ceci.uid, "PIPE-A"), false);
es("ni el de Beto", puedeMover(ceci.uid, "PIPE-B"), false);

console.log("\n── Gerente de ventas ──");
es("VE TODO", ve(gere.uid), "PIPE-A,PIPE-B,PIPE-NADIE");
es("y puede mover el de Ana", puedeMover(gere.uid, "PIPE-A"), true);

console.log("\n── Administrador ──");
es("VE TODO", ve(dire.uid), "PIPE-A,PIPE-B,PIPE-NADIE");
es("y puede mover el de Beto", puedeMover(dire.uid, "PIPE-B"), true);

console.log("\n── los sin asignar los ve todo el equipo ──");
{
  // Es la tercera condición de la política y está puesta a propósito: un lead
  // que no ve nadie no lo atiende nadie. Se prueba para que quede escrito que
  // es una decisión y no un descuido.
  es("Ana lo ve", ve(ana.uid).includes("PIPE-NADIE"), true);
  es("Ceci también", ve(ceci.uid).includes("PIPE-NADIE"), true);
  es("y lo puede tomar", puedeMover(ana.uid, "PIPE-NADIE"), true);
}

sql(limpiar);
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
