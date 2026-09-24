"use client";

import { useEffect, useRef, useState } from "react";

import {
  avisosDeAgenda,
  llaveDelAviso,
  type AvisoDeEvento,
  type Quien,
} from "@/lib/avisoDeEvento";
import type { Evento } from "@/lib/types";

/**
 * El reloj que dispara el aviso de agenda.
 *
 * ============================================================================
 * POR QUÉ UN RELOJ PROPIO Y NO EL REFRESCO DEL CRM
 * ============================================================================
 *
 * El CRM vuelve a pedir los datos cada minuto, y podría alcanzar. Pero el
 * refresco depende de la red: si Supabase tarda, o la computadora estuvo
 * suspendida, la vuelta se saltea y con ella el aviso. Un reloj local de medio
 * minuto no depende de nada y vuelve a mirar los eventos que ya están en
 * memoria, que es todo lo que hace falta para saber que faltan diez minutos.
 *
 * ============================================================================
 * CADA AVISO SE DA UNA VEZ
 * ============================================================================
 *
 * En los diez minutos previos el reloj pasa veinte veces. Sin memoria, el
 * cartel volvería a saltar en cada vuelta apenas se cierre, y el sonido
 * también: eso no es un recordatorio, es un acoso.
 *
 * Lo recordado es la llave del aviso —id más hora de inicio—, así que
 * reagendar la llamada para más tarde vuelve a avisar, que es lo correcto.
 *
 * Se recuerda en memoria y no en `localStorage` a propósito: si alguien
 * recarga la página cinco minutos antes de la llamada, que el aviso vuelva a
 * saltar es lo que se quiere. Lo que se está evitando es la repetición dentro
 * de la misma sesión, no la segunda oportunidad.
 */

export interface AvisoEnPantalla {
  /** Lo que hay que mostrar ahora. Vacío cuando no hay nada. */
  pendientes: AvisoDeEvento[];
  /** Descartar uno: se va de la pantalla y no vuelve en esta sesión. */
  descartar: (evento: Evento) => void;
}

export function useAvisoDeEvento(
  eventos: readonly Evento[],
  quien: Quien,
  /** El nombre del cliente y del tipo, para el aviso del navegador. */
  describir: (evento: Evento) => string,
): AvisoEnPantalla {
  const [pendientes, setPendientes] = useState<AvisoDeEvento[]>([]);
  // Lo ya avisado en esta sesión. En una referencia y no en estado: cambiarlo
  // no tiene que redibujar nada, y dentro del intervalo se necesita el valor
  // de ahora, no el de cuando se creó la función.
  const yaAvisados = useRef<Set<string>>(new Set());
  const descartados = useRef<Set<string>>(new Set());

  // Los eventos cambian en cada refresco del CRM; el intervalo no se puede
  // rearmar por eso o nunca llegaría a cumplirse.
  const ultimos = useRef(eventos);
  ultimos.current = eventos;
  const quienRef = useRef(quien);
  quienRef.current = quien;
  const describirRef = useRef(describir);
  describirRef.current = describir;

  useEffect(() => {
    const mirar = () => {
      const debidos = avisosDeAgenda(ultimos.current, quienRef.current, new Date());

      const nuevos = debidos.filter((a) => {
        const llave = llaveDelAviso(a.evento);
        return !yaAvisados.current.has(llave) && !descartados.current.has(llave);
      });

      if (nuevos.length === 0) {
        // Los que ya no corresponden —pasó la hora, o se marcaron realizados—
        // se van solos de la pantalla.
        setPendientes((antes) =>
          antes.filter((a) =>
            debidos.some((d) => llaveDelAviso(d.evento) === llaveDelAviso(a.evento)),
          ),
        );
        return;
      }

      for (const a of nuevos) {
        yaAvisados.current.add(llaveDelAviso(a.evento));
        avisarAlNavegador(describirRef.current(a.evento));
      }

      setPendientes((antes) => [...antes, ...nuevos]);
    };

    mirar();
    const t = setInterval(mirar, 30_000);
    return () => clearInterval(t);
  }, []);

  const descartar = (evento: Evento) => {
    const llave = llaveDelAviso(evento);
    descartados.current.add(llave);
    setPendientes((antes) => antes.filter((a) => llaveDelAviso(a.evento) !== llave));
  };

  return { pendientes, descartar };
}

/**
 * El aviso del sistema operativo, para cuando el CRM está en otra pestaña.
 *
 * Es la mitad que hace que esto sirva de verdad. Quien atiende la bandeja
 * pasa el día con el CRM abierto pero no siempre a la vista: un cartel dentro
 * de una pestaña que nadie está mirando no avisa nada.
 *
 * Si el permiso no está dado, NO se pide acá. Pedirlo desde un temporizador
 * hace saltar el cuadro del navegador sin que nadie haya tocado nada, y en ese
 * momento lo que se aprieta es «bloquear» —y entonces no hay forma de volver a
 * pedirlo—. El permiso se pide desde el cartel, con un botón, que es cuando la
 * persona ya entendió para qué es.
 */
function avisarAlNavegador(texto: string): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification("Les Arts Culinaires", { body: texto, tag: texto });
  } catch {
    // Navegador sin permisos, en un iframe, o con las notificaciones
    // desactivadas. El cartel en pantalla sigue estando.
  }
}

/** ¿Se pueden mandar avisos del sistema? `null` mientras no se decidió. */
export function permisoDeAvisos(): NotificationPermission | null {
  try {
    if (typeof Notification === "undefined") return null;
    return Notification.permission;
  } catch {
    return null;
  }
}

/** Pedirlo, con un gesto de por medio. Devuelve cómo quedó. */
export async function pedirPermisoDeAvisos(): Promise<NotificationPermission | null> {
  try {
    if (typeof Notification === "undefined") return null;
    return await Notification.requestPermission();
  } catch {
    return null;
  }
}
