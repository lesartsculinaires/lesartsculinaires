"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  VENTANA_MS,
  proximoIntento,
  queHacerConElError,
  type ReporteDeError,
} from "@/lib/recuperarse";
import { COOKIE_MODULO } from "@/lib/ultimoModulo";

type ErrorDeNext = Error & { digest?: string };

/**
 * Las fallas de esta pestaña.
 *
 * En la página van en memoria: cada falla vuelve a montar este componente, así
 * que adentro de él se olvidarían. En la raíz se recarga la página entera y la
 * memoria se pierde, así que van en `sessionStorage` —sin eso, una raíz que
 * falla siempre recargaría para siempre—.
 */
const fallasEnMemoria: number[] = [];
const CLAVE_FALLAS = "lac.fallas";

function anotarFalla(persistir: boolean): number[] {
  const ahora = Date.now();
  let previas: number[] = fallasEnMemoria;
  if (persistir) {
    try {
      const leidas = JSON.parse(sessionStorage.getItem(CLAVE_FALLAS) ?? "[]");
      if (Array.isArray(leidas)) previas = leidas.filter((x) => typeof x === "number");
    } catch {
      // Sin almacenamiento —ventana privada, permisos—: se cuenta en memoria.
    }
  }
  const recientes = [...previas, ahora].filter((t) => ahora - t <= VENTANA_MS);
  fallasEnMemoria.splice(0, fallasEnMemoria.length, ...recientes);
  if (persistir) {
    try {
      sessionStorage.setItem(CLAVE_FALLAS, JSON.stringify(recientes));
    } catch {
      // Ídem.
    }
  }
  return recientes;
}

/** Tope de reportes por pestaña: un error que se repite no tiene que inundar la tabla. */
let reportesMandados = 0;

