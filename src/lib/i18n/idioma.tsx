"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { EN } from "@/lib/i18n/en";
import { GALLETA_IDIOMA, type Idioma } from "@/lib/i18n/galleta";

/**
 * El idioma de la pantalla: castellano (el de siempre) o inglés.
 *
 * Se agregó el 21/10/2026 para grabar el video que pide la revisión de Meta,
 * cuyos revisores leen inglés. El CRM está escrito en castellano y sigue
 * siendo su idioma: el inglés es una traducción de lo que se ve en el flujo
 * que revisa Meta (entrada, menú, Inbox, Canales), no de cada rincón.
 *
 * ------------------------------------------------------------------------
 * CÓMO FUNCIONA
 * ------------------------------------------------------------------------
 *
 * `t("texto en castellano")` devuelve el mismo texto, o su traducción si el
 * idioma es inglés y está en el diccionario (`en.ts`). La CLAVE es el propio
 * texto en castellano, así que el código se sigue leyendo en castellano y lo
 * que no se tradujo queda en castellano en vez de verse roto.
 *
 * El idioma se guarda en una galleta (`lac.idioma`) y no en el navegador
 * solamente: el servidor la lee al dibujar la primera vez, y así la pantalla
 * no parpadea de castellano a inglés al cargar.
 *
 * Lo que escriben los clientes y las asesoras —mensajes, notas, nombres—
 * nunca se traduce: es contenido, no interfaz.
 */
export type { Idioma };

interface Valor {
  idioma: Idioma;
  cambiar: (i: Idioma) => void;
  t: (es: string) => string;
}

const Contexto = createContext<Valor>({
  idioma: "es",
  cambiar: () => {},
  t: (es) => es,
});

/** El texto en el idioma elegido. Lo que no está en el diccionario queda igual. */
export const traducir = (idioma: Idioma, es: string): string =>
  idioma === "en" ? (EN[es] ?? es) : es;

export function IdiomaProvider({ inicial, children }: { inicial: Idioma; children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>(inicial);

  const cambiar = useCallback((i: Idioma) => {
    setIdioma(i);
    try {
      // Un año; para todo el sitio. No lleva nada personal.
      document.cookie = `${GALLETA_IDIOMA}=${i}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = i;
    } catch {
      // Sin galleta, el cambio vale mientras la pestaña siga abierta.
    }
  }, []);

  const valor = useMemo<Valor>(
    () => ({ idioma, cambiar, t: (es) => traducir(idioma, es) }),
    [idioma, cambiar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** `const t = useT();` y después `t("Texto en castellano")`. */
export const useT = () => useContext(Contexto).t;

/** El idioma actual y cómo cambiarlo, para el selector. */
export const useIdioma = () => {
  const { idioma, cambiar } = useContext(Contexto);
  return { idioma, cambiar };
};
