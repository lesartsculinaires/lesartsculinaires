"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { JUNTAR_MS, PAUSA_MS, PRIORIDAD, type Aviso } from "@/lib/aviso";
import {
  crearCampanita,
  SONIDOS,
  TIMBRE_POR_OMISION,
  VOLUMEN_POR_OMISION,
  VOLUMENES,
  type Ajustes,
  type Timbre,
  type Volumen,
} from "@/lib/campanita";

/**
 * Dónde queda guardado, por navegador.
 *
 * Va en el navegador y no en la base a propósito: el sonido que necesita
 * alguien depende de dónde está sentado, no de quién es. La misma persona
 * quiere «Alerta» en el mostrador y «Marimba» en la computadora de su casa, y
 * guardándolo en su cuenta tendría que cambiarlo cada vez que se mueve.
 */
const LLAVE = "lac.sonido";
const LLAVE_TIMBRE = "lac.sonido.timbre";
const LLAVE_VOLUMEN = "lac.sonido.volumen";

/** Lee lo guardado, cayendo en lo de fábrica si dice cualquier cosa. */
function leerAjustes(): Ajustes {
  const t = window.localStorage.getItem(LLAVE_TIMBRE);
  const v = window.localStorage.getItem(LLAVE_VOLUMEN);
  return {
    timbre: t != null && t in SONIDOS ? (t as Timbre) : TIMBRE_POR_OMISION,
    volumen: VOLUMENES.some((x) => x.id === v) ? (v as Volumen) : VOLUMEN_POR_OMISION,
  };
}

export interface Campanita {
  encendido: boolean;
  /** Prende o apaga, y lo recuerda. Al prender toca una vez, para mostrar cómo suena. */
  alternar: () => void;
  /**
   * Está prendido pero el navegador todavía no dejó sonar: falta que la
   * persona toque la pantalla una vez. Sirve para no mentirle al que ve el
   * ícono prendido y no escucha nada.
   */
  bloqueado: boolean;
  /** Toca el aviso, si corresponde. Acepta null para no obligar a preguntar afuera. */
  avisar: (aviso: Aviso | null) => void;
  /**
   * Prende o apaga el repique de una llamada entrante. `true` mientras esté
   * sonando; `false` al atender, al rechazar y al cortarse sola.
   */
  repicar: (sonando: boolean) => void;
  /** Qué sonido y a qué volumen, para que la pantalla lo muestre elegido. */
  ajustes: Ajustes;
  /** Cambia uno de los dos, lo guarda y lo hace sonar para escucharlo. */
  cambiarAjuste: (cambios: Partial<Ajustes>) => void;
}

/**
 * El sonido de avisos: prendido o apagado, y sin repetirse de más.
 *
 * Tres cosas que no son obvias viven acá:
 *
 * 1. La preferencia se lee después del primer dibujado. Leer `localStorage`
 *    mientras se dibuja rompe la hidratación de Next: el servidor no tiene
 *    forma de saber qué eligió esta persona en esta computadora.
 *
 * 2. El desbloqueo se cuelga del primer clic o tecla en cualquier lado. No se
 *    le pide a nadie que apriete un botón especial: entrando al CRM se hace
 *    clic en algo dentro de los primeros segundos, y ahí queda listo solo.
 *
 * 3. La pausa entre sonidos. Sin ella, subir una base o recibir una tanda de
 *    mensajes sería una alarma.
 */
