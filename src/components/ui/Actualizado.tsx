"use client";

import { useEffect, useState } from "react";

import { T } from "@/lib/theme";
import type { EstadoEnVivo } from "@/hooks/useEnVivo";

interface Props {
  /** Momento en que llegaron los últimos datos del servidor. */
  en: number | null;
  accent: string;
  enVivo: EstadoEnVivo;
  onRefrescar: () => void;
}

function hace(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "recién";
  if (min === 1) return "hace 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
}

/**
 * Cuándo se trajeron los datos por última vez, y un botón para no esperar.
 *
 * Sin esto el refresco automático sería invisible: los números de la pantalla
 * cambiarían solos cada tanto sin que nadie sepa por qué, y no habría forma de
 * saber si lo que se está viendo es de hace un minuto o de hace media hora
 * porque la laptop estuvo cerrada.
 */
export function Actualizado({ en, accent, enVivo, onRefrescar }: Props) {
  const [ahora, setAhora] = useState(() => Date.now());

  // El texto es relativo, así que envejece solo aunque no llegue nada nuevo.
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // En el servidor todavía no se sabe la hora del navegador; se pinta al montar
  // para no arriesgar un desajuste de hidratación.
  if (en == null) return null;

  // "En vivo" sólo cuando los avisos llegan de verdad. Unirse al canal no
  // alcanza: sin las tablas publicadas la suscripción se acepta igual y no
  // llega nada, y un punto verde mintiendo es peor que no poner nada.
  const vivo = enVivo === "conectado";
  const caido = enVivo === "sin-conexion";
  const sinPublicar = enVivo === "sin-publicar";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {vivo ? (
        <span
          className="mono"
          title="Los cambios de otras personas aparecen solos"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.muted }}
        >
          <span
            aria-hidden
            style={{ width: 6, height: 6, borderRadius: "50%", background: "#2F6B4F" }}
          />
          En vivo
        </span>
      ) : (
        <span className="mono" style={{ fontSize: 11.5, color: T.faint }}>
          Actualizado {hace(Math.max(0, ahora - en))}
        </span>
      )}

      {/*
        Cuando los avisos no llegan, el cartel dice además QUÉ REVISAR.

        Antes decía sólo «sin conexión en vivo», y con eso no se puede hacer
        nada: no distingue la red de la oficina de una base sin configurar, que
        se arreglan en lugares distintos. Y el caso de «falta la migración» ni
        siquiera se veía —vivía en el título de un texto que nadie sobrevuela—,
        así que un CRM sin cambios en vivo se veía igual que uno al día.
      */}
      {(caido || sinPublicar) && (
        <span
          className="mono"
          title={
            sinPublicar
              ? "Las tablas no están publicadas para cambios en vivo. Corré la migración 20260813213000_cambios_en_vivo.sql en Supabase. Mientras tanto la pantalla se actualiza sola cada minuto."
              : "No llega la conexión en vivo: puede ser la red de acá, o que Realtime esté apagado en el proyecto de Supabase. Mientras tanto la pantalla se actualiza sola cada minuto."
          }
          style={{ fontSize: 11.5, color: T.warn, cursor: "help" }}
        >
          {sinPublicar ? "en vivo sin activar" : "sin conexión en vivo"}
        </span>
      )}
      <button
        type="button"
        onClick={onRefrescar}
        title="Traer los datos ahora mismo"
        style={{
          fontSize: 11.5,
          padding: "3px 9px",
          borderRadius: 20,
          border: `1px solid ${T.border}`,
          color: accent,
          background: T.surface,
        }}
      >
        Actualizar
      </button>
    </span>
  );
}
