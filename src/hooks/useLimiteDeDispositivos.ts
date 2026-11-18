"use client";

import { useEffect, useRef } from "react";

import { signOut } from "@/app/actions";
import { estadoDeMiSesion, registrarDispositivo } from "@/app/sesiones-actions";
import { agenteCorto, tipoDeDispositivo } from "@/lib/dispositivo";
import { MODO_UNIFICADO } from "@/lib/marcas";
import { getBrowserClient } from "@/lib/supabase/browser";

const CADA = 60_000;

/**
 * El límite de dispositivos por rol, del lado de la pantalla (crm-peñagroup).
 *
 * Al abrir el CRM se asegura de que este navegador tenga su sesión anotada, y
 * después pregunta si sigue abierta: al volver a la pestaña y cada minuto. Si
 * otra entrada del mismo tipo de dispositivo la cerró (o la cerró
 * administración), sale y vuelve al inicio de sesión diciendo por qué.
 *
 * Fuera de crm-peñagroup no hace nada.
 */
export function useLimiteDeDispositivos(): void {
  const saliendo = useRef(false);

  useEffect(() => {
    if (!MODO_UNIFICADO) return;
    let vivo = true;

    const salir = async (motivo: "otro_dispositivo" | "administrador") => {
      if (saliendo.current) return;
      saliendo.current = true;
      try {
        await getBrowserClient().auth.signOut({ scope: "local" });
      } catch {
        // La limpieza local no puede impedir salir.
      }
      await signOut(motivo);
    };

    const revisar = async () => {
      if (!vivo || saliendo.current) return;
      let estado;
      try {
        estado = await estadoDeMiSesion();
      } catch {
        return; // Sin red: se vuelve a probar en un rato.
      }
      if (!vivo) return;
      if (estado === "sin-registrar") {
        const tactiles = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0;
        await registrarDispositivo(
          tipoDeDispositivo(navigator.userAgent, tactiles),
          agenteCorto(navigator.userAgent, tactiles),
        ).catch(() => undefined);
        return;
      }
      if (estado === "otro_dispositivo" || estado === "administrador") await salir(estado);
    };

    void revisar();
    const reloj = window.setInterval(() => void revisar(), CADA);
    const alVolver = () => {
      if (document.visibilityState === "visible") void revisar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);
}
