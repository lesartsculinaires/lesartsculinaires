/**
 * Con más de mil leads, ¿el tablero los muestra todos?
 *
 *     node supabase/pruebas/banco/prueba-mil-leads.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ SE ESTÁ PROBANDO
 * ------------------------------------------------------------------------
 *
 * El defecto que reportó la escuela: «a veces el Gerente y el Jefe de ventas
 * no ven el pipeline de Ventas».
 *
 * No era un permiso. Era que PostgREST corta las respuestas en mil filas —sin
 * error y sin aviso— y la aplicación tomaba esas mil por todas. Con 1053 leads
 * en la base, a quien ve todo el equipo le faltaban 53; a una asesora, que
 * tiene 537 y entra holgada, no le faltaba ninguno. De ahí el «a veces».
 *
 * La prueba siembra más de mil leads y mira el número que la aplicación
 * imprime arriba: es el que sale de lo que efectivamente llegó.
 *
 * ------------------------------------------------------------------------
 * OJO CON EL BANCO
 * ------------------------------------------------------------------------
 *
 * Esto sólo tiene sentido si el PostgREST del banco tiene `db-max-rows = 1000`
 * como el de Supabase. Sin eso no hay techo y la prueba pasa siempre, incluso
 * con el defecto puesto. Se comprueba antes de empezar y, si falta, se corta:
 * un verde que no significa nada es peor que un rojo.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-mil-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(
      `su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`,
      { encoding: "utf8" },
    ).trim();

    /*
     * Un ERROR de psql corta la prueba acá mismo.
     *
     * psql devuelve cero aunque una sentencia falle, así que sin esto el error
     * se iba a la salida y nadie lo miraba: la primera versión de esta prueba
     * sembró los mil doscientos clientes, falló al crearles la oportunidad
     * —`date - bigint` no existe— y siguió como si nada, comparando siete
     * leads contra siete. Verde, y sin haber probado nada.
     */
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

// ------------------------------------------------ que el banco tenga el techo
{
  const conf = fs.readFileSync(
    "/home/user/lesartsculinaires/supabase/pruebas/banco/v.conf",
    "utf8",
  );
  if (!/db-max-rows\s*=\s*1000/.test(conf)) {
    console.error(
      "El PostgREST del banco no tiene el techo de mil filas, así que esta prueba\n" +
        "no probaría nada. Volvé a correr armar.sh.",
    );
    process.exit(1);
  }
}

const CUANTOS = 1200;
const limpiar = () => {
  sql(`
    delete from public.oportunidades where codigo like 'MIL-%';
    delete from public.clientes where nombre like 'Mil Prueba %';
  `);
};
limpiar();

const HABIA = Number(sql("select count(*) from public.oportunidades;"));
console.log(`   (ya había ${HABIA} leads; se agregan ${CUANTOS})`);

// Se siembra de una sola vez: mil doscientas filas de a una serían mil
// doscientos viajes y la prueba tardaría minutos.
sql(`
  insert into public.clientes (nombre, telefono)
  select 'Mil Prueba ' || n, '7900' || lpad(n::text, 4, '0')
    from generate_series(1, ${CUANTOS}) as n;

  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'MIL-' || lpad(row_number() over (order by c.id)::text, 5, '0'),
         c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         current_date - ((c.id % 400)::int)
    from public.clientes c
   where c.nombre like 'Mil Prueba %';
`);

const TOTAL = Number(sql("select count(*) from public.oportunidades;"));
es("quedaron sembrados", TOTAL, HABIA + CUANTOS);
es("y son más de mil, que es donde empieza el problema", TOTAL > 1000, true);

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const JEFA = subDe("jwt-jefa.txt");

const abrir = async () => {
  const jwt = fs
    .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
    .trim();
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
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript((h) => {
    try {
      localStorage.setItem("lac.reservas.visto", h);
    } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(4000);
  return { nav, p };
};

console.log("\n── quien ve todo el equipo, los ve todos ──");
{
  const { nav, p } = await abrir();

  // El encabezado dice «N oportunidades», y ese N sale de lo que llegó.
  const cabecera = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  const m = /(\d+) oportunidades/.exec(cabecera);
  const enPantalla = m ? Number(m[1]) : -1;

  console.log(`   (la pantalla dice ${enPantalla}; en la base hay ${TOTAL})`);
  es("LLEGARON TODAS, NO LAS PRIMERAS MIL", enPantalla, TOTAL);

  await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/mil-leads.png" });
  await nav.close();
}

limpiar();
es(
  "no quedaron leads de prueba",
  sql("select count(*) from public.oportunidades where codigo like 'MIL-%';"),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
