"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PAUSA_PARA_INTERRUMPIR_MS, type LlamadaEnVivo } from "@/lib/llamadas";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * La llamada que está pasando ahora, y qué está haciendo la persona.
 *
 * ============================================================================
 * POR QUÉ NO VA POR `useEnVivo`
 * ============================================================================
 *
 * Ese canal existe para otra cosa: cada aviso que le llega termina en un
 * `router.refresh()`, que vuelve a pedir la pantalla entera al servidor. Para
 * un lead que se movió está bien —medio segundo de retraso no se nota— pero
 * para una llamada sería justo lo que la escuela pidió evitar:
 *
 *   «No quiero que vayan a afectar las llamadas entrantes al momento que estén
 *    escribiendo o interactuando en el CRM.»
 *
 * Un refresco en el medio de una frase la corta. Este canal es propio y no
 * refresca NADA: lee la fila que viene en el aviso y la deja en un estado
 * local. Lo que se está escribiendo no se entera de que entró una llamada.
 *
 * ============================================================================
 * Y POR QUÉ MIRA EL TECLADO
 * ============================================================================
 *
 * Porque la otra mitad del pedido —el pop-up que espera a que la persona
 * levante las manos— necesita saber si las manos están puestas. Se anota
 * cuándo fue la última tecla y si hay algo arrastrándose, y la regla de
 * `lib/llamadas.ts` decide con eso.
 */

/** Cómo viene la fila de `llamadas` por el websocket, cruda de Postgres. */
interface FilaCruda {
  call_id?: unknown;
  telefono?: unknown;
  conversacion_id?: unknown;
  vendedor_id?: unknown;
  nombre?: unknown;
  direccion?: unknown;
  estado?: unknown;
  atendida_por?: unknown;
  sdp_remoto?: unknown;
  sdp_tipo?: unknown;
  creado_en?: unknown;
}

export interface LlamadaConSdp extends LlamadaEnVivo {
  /** La oferta de Meta —en una entrante— o su respuesta —en una saliente—. */
  sdpRemoto: string | null;
  sdpTipo: "offer" | "answer" | null;
}

const leerFila = (f: FilaCruda): LlamadaConSdp | null => {
  const callId = typeof f.call_id === "string" ? f.call_id : null;
  if (!callId) return null;

  return {
    callId,
    telefono: String(f.telefono ?? ""),
    conversacionId: f.conversacion_id == null ? null : Number(f.conversacion_id),
    vendedorId: f.vendedor_id == null ? null : Number(f.vendedor_id),
    nombre: typeof f.nombre === "string" && f.nombre.trim() !== "" ? f.nombre : null,
    direccion: f.direccion === "saliente" ? "saliente" : "entrante",
    estado: (f.estado ?? "sonando") as LlamadaEnVivo["estado"],
    atendidaPor: typeof f.atendida_por === "string" ? f.atendida_por : null,
    creadoEn: typeof f.creado_en === "string" ? f.creado_en : new Date().toISOString(),
    sdpRemoto: typeof f.sdp_remoto === "string" ? f.sdp_remoto : null,
    sdpTipo: f.sdp_tipo === "offer" || f.sdp_tipo === "answer" ? f.sdp_tipo : null,
  };
};

export interface EnVivoDeLlamadas {
  /** La que importa ahora. Nula casi todo el tiempo, que es lo normal. */
  llamada: LlamadaConSdp | null;
  /** Hace cuántos milisegundos tocó una tecla. Nulo si no tocó ninguna. */
  tecleoHaceMs: number | null;
  arrastrando: boolean;
  /** Para el final feliz: se suelta la llamada de la pantalla. */
  soltar: () => void;
  /** Para las salientes: la pone en pantalla sin esperar el websocket. */
  poner: (l: LlamadaConSdp) => void;
}

/**
 * Cada cuánto se vuelve a mirar el reloj del teclado.
 *
 * Es lo que hace que el pop-up SUBA solo cuando la persona deja de escribir.
 * Sin esto habría que esperar a que llegara otro aviso del websocket, que en
 * una llamada que ya está sonando no va a llegar nunca: la fila no cambia
 * mientras suena.
 *
 * Medio segundo es suficiente —nadie nota la diferencia entre 2,5 y 3
 * segundos de espera— y es lo bastante espaciado como para no costar nada.
 */
const CADA_MS = 500;

