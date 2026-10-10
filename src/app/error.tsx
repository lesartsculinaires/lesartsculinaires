"use client";

import { RecuperacionDeLaPagina } from "@/components/PantallaDeRecuperacion";

/**
 * Lo que se ve cuando la página falla, en vez de la pantalla blanca de
 * «Application error». Se recupera sola: ver `@/lib/recuperarse`.
 */
export default function ErrorDeLaPagina({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RecuperacionDeLaPagina error={error} reset={reset} />;
}
