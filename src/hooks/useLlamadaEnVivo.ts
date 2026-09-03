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

/**
 * Cada cuánto se le pregunta a la base si hay una llamada.
 *
 * Ver la explicación larga en el efecto que lo usa. En resumen: el websocket
 * es el camino rápido, esto es el piso. Tres segundos contra los treinta que
 * da Meta para atender.
 */
const CADA_PREGUNTA_MS = 3_000;

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
   * ==========================================================================
   * LA RED DE SEGURIDAD: SE PREGUNTA, NO SÓLO SE ESPERA
   * ==========================================================================
   *
   * El websocket es el camino rápido y sigue siendo el primero. Pero en la
   * prueba real con un cliente de verdad pasó esto:
   *
   *   «La segunda vez que llamé, hasta que refresqué la página no salió la
   *    notificación de llamada, y hay demasiada tardanza en que salga en cada
   *    dispositivo.»
   *
   * Un aviso por websocket se manda UNA vez y no se guarda. Si la pestaña
   * estaba dormida, si el wifi parpadeó, si el canal se estaba reconectando —o
   * si el proxy de la oficina cortó el socket sin avisar—, ese aviso no llega
   * y no vuelve a llegar nunca. Para un lead que se movió eso se arregla solo
   * en el próximo refresco; para una llamada no: el cliente cuelga.
   *
   * Por eso acá se PREGUNTA cada pocos segundos. No reemplaza al websocket
   * —cuando anda, la llamada aparece al instante— sino que le pone un piso: en
   * el peor caso el teléfono suena unos segundos tarde, y nunca «recién cuando
   * alguien recarga».
   *
   * --------------------------------------------------------------------------
   * POR QUÉ ESTE RITMO Y NO OTRO
   * --------------------------------------------------------------------------
   *
   * Meta da entre 30 y 60 segundos antes de dar la llamada por no contestada.
   * Preguntando cada tres segundos, lo peor que puede pasar es perder tres de
   * esos treinta: queda tiempo de sobra para que alguien decida.
   *
   * Y sólo con la pestaña A LA VISTA. Una asesora tiene el CRM abierto en una
   * pestaña entre otras diez todo el día; preguntar en todas, todo el tiempo,
   * sería multiplicar la consulta por pestañas que nadie está mirando —y en
   * una pestaña que nadie mira, tampoco hay quien atienda—. Al volver a ella
   * se pregunta de inmediato, así que no se pierde nada.
   *
   * La consulta es de una fila con índice propio (`ix_llamadas_vivas`) y casi
   * siempre devuelve vacío, que es lo normal: la escuela no vive en llamada.
   */
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let vivo = true;
    let reloj: number | null = null;

    const preguntar = async () => {
      const { data, error } = await getBrowserClient()
        .from("llamadas")
        .select(
          "call_id, telefono, conversacion_id, vendedor_id, nombre, direccion, " +
            "estado, atendida_por, sdp_remoto, sdp_tipo, creado_en",
        )
        .in("estado", ["sonando", "contestando", "en_curso"])
        .order("creado_en", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!vivo) return;

      const l = data ? leerFila(data as FilaCruda) : null;

      if (!l) {
        /*
         * No hay ninguna llamada viva. Se suelta lo que hubiera en pantalla.
         *
         * Es la otra mitad de la red de seguridad: si el aviso de que la
         * llamada terminó se pierde igual que se perdía el de que empezó, la
         * tarjeta se quedaría sonando contra nadie hasta que venciera el plazo
         * de los 75 segundos.
         *
         * SÓLO si la consulta contestó bien. Con `error` no se toca nada: una
         * caída de red de un segundo se ve igual que «no hay llamadas», y
         * soltar ahí le cortaría la tarjeta a alguien que está hablando.
         */
        if (!error) setLlamada(null);
        return;
      }

      setLlamada((antes) => {
        /*
         * Lo que ya está en pantalla manda, salvo que esto traiga la MISMA
         * llamada más adelantada.
         *
         * Dos razones. La primera: el websocket llega antes y con la fila
         * entera, así que pisarlo con esto sería ir para atrás. La segunda, y
         * la que importa: mientras se está hablando, esta consulta no puede
         * reemplazar la llamada en curso por otra que entró —quien está
         * hablando se quedaría sin botón para colgar, con el micrófono
         * abierto—.
         */
        if (antes == null) return l;
        if (antes.callId !== l.callId) return antes;
        // La misma: se acepta lo nuevo, que puede traer el SDP o quién la agarró.
        return l;
      });
    };

    const alaVista = () => document.visibilityState === "visible";

    const arrancar = () => {
      if (reloj != null) return;
      void preguntar();
      reloj = window.setInterval(() => void preguntar(), CADA_PREGUNTA_MS);
    };

    const parar = () => {
      if (reloj == null) return;
      window.clearInterval(reloj);
      reloj = null;
    };

    const segunSeVea = () => (alaVista() ? arrancar() : parar());

    segunSeVea();
    document.addEventListener("visibilitychange", segunSeVea);

    return () => {
      vivo = false;
      parar();
      document.removeEventListener("visibilitychange", segunSeVea);
    };
  }, []);

  const soltar = useCallback(() => setLlamada(null), []);
  const poner = useCallback((l: LlamadaConSdp) => setLlamada(l), []);

  return { llamada, tecleoHaceMs, arrastrando, soltar, poner };
}