export function useLlamadaEnVivo(): EnVivoDeLlamadas {
  const [llamada, setLlamada] = useState<LlamadaConSdp | null>(null);
  const [tecleoHaceMs, setTecleoHaceMs] = useState<number | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const ultimaTecla = useRef<number | null>(null);

  /*
   * El teclado y el arrastre.
   *
   * Se escuchan en la ventana entera y en captura, para que valgan también las
   * teclas que un campo se queda —el editor de notas, el buscador— y no sólo
   * las que llegan hasta el fondo.
   *
   * `keydown` y no `input`: escribir en un campo, mover un lead con las
   * flechas y navegar con el tabulador son todas cosas que un pop-up encima
   * arruinaría, y sólo la primera dispara `input`.
   */
  useEffect(() => {
    const tecla = () => {
      ultimaTecla.current = Date.now();
    };
    const empieza = () => setArrastrando(true);
    const termina = () => setArrastrando(false);

    window.addEventListener("keydown", tecla, true);
    window.addEventListener("dragstart", empieza, true);
    window.addEventListener("dragend", termina, true);
    window.addEventListener("drop", termina, true);
    // Un arrastre puede terminar sin `dragend` si se suelta fuera de la
    // ventana; sin esto quedaría «arrastrando» para siempre y el pop-up no
    // subiría nunca más.
    window.addEventListener("pointerup", termina, true);

    return () => {
      window.removeEventListener("keydown", tecla, true);
      window.removeEventListener("dragstart", empieza, true);
      window.removeEventListener("dragend", termina, true);
      window.removeEventListener("drop", termina, true);
      window.removeEventListener("pointerup", termina, true);
    };
  }, []);

  /*
   * El reloj sólo corre cuando hay una llamada sonando.
   *
   * Un intervalo permanente redibujaría el CRM entero dos veces por segundo
   * todo el día, por una cuenta que el 99,9 % del tiempo no le importa a
   * nadie. Y sólo empuja un cambio de estado cuando el número cruza el umbral
   * que a la regla le importa: pasar de 4000 a 4500 milisegundos de silencio
   * no cambia ninguna decisión.
   */
  useEffect(() => {
    if (llamada == null) {
      setTecleoHaceMs(null);
      return;
    }

    const mirar = () => {
      const t = ultimaTecla.current;
      const cuanto = t == null ? null : Date.now() - t;
      setTecleoHaceMs((antes) => {
        const ocupadoAntes = antes != null && antes < PAUSA_PARA_INTERRUMPIR_MS;
        const ocupadoAhora = cuanto != null && cuanto < PAUSA_PARA_INTERRUMPIR_MS;
        return ocupadoAntes === ocupadoAhora ? antes : cuanto;
      });
    };

    mirar();
    const reloj = window.setInterval(mirar, CADA_MS);
    return () => window.clearInterval(reloj);
  }, [llamada]);

  // ------------------------------------------------------------- el canal

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = getBrowserClient();
    let vivo = true;

    const canal = supabase.channel("crm-llamadas");

    canal.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "llamadas" },
      (p) => {
        if (!vivo) return;
        const nueva = leerFila((p.new ?? {}) as FilaCruda);
        if (!nueva) return;

        setLlamada((antes) => {
          /*
           * Una llamada nueva no pisa a la que se está atendiendo.
           *
           * Pasa: se está hablando con alguien y entra otra. Reemplazarla
           * dejaría a quien está hablando sin botón para colgar y con el
           * micrófono abierto, que es peor que no enterarse de la segunda.
           * La segunda queda en el hilo como perdida, que es lo que
           * corresponde.
           */
          if (
            antes != null &&
            antes.callId !== nueva.callId &&
            (antes.estado === "contestando" || antes.estado === "en_curso")
          ) {
            return antes;
          }
          return nueva;
        });
      },
    );

    canal.subscribe();

    return () => {
      vivo = false;
      supabase.removeChannel(canal);
    };
  }, []);

  /*
   * Al recargar la pantalla puede haber una sonando: el aviso del websocket ya
   * pasó y no vuelve. Sin esta consulta, quien recarga justo cuando entra una
   * llamada no la ve nunca.
   */
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let vivo = true;

    void getBrowserClient()
      .from("llamadas")
      .select(
        "call_id, telefono, conversacion_id, vendedor_id, nombre, direccion, " +
          "estado, atendida_por, sdp_remoto, sdp_tipo, creado_en",
      )
      .in("estado", ["sonando", "contestando", "en_curso"])
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo || !data) return;
        const l = leerFila(data as FilaCruda);
        // No pisa lo que ya haya llegado por el websocket, que es más nuevo.
        if (l) setLlamada((antes) => antes ?? l);
      });

    return () => {
      vivo = false;
    };
  }, []);

  const soltar = useCallback(() => setLlamada(null), []);
  const poner = useCallback((l: LlamadaConSdp) => setLlamada(l), []);

  return { llamada, tecleoHaceMs, arrastrando, soltar, poner };
}
