import type { Metadata } from "next";
import { Montserrat, Old_Standard_TT } from "next/font/google";

import "./globals.css";

/**
 * Las dos familias se descargan en el build y se sirven desde el propio
 * dominio. Además de ser más rápido que pedirlas a Google en cada carga,
 * evita que la app dependa de un tercero para renderizar texto.
 */
const titulos = Old_Standard_TT({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--fuente-titulos",
  display: "swap",
});

const cuerpo = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fuente-cuerpo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRM · Les Arts Culinaires",
  description:
    "CRM de ventas de Les Arts Culinaires: leads, seguimiento, pipeline y cierre de matrículas.",
  // Ver el `translate="no"` de abajo: esto es lo mismo dicho a Google.
  other: { google: "notranslate" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
     * `translate="no"`: que el traductor del navegador no toque la página.
     *
     * Si alguien tiene Chrome en inglés con «traducir siempre del español», el
     * traductor reescribe los textos por debajo de React, y en el siguiente
     * refresco React no encuentra lo que dejó: la pantalla revienta con el
     * mismo «Application error» del 10 de octubre de 2026. El CRM está en
     * castellano y lo usa un equipo que habla castellano; no hay nada que
     * traducir y sí mucho que perder.
     */
    <html lang="es" translate="no" className={`${titulos.variable} ${cuerpo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
