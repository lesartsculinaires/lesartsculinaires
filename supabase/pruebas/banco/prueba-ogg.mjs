/**
 * El re-empaquetado de la nota de voz: ¿el archivo que sale suena?
 *
 *     node supabase/pruebas/banco/prueba-ogg.mjs
 *
 * ============================================================================
 * POR QUÉ ESTA PRUEBA NECESITA UN NAVEGADOR
 * ============================================================================
 *
 * Porque lo único que importa de un archivo de audio es que se pueda
 * reproducir, y eso no se comprueba mirando bytes. Un Ogg mal armado —una suma
 * de control equivocada, un paquete cortado— pesa lo mismo, se abre igual y
 * simplemente no suena. Del otro lado el cliente ve una nota de voz que no
 * arranca, y nadie se entera de nada.
 *
 * Así que la prueba hace las dos puntas de verdad:
 *
 *   1. GRABA con Chromium y un micrófono de mentira, que es exactamente lo que
 *      va a hacer la asesora. Sale un WebM con Opus adentro.
 *
 *   2. RE-EMPAQUETA con el código de la aplicación.
 *
 *   3. LO HACE DECODIFICAR por el propio Chromium, con `decodeAudioData`. Ahí
 *      está el valor: Chrome no sabe GRABAR Ogg Opus pero sí sabe LEERLO, así
 *      que si su decodificador lo abre, lo abre cualquiera. Y además se
 *      comprueba que el sonido esté —no sólo que el archivo se lea—, porque un
 *      remuxeo que perdiera los paquetes daría un archivo válido y mudo.
 *
 * No necesita el banco ni la aplicación levantada: sólo Chromium.
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

// El código de la aplicación, empaquetado para poder importarlo desde acá.
const MODULO = `${os.tmpdir()}/ogg-${process.pid}.mjs`;
execSync(
  `npx esbuild src/lib/audio/ogg.ts --bundle --format=esm --platform=node ` +
    `--alias:@=./src --outfile=${MODULO}`,
  { cwd: "/home/user/lesartsculinaires", stdio: "pipe" },
);
const { webmAOgg, paquetesDeWebm, duracionDelPaquete, segundosDe } = await import(MODULO);

/*
 * Un servidor mínimo sobre 127.0.0.1.
 *
 * `getUserMedia` sólo existe en un contexto seguro, y «about:blank» no lo es.
 * Localhost sí cuenta como seguro, así que alcanza con esto.
 */
const servidor = http.createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<!doctype html><title>prueba</title>");
});
await new Promise((r) => servidor.listen(3198, "127.0.0.1", r));

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const ctx = await nav.newContext({ permissions: ["microphone"] });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3198/");

const SEGUNDOS = 2;

console.log("── se graba como graba el navegador ──");
let webm;
{
  const grabado = await p.evaluate(async (ms) => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(s, { mimeType: "audio/webm;codecs=opus" });
    const trozos = [];
    rec.ondataavailable = (e) => trozos.push(e.data);
    rec.start();
    await new Promise((r) => setTimeout(r, ms));
    await new Promise((r) => {
      rec.onstop = r;
      rec.stop();
    });
    s.getTracks().forEach((t) => t.stop());
    const buf = new Uint8Array(await new Blob(trozos, { type: rec.mimeType }).arrayBuffer());
    return { tipo: rec.mimeType, datos: [...buf] };
  }, SEGUNDOS * 1000);

  webm = new Uint8Array(grabado.datos);
  console.log(`   (${grabado.tipo}, ${webm.length} bytes)`);
  es("Chrome graba WebM y no Ogg", grabado.tipo.startsWith("audio/webm"), true);
  es("y trae algo adentro", webm.length > 1000, true);
}

console.log("\n── se abre el WebM ──");
let ogg;
{
  const adentro = paquetesDeWebm(webm);
  console.log(`   (${adentro.paquetes.length} paquetes, cabecera de ${adentro.cabecera.length} bytes)`);

  // «OpusHead» son los ocho primeros bytes de la cabecera. Si esto falla, lo
  // que se grabó no era Opus y no hay nada que re-empaquetar.
  es(
    "LA CABECERA ES DE OPUS",
    new TextDecoder().decode(adentro.cabecera.subarray(0, 8)),
    "OpusHead",
  );
  es("hay paquetes de sobra", adentro.paquetes.length > 20, true);

  const duracion = segundosDe(adentro.paquetes);
  console.log(`   (los paquetes suman ${duracion.toFixed(2)} s)`);
  es(
    "y suman lo que se grabó",
    Math.abs(duracion - SEGUNDOS) < 0.5,
    true,
  );

  ogg = webmAOgg(webm);
  console.log(`   (el Ogg pesa ${ogg.length} bytes)`);
}

