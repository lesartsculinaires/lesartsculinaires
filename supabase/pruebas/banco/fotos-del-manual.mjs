/**
 * Las fotos del «Manual CRM», sacadas del banco de pruebas (12/11/2026).
 *
 *     node supabase/pruebas/banco/fotos-del-manual.mjs
 *
 * Lee los capítulos de `src/lib/manual/contenido.ts`, abre cada pantalla como
 * administradora, hace los `pasos` de cada foto, la guarda en
 * `public/manual/<archivo>.jpg` y anota dónde quedó cada parte numerada en
 * `src/lib/manual/puntos.json` (en % de la foto). Si una parte no se encuentra,
 * lo dice y esa parte queda sin número sobre la foto.
 *
 * Para que las fotos no muestren «Prueba Iconos» ni «Vivo Otra 991», antes de
 * empezar se les ponen nombres de ejemplo a los clientes, chats y asesoras del
 * banco, y se agendan unos eventos para el calendario. Al terminar se deja todo
 * como estaba.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = path.resolve(new URL("../../..", import.meta.url).pathname);
const BANCO = path.join(RAIZ, "supabase/pruebas/banco");
const FOTOS = path.join(RAIZ, "public/manual");
const PUNTOS = path.join(RAIZ, "src/lib/manual/puntos.json");
const ANCHO = 1440;
const ALTO = 900;

const sql = (q) =>
  execFileSync("su", ["postgres", "-c", "psql -h /tmp -p 5511 -d crm -A -t -q -v ON_ERROR_STOP=1 -f -"], {
    input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();

// ── El contenido, compilado de TypeScript ───────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "manual-"));
execFileSync("npx", ["esbuild", path.join(RAIZ, "src/lib/manual/contenido.ts"), "--format=esm", `--outfile=${tmp}/contenido.mjs`, "--log-level=error"], { cwd: RAIZ });
const { CAPITULOS } = await import(`${tmp}/contenido.mjs`);

// ── Nombres de ejemplo ──────────────────────────────────────────────────────
const NOMBRES = [
  "Daniela Hernández", "Carlos Martínez", "Gabriela Rivas", "José Alberto Flores", "Valeria Castillo",
  "Andrés Méndez", "Sofía Aguilar", "Fernando Romero", "Lucía Mejía", "Ricardo Navarro",
  "Camila Ortiz", "Diego Portillo", "Mariana Guevara", "Kevin Rodríguez", "Paola Escobar",
  "Javier Molina", "Natalia Cruz", "Mauricio Peña", "Andrea Valle", "Roberto Campos",
  "Isabella Ramos", "Óscar Herrera", "Fernanda Quintanilla", "Luis Alvarado", "Rebeca Solís",
];
const ASESORAS = ["Andrea López", "María José Díaz", "Karen Martínez", "Paola Reyes", "Silvia Cárcamo", "Brenda Pineda", "Gloria Menjívar", "Tatiana Bonilla"];
const lista = (xs) => `array[${xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]`;

function ponerNombresDeEjemplo() {
  // Todo o nada: si algo falla a mitad de camino, el banco queda como estaba.
  sql(`
    begin;
    create table if not exists public._manual_respaldo (tabla text, id text, valor text);
    delete from public._manual_respaldo;
    insert into public._manual_respaldo select 'clientes', id::text, nombre from public.clientes;
    insert into public._manual_respaldo select 'conversaciones', id::text, nombre_perfil from public.conversaciones;
    insert into public._manual_respaldo select 'vendedores', id::text, nombre from public.vendedores;
    insert into public._manual_respaldo select 'usuarios', id::text, nombre from public.usuarios;

    with n as (select id, row_number() over (order by id) - 1 as i from public.clientes)
    update public.clientes c set nombre = (${lista(NOMBRES)})[(n.i % ${NOMBRES.length}) + 1]
      from n where n.id = c.id;
    update public.conversaciones v set nombre_perfil = c.nombre
      from public.clientes c where c.id = v.cliente_id;
    with n as (select id, row_number() over (order by id desc) - 1 as i from public.conversaciones where cliente_id is null)
    update public.conversaciones v set nombre_perfil = (${lista([...NOMBRES].reverse())})[(n.i % ${NOMBRES.length}) + 1]
      from n where n.id = v.id;
    with n as (select id, row_number() over (order by usuario_id is null, id) - 1 as i from public.vendedores)
    update public.vendedores v set nombre = (${lista(ASESORAS)})[(n.i % ${ASESORAS.length}) + 1]
                                          || case when n.i >= ${ASESORAS.length} then ' ' || (n.i / ${ASESORAS.length} + 1) else '' end
      from n where n.id = v.id;
    update public.usuarios u set nombre = v.nombre from public.vendedores v where v.usuario_id = u.id;
    update public.usuarios u set nombre = 'Dirección' where u.nombre = 'Jefa';
    commit;
  `);

  // Unos eventos de esta semana para que el calendario no salga vacío.
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  const dia = (n) => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const ev = [
    [0, "09:00", 0, 30], [0, "11:00", 2, 120], [0, "15:30", 4, 20],
    [1, "10:00", 1, 60], [1, "14:00", 0, 30], [-1, "09:30", 3, 15],
    [2, "16:00", 5, 15], [-2, "13:00", 0, 30], [3, "10:30", 1, 60],
  ];
  sql(`
    insert into public.eventos (oportunidad_id, tipo_id, vendedor_id, inicia_en, duracion_min, canal, estado, resultado)
    select o.id, x.tipo, o.vendedor_id, (x.dia || 'T' || x.hora || ':00-06:00')::timestamptz, x.dur, 'Llamada',
           case when x.dia < '${hoy}' then 'Realizado' else 'Pendiente' end, 'foto-del-manual'
      from (values ${ev.map(([d, h, t, m], i) => `(${i}, '${dia(d)}', '${h}', ${t}, ${m})`).join(",")})
           as x(k, dia, hora, tipo, dur)
      join lateral (select id, vendedor_id from public.oportunidades where vendedor_id is not null order by id offset (x.k % 5) limit 1) o on true;
  `);
}

function dejarComoEstaba() {
  sql(`
    begin;
    delete from public.eventos where resultado = 'foto-del-manual';
    update public.clientes t set nombre = r.valor from public._manual_respaldo r where r.tabla = 'clientes' and r.id = t.id::text;
    update public.conversaciones t set nombre_perfil = r.valor from public._manual_respaldo r where r.tabla = 'conversaciones' and r.id = t.id::text;
    update public.vendedores t set nombre = r.valor from public._manual_respaldo r where r.tabla = 'vendedores' and r.id = t.id::text;
    update public.usuarios t set nombre = r.valor from public._manual_respaldo r where r.tabla = 'usuarios' and r.id = t.id::text;
    drop table public._manual_respaldo;
    commit;
  `);
}

// ── Las fotos ───────────────────────────────────────────────────────────────
fs.mkdirSync(FOTOS, { recursive: true });
const jwt = fs.readFileSync(path.join(BANCO, "jwt-jefa.txt"), "utf8").trim();
const sub = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub;
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: sub, email: "direccion@escuela.test" },
})).toString("base64");

ponerNombresDeEjemplo();
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
const puntos = {};
let faltan = 0;
try {
  for (const capitulo of CAPITULOS) {
    for (const foto of capitulo.fotos) {
      const ctx = await nav.newContext({ viewport: { width: ANCHO, height: ALTO } });
      await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
      await ctx.addInitScript(() => {
        const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
        try {
          localStorage.setItem("lac.reservas.visto", hoy);
          localStorage.setItem("crm.reglas.visto", hoy);
          localStorage.setItem("crm.calendario.vista", "semana");
        } catch {}
      });
      const p = await ctx.newPage();
      await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
      await p.waitForTimeout(2000);
      await p.locator(`aside button[data-mod="${foto.modulo}"]`).click();
      await p.waitForTimeout(2200);
      for (const paso of foto.pasos ?? []) {
        if ("clic" in paso) await p.locator(paso.clic).first().click({ timeout: 8000 });
        else if ("esperar" in paso) await p.waitForTimeout(paso.esperar);
        else if ("tecla" in paso) await p.keyboard.press(paso.tecla);
        else if ("verHasta" in paso) {
          await p.locator(paso.verHasta).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
        }
      }
      await p.waitForTimeout(600);

      const cajas = {};
      for (const parte of foto.partes) {
        if (!parte.selector) continue;
        let caja = null;
        try {
          const loc = p.locator(parte.selector).first();
          if (await loc.count()) caja = await loc.boundingBox();
        } catch {
          caja = null;
        }
        const dentro = caja && caja.width > 0 && caja.y + caja.height > 0 && caja.y < ALTO && caja.x < ANCHO;
        if (!dentro) {
          faltan++;
          console.log(`  ✗ ${foto.archivo} #${parte.n} «${parte.titulo}»: no se ve (${parte.selector})`);
          continue;
        }
        const pct = (v, total) => Math.round((v / total) * 1000) / 10;
        const x = Math.max(0, caja.x);
        const y = Math.max(0, caja.y);
        cajas[String(parte.n)] = {
          x: pct(x, ANCHO),
          y: pct(y, ALTO),
          w: pct(Math.min(caja.width, ANCHO - x), ANCHO),
          h: pct(Math.min(caja.height, ALTO - y), ALTO),
        };
      }
      puntos[foto.archivo] = cajas;
      await p.screenshot({ path: path.join(FOTOS, `${foto.archivo}.jpg`), type: "jpeg", quality: 72 });
      console.log(`✓ ${foto.archivo}.jpg — ${Object.keys(cajas).length}/${foto.partes.filter((x) => x.selector).length} partes`);
      await ctx.close();
    }
  }
} finally {
  await nav.close();
  dejarComoEstaba();
  fs.rmSync(tmp, { recursive: true, force: true });
}

fs.writeFileSync(PUNTOS, JSON.stringify(puntos, null, 2) + "\n");
console.log(faltan ? `\n${faltan} partes sin ubicar.` : "\nTodas las partes ubicadas.");
