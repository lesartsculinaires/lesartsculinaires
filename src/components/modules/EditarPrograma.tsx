"use client";

import { useState } from "react";

import { editarPrograma } from "@/app/programas-actions";
import { CAMPO, ETIQUETA } from "@/components/modules/estilosDePrograma";
import { CATEGORIAS } from "@/lib/programas";
import { T } from "@/lib/theme";
import type { Producto } from "@/lib/types";

interface Props {
  producto: Producto;
  accent: string;
  onCerrar: () => void;
  /** Se llama al guardar, para que la pantalla vuelva a pedir el catálogo. */
  onGuardado: () => void;
}

/**
 * Cambiar un programa del catálogo.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ TODO EN UN SOLO CUADRO
 * ------------------------------------------------------------------------
 *
 * Hasta acá lo único editable era el horario, con un botón en la tarjeta, y el
 * nombre había que cambiarlo en la base. Eso dejaba el cambio más delicado
 * —renombrar, que cambia cómo se lee el mismo lead en todas las pantallas—
 * fuera del CRM, y el más inocuo adentro.
 *
 * Van juntos porque se deciden juntos: cuando la escuela cambia un diplomado
 * de nombre, casi siempre le cambia también el horario y el precio. Con dos
 * lugares, el segundo se olvida.
 *
 * ------------------------------------------------------------------------
 * LO QUE ESTE CUADRO AVISA, Y POR QUÉ
 * ------------------------------------------------------------------------
 *
 * Renombrar NO mueve ningún lead: los leads cuelgan del `id`. Pero sí cambia
 * el nombre que van a leer todos, en los cortes del Dashboard y en las fichas
 * ya cerradas. Quien está por tocarlo se hace exactamente esa pregunta, así
 * que la respuesta va escrita al lado del campo y no en un manual.
 *
 * Dar de baja tampoco borra nada: saca el programa de los desplegables donde
 * se elige y lo deja donde ya se usó. Eso también va dicho: «dar de baja» se
 * parece demasiado a «borrar» como para dejarlo a la intuición.
 */
export function EditarPrograma({ producto, accent, onCerrar, onGuardado }: Props) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [categoria, setCategoria] = useState<string>(producto.categoria);
  const [precio, setPrecio] = useState(producto.precio != null ? String(producto.precio) : "");
  const [horario, setHorario] = useState(producto.horario ?? "");
  const [activo, setActivo] = useState(producto.activo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parecidos, setParecidos] = useState<string[] | null>(null);

  const seRenombra = nombre.trim() !== producto.nombre;

  const guardar = async (forzar: boolean) => {
    setGuardando(true);
    setError(null);

    const limpio = precio.replace(/[^0-9.]/g, "");
    const r = await editarPrograma({
      id: producto.id,
      nombre,
      categoria,
      precio: limpio === "" ? null : Number(limpio),
      horario,
      activo,
      forzar,
    });

    setGuardando(false);

    if (r.parecidos?.length) {
      setParecidos(r.parecidos);
      return;
    }
    if (!r.ok) {
      setError(r.error);
      return;
    }

    onGuardado();
    onCerrar();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar ${producto.nombre}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(3, 27, 79, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          maxHeight: "calc(100vh - 36px)",
          overflowY: "auto",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          Editar programa
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          Lo que se cambie acá lo va a ver todo el equipo: la ficha del cliente, el
          alta, el historial de cursos y los cortes por programa.
        </p>

        <label style={{ display: "block", marginBottom: 4 }}>
          <span style={ETIQUETA}>Nombre</span>
          <input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              // El aviso de parecidos era sobre el nombre anterior.
              setParecidos(null);
              setError(null);
            }}
            autoFocus
            style={CAMPO}
          />
        </label>

        {seRenombra && (
          <p style={{ margin: "0 0 10px", fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
            Los leads no se mueven: siguen en este programa. Lo que cambia es el
            nombre con que se leen, también en los ya cerrados. Las opciones ya
            escritas en un formulario de feria no se tocan.
          </p>
        )}
        {!seRenombra && <div style={{ height: 10 }} />}

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <label style={{ flex: 1 }}>
            <span style={ETIQUETA}>Categoría</span>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              style={CAMPO}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={ETIQUETA}>Precio de lista</span>
            <input
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              inputMode="decimal"
              placeholder="opcional"
              style={CAMPO}
            />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={ETIQUETA}>Horario vigente</span>
          <textarea
            value={horario}
            onChange={(e) => setHorario(e.target.value)}
            rows={3}
            placeholder="Ej.: Sábados de 8:00 a 12:00, del 15/02 al 20/06"
            style={{
              ...CAMPO,
              height: "auto",
              padding: "7px 9px",
              lineHeight: 1.45,
              resize: "vertical",
            }}
          />
          <span
            style={{
              display: "block",
              marginTop: 5,
              fontSize: 11,
              color: T.faint,
              lineHeight: 1.45,
            }}
          >
            Es el borrador para los leads nuevos. Las inscripciones ya cerradas
            conservan el horario con el que se cerraron; esto no las toca.
          </span>
        </label>

        {/*
          Dar de baja.

          No es un campo más y por eso está separado del resto, con su marco:
          es lo único de este cuadro que hace desaparecer el programa de una
          pantalla. Que se lea qué significa antes de tocarlo es el punto.
        */}
        <div
          style={{
            marginBottom: 14,
            padding: "10px 11px",
            borderRadius: 8,
            border: `1px solid ${activo ? T.border : T.warn}`,
            background: T.paper,
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!activo}
              onChange={(e) => setActivo(!e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <span style={{ display: "block", fontSize: 12.5, color: T.ink }}>
                Dar de baja: ya no se ofrece
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontSize: 11,
                  color: T.muted,
                  lineHeight: 1.5,
                }}
              >
                No borra nada. Sale de los desplegables donde se elige un programa y
                sigue nombrándose en los leads, el historial y los reportes donde ya
                se usó. Se puede volver a activar cuando se quiera.
              </span>
            </span>
          </label>
        </div>

        {parecidos && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 11px",
              borderRadius: 8,
              border: `1px solid ${T.warn}`,
              background: T.paper,
            }}
          >
            <p style={{ margin: "0 0 5px", fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>
              Ya hay {parecidos.length === 1 ? "un programa parecido" : "programas parecidos"}:
            </p>
            <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 12.5, color: T.ink }}>
              {parecidos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
              Si son el mismo, cancelá y unificá: dos nombres para un programa parten
              los reportes en dos.
            </p>
          </div>
        )}

        {error && (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            style={{
              height: 36,
              padding: "0 16px",
              fontSize: 13,
              borderRadius: 7,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.ink,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar(parecidos != null)}
            disabled={guardando || !nombre.trim()}
            style={{
              height: 36,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 7,
              background: nombre.trim() ? accent : T.border,
              color: nombre.trim() ? "#fff" : T.faint,
              cursor: guardando ? "wait" : nombre.trim() ? "pointer" : "not-allowed",
            }}
          >
            {guardando ? "Guardando…" : parecidos ? "Guardarlo igual" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