export function useCampanita(): Campanita {
  const [encendido, setEncendido] = useState(true);
  const [bloqueado, setBloqueado] = useState(true);
  const [ajustes, setAjustes] = useState<Ajustes>({
    timbre: TIMBRE_POR_OMISION,
    volumen: VOLUMEN_POR_OMISION,
  });

  // La campanita sobrevive a los redibujados: si se creara en cada uno, cada
  // uno abriría un contexto de audio nuevo.
  const campana = useRef<ReturnType<typeof crearCampanita> | null>(null);
  if (campana.current == null) campana.current = crearCampanita();

  const ultimo = useRef<Record<Aviso, number>>({ mensaje: 0, cambio: 0 });
  const prendidoRef = useRef(true);
  const pendiente = useRef<Aviso | null>(null);
  const reloj = useRef<number | null>(null);

  useEffect(() => {
    const guardado = window.localStorage.getItem(LLAVE);
    const v = guardado !== "no";
    setEncendido(v);
    prendidoRef.current = v;

    const elegidos = leerAjustes();
    setAjustes(elegidos);
    campana.current?.ajustar(elegidos);
  }, []);

  /** El permiso del navegador, que se consigue con el primer gesto. */
  useEffect(() => {
    const c = campana.current;
    if (!c) return;

    let vivo = true;
    const abrir = () => {
      void c.despertar().then((ok) => {
        if (!vivo || !ok) return;
        setBloqueado(false);
        document.removeEventListener("pointerdown", abrir);
        document.removeEventListener("keydown", abrir);
      });
    };

    // Por las dudas ya esté despierto —vuelta atrás del navegador, pestaña
    // reusada— se prueba una vez sin esperar gesto.
    abrir();
    document.addEventListener("pointerdown", abrir);
    document.addEventListener("keydown", abrir);

    return () => {
      vivo = false;
      document.removeEventListener("pointerdown", abrir);
      document.removeEventListener("keydown", abrir);
    };
  }, []);

  // El contexto de audio se cierra al salir. Cortar acá y no en cada cambio de
  // pantalla: es uno por sesión.
  useEffect(
    () => () => {
      if (reloj.current != null) window.clearTimeout(reloj.current);
      campana.current?.cerrar();
    },
    [],
  );

  const alternar = useCallback(() => {
    const nuevo = !prendidoRef.current;
    prendidoRef.current = nuevo;
    setEncendido(nuevo);
    window.localStorage.setItem(LLAVE, nuevo ? "si" : "no");

    if (!nuevo) return;
    // Este clic es un gesto de la persona, así que sirve para despertar el
    // audio; y sonar una vez al prender es la única forma de saber que quedó
    // prendido de verdad y a qué volumen.
    void campana.current?.despertar().then((ok) => {
      setBloqueado(!ok);
      if (ok) campana.current?.sonar("cambio");
    });
  }, []);

  /**
   * `prendidoRef` en vez del estado: esta función se le pasa al websocket, que
   * la guarda una sola vez. Leyendo el estado se quedaría con el valor que
   * había al suscribirse y seguiría sonando después de apagarla.
   */
  const avisar = useCallback((aviso: Aviso | null) => {
    if (aviso == null || !prendidoRef.current) return;

    const anterior = pendiente.current;
    if (anterior == null || PRIORIDAD[aviso] > PRIORIDAD[anterior]) pendiente.current = aviso;

    // El reloj ya corriendo no se reinicia: lo que junta es la tanda que
    // empezó, no la última que entró. Reiniciándolo, una seguidilla larga
    // correría el sonido hasta el final y avisaría tarde.
    if (reloj.current != null) return;

    reloj.current = window.setTimeout(() => {
      reloj.current = null;
      const gana = pendiente.current;
      pendiente.current = null;
      // Se vuelve a preguntar: entre que entró el aviso y ahora, pudo
      // apagarse el sonido.
      if (gana == null || !prendidoRef.current) return;

      const ahora = Date.now();
      if (ahora - ultimo.current[gana] < PAUSA_MS) return;
      ultimo.current[gana] = ahora;

      campana.current?.sonar(gana);
    }, JUNTAR_MS);
  }, []);

  /**
   * Cambiar el sonido o el volumen, y escucharlo en el momento.
   *
   * Suena siempre al elegir, aunque el sonido esté apagado: quien entra a
   * elegir un tono está eligiendo, no trabajando, y comparar cinco sonidos sin
   * escucharlos no se puede. El clic además sirve de gesto para despertar el
   * audio, así que probar desde acá funciona incluso recién entrado al CRM.
   */
  const cambiarAjuste = useCallback((cambios: Partial<Ajustes>) => {
    setAjustes((antes) => {
      const nuevos = { ...antes, ...cambios };
      window.localStorage.setItem(LLAVE_TIMBRE, nuevos.timbre);
      window.localStorage.setItem(LLAVE_VOLUMEN, nuevos.volumen);
      campana.current?.ajustar(nuevos);

      void campana.current?.despertar().then((ok) => {
        setBloqueado(!ok);
        if (ok) campana.current?.probar(nuevos);
      });

      return nuevos;
    });
  }, []);

  /**
   * El repique de una llamada entrante.
   *
   * ------------------------------------------------------------------------
   * NO PASA POR LA PAUSA NI POR LA JUNTA DE AVISOS
   * ------------------------------------------------------------------------
   *
   * Todo lo de arriba existe para que una tanda de mensajes no se vuelva una
   * alarma: se juntan, se espera medio segundo, y no se repite antes de la
   * pausa. Un teléfono es lo contrario: tiene que empezar YA y seguir hasta
   * que alguien atienda. Pasarlo por ese camino lo haría empezar tarde y
   * callarse solo a la mitad.
   *
   * Lo que sí respeta es el interruptor. Quien apagó el sonido porque está en
   * una reunión no quiere que un teléfono le suene igual, y la llamada se ve
   * en pantalla de todas formas.
   */
  const repicar = useCallback((sonando: boolean) => {
    if (!sonando || !prendidoRef.current) {
      campana.current?.parar();
      return;
    }
    campana.current?.repicar();
  }, []);

  return { encendido, alternar, bloqueado, avisar, repicar, ajustes, cambiarAjuste };
}