function moduloActual(): string | null {
  try {
    const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_MODULO}=`));
    return par ? decodeURIComponent(par.slice(COOKIE_MODULO.length + 1)) : null;
  } catch {
    return null;
  }
}

/**
 * Le cuenta la falla al servidor, que la deja en `errores_cliente`.
 *
 * Hasta ahora, cuando la pantalla se ponía blanca, lo único que quedaba era una
 * foto del monitor: el error de verdad estaba en la consola del navegador de
 * esa persona y se perdía al recargar. Con esto queda cuál fue, en qué
 * pantalla y a qué hora, y se puede ir a buscarlo.
 *
 * `keepalive` es para que llegue aunque lo que sigue sea recargar la página.
 * Si no llega, no pasa nada: recuperarse importa más que contarlo.
 */
function contarAlServidor(error: ErrorDeNext, donde: ReporteDeError["donde"], intento: number) {
  if (reportesMandados >= 10) return;
  reportesMandados += 1;
  const reporte: ReporteDeError = {
    mensaje: error?.message || String(error),
    nombre: error?.name ?? null,
    pila: error?.stack ?? null,
    digest: error?.digest ?? null,
    url: typeof location !== "undefined" ? location.pathname + location.search : null,
    modulo: moduloActual(),
    donde,
    intento,
  };
  try {
    void fetch("/api/errores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reporte),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ídem.
  }
}

/** Recarga entera, pero no en bucle: si recién se recargó por lo mismo, se deja quieta. */
function recargarUnaVez(): boolean {
  const CLAVE = "lac.recargado";
  try {
    const antes = Number(sessionStorage.getItem(CLAVE) ?? 0);
    if (Date.now() - antes < 30_000) return false;
    sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    // Sin almacenamiento no hay cómo saber si es un bucle: se recarga igual.
  }
  window.location.reload();
  return true;
}

/**
 * La pantalla que reemplaza a la blanca, y que se arregla sola.
 *
 * `reintentar` es lo único que cambia entre la página y la raíz: en la página
 * alcanza con volver a pedir los datos —`router.refresh()` y `reset()` juntos,
 * que es lo que recomienda Next para fallas del servidor—; en la raíz no queda
 * nada en pie que refrescar y se recarga entera.
 */
function Recuperacion({
  error,
  donde,
  reintentar,
}: {
  error: ErrorDeNext;
  donde: ReporteDeError["donde"];
  reintentar: () => void;
}) {
  /** Cuántos milisegundos falta para el próximo intento; `null` si ya no se insiste. */
  const [plan, setPlan] = useState<number | null>(ESPERA_INICIAL);
  const [sinRed, setSinRed] = useState(false);

  useEffect(() => {
    const fallas = anotarFalla(donde === "raiz");
    // Para quien abra la consola: lo de siempre, con su pila.
    console.error("[CRM] la pantalla falló; se recupera sola", error);
    contarAlServidor(error, donde, fallas.length);

    if (queHacerConElError(error) === "recargar" && recargarUnaVez()) return;

    const espera = proximoIntento(fallas, Date.now());
    setPlan(espera);
    if (espera == null) return;

    /*
     * Sin red no se reintenta: `router.refresh()` sin conexión hace que Next
     * recargue la página entera, y el navegador mostraría su propia pantalla
     * de «sin internet». Mejor quedarse acá y volver cuando vuelva la red.
     */
    const intentar = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setSinRed(true);
        return;
      }
      reintentar();
    };
    const reloj = window.setTimeout(intentar, espera);
    const alVolverLaRed = () => {
      setSinRed(false);
      window.clearTimeout(reloj);
      window.setTimeout(reintentar, 800);
    };
    window.addEventListener("online", alVolverLaRed);
    return () => {
      window.clearTimeout(reloj);
      window.removeEventListener("online", alVolverLaRed);
    };
    // `reintentar` se arma de nuevo en cada dibujado y no es motivo para
    // reprogramar: lo que cuenta es que llegó una falla nueva.
  }, [error, donde]);

  return (
    <main
      role="alert"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#031B4F",
        background: "#F4F6FB",
      }}
    >
      <div style={{ maxWidth: 440, textAlign: "center", lineHeight: 1.55 }}>
        <h1 style={{ fontSize: 20, marginBottom: 10 }}>Se cortó la conexión con el CRM</h1>
        <p style={{ fontSize: 14, color: "#4C5A7A", marginBottom: 18 }}>
          {sinRed
            ? "Esta computadora se quedó sin internet. En cuanto vuelva, el CRM se vuelve a cargar solo."
            : plan != null
              ? "Lo estamos volviendo a cargar solo, en unos segundos. No hace falta que hagas nada."
              : "Ya lo intentamos varias veces y no se pudo. Revisá que haya internet y recargá la página."}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={reintentar}
            style={{
              padding: "9px 18px",
              borderRadius: 6,
              border: "none",
              background: "#031B4F",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reintentar ahora
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "9px 18px",
              borderRadius: 6,
              border: "1px solid #031B4F",
              background: "transparent",
              color: "#031B4F",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Recargar la página
          </button>
        </div>
      </div>
    </main>
  );
}

/** Lo que se muestra antes de decidir: igual al primer intento, para no parpadear. */
const ESPERA_INICIAL = 1_500;

/** Para `app/error.tsx`: falló la página, el resto sigue en pie. */
export function RecuperacionDeLaPagina({ error, reset }: { error: ErrorDeNext; reset: () => void }) {
  const router = useRouter();
  return (
    <Recuperacion
      error={error}
      donde="pagina"
      reintentar={() =>
        startTransition(() => {
          router.refresh();
          reset();
        })
      }
    />
  );
}

/** Para `app/global-error.tsx`: falló hasta el armazón, se recarga entera. */
export function RecuperacionDeLaRaiz({ error }: { error: ErrorDeNext }) {
  return <Recuperacion error={error} donde="raiz" reintentar={() => window.location.reload()} />;
}
