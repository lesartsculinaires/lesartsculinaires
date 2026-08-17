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

export type EstadoEnVivo =
  | "conectando"
  /** Canal arriba y tablas publicadas: los avisos llegan de verdad. */
  | "conectado"
  /** Canal arriba, pero falta correr la migración: no va a llegar nada. */
  | "sin-publicar"
  | "sin-conexion";

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
 * Sobre el estado que devuelve: unirse al canal no basta para decir «En
 * vivo». Supabase acepta la suscripción aunque las tablas no estén en la
 * publicación, y después no manda nada nunca; la pantalla quedaría diciendo
 * que está en vivo mientras no llega un solo aviso, que es peor que no decir
 * nada. Por eso además se le pregunta a la base, con
 * `cambios_en_vivo_activos()`, si los avisos van a salir de verdad.
 *
 * En cualquier caso el refresco cada diez minutos sigue corriendo por debajo:
 * la pantalla se atrasa, no se queda muerta.
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

    /**
     * ¿Las tablas están publicadas?
     *
     * Si la función no existe todavía —la migración no se ha corrido— el
     * error es la respuesta: tampoco están publicadas las tablas.
     */
    let publicadas: boolean | null = null;
    const revisarPublicacion = async () => {
      const { data, error } = await supabase.rpc("cambios_en_vivo_activos");
      publicadas = error ? false : data === true;
      if (vivo) asentarEstado();
    };

    /** El canal por su lado y la publicación por el suyo; mandan los dos. */
    let canalListo: boolean | null = null;
    const asentarEstado = () => {
      if (canalListo === false) return setEstado("sin-conexion");
      if (canalListo == null || publicadas == null) return;
      setEstado(publicadas ? "conectado" : "sin-publicar");
    };

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
      if (s === "SUBSCRIBED") {
        canalListo = true;
        // Se pregunta recién acá: si el canal no levanta, la respuesta da
        // igual y no hay por qué gastar la consulta.
        void revisarPublicacion();
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        // Sesión vencida, red caída, proxy de oficina. Para quien mira son lo
        // mismo: no hay avisos, y manda el refresco cada diez minutos.
        canalListo = false;
      }
      asentarEstado();
    });

    return () => {
      vivo = false;
      rafaga.cancelar();
      supabase.removeChannel(canal);
    };
  }, [router]);

  return estado;
}
