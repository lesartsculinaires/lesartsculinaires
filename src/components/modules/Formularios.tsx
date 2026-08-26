"use client";

import { useState } from "react";

import { alternarFormulario } from "@/app/formularios-actions";
import { ArmarFormulario } from "@/components/modules/ArmarFormulario";
import { LlenarFormulario } from "@/components/modules/LlenarFormulario";
import { useCatalogo } from "@/lib/catalog";
import type { Formulario } from "@/lib/formularios";
import { T } from "@/lib/theme";

/**
 * Formularios de feria.
 *
 * Tres pantallas en una, y el orden importa: lo primero que se ve es la lista
 * para poder abrir uno y empezar a llenar. Armarlos es cosa de una vez, antes
 * de la feria; llenarlos es lo que se hace doscientas veces durante.
 */
type Vista =
  | { que: "lista" }
  | { que: "llenar"; formulario: Formulario }
  | { que: "armar"; formulario: Formulario | null };

export function Formularios({
  formularios,
  faltaMigracion,
  puedeCrear,
  puedeEditar,
  accent,
  onVerFicha,
  onRefrescar,
}: {
  formularios: Formulario[];
  /** Las tablas todavía no existen. */
  faltaMigracion: boolean;
  /**
   * Armar un formulario nuevo. Casilla «crear» del rol.
   *
   * Antes esto era «sos administrador», y por eso dirección podía tildarle la
   * casilla al Jefe de ventas sin que apareciera el botón. La política de la
   * base lo hace cumplir aparte; esto sólo evita ofrecer algo que iba a fallar.
   */
  puedeCrear: boolean;
  /** Cambiar las preguntas, y cerrar o reabrir. Casilla «editar». */
  puedeEditar: boolean;
  accent: string;
  onVerFicha: (oportunidadId: number) => void;
  onRefrescar: () => void;
}) {
  const [vista, setVista] = useState<Vista>({ que: "lista" });
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cat = useCatalogo();

  if (faltaMigracion) {
    return (
      <p
        style={{
          margin: 0,
          padding: "12px 15px",
          maxWidth: 640,
          fontSize: 12.5,
          lineHeight: 1.55,
          borderRadius: 9,
          background: "#F6EEDC",
          color: "#7A5A12",
        }}
      >
        Para usar los formularios falta correr la migración{" "}
        <code>supabase/migrations/20260906120000_formularios.sql</code> en Supabase →
        SQL Editor. Trae además el primer formulario de feria ya armado.
      </p>
    );
  }

  if (vista.que === "llenar") {
    return (
      <LlenarFormulario
        formulario={vista.formulario}
        accent={accent}
        onCerrar={() => {
          setVista({ que: "lista" });
          onRefrescar();
        }}
        onVerFicha={onVerFicha}
      />
    );
  }

  if (vista.que === "armar") {
    return (
      <ArmarFormulario
        formulario={vista.formulario}
        accent={accent}
        onCerrar={() => setVista({ que: "lista" })}
        onGuardado={() => {
          setVista({ que: "lista" });
          onRefrescar();
        }}
      />
    );
  }

  const alternar = async (f: Formulario) => {
    setOcupado(f.id);
    setError(null);
    const r = await alternarFormulario(f.id, !f.activo);
    setOcupado(null);
    if (!r.ok) setError(r.error);
    else onRefrescar();
  };

  const nombreDe = (lista: readonly { id: number; nombre: string }[], id: number | null) =>
    id == null ? null : (lista.find((x) => x.id === id)?.nombre ?? null);

  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: T.muted, lineHeight: 1.55, maxWidth: 660 }}>
        Un formulario por feria. Lo que se contesta entra como lead: se crea la
        ficha del cliente con su oportunidad, asignada a quien lo llenó, y todo lo
        contestado queda anotado en su bitácora.
      </p>

      {puedeCrear && (
        <button
          type="button"
          onClick={() => setVista({ que: "armar", formulario: null })}
          style={{
            height: 36,
            padding: "0 16px",
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            background: accent,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Nuevo formulario
        </button>
      )}

      {error && (
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}

      {formularios.length === 0 ? (
        <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          Todavía no hay formularios.
          {puedeCrear
            ? " Armá el primero con el botón de arriba."
            : " Pedile a dirección que arme el de la feria."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
          {formularios.map((f) => {
            const partes = [
              nombreDe(cat.canales, f.canalId),
              nombreDe(cat.etapas, f.etapaId),
              nombreDe(cat.estados, f.estadoId),
            ].filter((x): x is string => x != null);

            return (
              <div
                key={f.id}
                className="card"
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: `1px solid ${T.border}`,
                  background: f.activo ? T.surface : T.paper,
                  opacity: f.activo ? 1 : 0.75,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 9 }}>
                  <span className="dsp" style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>
                    {f.nombre}
                  </span>
                  {!f.activo && (
                    <span
                      className="pill"
                      style={{
                        padding: "2px 8px",
                        borderRadius: 20,
                        fontSize: 10.5,
                        background: "#E4E9F3",
                        color: T.muted,
                      }}
                    >
                      Cerrado
                    </span>
                  )}
                </div>

                {f.descripcion && (
                  <p style={{ margin: "4px 0 0", fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
                    {f.descripcion}
                  </p>
                )}

                <p className="mono" style={{ margin: "6px 0 0", fontSize: 11, color: T.faint }}>
                  {f.campos.length} {f.campos.length === 1 ? "pregunta" : "preguntas"} ·{" "}
                  {f.respuestas} {f.respuestas === 1 ? "lead" : "leads"}
                  {partes.length > 0 && ` · entran como ${partes.join(" · ")}`}
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 11 }}>
                  <button
                    type="button"
                    onClick={() => setVista({ que: "llenar", formulario: f })}
                    disabled={!f.activo || f.campos.length === 0}
                    title={
                      !f.activo
                        ? "Este formulario está cerrado"
                        : f.campos.length === 0
                          ? "Todavía no tiene preguntas"
                          : undefined
                    }
                    style={{
                      ...BOTON,
                      background: f.activo && f.campos.length > 0 ? accent : T.border,
                      color: f.activo && f.campos.length > 0 ? "#fff" : T.faint,
                      border: "none",
                      cursor: f.activo && f.campos.length > 0 ? "pointer" : "not-allowed",
                    }}
                  >
                    Llenar
                  </button>
                  {puedeEditar && (
                    <>
                      <button
                        type="button"
                        onClick={() => setVista({ que: "armar", formulario: f })}
                        style={BOTON}
                      >
                        Editar preguntas
                      </button>
                      <button
                        type="button"
                        onClick={() => void alternar(f)}
                        disabled={ocupado === f.id}
                        title={
                          f.activo
                            ? "Cerrarlo: deja de poder llenarse, pero los leads que entraron siguen ahí"
                            : "Volver a abrirlo"
                        }
                        style={BOTON}
                      >
                        {ocupado === f.id ? "…" : f.activo ? "Cerrar" : "Reabrir"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const BOTON: React.CSSProperties = {
  height: 32,
  padding: "0 13px",
  fontSize: 12.5,
  borderRadius: 7,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
  cursor: "pointer",
};
