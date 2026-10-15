import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

import type { NextConfig } from "next";

/*
 * ============================================================================
 * «SERVER ACTION … WAS NOT FOUND ON THE SERVER» (14 Y 15 DE OCTUBRE DE 2026)
 * ============================================================================
 *
 * Dos asesoras con el CRM abierto vieron ese error justo después de un
 * despliegue —13:58 del 14/10 y 8:33 del 15/10, minutos después de publicar—:
 * una al cambiar la etapa de un lead y otra al mandar un PDF.
 *
 * Cada botón que guarda algo llama al servidor por un número que Next le pone
 * a la acción. Ese número se calcula con una llave que Next inventa al azar en
 * CADA compilación, así que al publicar una versión nueva todos los números
 * cambian, y la pestaña que quedó abierta sigue pidiendo los viejos: el
 * servidor ya no los conoce.
 *
 * Con la llave fija los números quedan iguales de una versión a la otra, y una
 * pestaña abierta antes del despliegue sigue guardando como si nada. Sólo
 * fallaría una acción que se borró o se renombró, y para eso está el aviso de
 * versión nueva (`AvisoDeVersionNueva`).
 *
 * La llave sale de una que Netlify ya guarda en secreto —la de servicio de
 * Supabase—, pasada por SHA-256 con un rótulo propio: es estable, nunca viaja
 * a ningún lado y no deja reconstruir la original. Si alguien la define a mano
 * en NEXT_SERVER_ACTIONS_ENCRYPTION_KEY, manda ésa.
 */
if (!process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = createHash("sha256")
    .update(`lac-crm:acciones-del-servidor:${process.env.SUPABASE_SERVICE_ROLE_KEY}`)
    .digest("base64");
}

/**
 * Qué versión es ésta, para que una pestaña abierta se entere de que hay otra.
 *
 * Netlify pone DEPLOY_ID en cada compilación; en una máquina de desarrollo se
 * usa el commit. Tiene que ser igual en todas las vueltas que Next hace por
 * este archivo durante una misma compilación, por eso no es la hora.
 */
function versionDelCrm(): string {
  const deNetlify = process.env.DEPLOY_ID || process.env.COMMIT_REF;
  if (deNetlify) return deNetlify;
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "desarrollo";
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  env: {
    VERSION_DEL_CRM: versionDelCrm(),
  },

  /**
   * Security headers live here, not in netlify.toml: that file's `[[headers]]`
   * only reach assets served straight from the CDN, and every page in this app
   * is rendered on demand, so they never applied.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          /*
           * El micrófono, sólo para esta aplicación.
           *
           * Decía `microphone=()`, que es «nadie, ni siquiera esta página». Se
           * escribió así cuando el CRM no grababa nada, y era lo correcto
           * entonces. Ahora la bandeja graba notas de voz, y con esa cabecera
           * `getUserMedia` falla con `NotAllowedError` —el mismo error que da
           * un permiso denegado por la persona— así que la asesora ve «el
           * navegador no dio permiso» y va a buscarlo al candado de la barra de
           * direcciones, donde está todo en orden y no hay nada que arreglar.
           *
           * `(self)` es sólo el origen del CRM: nada que la página incruste
           * puede pedir el micrófono. La cámara y la ubicación siguen cerradas
           * para todos, porque no hay nada acá que las use.
           */
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
