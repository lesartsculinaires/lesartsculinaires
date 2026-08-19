"use client";

import { useState } from "react";

import { crearPrograma } from "@/app/programas-actions";
import { CATEGORIAS } from "@/lib/programas";
import { T } from "@/lib/theme";

interface Props {
  accent: string;
  onCerrar: () => void;
  /** Se llama al crear, para que la pantalla vuelva a pedir el catálogo. */
  onCreado: () => void;
}

/**
 * Alta de un programa del catálogo.
 *
 * El grueso de esta pantalla es un aviso: cuando el nombre se parece a uno que
 * ya está, se muestra la lista y se pide confirmar. La base sólo rechaza el
 * nombre idéntico, así que «Diplomado Cocina» junto a «Diplomado de Cocina»
 * entra sin protestar y a partir de ahí los reportes cuentan dos programas
 * donde hay uno, y la importación de bases deja de emparejar.
 */
export function NuevoPrograma({ accent, onCerrar, onCreado }: Props) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<string>("Diplomado");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parecidos, setParecidos] = useState<string[] | null>(null);

  const guardar = async (forzar: boolean) => {
    setGuardando(true);
    setError(null);

    const limpio = precio.replace(/[^0-9.]/g, "");
    const r = await crearPrograma({
      nombre,
      categoria,
      precio: limpio === "" ? null : Number(limpio),
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

    onCreado();
    onCerrar();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo programa"
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
          maxWidth: 420,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          Nuevo programa
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          Va a aparecer en la ficha del cliente, en el alta, en el historial de cursos
          y en los cortes por programa.
        </p>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={ETIQUETA}>Nombre</span>
          <input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              // Cambiar el nombre invalida el aviso anterior: era sobre otro.
              setParecidos(null);
              setError(null);
            }}
            placeholder="Diplomado de Cocina"
            autoFocus
            style={CAMPO}
          />
        </label>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <label style={{ flex: 1 }}>
            <span style={ETIQUETA}>Categoría</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={CAMPO}>
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
              Si es el mismo, cerrá y usá el que ya está: dos nombres para un programa
              parten los reportes en dos.
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
            {guardando
              ? "Creando…"
              : parecidos
                ? "Crearlo igual"
                : "Crear programa"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CAMPO: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 9px",
  fontSize: 13,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

const ETIQUETA: React.CSSProperties = {
  display: "block",
  marginBottom: 3,
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.faint,
};
