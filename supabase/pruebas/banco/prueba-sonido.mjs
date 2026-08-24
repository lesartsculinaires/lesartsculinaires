/**
 * ¿Se puede elegir el sonido del aviso y su volumen?
 *
 *     node supabase/pruebas/banco/prueba-sonido.mjs
 *
 * Lo que no se puede probar acá es cómo suena —eso lo juzga un oído—, así que
 * se comprueba lo que sí es verificable: que el interruptor siga siendo un
 * clic, que las opciones estén, que lo elegido se recuerde entre recargas, y
 * que al elegir se genere sonido de verdad. Lo último se mira interceptando el
 * audio del navegador: si nadie crea un oscilador, no salió nada por el
 * parlante por más que el botón se pinte de azul.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";

let f=0; const es=(t,r,e)=>{const ok=JSON.stringify(r)===JSON.stringify(e);
  if(!ok){f++;console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`)}else console.log(`✓ ${t}`)};

const jwt = fs.readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt","utf8").trim();
const g = "base64-"+Buffer.from(JSON.stringify({access_token:jwt,token_type:"bearer",expires_in:86400,
  expires_at:Math.floor(Date.now()/1000)+86400,refresh_token:"x",
  user:{id:"cccccccc-0000-0000-0000-000000000003",email:"jefa@lac.test"}})).toString("base64");

const nav = await chromium.launch({
  executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  // Sin esto el navegador no deja sonar nada y el contexto de audio nunca
  // arranca, así que no habría osciladores que contar.
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const ctx = await nav.newContext({viewport:{width:1500,height:1000}});
await ctx.addCookies([{name:"sb-127-auth-token",value:g,domain:"127.0.0.1",path:"/"}]);
await ctx.addInitScript((h)=>{try{localStorage.setItem("lac.reservas.visto",h)}catch{}}, new Date().toISOString().slice(0,10));

// Se cuentan los osciladores que se crean: es la prueba de que salió sonido.
await ctx.addInitScript(() => {
  window.__notas = [];
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () {
    const osc = orig.call(this);
    // La forma de onda y la frecuencia se leen DESPUÉS, no acá: quien crea el
    // oscilador se las asigna en las líneas siguientes, así que mirarlas en
    // este instante devuelve siempre lo de fábrica.
    const i = window.__notas.push({ tipo: null, hz: 0 }) - 1;
    setTimeout(() => {
      try {
        window.__notas[i].tipo = osc.type;
        window.__notas[i].hz = Math.round(osc.frequency.value);
      } catch {}
    }, 0);
    return osc;
  };
});

const p = await ctx.newPage();
const errores=[]; p.on("pageerror",e=>errores.push(e.message));
await p.goto("http://127.0.0.1:3142/?mod=x",{waitUntil:"networkidle"});
await p.waitForTimeout(2500);
await p.mouse.click(700, 500); // gesto, para despertar el audio
await p.waitForTimeout(600);

const flecha = p.locator('button[aria-label="Elegir el sonido de los avisos"]');
const panel = p.locator('div[role="dialog"][aria-label="Sonido de los avisos"]');
const bocina = p.locator('button[aria-label*="el sonido de los avisos"]').first();
const notas = () => p.evaluate(() => window.__notas.length);

console.log("── el interruptor sigue siendo un clic ──");
{
  es("la bocina está", await bocina.count(), 1);
  es("y la flechita al lado también", await flecha.count(), 1);
  es("el panel arranca cerrado", await panel.count(), 0);
}

console.log("\n── el panel ofrece los sonidos y los volúmenes ──");
{
  await flecha.click();
  await p.waitForTimeout(600);
  es("se abre", await panel.count(), 1);
  const t = (await panel.innerText()).replace(/\s+/g," ").trim();
  console.log(`   (${t.slice(0, 120)}…)`);
  for (const n of ["Campanita","Digital","Marimba","Campana","Alerta"]) {
    es(`está «${n}»`, t.includes(n), true);
  }
  es("y los tres volúmenes", /Bajo/.test(t) && /Medio/.test(t) && /Alto/.test(t), true);
}

console.log("\n── elegir uno suena de verdad ──");
{
  const antes = await notas();
  await panel.locator('button[aria-pressed]:has-text("Alerta")').click();
  await p.waitForTimeout(900);
  const despues = await notas();
  console.log(`   (${despues - antes} notas)`);
  es("SALIERON NOTAS AL ELEGIRLO", despues > antes, true);
  const ondas = await p.evaluate(() => window.__notas.slice(-3).map((n) => n.tipo));
  console.log(`   (ondas: ${ondas.join(" · ")})`);
  es("y con la onda de Alerta, que es la que se oye con ruido",
     ondas.every((o) => o === "square"), true);
}

console.log("\n── el volumen también se puede subir ──");
{
  const antes = await notas();
  await panel.locator('button[aria-pressed]:has-text("Alto")').click();
  await p.waitForTimeout(900);
  es("suena al tocarlo", (await notas()) > antes, true);
  es("queda marcado",
     await panel.locator('button[aria-pressed="true"]:has-text("Alto")').count(), 1);
}

console.log("\n── y se recuerda al recargar ──");
{
  const guardado = await p.evaluate(() => [
    localStorage.getItem("lac.sonido.timbre"),
    localStorage.getItem("lac.sonido.volumen"),
  ]);
  es("queda guardado en el navegador", guardado, ["alerta", "alto"]);

  await p.reload({waitUntil:"networkidle"});
  await p.waitForTimeout(2500);
  await flecha.click();
  await p.waitForTimeout(600);
  es("ALERTA SIGUE ELEGIDO",
     await panel.locator('button[aria-pressed="true"]:has-text("Alerta")').count(), 1);
  es("y Alto también",
     await panel.locator('button[aria-pressed="true"]:has-text("Alto")').count(), 1);
  await p.screenshot({path: (process.env.SP ?? "/tmp") + "/sonido.png"});
}

console.log("\n── apagar sigue siendo un solo clic ──");
{
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  es("el panel se cerró con Escape", await panel.count(), 0);
  await bocina.click();
  await p.waitForTimeout(600);
  es("y la bocina lo apagó", await bocina.getAttribute("aria-pressed"), "false");
}

es("sin errores en la página", errores, []);
await nav.close();
console.log(f===0?"\nTodo bien.":`\n${f} fallaron.`);
process.exit(f?1:0);
