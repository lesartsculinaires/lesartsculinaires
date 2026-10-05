/**
 * Un Supabase frío no puede tirar el CRM.
 *
 *     node supabase/pruebas/banco/prueba-supabase-frio.mjs
 *
 * ============================================================================
 * ESTO PASÓ, Y DOS VECES
 * ============================================================================
 *
 * El proyecto de Supabase se enfría cuando pasa un rato sin uso. Medido contra
 * el de la escuela el 5 de octubre de 2026: dos intentos que ni conectaron, y
 * después 11,3 s en `/auth/v1/settings` y 15,9 s en `/rest`. En caliente, 230
 * ms. O sea que no es «va lento»: es un pozo de diez o quince segundos la
 * primera vez que alguien entra después de un rato.
 *
 * La escuela lo vio como dos pantallas distintas, ninguna de las cuales nombra
 * a Supabase:
 *
 *     This edge function has crashed — the edge function timed out
 *     Inactivity Timeout — Too much time has passed without sending any data
 *
 * Son dos caminos distintos —el middleware y el render de la página— y los dos
 * se colgaban por lo mismo.
 *
 * ============================================================================
 * EL ERROR QUE ESTA PRUEBA EXISTE PARA QUE NO VUELVA
 * ============================================================================
 *
 * Ya se había puesto un plazo. No alcanzó, y entender por qué es lo único que
 * importa de todo esto:
 *
 *     `AbortSignal.timeout()` acota UN intento, no la operación.
 *
 * Cuando el token toca renovarse, `auth.getUser()` llama por dentro a
 * `_refreshAccessToken`, que reintenta con espera creciente mientras quepa en su
 * propio presupuesto de TREINTA segundos —y un fetch abortado le parece un error
 * de red, o sea de los que vale la pena reintentar—. El plazo por intento no lo
 * frenaba: lo alimentaba. Con Supabase a 12 s, la portada tardaba 36 segundos en
 * contestar una redirección.
 *
 * Por eso lo que se mide acá es EL TOTAL, contra el tope con que Netlify mata la
 * función. Una prueba que mirara «¿tiene plazo?» habría salido verde con el
 * código roto.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación compilada.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";

/**
 * El tope con el que Netlify mata una función síncrona.
 *
 * No es un número elegido por nosotros: es el que convierte «tardó» en «el
 * visitante ve una pantalla de error de Netlify». Por eso se mide contra esto y
 * no contra lo que nos parezca aceptable.
 */
const TOPE_DE_NETLIFY_S = 10;

/** Cuánto se enfría Supabase en la simulación. Lo medido fue 11,3 y 15,9 s. */
const FRIO_MS = 12000;

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const sh = (c) => execSync(c, { encoding: "utf8", shell: "/bin/bash" }).trim();

/** Enfriar o calentar el Supabase del banco. */
const temperatura = (ms) =>
  sh(`curl -s --noproxy '*' -X POST 'http://127.0.0.1:3141/__lento?ms=${ms}'`);

/**
 * Las dos galletas, que son dos casos DISTINTOS.
 *
 *   VIVA      El token todavía vale. `getUser()` pregunta una vez.
 *   VENCIDA   El token caducó, así que la librería intenta RENOVARLO, y es ahí
 *             donde aparecen los reintentos de treinta segundos.
 *
 * Sin la vencida, la prueba pasaría con el error puesto: el caso malo es
 * justamente el de alguien que venía trabajando y se le venció el token, que es
 * lo más común a media mañana.
 */
