/**
 * El tablero mes a mes, comprobado contra la base.
 *
 *     node supabase/pruebas/banco/prueba-tablero-mensual.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Verifica que los datos del dashboard estén vinculados tanto al módulo de
 *  clientes, al pipeline, y que se vea reflejado en relación a las métricas de
 *  cada mes. La idea es que cada mes se vea reflejado un nuevo comienzo y poder
 *  comparar los datos de los meses anteriores y a futuro del año [...] que cada
 *  mes pueda ver datos reales y actualizados.»
 *
 * ============================================================================
 * QUÉ SE COMPRUEBA, Y CONTRA QUÉ
 * ============================================================================
 *
 * Contra la base, no contra lo que uno espere que diga. Cada número que
 * aparece en pantalla se calcula acá con SQL y se compara: si el tablero suma
 * distinto que la base, esta prueba lo dice.
 *
 * Es lo único que sirve para una pantalla de métricas. Una prueba que
 * comprueba «hay cuatro recuadros» pasa igual el día que los cuatro empiecen a
 * mostrar el número de otro mes.
 *
 * Necesita el banco armado con varios meses y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-tab-${process.pid}-${Math.random()}.sql`);
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

/**
 * Varios meses de leads inventados.
 *
 * La prueba se los siembra sola porque sin varios meses no prueba nada: con
 * un solo mes, «el tablero abre en el mes en curso» y «el tablero muestra todo
 * el histórico» dan el mismo número y las dos pasarían aunque el recorte no
 * existiera.
 *
 * Las formas son distintas a propósito —un mes flojo, uno bueno, uno casi
 * vacío— para que la comparación contra el mes anterior tenga algo que decir.
 */
const sembrar = () => {
  limpiar();
  sql(`
    do $$
    declare
      m int; i int; cid bigint; n int; base date;
      cuantos int[] := array[12, 20, 9, 26, 5];
      ganados int[] := array[3, 6, 1, 8, 1];
      perdidos int[] := array[4, 5, 4, 6, 0];
      gan_id bigint; per_id bigint;
    begin
      select id into gan_id from public.etapas where nombre = 'Ganado' limit 1;
      select id into per_id from public.etapas where nombre = 'Perdido' limit 1;

      for m in 1..5 loop
        -- Contados hacia atrás desde el mes en curso, para que la prueba siga
        -- valiendo el año que viene: con fechas fijas caducaría sola.
        base := date_trunc('month', now())::date - ((5 - m) || ' months')::interval;

        for i in 1..cuantos[m] loop
          insert into public.clientes (nombre, telefono)
          values ('Mes Prueba ' || m || '-' || i, '503' || lpad((m*100+i)::text, 8, '0'))
          returning id into cid;

          n := (m * 7 + i);
          insert into public.oportunidades
            (codigo, cliente_id, vendedor_id, producto_id, canal_id,
             etapa_id, estado_id, fecha_registro, fecha_cierre,
             valor_oportunidad, venta_cerrada)
          values (
            'MES-' || m || '-' || lpad(i::text,3,'0'), cid,
            (array[1,2,3,4])[1 + (n % 4)],
            (array[1,2,3,4])[1 + (n % 4)],
            (array[1,2,3,4])[1 + (n % 4)],
            case when i <= ganados[m] then gan_id
                 when i <= ganados[m] + perdidos[m] then per_id
                 else (select id from public.etapas where nombre = 'Prospectos' limit 1) end,
            case when i <= ganados[m] then 4
                 when i <= ganados[m] + perdidos[m] then 5 else 1 end,
            -- Dentro del mes, sin pasarse al siguiente ni al futuro.
            least(base + ((i * 2) % 27), current_date),
            null,
            400 + (n % 5) * 150,
            case when i <= ganados[m] then 350 + (n % 4) * 120 else null end
          );
        end loop;
      end loop;
    end $$;
  `);
};

const limpiar = () => {
  sql(`delete from public.oportunidades where codigo like 'MES-%';
       delete from public.clientes where nombre like 'Mes Prueba %';`);
};

sembrar();

