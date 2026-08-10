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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${titulos.variable} ${cuerpo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
