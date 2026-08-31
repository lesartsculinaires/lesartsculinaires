import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

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