console.log("\n── el Ogg está bien armado ──");
{
  es("empieza con OggS", new TextDecoder().decode(ogg.subarray(0, 4)), "OggS");
  es("la primera página es la de apertura", ogg[5], 0x02);
  es(
    "y trae la cabecera de Opus",
    new TextDecoder().decode(ogg.subarray(28, 36)),
    "OpusHead",
  );

  // Se recorren todas las páginas comprobando su suma de control. Es lo que
  // hace el reproductor antes de decidir si el archivo sirve.
  const paginas = [];
  let i = 0;
  let malas = 0;
  while (i < ogg.length) {
    if (String.fromCharCode(...ogg.subarray(i, i + 4)) !== "OggS") break;
    const tramos = ogg[i + 26];
    let cuerpo = 0;
    for (let k = 0; k < tramos; k++) cuerpo += ogg[i + 27 + k];
    const largo = 27 + tramos + cuerpo;

    const copia = ogg.slice(i, i + largo);
    const guardada = new DataView(copia.buffer).getUint32(22, true);
    new DataView(copia.buffer).setUint32(22, 0, true);
    if (crcOgg(copia) !== guardada) malas++;

    paginas.push({ bandera: ogg[i + 5], posicion: leerPosicion(ogg, i + 6) });
    i += largo;
  }

  console.log(`   (${paginas.length} páginas)`);
  es("se leyeron todas hasta el final", i, ogg.length);
  es("NINGUNA SUMA DE CONTROL MAL", malas, 0);
  es("la última cierra el archivo", paginas[paginas.length - 1].bandera, 0x04);
  es("las dos de cabecera van en cero", [paginas[0].posicion, paginas[1].posicion], [0, 0]);

  const posiciones = paginas.slice(2).map((x) => x.posicion);
  es(
    "y las de audio siempre crecen",
    posiciones.every((x, k) => k === 0 || x > posiciones[k - 1]),
    true,
  );
}

console.log("\n── y CHROMIUM LO SABE REPRODUCIR ──");
{
  /*
   * La prueba de fuego. Chrome no puede grabar Ogg Opus pero sí decodificarlo,
   * así que su decodificador es un juez independiente del código que armó el
   * archivo: si abre esto, lo abre el teléfono del cliente.
   */
  const r = await p.evaluate(async (datos) => {
    const bytes = new Uint8Array(datos);
    try {
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(bytes.buffer);
      const muestras = audio.getChannelData(0);

      // Que no sea un archivo válido pero mudo, que es lo que daría un
      // re-empaquetado que perdiera los paquetes por el camino.
      let pico = 0;
      for (let i = 0; i < muestras.length; i++) {
        const v = Math.abs(muestras[i]);
        if (v > pico) pico = v;
      }
      return { ok: true, duracion: audio.duration, canales: audio.numberOfChannels, pico };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, [...ogg]);

  if (!r.ok) console.log(`   (${r.error})`);
  es("EL DECODIFICADOR LO ABRE", r.ok, true);

  if (r.ok) {
    console.log(`   (${r.duracion.toFixed(2)} s, ${r.canales} canal(es), pico ${r.pico.toFixed(3)})`);
    es("dura lo que se grabó", Math.abs(r.duracion - SEGUNDOS) < 0.5, true);
    es("Y TIENE SONIDO, NO SILENCIO", r.pico > 0.01, true);
  }
}

console.log("\n── la duración de un paquete, byte a byte ──");
{
  // A 48 kHz: 20 ms son 960 muestras. Es lo que usa Chrome y lo que decide que
  // la barra de avance del reproductor diga la verdad.
  es("un paquete de 20 ms", duracionDelPaquete(new Uint8Array([0x08, 0])), 960);
  es("uno de 10 ms", duracionDelPaquete(new Uint8Array([0x00, 0])), 480);
  es("uno de 60 ms", duracionDelPaquete(new Uint8Array([0x18, 0])), 2880);
  // Los CELT de banda completa, que es lo que graba Chrome de verdad.
  es("CELT de 20 ms", duracionDelPaquete(new Uint8Array([0xf8, 0])), 960);
  es("dos cuadros pegados", duracionDelPaquete(new Uint8Array([0xf9, 0])), 1920);
  es("uno vacío no revienta", duracionDelPaquete(new Uint8Array([])), 0);
}

console.log("\n── lo que no es audio da un error que se entiende ──");
{
  const cae = (bytes) => {
    try {
      webmAOgg(bytes);
      return "no falló";
    } catch (e) {
      return e.message;
    }
  };
  es(
    "un archivo vacío",
    cae(new Uint8Array(0)),
    "El audio grabado no trae la cabecera de Opus.",
  );
  es(
    "y uno que no es WebM",
    cae(new TextEncoder().encode("esto no es audio, es un texto cualquiera")),
    "El audio grabado no trae la cabecera de Opus.",
  );
}

await nav.close();
servidor.close();
fs.rmSync(MODULO, { force: true });

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);

// --------------------------------------------------------------------------

/** El CRC de Ogg, escrito aparte para que la prueba no dependa del código. */
function crcOgg(b) {
  let r = 0;
  for (const x of b) {
    r = (r ^ (x << 24)) >>> 0;
    for (let k = 0; k < 8; k++) {
      r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    }
  }
  return r >>> 0;
}

/** Los ocho bytes de la posición, en dos mitades. */
function leerPosicion(b, i) {
  const v = new DataView(b.buffer, b.byteOffset + i, 8);
  return v.getUint32(0, true) + v.getUint32(4, true) * 2 ** 32;
}
