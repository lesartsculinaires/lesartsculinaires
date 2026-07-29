import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