const galleta = (segundos) => {
  const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-jefa.txt`, "utf8").trim();
  return (
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + segundos,
        refresh_token: "x",
        user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
      }),
    ).toString("base64")
  );
};

const VIVA = galleta(86400);
const VENCIDA = galleta(-3600);

/**
 * Pide la portada y devuelve cuánto tardó y con qué contestó.
 *
 * `--max-time` va bastante por encima del tope de Netlify a propósito: si la
 * petición se corta por el reloj de curl no se sabría cuánto habría tardado, y
 * la diferencia entre «18 segundos» y «para siempre» importa para el
 * diagnóstico.
 */
const pedirPortada = (cookie) => {
  const salida = sh(
    `curl -s -o /dev/null -w '%{http_code} %{time_total}' --max-time 70 ` +
      `-H 'cookie: sb-127-auth-token=${cookie}' http://127.0.0.1:3142/ || echo '000 99'`,
  );
  const [code, t] = salida.split(" ");
  return { code, segundos: Number(t) };
};

// ── la aplicación, recompilada aparte ──────────────────────────────────────

const parar = (puerto) => {
  try {
    execSync(`fuser -k ${puerto}/tcp 2>/dev/null || true`, { shell: "/bin/bash" });
  } catch {
    // No estaba levantado.
  }
  for (let i = 0; i < 20; i++) {
    if (!sh(`fuser ${puerto}/tcp 2>/dev/null || true`)) return;
    execSync("sleep 1");
  }
};

parar(3142);
execSync(`cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-frio.log 2>&1 < /dev/null &)`, {
  shell: "/bin/bash",
});
{
  let vivo = false;
  for (let i = 0; i < 40; i++) {
    if (sh("curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true") === "200") {
      vivo = true;
      break;
    }
    execSync("sleep 1");
  }
  if (!vivo) throw new Error("La aplicación no levantó en el 3142.");
}

// ══════════════════════════════════════════════════════════════════════════
console.log(`── 1. CON SUPABASE FRÍO (${FRIO_MS / 1000} s) NADIE SE QUEDA COLGADO ──`);
// ══════════════════════════════════════════════════════════════════════════
temperatura(FRIO_MS);
{
  const viva = pedirPortada(VIVA);
  const vencida = pedirPortada(VENCIDA);

  console.log(`   (token vivo: ${viva.segundos}s · vencido: ${vencida.segundos}s)`);

  es("con el token vivo, contesta", viva.code !== "000", true);
  es(
    `Y ANTES DEL TOPE DE NETLIFY (${TOPE_DE_NETLIFY_S}s)`,
    viva.segundos < TOPE_DE_NETLIFY_S,
    true,
  );

  /*
   * El vencido es el que importa: acá es donde la librería reintentaba hasta
   * los treinta segundos. Antes del arreglo esta medición daba 36.
   */
  es("con el token VENCIDO, contesta", vencida.code !== "000", true);
  es(
    `Y TAMBIÉN ANTES DEL TOPE (acá es donde reintentaba hasta 30 s)`,
    vencida.segundos < TOPE_DE_NETLIFY_S,
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. Y CUANDO DESPIERTA, LA SESIÓN SIGUE AHÍ ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * Esto es la mitad que no se puede olvidar.
 *
 * Rendirse rápido es fácil si uno acepta echar a la gente: bastaría con mandar
 * al login y borrar la sesión. Lo que hace falta es rendirse rápido Y que quien
 * estaba trabajando pueda seguir en el intento siguiente, sin volver a escribir
 * la contraseña.
 */
temperatura(0);
{
  const r = pedirPortada(VIVA);
  console.log(`   (${r.segundos}s)`);
  es("el siguiente intento entra", r.code, "200");
  es("Y SIN VOLVER A PEDIR CONTRASEÑA", r.code !== "307", true);
  es("y rápido, como siempre", r.segundos < 3, true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. EN CALIENTE NO SE PAGA NADA POR TODO ESTO ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * Un plazo mal puesto se nota acá: si los topes fueran tan cortos que cortaran
 * una respuesta normal, el caso de todos los días empezaría a fallar.
 */
{
  const r = pedirPortada(VIVA);
  console.log(`   (${r.segundos}s)`);
  es("la portada abre", r.code, "200");
  es("en menos de un segundo", r.segundos < 1, true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
