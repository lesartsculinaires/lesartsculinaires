"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { GRUPOS, buscar, type Emoji } from "@/lib/emojis";
import { T } from "@/lib/theme";

/**
 * El teclado de emojis del cuadro de mensaje.
 *
 * ============================================================================
 * QUÉ RESUELVE
 * ============================================================================
 *
 * Que se puedan mandar emojis sin salir del CRM. Hasta ahora la única forma era
 * el teclado del sistema operativo —que hay que saber invocar, que en Windows
 * no siempre está a mano y que en una laptop compartida nadie tiene
 * configurado— o copiar y pegar de otro lado. El resultado práctico era que los
 * mensajes del CRM salían secos comparados con los que la misma persona escribe
 * desde su celular, y eso se nota del otro lado.
 *
 * ============================================================================
 * LAS DECISIONES QUE NO SE VEN
 * ============================================================================
 *
 *   LOS RECIENTES PRIMERO   Se usan siempre los mismos ocho o diez. Tenerlos
 *                           arriba ahorra el recorrido entero, y son distintos
 *                           para cada persona: se guardan en su navegador, no
 *                           en la base. Es una comodidad, no un dato del CRM.
 *
 *   SE QUEDA ABIERTO        Elegir uno no lo cierra. Casi nunca se manda un
 *                           emoji solo —van dos o tres juntos— y cerrarse
 *                           después de cada uno obligaría a abrirlo tres veces
 *                           para escribir «🎉🎂✨».
 *
 *   NO ROBA EL FOCO         El buscador se enfoca al abrir, pero al elegir un
 *                           emoji el cursor vuelve al mensaje, en la posición
 *                           donde estaba. De eso se encarga quien lo usa, con
 *                           `insertarEnCursor`.
 */

/** Cuántos recientes se recuerdan. Dos filas: más ya no se recorre con la vista. */
const CUANTOS_RECIENTES = 16;
const LLAVE = "lac.emojis.recientes";

/**
 * Los últimos usados, del navegador de cada quien.
 *
 * Todo va adentro de `try`: en una ventana privada, o con las cookies de sitio
 * bloqueadas, `localStorage` no falla devolviendo vacío sino que lanza. Sin
 * esto, esa configuración del navegador dejaría el selector entero sin abrir.
 */
