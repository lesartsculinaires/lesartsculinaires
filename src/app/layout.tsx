import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Jost, Montserrat, Old_Standard_TT, Tinos } from "next/font/google";
import type { CSSProperties } from "react";

import { ProveedorDeMarca } from "@/components/marca/MarcaContexto";
import { GALLETA_IDIOMA, type Idioma } from "@/lib/i18n/galleta";
import { IdiomaProvider } from "@/lib/i18n/idioma";
import { marcaDelPedido } from "@/lib/marca/servidor";
import { MARCAS, MODO_UNIFICADO, variablesDeColor } from "@/lib/marcas";

import "./globals.css";

/**
 * Las dos familias se descargan en el build y se sirven desde el propio
 * dominio. Además de ser más rápido que pedirlas a Google en cada carga,
 * evita que la app dependa de un tercero para renderizar texto.
 */
/*
 * Las tipografías de las dos marcas (12/11/2026). Cada una deja su variable,
 * y el <html> apunta `--fuente-titulos` y `--fuente-cuerpo` a las de la marca
 * en uso. LAC: Old Standard TT y Montserrat. HC: Tinos (las medidas de la
 * Times del manual) y Jost (el pariente libre de Neuzeit Grotesk).
 */
const titulosLac = Old_Standard_TT({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--fuente-titulos-lac",
  display: "swap",
});

const cuerpoLac = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fuente-cuerpo-lac",
  display: "swap",
});

const titulosHc = Tinos({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--fuente-titulos-hc",
  display: "swap",
  preload: false,
});

const cuerpoHc = Jost({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fuente-cuerpo-hc",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const marca = MARCAS[marcaDelPedido()];
  return {
    title: MODO_UNIFICADO ? `CRM Peñagroup · ${marca.nombre}` : `CRM · ${marca.nombre}`,
    description: marca.descripcion,
    // Ver el `translate="no"` de abajo: esto es lo mismo dicho a Google.
    other: { google: "notranslate" },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // El idioma que se eligió la última vez; castellano si no hay nada.
  const idioma: Idioma = (await cookies()).get(GALLETA_IDIOMA)?.value === "en" ? "en" : "es";

  // La marca del pedido: sus colores y tipografías van en el <html>.
  const marca = marcaDelPedido();
  const estilo = {
    ...variablesDeColor(marca),
    "--fuente-titulos": `var(--fuente-titulos-${marca})`,
    "--fuente-cuerpo": `var(--fuente-cuerpo-${marca})`,
  } as CSSProperties;

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
    <html
      lang={idioma}
      translate="no"
      data-marca={marca}
      style={estilo}
      className={`${titulosLac.variable} ${cuerpoLac.variable} ${titulosHc.variable} ${cuerpoHc.variable}`}
    >
      <body>
        <ProveedorDeMarca marca={marca}>
          <IdiomaProvider inicial={idioma}>{children}</IdiomaProvider>
        </ProveedorDeMarca>
      </body>
    </html>
  );
}