/** La verdad, según la base. `mes` en formato aaaa-mm, o "TODO". */
const verdad = (mes) => {
  const donde =
    mes === "TODO" ? "" : `where to_char(o.fecha_registro,'YYYY-MM') = '${mes}'`;
  const [leads, pipeline, cerrado, tasa] = sql(`
    select count(*)
      || '|' || count(*) filter (where not coalesce(e.es_final,false))
      || '|' || coalesce(sum(o.venta_cerrada),0)::numeric(12,0)
      || '|' || coalesce(round(100.0*count(*) filter (where s.nombre='Ganado')/nullif(count(*),0)),0)
      from public.oportunidades o
      left join public.estados e on e.id = o.estado_id
      left join public.estados s on s.id = o.estado_id
      ${donde};
  `).split("|");
  return { leads: Number(leads), pipeline: Number(pipeline), cerrado: Number(cerrado), tasa: Number(tasa) };
};

// El mes en curso, que es con el que tiene que abrir el tablero.
const MES_HOY = sql("select to_char(now(),'YYYY-MM');");
const NOMBRES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const comoSeLee = (m) => `${NOMBRES[Number(m.slice(5,7)) - 1]} ${m.slice(0,4)}`;

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
  .trim();
const YO = "cccccccc-0000-0000-0000-000000000003";
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt, token_type: "bearer", expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
      user: { id: YO, email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1100 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try { localStorage.setItem("lac.reservas.visto", h); } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/mensual-${n}.png`, fullPage: true });

/** Los cuatro números de arriba, leídos de la pantalla. */
const indicadores = async () => {
  const caja = p.locator('main [data-kpi]');
  const n = await caja.count();
  const salida = {};
  for (let i = 0; i < n; i += 1) {
    salida[await caja.nth(i).getAttribute("data-kpi")] = (
      await caja.nth(i).locator("[data-valor]").innerText()
    ).trim();
  }
  return salida;
};

const dinero = (n) => "$" + n.toLocaleString("en-US");

await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
await p.waitForTimeout(3500);

console.log("── EL TABLERO ABRE EN EL MES EN CURSO ──");
{
  /*
   * Lo primero que pidió la escuela: «que cada mes se vea reflejado un nuevo
   * comienzo». Antes abría con TODO el histórico y decía lo mismo el 1 y el 30.
   */
  await foto("1-mes-en-curso");
  const elegido = await p.locator('main button[data-periodo][data-puesto="si"]').innerText();
  es("abre en el mes de hoy", elegido.trim(), comoSeLee(MES_HOY));

  const v = verdad(MES_HOY);
  const i = await indicadores();
  es("OPORTUNIDADES: las del mes", i.Oportunidades, String(v.leads));
  es("En pipeline: las del mes", i["En pipeline"], String(v.pipeline));
  es("VENTA CERRADA: la del mes", i["Venta cerrada"], dinero(v.cerrado));
  es("Tasa de cierre: la del mes", i["Tasa de cierre"], `${v.tasa}%`);

  // Y no la del histórico, que es lo que decía antes.
  const todo = verdad("TODO");
  es("y NO el histórico", i.Oportunidades !== String(todo.leads), true);
}

console.log("\n── SE PUEDE MIRAR UN MES ANTERIOR ──");
{
  const previo = sql(`select to_char(fecha_registro,'YYYY-MM') from public.oportunidades
                       where to_char(fecha_registro,'YYYY-MM') < '${MES_HOY}'
                       group by 1 order by 1 desc limit 1;`);

  await p.locator(`main button[data-periodo="${previo}"]`).click();
  await p.waitForTimeout(900);
  await foto("2-mes-anterior");

  const v = verdad(previo);
  const i = await indicadores();
  es(`${comoSeLee(previo)}: oportunidades`, i.Oportunidades, String(v.leads));
  es(`${comoSeLee(previo)}: venta cerrada`, i["Venta cerrada"], dinero(v.cerrado));
  es(`${comoSeLee(previo)}: tasa`, i["Tasa de cierre"], `${v.tasa}%`);
}

console.log("\n── Y EL HISTÓRICO SIGUE ESTANDO, A UN CLIC ──");
{
  /*
   * Hay preguntas que sólo se contestan así —de dónde vino la gente en dos
   * años, qué programa vende más siempre—. Lo que cambió es que dejó de ser lo
   * primero que se ve, no que se haya perdido.
   */
  await p.locator('main button[data-periodo="todo"]').click();
  await p.waitForTimeout(900);
  await foto("3-todo");

  const v = verdad("TODO");
  const i = await indicadores();
  es("el histórico entero", i.Oportunidades, String(v.leads));
  es("con toda la venta cerrada", i["Venta cerrada"], dinero(v.cerrado));
}

console.log("\n── LOS GRÁFICOS TAMBIÉN SIGUEN AL MES ──");
{
  /*
   * Es la mitad del pedido y la que más cuesta ver: sin esto, los cuatro
   * números de arriba dirían «septiembre» y los seis gráficos de abajo
   * seguirían mostrando el histórico, en la misma pantalla y sin avisar.
   *
   * Se comprueba sobre «Etapas», donde cada lead cae en una sola columna: la
   * suma de sus barras tiene que dar los leads del mes.
   */
  await p.locator(`main button[data-periodo="${MES_HOY}"]`).click();
  await p.waitForTimeout(900);

  const etapas = p.locator('main section:has(h3:text-is("Etapas"))');
  const texto = await etapas.innerText();
  const suma = [...texto.matchAll(/(\d+)\s+leads?/g)].reduce((a, m) => a + Number(m[1]), 0);

  es("LAS BARRAS SUMAN LOS LEADS DEL MES", suma, verdad(MES_HOY).leads);
}

console.log("\n── EVOLUCIÓN SIGUE VIENDO TODOS LOS MESES ──");
{
  /*
   * A propósito, y es la excepción: es la pantalla que COMPARA meses.
   * Recortarla al mes elegido la dejaría con una sola barra y sin nada que
   * comparar, que es justo lo contrario de para lo que está.
   */
  const evo = p.locator('main section:has(h3:text-is("Evolución"))');
  const meses = sql(`select count(distinct to_char(fecha_registro,'YYYY-MM'))
                       from public.oportunidades;`);
  await evo.getByRole("button", { name: "Comparativa" }).click();
  await p.waitForTimeout(700);
  await foto("4-evolucion");

  const barras = await evo.locator("[data-mes]").count();
  es("están todos los meses, no sólo el elegido", barras >= Number(meses), true);
}

console.log("\n── PIPELINE: LA COLUMNA GANADO DICE LO COBRADO ──");
{
  /*
   * Antes sumaba el valor de LISTA de lo ganado, así que daba una cifra más
   * alta que la venta cerrada del Dashboard por los mismos leads —la
   * diferencia era todo lo descontado al cerrar— y nada en pantalla lo
   * explicaba.
   */
  await p.locator('aside button[data-mod="Pipeline"]').click();
  await p.waitForTimeout(2500);
  await foto("5-pipeline");

  const cobrado = Number(sql(`
    select coalesce(sum(o.venta_cerrada),0)::numeric(12,0)
      from public.oportunidades o
      join public.etapas e on e.id = o.etapa_id
     where e.nombre = 'Ganado';`));
  const lista = Number(sql(`
    select coalesce(sum(o.valor_oportunidad),0)::numeric(12,0)
      from public.oportunidades o
      join public.etapas e on e.id = o.etapa_id
     where e.nombre = 'Ganado';`));

  const col = p.locator('main [data-etapa="Ganado"]');
  const dice = (await col.innerText()).replace(/\s+/g, " ");

  es("MUESTRA LO COBRADO", dice.includes(dinero(cobrado)), true);
  es("y NO el valor de lista", dice.includes(dinero(lista)), false);
}

console.log("\n── PIPELINE: SE PUEDE VER EL EMBUDO DE UN MES ──");
{
  /*
   * Como filtro y no como modo por omisión: el Pipeline es trabajo pendiente.
   * Un lead de mayo que sigue en Negociación hay que trabajarlo hoy, y un
   * tablero que arrancara en el mes en curso lo escondería.
   */
  const filtro = p.locator('main button:has-text("Mes")').first();
  es("hay un filtro de mes", await filtro.count(), 1);
  es("y arranca en «Todos»", (await filtro.innerText()).includes("Todos"), true);

  const totalSinFiltro = Number(sql("select count(*) from public.oportunidades;"));
  const enElMes = verdad(MES_HOY).leads;

  await filtro.click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: comoSeLee(MES_HOY), exact: true }).last().click();
  await p.waitForTimeout(1200);
  await foto("6-pipeline-mes");

  const puestas = await p.locator('main [data-etapa] [data-ficha]').count();
  es("SIN FILTRO ESTABAN TODAS", totalSinFiltro > enElMes, true);
  es("y con el mes puesto quedan las del mes", puestas, enElMes);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();

limpiar();
es(
  "no quedó basura",
  sql("select count(*) from public.oportunidades where codigo like 'MES-%';"),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
