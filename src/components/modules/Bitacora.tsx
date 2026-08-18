"use client";

import { useCallback, useEffect, useState } from "react";

import { listarNotas, type NotaRegistrada } from "@/app/actions";
import { cuando } from "@/lib/format";
import { T } from "@/lib/theme";

interface Props {
  oportunidadId: number;
  /**
   * Cambia cada vez que se guarda algo que deja rastro. Sirve para volver a
   * pedir la lista sin que la ficha tenga que saber cómo se recarga.
   */
  refresco: number;
}

/**
 * Lo que se fue escribiendo sobre esta oportunidad.
 *
 * Faltaba: las notas se guardaban desde el primer día y no había ninguna
 * pantalla que las leyera. Desde afuera eso se ve exactamente igual que si no
 * se guardaran —se escribe, se aprieta Guardar, y no queda nada a la vista—,
 * así que la primera pregunta de quien lo usa es si funciona.
 *
 * Van de lo más nuevo a lo más viejo, que es el orden en que se busca: lo que
 * importa casi siempre es qué pasó la última vez.
 */
export function Bitacora({ oportunidadId, refresco }: Props) {
  const [notas, setNotas] = useState<NotaRegistrada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  const cargar = useCallback(async () => {
    const r = await listarNotas(oportunidadId);
    if (r.ok) {
      setNotas(r.notas);
      setError(null);
    } else {
      setError(r.error);
    }
    setCargando(false);
  }, [oportunidadId]);

  useEffect(() => {
    void cargar();
  }, [cargar, refresco]);

  if (cargando) {
    return (
      <p style={{ margin: "8px 0 0", fontSize: 12, color: T.faint }}>Cargando…</p>
    );
  }

  if (error) {
    return (
      <p style={{ margin: "8px 0 0", fontSize: 12, color: T.warn, lineHeight: 1.5 }}>
        No se pudo leer la bitácora: {error}
      </p>
    );
  }

  if (notas.length === 0) {
    return (
      <p style={{ margin: "8px 0 0", fontSize: 12, color: T.faint, lineHeight: 1.5 }}>
        Todavía no hay nada anotado. Lo que escribas arriba aparece acá.
      </p>
    );
  }

  // Se muestran unas pocas y se puede abrir el resto: una ficha trabajada
  // acumula decenas de notas, y empujar la sección de adjuntos fuera de la
  // pantalla haría que nadie la encuentre.
  const CUANTAS = 5;
  const visibles = verTodas ? notas : notas.slice(0, CUANTAS);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
        {visibles.map((n, i) => (
          <div
            key={n.id}
            style={{
              padding: "9px 11px",
              borderTop: i ? `1px solid ${T.border}` : "none",
              // Las automáticas —las que deja el sistema al adjuntar— van con
              // el fondo suave: son parte del hilo, pero no las escribió nadie.
              background: n.origen === "comentario" ? T.surface : T.paper,
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                color: T.ink,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {n.nota}
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: T.faint }}>
              {[n.autor, cuando(n.creadaEn)].filter(Boolean).join(" · ")}
            </div>
          </div>
        ))}
      </div>

      {notas.length > CUANTAS && (
        <button
          type="button"
          onClick={() => setVerTodas((v) => !v)}
          style={{
            marginTop: 6,
            fontSize: 11.5,
            color: T.muted,
            background: "none",
            padding: 0,
          }}
        >
          {verTodas
            ? "Ver menos"
            : `Ver las ${notas.length - CUANTAS} anteriores`}
        </button>
      )}
    </div>
  );
}
