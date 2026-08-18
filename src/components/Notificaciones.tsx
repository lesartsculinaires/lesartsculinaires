"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listarActividad, marcarVisto } from "@/app/actividad-actions";
import { agrupar, quien, redactarGrupo, type Evento } from "@/lib/actividad";
import { cuando } from "@/lib/format";
import { T } from "@/lib/theme";
import type { Catalogo } from "@/lib/types";

interface Props {
  accent: string;
  catalogo: Catalogo;
  /** Para poder abrir la ficha desde un aviso. */
  onAbrirFicha?: (oportunidadId: number) => void;
}

/**
 * La campana: qué hizo el equipo.
 *
 * Es un panel desplegable y no un módulo aparte. Lo que se busca acá es «¿qué
 * pasó?», una mirada de pasada mientras se está en otra cosa; mandar a otra
 * pantalla obliga a perder el lugar donde uno estaba. Si algún día hace falta
 * buscar por persona o por mes, eso sí es un módulo, y esta lista no le
 * estorba.
 *
 * Ventas ve lo suyo y dirección ve todo, pero eso no se decide acá: lo hace
 * cumplir la política de la base. Este componente muestra lo que le den.
 */
export function Notificaciones({ accent, catalogo, onAbrirFicha }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [sinVer, setSinVer] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    const r = await listarActividad();
    setFaltaMigracion(r.faltaMigracion);
    if (r.ok) {
      setEventos(r.eventos);
      setSinVer(r.sinVer);
      setError(null);
    } else {
      setError(r.error);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Cerrar al hacer clic afuera y con Escape.
   *
   * Sin esto el panel se queda abierto tapando la pantalla y hay que volver a
   * apretar la campana, que es justo lo que nadie recuerda hacer.
   */
  useEffect(() => {
    if (!abierto) return;

    const afuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };

    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const alternar = async () => {
    const abriendo = !abierto;
    setAbierto(abriendo);
    if (!abriendo) return;

    await cargar();
    // El contador se apaga al abrir, no al cerrar: lo que se vio, se vio. Si
    // falla la marca no se le dice nada a nadie; el peor caso es que el número
    // vuelva a aparecer.
    setSinVer(0);
    void marcarVisto();
  };

  const grupos = agrupar(eventos);

  return (
    <div ref={caja} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => void alternar()}
        aria-label={
          sinVer > 0 ? `Notificaciones, ${sinVer} sin ver` : "Notificaciones"
        }
        aria-expanded={abierto}
        style={{
          position: "relative",
          width: 34,
          height: 34,
          display: "grid",
          placeItems: "center",
          borderRadius: 8,
          border: `1px solid ${abierto ? accent : T.border}`,
          background: abierto ? T.paper : T.surface,
          cursor: "pointer",
        }}
      >
        <Campana color={abierto ? accent : T.muted} />
        {sinVer > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              padding: "0 4px",
              display: "grid",
              placeItems: "center",
              borderRadius: 9,
              background: "#B85042",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {sinVer > 99 ? "99+" : sinVer}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Actividad del equipo"
          style={{
            position: "absolute",
            top: 42,
            right: 0,
            zIndex: 60,
            width: 380,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: 460,
            display: "flex",
            flexDirection: "column",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            boxShadow: "0 16px 44px rgba(3, 27, 79, 0.2)",
          }}
        >
          <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${T.border}` }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.ink }}>
              Actividad del equipo
            </p>
          </div>

          <div style={{ overflowY: "auto" }}>
            {faltaMigracion ? (
              <Mensaje>
                Para ver la actividad falta correr la migración{" "}
                <code>20260823120000_actividad.sql</code> en Supabase.
              </Mensaje>
            ) : error ? (
              <Mensaje tono={T.warn}>No se pudo leer la actividad: {error}</Mensaje>
            ) : cargando ? (
              <Mensaje>Cargando…</Mensaje>
            ) : grupos.length === 0 ? (
              <Mensaje>
                Todavía no hay nada registrado. Lo que haga el equipo aparece acá.
              </Mensaje>
            ) : (
              grupos.map((g, i) => {
                const e = g.evento;
                const abrible = e.oportunidadId != null && onAbrirFicha != null;
                return (
                  <div
                    key={e.id}
                    onClick={() => {
                      if (!abrible) return;
                      onAbrirFicha(e.oportunidadId as number);
                      setAbierto(false);
                    }}
                    style={{
                      padding: "9px 14px",
                      borderTop: i ? `1px solid ${T.border}` : "none",
                      cursor: abrible ? "pointer" : "default",
                    }}
                  >
                    <div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.45 }}>
                      {redactarGrupo(g, catalogo)}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: T.faint }}>
                      {quien(e.actor)} · {cuando(e.creadoEn)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Mensaje({ children, tono = T.muted }: { children: React.ReactNode; tono?: string }) {
  return (
    <p style={{ margin: 0, padding: "16px 14px", fontSize: 12, color: tono, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

function Campana({ color }: { color: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a6 6 0 0 0-6 6v3.6l-1.4 2.6A.8.8 0 0 0 5.3 17h13.4a.8.8 0 0 0 .7-1.2L18 12.6V9a6 6 0 0 0-6-6Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9.6 20a2.6 2.6 0 0 0 4.8 0" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
