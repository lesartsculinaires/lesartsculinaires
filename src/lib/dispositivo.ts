/**
 * Qué tipo de dispositivo es, para el límite de sesiones por rol (12/11/2026).
 *
 * Se decide en el navegador, con lo que el navegador dice de sí mismo. No es
 * a prueba de quien quiera engañarlo, ni hace falta: el límite es para
 * ordenar, no una barrera de seguridad.
 *
 * El iPad merece una línea aparte: desde iPadOS 13, Safari se presenta como
 * una Mac («Macintosh»). Lo que lo delata es que tiene pantalla táctil, y las
 * Mac no.
 */

export type TipoDeDispositivo = "computadora" | "celular" | "tablet";

export function tipoDeDispositivo(agente: string, puntosTactiles = 0): TipoDeDispositivo {
  const ua = agente || "";
  const ipadComoMac = /Macintosh/i.test(ua) && puntosTactiles > 1;
  if (ipadComoMac || /iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  // Android sin «Mobile» es una tablet: así lo marca Google.
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet";
  if (/iPhone|iPod|Android|Mobi|Windows Phone/i.test(ua)) return "celular";
  return "computadora";
}

/** «Chrome · Windows»: lo justo para reconocer la sesión en una lista. */
export function agenteCorto(agente: string, puntosTactiles = 0): string {
  const ua = agente || "";
  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navegador";
  const sistema = /iPad/.test(ua) || (/Macintosh/.test(ua) && puntosTactiles > 1)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "otro sistema";
  return `${navegador} · ${sistema}`;
}