const leerRecientes = (): string[] => {
  try {
    const crudo = localStorage.getItem(LLAVE);
    const lista: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const guardarReciente = (e: string, previos: string[]): string[] => {
  // El elegido primero y sin repetirse: usar uno que ya estaba lo mueve al
  // frente en vez de dejar dos iguales.
  const lista = [e, ...previos.filter((x) => x !== e)].slice(0, CUANTOS_RECIENTES);
  try {
    localStorage.setItem(LLAVE, JSON.stringify(lista));
  } catch {
    // Que no se recuerden es una molestia menor; que reviente, no.
  }
  return lista;
};

/**
 * La caja con el buscador, las pestañas y la rejilla.
 *
 * Va aparte del botón porque hay dos maneras de llegar a ella y sólo la
 * primera necesita un botón propio: desde el cuadro de mensaje —el 🙂 de la
 * barra— y desde las reacciones de un mensaje, donde lo que se abre primero es
 * la fila de los seis de siempre y esto aparece recién al pedir «más».
 *
 * No se posiciona sola: quien la usa la mete adentro de su propio contenedor
 * absoluto, que es el que sabe hacia dónde hay lugar.
 */
export function PanelEmoji({
  onElegir,
  accent,
}: {
  onElegir: (emoji: string) => void;
  accent: string;
}) {
  const [grupo, setGrupo] = useState(0);
  const [q, setQ] = useState("");
  const [recientes, setRecientes] = useState<string[]>([]);
  const buscador = useRef<HTMLInputElement | null>(null);

  // Se leen al aparecer y no una vez para siempre: en una bandeja con cuarenta
  // hilos este componente se monta y se desmonta todo el tiempo, y lo guardado
  // puede haber cambiado en otra pestaña.
  useEffect(() => {
    setRecientes(leerRecientes());
    buscador.current?.focus();
  }, []);

  const hallados = useMemo(() => buscar(q), [q]);
  const buscando = q.trim() !== "";

  const elegir = (e: string) => {
    setRecientes((previos) => guardarReciente(e, previos));
    onElegir(e);
  };

  const rejilla = (emojis: readonly Emoji[]) => (
    <div
      style={{
        display: "grid",
        /*
         * `minmax(0, 1fr)` y no `1fr` a secas.
         *
         * Un `1fr` no baja del ancho mínimo de su contenido, y el contenido es
         * un emoji de 19px: cuando aparece la barra de desplazamiento —siempre,
         * porque la lista no entra— las ocho columnas ya no caben y la última
         * queda cortada por el borde del panel. Con `minmax(0, …)` se dejan
         * encoger y entran las ocho.
         */
        gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
        gap: 2,
      }}
    >
      {emojis.map((em) => (
        <button
          key={em.e}
          type="button"
          title={em.nombre.split(" ")[0]}
          aria-label={em.nombre}
          onClick={() => elegir(em.e)}
          style={{
            height: 30,
            fontSize: 19,
            lineHeight: "30px",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          {/* El amarillo al pasar por encima lo pone la hoja de estilos general
              —vale para todo botón del CRM—, así que acá no va nada. */}
          {em.e}
        </button>
      ))}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-label="Elegir un emoji"
      style={{
        width: 306,
        background: T.surface,
        border: `1px solid ${T.borderStrong}`,
        borderRadius: 10,
        boxShadow: "0 16px 34px rgba(3,27,79,0.18)",
        padding: 8,
      }}
    >
      <input
        ref={buscador}
        value={q}
        onChange={(ev) => setQ(ev.target.value)}
        placeholder="Buscar: pastel, gracias, fuego…"
        aria-label="Buscar un emoji"
        style={{
          width: "100%",
          height: 30,
          padding: "0 9px",
          marginBottom: 7,
          fontSize: 12.5,
          border: `1px solid ${T.border}`,
          borderRadius: 7,
          background: T.paper,
          color: T.ink,
        }}
      />

      {/* Las pestañas se esconden mientras se busca: lo que se ve entonces no
          es un grupo, y dejar una marcada diría que sí. */}
      {!buscando && (
        <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
          {GRUPOS.map((gr, i) => (
            <button
              key={gr.titulo}
              type="button"
              onClick={() => setGrupo(i)}
              title={gr.titulo}
              aria-label={gr.titulo}
              style={{
                flex: 1,
                height: 28,
                fontSize: 16,
                borderRadius: 6,
                background: grupo === i ? T.paper : "transparent",
                borderBottom: `2px solid ${grupo === i ? accent : "transparent"}`,
                cursor: "pointer",
              }}
            >
              {gr.icono}
            </button>
          ))}
        </div>
      )}

      <div style={{ maxHeight: 214, overflowY: "auto", paddingRight: 2 }}>
        {buscando ? (
          hallados.length === 0 ? (
            <p style={{ margin: "14px 6px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
              No hay ninguno que se llame «{q.trim()}». Probá con una palabra
              más corta: «past», «gra», «fue».
            </p>
          ) : (
            rejilla(hallados)
          )
        ) : (
          <>
            {/* Los recientes sólo en la primera pestaña: repetirlos arriba de
                cada grupo sería la misma fila cinco veces. */}
            {grupo === 0 && recientes.length > 0 && (
              <>
                <p style={titulito}>Los que más usás</p>
                {rejilla(recientes.map((e) => ({ e, nombre: e })))}
                <p style={titulito}>{GRUPOS[0].titulo}</p>
              </>
            )}
            {rejilla(GRUPOS[grupo].emojis)}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * El botón 🙂 del cuadro de mensaje, con su panel.
 *
 * Se queda abierto al elegir: casi nunca se manda un emoji solo —van dos o
 * tres juntos— y cerrarse después de cada uno obligaría a abrirlo tres veces
 * para escribir «🎉🎂✨».
 */
export function SelectorEmoji({
  onElegir,
  accent,
  disabled = false,
  title = "Emojis",
}: {
  onElegir: (emoji: string) => void;
  accent: string;
  disabled?: boolean;
  title?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);

  /*
   * Cerrar con Escape o tocando afuera.
   *
   * `mousedown` y no `click`: con `click`, tocar un botón del propio panel
   * dispara primero el cierre de afuera y después el botón, sobre algo que ya
   * no está.
   */
  useEffect(() => {
    if (!abierto) return;

    const afuera = (ev: MouseEvent) => {
      if (caja.current && !caja.current.contains(ev.target as Node)) setAbierto(false);
    };
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setAbierto(false);
    };

    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div ref={caja} style={{ position: "relative", alignSelf: "flex-end" }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={disabled}
        title={disabled ? "No se puede escribir en este momento" : title}
        aria-label="Emojis"
        aria-expanded={abierto}
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          border: `1px solid ${abierto ? accent : T.border}`,
          background: T.surface,
          color: disabled ? T.faint : T.ink,
          fontSize: 17,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        🙂
      </button>

      {abierto && (
        <div
          style={{
            position: "absolute",
            // Hacia arriba: el cuadro de mensaje está pegado al piso de la
            // pantalla y un panel que abriera hacia abajo quedaría afuera.
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 80,
          }}
        >
          <PanelEmoji onElegir={onElegir} accent={accent} />
        </div>
      )}
    </div>
  );
}

const titulito: CSSProperties = {
  margin: "2px 2px 5px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: T.faint,
};
