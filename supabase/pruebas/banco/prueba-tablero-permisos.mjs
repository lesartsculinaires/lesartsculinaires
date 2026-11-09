/**
 * ¿Quién ve y quién llena el Tablero Comercial? (9/11/2026)
 *
 *     node supabase/pruebas/banco/prueba-tablero-permisos.mjs
 *
 * Lo que se prueba es la base, no la pantalla: esconder un botón acomoda la
 * vista, lo que protege son las políticas. Por eso cada paso se pide con la
 * sesión de cada persona, directo contra las tablas.
 *
 *   1. Dirección llena y ve todo.
 *   2. Recién instalado, Ventas no ve nada: el Tablero trae metas y montos, y
 *      queda cerrado hasta que se decidan los roles.
 *   3. Con «Llenar lo de Ventas», Huri llena lo de Ventas y NO lo de Marketing
 *      ni las metas.
 *   4. Con «Llenar la actividad propia», Ale escribe su actividad y no la de
 *      Huri.
 *
 * Necesita el banco armado (`armar.sh`). No necesita la aplicación.
 */
import { execFileSync } from "node:child_process";

const JEFA = "cccccccc-0000-0000-0000-000000000003";
const HURI = "44444444-0000-0000-0000-000000000004";
const ALE = "11111111-0000-0000-0000-000000000001";

/** Corre SQL como superusuario y devuelve la primera línea con algo. */
const sql = (q) =>
  execFileSync("su", ["postgres", "-c", "psql -h /tmp -p 5511 -d crm -A -t -q -v ON_ERROR_STOP=1 -f -"], {
    input: q,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  })
    .split("\n")
    .find((l) => l.trim() !== "")
    ?.trim() ?? "";

/**
 * Corre SQL con la sesión de alguien. Devuelve «ok» o «rechazado».
 *
 * `set role` y no `set local role`: psql corre cada sentencia en su propia
 * transacción, y con `local` la orden terminaría corriendo como superusuario
 * (ver prueba-autorizaciones.mjs, que lo aprendió así).
 */
const como = (uid, q) => {
  try {
    sql(`set role authenticated;
         set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
         ${q}
         reset role;`);
    return "ok";
  } catch {
    return "rechazado";
  }
};

/** Lo que ve alguien: el resultado de una consulta con su sesión. */
const ve = (uid, q) =>
  sql(`set role authenticated;
       set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
       ${q};`);

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const SEMANA = "2026-11-02";
const rolDe = (uid) => sql(`select rol_id from public.usuarios where id = '${uid}'`);
const fichaDe = (uid) => sql(`select id from public.vendedores where usuario_id = '${uid}'`);
const ROL_HURI = rolDe(HURI);
const ROL_ALE = rolDe(ALE);

const limpiar = () => {
  sql(`delete from public.tablero_semanal where semana = '${SEMANA}';
       delete from public.tablero_metas where clave like 'prueba_%';
       delete from public.tablero_actividad where semana = '${SEMANA}';`);
};
/** Deja las casillas del Tablero de un rol como las instala la migración: todo en no. */
const cerrar = (rol) =>
  sql(`update public.rol_permisos set ver = false, crear = false, editar = false, eliminar = false
        where rol_id = ${rol} and modulo like 'tablero%';`);
const abrir = (rol, modulo, accion) =>
  sql(`insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
       values (${rol}, '${modulo}', ${accion === "ver"}, false, ${accion === "editar"}, false)
       on conflict (rol_id, modulo) do update set ${accion} = true;`);

limpiar();
cerrar(ROL_HURI);
cerrar(ROL_ALE);

try {
  console.log("── 1. Dirección llena y ve todo ──");
  es("llena lo de Marketing", como(JEFA, `insert into public.tablero_semanal (semana, campo, valor) values ('${SEMANA}', 'mk.pauta_meta', 120);`), "ok");
  es("llena lo de Ventas", como(JEFA, `insert into public.tablero_semanal (semana, campo, valor) values ('${SEMANA}', 'ventas.cotizaciones_corp', 2);`), "ok");
  es("define una meta", como(JEFA, `insert into public.tablero_metas (mes, clave, valor) values ('2026-11-01', 'prueba_venta', 38200);`), "ok");
  es("y ve lo que llenó", ve(JEFA, `select count(*) from public.tablero_semanal where semana = '${SEMANA}'`), "2");

  console.log("\n── 2. recién instalado, Ventas no ve nada ──");
  es("Huri no ve los datos de la semana", ve(HURI, `select count(*) from public.tablero_semanal where semana = '${SEMANA}'`), "0");
  es("ni las metas", ve(HURI, `select count(*) from public.tablero_metas where clave like 'prueba_%'`), "0");
  es("ni puede llenar lo de Ventas", como(HURI, `insert into public.tablero_semanal (semana, campo, valor) values ('${SEMANA}', 'ventas.contratos_corp', 1);`), "rechazado");

  console.log("\n── 3. con «Llenar lo de Ventas» ──");
  abrir(ROL_HURI, "tablero", "ver");
  abrir(ROL_HURI, "tablero.ventas", "editar");
  es("ahora ve el Tablero", ve(HURI, `select count(*) from public.tablero_semanal where semana = '${SEMANA}'`), "2");
  es("llena lo de Ventas", como(HURI, `insert into public.tablero_semanal (semana, campo, valor) values ('${SEMANA}', 'ventas.contratos_corp', 1);`), "ok");
  es("NO llena lo de Marketing", como(HURI, `insert into public.tablero_semanal (semana, campo, valor) values ('${SEMANA}', 'mk.alcance', 999);`), "rechazado");
  es("NO cambia lo que puso Marketing", como(HURI, `update public.tablero_semanal set valor = 0 where semana = '${SEMANA}' and campo = 'mk.pauta_meta';`), "ok");
  es("…y de verdad no lo cambió", sql(`select valor from public.tablero_semanal where semana = '${SEMANA}' and campo = 'mk.pauta_meta'`), "120");
  es("NO define metas", como(HURI, `insert into public.tablero_metas (mes, clave, valor) values ('2026-12-01', 'prueba_venta', 1);`), "rechazado");

  console.log("\n── 4. la actividad propia ──");
  // En el banco Ale y Huri tienen el mismo rol: lo de Ventas que se le abrió a
  // Huri en el paso 3 lo tiene Ale también. Se cierra antes de probar «sólo lo
  // propio», o la prueba miraría el permiso equivocado.
  cerrar(ROL_ALE);
  abrir(ROL_ALE, "tablero", "ver");
  abrir(ROL_ALE, "tablero.actividad", "editar");
  const fichaAle = fichaDe(ALE);
  const fichaHuri = fichaDe(HURI);
  es("Ale escribe su actividad", como(ALE, `insert into public.tablero_actividad (semana, vendedor_id, campo, valor) values ('${SEMANA}', ${fichaAle}, 'salidas_campo', 2);`), "ok");
  es("y NO la de Huri", como(ALE, `insert into public.tablero_actividad (semana, vendedor_id, campo, valor) values ('${SEMANA}', ${fichaHuri}, 'salidas_campo', 9);`), "rechazado");
  abrir(ROL_HURI, "tablero.ventas", "editar");
  es("la Gerente (con Ventas) sí escribe la de cualquiera", como(HURI, `insert into public.tablero_actividad (semana, vendedor_id, campo, valor) values ('${SEMANA}', ${fichaAle}, 'eventos', 1);`), "ok");
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  limpiar();
  cerrar(ROL_HURI);
  cerrar(ROL_ALE);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
