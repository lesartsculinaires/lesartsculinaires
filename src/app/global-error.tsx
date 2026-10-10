"use client";

import { RecuperacionDeLaRaiz } from "@/components/PantallaDeRecuperacion";

/**
 * Cuando falla hasta el armazón de la página —`layout.tsx`—, que `error.tsx`
 * no alcanza a atajar. Reemplaza al documento entero, por eso lleva su propio
 * `<html>`. Ver `@/lib/recuperarse`.
 */
export default function ErrorDeLaRaiz({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="es" translate="no">
      <body style={{ margin: 0 }}>
        <RecuperacionDeLaRaiz error={error} />
      </body>
    </html>
  );
}
