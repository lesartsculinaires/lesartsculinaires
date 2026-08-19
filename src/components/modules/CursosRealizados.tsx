"use client";

import { useCallback, useEffect, useState } from "react";

import {
  agregarCurso,
  listarCursos,
  quitarCurso,
  type CursoRealizado,
} from "@/app/cursos-actions";
import { useCatalogo } from "@/lib/catalog";
import { fechaCorta } from "@/lib/format";
import { T } from "@/lib/theme";

interface Props {
  clienteId: number;
  accent: string;
  /** Para que la bitácora se entere: agregar y quitar dejan rastro. */
  onCambio?: () => void;
}

/**
 * Qué cursó antes esta persona.
 *
 * Sirve para dos cosas concretas: no ofrecerle un programa que ya hizo, y
 * saber que es alumno de la casa cuando se discute un precio. Hasta ahora eso
 * vivía en la memoria de quien la atendió la vez pasada.
 *
 * El curso se elige del catálogo o se escribe. Lo segundo hace falta porque un
 * programa de hace cinco años puede no dictarse más, y no poder anotarlo sería
 * peor que anotarlo suelto.
 */
export function CursosRealizados({ clienteId, accent, onCambio }: Props) {
  const cat = useCatalogo();
  const [cursos, setCursos] = useState<CursoRealizado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // El formulario de alta. `producto` vacío significa «lo escribo yo».
  const [producto, setProducto] = useState<string>("");
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const cargar = useCallback(async () => {
    const r = await listarCursos(clienteId);
    setFaltaMigracion(r.faltaMigracion);
    if (r.ok) {
      setCursos(r.cursos);
      setError(null);
    } else {
      setError(r.error);
    }
    setCargando(false);
  }, [clienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const limpiar = () => {
    setProducto("");
    setNombre("");
    setDesde("");
    setHasta("");
  };

  const agregar = async () => {
    setGuardando(true);
    setError(null);

    const r = await agregarCurso({
      clienteId,
      productoId: producto ? Number(producto) : null,
      nombre: producto ? null : nombre,
      iniciaEn: desde || null,
      terminaEn: hasta || null,
    });

    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }

    limpiar();
    await cargar();
    onCambio?.();
  };

  const quitar = async (c: CursoRealizado) => {
    if (!window.confirm(`¿Quitar «${c.nombre}» del historial?`)) return;
    const r = await quitarCurso(c.id);
    if (!r.ok) setError(r.error);
    await cargar();
    onCambio?.();
  };

  if (faltaMigracion) {
    return (
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.5 }}>
        Para llevar este historial falta correr la migración{" "}
        <code>20260826120000_cursos_realizados.sql</code> en Supabase.
      </p>
    );
  }

  const puedeAgregar = Boolean(producto || nombre.trim());

  return (
    <div style={{ marginTop: 10 }}>
      {/* ------------------------------------------------------ lo ya cursado */}
      {!cargando && cursos.length > 0 && (
        <div
          style={{
            border: `1px solid ${T.border}`,
            borderRadius: 9,
            overflow: "hidden",
            marginBottom: 10,
          }}
        >
          {cursos.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 11px",
                borderTop: i ? `1px solid ${T.border}` : "none",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: T.ink, wordBreak: "break-word" }}>
                  {c.nombre}
                </div>
                <div style={{ fontSize: 11, color: T.faint }}>{periodo(c)}</div>
              </div>
              <button
                type="button"
                onClick={() => void quitar(c)}
                title="Quitar del historial"
                style={{
                  flexShrink: 0,
                  fontSize: 11.5,
                  padding: "3px 9px",
                  borderRadius: 6,
                  border: `1px solid ${T.border}`,
                  background: T.surface,
                  color: T.muted,
                }}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      {!cargando && cursos.length === 0 && (
        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
          No tiene cursos anteriores registrados.
        </p>
      )}

      {/* --------------------------------------------------------- agregar */}
      <div style={{ display: "grid", gap: 6 }}>
        <select
          value={producto}
          onChange={(e) => {
            setProducto(e.target.value);
            // Elegir del catálogo descarta lo escrito, y viceversa: si los dos
            // quedaran cargados no habría forma de saber cuál vale.
            if (e.target.value) setNombre("");
          }}
          style={CAMPO}
        >
          <option value="">Otro (lo escribo)</option>
          {cat.productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        {!producto && (
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del curso o diplomado"
            style={CAMPO}
          />
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={ETIQUETA}>Inicio</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={CAMPO} />
          </label>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={ETIQUETA}>Fin</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={CAMPO} />
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <button
            type="button"
            onClick={() => void agregar()}
            disabled={!puedeAgregar || guardando}
            style={{
              height: 32,
              padding: "0 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 7,
              background: puedeAgregar ? accent : T.border,
              color: puedeAgregar ? "#fff" : T.faint,
              cursor: puedeAgregar && !guardando ? "pointer" : "not-allowed",
            }}
          >
            {guardando ? "Agregando…" : "Agregar curso"}
          </button>
          <span style={{ fontSize: 11, color: T.faint, lineHeight: 1.4 }}>
            Las fechas son opcionales.
          </span>
        </div>
      </div>

      {error && (
        <p style={{ margin: "7px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}
    </div>
  );
}

const CAMPO: React.CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 8px",
  fontSize: 12.5,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

const ETIQUETA: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.faint,
};

/**
 * «Mar 2025 – Jun 2025», «desde 05/2019», o «sin fechas».
 *
 * De un curso viejo a veces sólo se sabe que se hizo. Mostrar «— – —» en ese
 * caso ocupa lugar para decir nada.
 */
function periodo(c: CursoRealizado): string {
  if (c.iniciaEn && c.terminaEn) return `${fechaCorta(c.iniciaEn)} – ${fechaCorta(c.terminaEn)}`;
  if (c.iniciaEn) return `desde ${fechaCorta(c.iniciaEn)}`;
  if (c.terminaEn) return `hasta ${fechaCorta(c.terminaEn)}`;
  return "sin fechas";
}
