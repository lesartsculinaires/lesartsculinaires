"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Una ventana que interrumpe como mucho una vez por día.
 *
 * El CRM se refresca solo cada diez minutos y la gente deja la pestaña abierta
 * todo el día. Sin este freno, el aviso de reservas saltaría seis veces por
 * hora, y a la tercera se cierra sin leer —que es lo mismo que no tenerlo,
 * pero molestando—.
 *
 * Se recuerda el día, no un «ya lo vi»: al día siguiente vuelve a aparecer,
 * porque al día siguiente la reserva está un día más vencida.
 *
 * Es por navegador y a propósito. Posponer un aviso concreto sí se guarda en
 * la base y vale en todas las computadoras; esto otro es nada más «hoy ya me
 * lo mostraste acá», y no vale la pena una fila en la base por eso.
 */
export function useAvisoDiario(llave: string, hayAlgoQueMostrar: boolean) {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if (!hayAlgoQueMostrar) return;

    // Se lee después del primer dibujado, no durante: el servidor no tiene
    // manera de saber qué vio esta computadora, y decidirlo mientras se dibuja
    // haría que lo pintado no coincida con lo que mandó.
    let visto: string | null = null;
    try {
      visto = window.localStorage.getItem(llave);
    } catch {
      // Navegador con el almacenamiento bloqueado. Se muestra igual: molestar
      // de más es mejor que callar un aviso de plata.
    }

    if (visto !== hoyComoTexto()) setMostrar(true);
  }, [llave, hayAlgoQueMostrar]);

  const cerrar = useCallback(() => {
    setMostrar(false);
    try {
      window.localStorage.setItem(llave, hoyComoTexto());
    } catch {
      // Si no se puede anotar, el aviso vuelve en la próxima recarga. Es
      // molesto, no roto.
    }
  }, [llave]);

  return { mostrar, cerrar };
}

/**
 * El día de hoy como «2026-08-21», en hora local.
 *
 * En local y no en UTC porque el día tiene que cambiar cuando cambia para la
 * persona. En El Salvador son seis horas de diferencia: con UTC, el aviso se
 * daría por visto de nuevo a las seis de la tarde.
 */
function hoyComoTexto(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}
