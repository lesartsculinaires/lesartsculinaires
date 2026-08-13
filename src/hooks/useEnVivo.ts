"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { crearRafaga } from "@/lib/rafaga";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getBrowserClient } from "@/lib/supabase/browser";

/** Tablas cuyos cambios le importan a la pantalla. */
const TABLAS = [
  "oportunidades",
  "clientes",
  "oportunidad_notas",
  "eventos",
] as const;

/**
 * Espera antes de recargar tras el primer aviso.
 *
 * Subir una base manda un aviso por fila. Sin esta pausa, importar 500
 * contactos dispararía 500 recargas seguidas. Con ella, la ráfaga entera se
 * cobra una sola, y medio segundo de retraso no se nota escribiendo.
 */
const ESPERA_MS = 600;

/** Tope: con avisos entrando sin parar, se recarga igual cada tanto. */
const TOPE_MS = 4000;

export type EstadoEnVivo = "conectando" | "conectado" | "sin-conexion";

/**
 * Trae los cambios de otras personas en el momento en que ocurren.
 *
 * Lo que llega por el websocket es sólo el aviso de que una tabla cambió; el
 * dato se vuelve a pedir por el camino de siempre con `router.refresh()`. Es
 * a propósito: los permisos y el armado de la vista siguen resolviéndose en
 * el servidor, así que nadie ve por esta vía nada que no vería recargando, y
 * no hay una segunda copia de los datos en el navegador que pueda quedar
 * distinta de la primera.
 *
 * Devuelve el estado de la conexión para poder decirlo en pantalla. Si se
 * cae, el refresco cada diez minutos sigue corriendo por debajo: la pantalla
 * se atrasa, no se queda muerta.
 */
export function useEnVivo(): EstadoEnVivo {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoEnVivo>("conectando");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setEstado("sin-conexion");
      return;
    }

    const supabase = getBrowserClient();
    let vivo = true;

    const rafaga = crearRafaga(
      () => {
        if (vivo) router.refresh();
      },
      { esperaMs: ESPERA_MS, topeMs: TOPE_MS },
    );

    const canal = supabase.channel("crm-en-vivo");
    for (const table of TABLAS) {
      canal.on("postgres_changes", { event: "*", schema: "public", table }, rafaga.avisar);
    }

    canal.subscribe((s) => {
      if (!vivo) return;
      if (s === "SUBSCRIBED") setEstado("conectado");
      // CHANNEL_ERROR suele ser la tabla sin publicar o la sesión vencida;
      // TIMED_OUT y CLOSED, la red. Para quien mira son lo mismo: no hay
      // avisos, y manda el refresco cada diez minutos.
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        setEstado("sin-conexion");
      }
    });

    return () => {
      vivo = false;
      rafaga.cancelar();
      supabase.removeChannel(canal);
    };
  }, [router]);

  return estado;
}
