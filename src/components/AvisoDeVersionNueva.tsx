"use client";

import { useEffect, useState } from "react";

/** La versión con la que se compiló esta pantalla. */
const ESTA = process.env.VERSION_DEL_CRM ?? "desarrollo";

/** Cada cuánto se pregunta, además de al volver a la pestaña. */
const CADA_MS = 3 * 60_000;

/**
 * Avisa que se publicó una versión nueva del CRM, antes de que algo falle.
 *
 * Una pestaña abierta durante un despliegue sigue con el programa viejo. Casi
 * todo sigue andando —las acciones del servidor ya no cambian de nombre entre
 * versiones, ver `next.config.ts`—, pero lo que se agregó o se cambió en la
 * versión nueva no está en esa pestaña. Pasó el 14 y el 15 de octubre de 2026:
 * guardar una etapa y mandar un PDF fallaron con un error en inglés.
 *
 * Si la pestaña está escondida se recarga sola: nadie la está mirando y el
 * borrador del chat queda guardado. Si está a la vista se avisa con un botón,
 * para no recargarle la pantalla a nadie en medio de algo.
 */
export function AvisoDeVersionNueva() {
  const [hayOtra, setHayOtra] = useState(false);

  useEffect(() => {
    if (ESTA === "desarrollo") return;
    let vivo = true;

    const preguntar = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { version } = (await r.json()) as { version?: string };
        if (!vivo || !version || version === "desarrollo" || version === ESTA) return;
        if (document.visibilityState === "hidden") window.location.reload();
        else setHayOtra(true);
      } catch {
        // Sin conexión: se vuelve a preguntar en la próxima vuelta.
      }
    };

    const alVolver = () => {
      if (document.visibilityState === "visible") void preguntar();
    };
    const reloj = window.setInterval(() => {
      void preguntar();
    }, CADA_MS);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  if (!hayOtra) return null;

  return (
    <div
      role="status"
      data-version-nueva
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 14px",
        marginBottom: 14,
        borderRadius: 9,
        background: "#E8EEF9",
        color: "#031B4F",
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      <span>
        Se publicó una versión nueva del CRM. Recargá para tenerla: lo que estás escribiendo en el
        chat queda guardado.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: "4px 12px",
          borderRadius: 6,
          border: "1px solid #031B4F",
          background: "#031B4F",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Recargar
      </button>
    </div>
  );
}
