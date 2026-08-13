"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve a pedir los datos del servidor cada cierto tiempo.
 *
 * `router.refresh()` rearma la página con datos frescos pero no toca el estado
 * del navegador: el filtro puesto, la ficha abierta, el texto a medio escribir
 * y la posición del scroll quedan donde estaban. Por eso se puede correr con
 * gente trabajando sin interrumpirle nada.
 *
 * Dos detalles que no son obvios:
 *
 * - El reloj se consulta cada medio minuto en vez de programar un solo
 *   temporizador a diez. Cuando una laptop se suspende, los temporizadores se
 *   congelan con ella: al despertar, uno de diez minutos todavía tendría ocho
 *   por delante aunque la máquina haya pasado la noche cerrada. Mirando la hora
 *   real, al volver ya está vencido y refresca de una.
 *
 * - Con la pestaña escondida no se refresca. Nadie está viendo, y cada vuelta
 *   son consultas contra Supabase que se gastan sin que nadie las lea.
 */
export function useAutoRefresco(cadaMs: number) {
  const router = useRouter();
  const ultimo = useRef(Date.now());

  useEffect(() => {
    const tic = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimo.current < cadaMs) return;
      ultimo.current = Date.now();
      router.refresh();
    };

    const id = window.setInterval(tic, 30_000);
    document.addEventListener("visibilitychange", tic);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tic);
    };
  }, [router, cadaMs]);
}
