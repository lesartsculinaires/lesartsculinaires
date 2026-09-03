"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { archivar, marcar, type Marca } from "@/app/whatsapp-actions";
import { T } from "@/lib/theme";
import type { Conversacion } from "@/lib/types";

/**
 * Las acciones secundarias de un hilo, en el «⋮» de su fila.
 *
 * ============================================================================
 * POR QUÉ EN LA LISTA Y NO ADENTRO DE LA CONVERSACIÓN
 * ============================================================================
 *
 * Porque son decisiones que se toman recorriendo la bandeja, no leyendo un
 * hilo. «Esta la dejo pendiente», «ésta la fijo», «ésta la archivo» se piensan
 * mirando las cuarenta juntas. Hasta ahora archivar estaba únicamente en el
 * encabezado de la conversación abierta, así que archivar cinco hilos era
 * entrar y salir cinco veces.
 *
 * Y una de ellas ni siquiera se puede hacer desde adentro: marcar sin leer.
 * Abrir el hilo lo marca leído —así funciona la bandeja— así que un botón de
 * «pendiente» adentro estaría peleando con el efecto que acaba de correr. Por
 * eso al marcarla se cierra la conversación, que además es lo que hace
 * WhatsApp Web y lo que la persona espera: la deja en la fila y sigue.
 *
 * ============================================================================
 * NINGUNA DE ESTAS SALE A META
 * ============================================================================
 *
 * Son marcas del CRM. El cliente no se entera, no gastan cuota de la API y no
 * hay nada que aprobar. Es la parte de la bandeja que se puede mejorar sin
 * depender de nadie.
 */

interface Props {
  conversacion: Conversacion;
  accent: string;
  /** Está abierta en el panel de la derecha: marcarla pendiente la cierra. */
  abierta: boolean;
  onCambio: () => void;
  onCerrar: () => void;
  /**
   * Abrir la ficha del lead de este hilo.
   *
   * Nulo cuando esa persona todavía no tiene lead. El menú entonces no ofrece
   * la opción, en vez de ofrecerla y llevar a otra pantalla: lo que hace falta
   * en ese caso es abrirle el lead, y eso se hace desde el hilo abierto, donde
   * se ve de quién se trata.
   */
  onVerFicha: (() => void) | null;
}

export function AccionesDelHilo({
  conversacion: c,
  accent,
  abierta,
  onCambio,
  onCerrar,
  onVerFicha,
}: Props) {
  const [menu, setMenu] = useState(false);
  const [haciaArriba, setHaciaArriba] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;

    const afuera = (ev: MouseEvent) => {
      if (caja.current && !caja.current.contains(ev.target as Node)) setMenu(false);
    };
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setMenu(false);
    };

    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [menu]);

  /**
   * Abre para el lado donde entra.
   *
   * La lista de hilos tiene su propio scroll, así que un menú que siempre
   * abriera hacia abajo quedaría cortado por el borde del panel en las últimas
   * filas —justo las archivadas viejas, que son las que uno anda buscando—. Se
   * mide dónde está la fila y se decide.
   */
  const abrir = () => {
    setError(null);
    if (!menu && caja.current) {
      const caja1 = caja.current.getBoundingClientRect();
      setHaciaArriba(window.innerHeight - caja1.bottom < ALTO_DEL_MENU);
    }
    setMenu((v) => !v);
  };

  const hacer = async (accion: () => Promise<{ ok: boolean; error: string | null }>) => {
    setTrabajando(true);
    setError(null);
    const r = await accion();
    setTrabajando(false);
    if (!r.ok) {
      // El menú se queda abierto a propósito: el error explica que falta una
      // migración, y cerrarlo dejaría a la persona tocando un botón que no
      // hace nada sin saber nunca por qué.
      setError(r.error);
      return;
    }
    setMenu(false);
    onCambio();
  };

  const marcarla = (m: Marca, puesta: boolean) => hacer(() => marcar(c.id, m, puesta));

  return (
    <div ref={caja} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={abrir}
        title="Más acciones"
        aria-label={`Más acciones de ${c.nombrePerfil ?? c.telefono}`}
        aria-expanded={menu}
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          fontSize: 15,
          lineHeight: "22px",
          color: menu ? accent : T.faint,
          background: menu ? T.paper : "transparent",
          cursor: "pointer",
        }}
      >
        ⋮
      </button>

      {menu && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: haciaArriba ? undefined : "calc(100% + 4px)",
            bottom: haciaArriba ? "calc(100% + 4px)" : undefined,
            zIndex: 90,
            width: 214,
            padding: 5,
            background: T.surface,
            border: `1px solid ${T.borderStrong}`,
            borderRadius: 9,
            boxShadow: "0 14px 30px rgba(3,27,79,0.16)",
          }}
        >
          {/*
            «Sin leer» tiene dos textos porque son dos cosas distintas. Con la
            marca puesta, lo que se ofrece es sacarla; sin ella, ponerla. Un
            solo texto que dijera «Sin leer» las dos veces no diría qué va a
            pasar al tocarlo.
          */}
          <button
            type="button"
            role="menuitem"
            disabled={trabajando}
            onClick={() => {
              const quitando = c.noLeida;
              /*
               * Se cierra ANTES de marcar, no después.
               *
               * Marcarla pendiente dejándola abierta se anula solo: el efecto
               * de «abrirla es haberla leído» corre en cuanto llega el
               * refresco y la vuelve a apagar. Cerrarla primero saca del medio
               * a ese efecto, y además es lo que uno espera: la dejo pendiente
               * y sigo con la lista.
               */
              if (!quitando && abierta) onCerrar();
              void marcarla("no_leida", !quitando);
            }}
            style={item}
          >
            {c.noLeida ? "✓ Quitar de pendientes" : "● Marcar como no leída"}
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={trabajando}
            onClick={() => void marcarla("fijada", !c.fijada)}
            style={item}
          >
            {c.fijada ? "📌 Quitar de arriba" : "📌 Fijar arriba"}
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={trabajando}
            onClick={() => void marcarla("silenciada", !c.silenciada)}
            style={item}
          >
            {c.silenciada ? "🔔 Volver a avisar" : "🔕 Silenciar"}
          </button>

          <span style={{ display: "block", height: 1, margin: "4px 2px", background: T.border }} />

          <button
            type="button"
            role="menuitem"
            disabled={trabajando}
            onClick={() => void hacer(() => archivar(c.id, !c.archivada))}
            style={item}
          >
            {c.archivada ? "↩ Desarchivar" : "📁 Archivar"}
          </button>

          {onVerFicha && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onVerFicha();
              }}
              style={item}
            >
              👤 Ver ficha
            </button>
          )}

          {error && (
            <p
              role="alert"
              style={{
                margin: "5px 2px 1px",
                fontSize: 11,
                lineHeight: 1.45,
                color: "#9E2F29",
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Lo que mide el menú desplegado, para saber si entra debajo de la fila. */
const ALTO_DEL_MENU = 210;

const item: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "7px 9px",
  borderRadius: 6,
  fontSize: 12.5,
  color: T.ink,
  background: "transparent",
  cursor: "pointer",
};
