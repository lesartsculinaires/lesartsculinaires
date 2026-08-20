"use client";

import { useState } from "react";

import { editarVendedor } from "@/app/vendedores-actions";
import { T } from "@/lib/theme";
import type { Vendedor } from "@/lib/types";

/**
 * Corregir los datos de un vendedor.
 *
 * Lo que se cambia acá viaja a todas partes: el nombre aparece en cada
 * oportunidad que atendió —incluidas las cerradas hace un año—, en el
 * calendario y en la bandeja; el teléfono es a donde n8n le avisa de un lead
 * nuevo. No es una ficha aislada, y por eso el aviso de parecidos sigue puesto
 * al editar: renombrar a «Katya» como «Katya V.» al lado de una «Katya
 * Villatoro» que ya existe deja las mismas dos fichas confundibles que crear
 * una de más.
 */
export function EditarVendedor({
  vendedor,
  accent,
  onCerrar,
  onGuardado,
}: {
  vendedor: Vendedor & { correo?: string | null; telefono?: string | null };
  accent: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(vendedor.nombre);
  const [correo, setCorreo] = useState(vendedor.correo ?? "");
  const [telefono, setTelefono] = useState(vendedor.telefono ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parecidos, setParecidos] = useState<string[] | null>(null);

  const guardar = async (forzar: boolean) => {
    setGuardando(true);
    setError(null);

    const r = await editarVendedor(vendedor.id, {
      nombre,
      correo: correo.trim() || null,
      telefono: telefono.trim() || null,
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

  const cambio =
    nombre !== vendedor.nombre ||
    correo !== (vendedor.correo ?? "") ||
    telefono !== (vendedor.telefono ?? "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar a ${vendedor.nombre}`}
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
          maxWidth: 430,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          Editar perfil
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          El nombre aparece en todas las oportunidades que atendió, también en las
          de hace un año. El teléfono es a donde n8n le avisa de un lead nuevo.
        </p>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={ETIQUETA}>Nombre y apellido</span>
          <input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setParecidos(null);
              setError(null);
            }}
            autoFocus
            style={CAMPO}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={ETIQUETA}>Correo</span>
          <input
            value={correo}
            onChange={(e) => {
              setCorreo(e.target.value);
              setError(null);
            }}
            type="email"
            placeholder="opcional"
            style={CAMPO}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={ETIQUETA}>WhatsApp</span>
          <input
            value={telefono}
            onChange={(e) => {
              setTelefono(e.target.value);
              setError(null);
            }}
            inputMode="numeric"
            placeholder="50371000001"
            style={CAMPO}
          />
          <span style={{ fontSize: 10.5, color: T.faint, lineHeight: 1.4 }}>
            Con código de país y sólo dígitos.
          </span>
        </label>

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
              Con ese nombre se va a confundir con{" "}
              {parecidos.length === 1 ? "alguien que ya está" : "gente que ya está"}:
            </p>
            <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 12.5, color: T.ink }}>
              {parecidos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
              Dos nombres parecidos hacen que sus números se lean como si fueran de
              personas distintas.
            </p>
          </div>
        )}

        {error && (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <button type="button" onClick={onCerrar} disabled={guardando} style={BOTON_GRIS}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar(parecidos != null)}
            disabled={guardando || !nombre.trim() || !cambio}
            title={cambio ? undefined : "No hay nada distinto que guardar"}
            style={{
              height: 36,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 7,
              background: nombre.trim() && cambio ? accent : T.border,
              color: nombre.trim() && cambio ? "#fff" : T.faint,
              cursor: guardando ? "wait" : nombre.trim() && cambio ? "pointer" : "not-allowed",
            }}
          >
            {guardando ? "Guardando…" : parecidos ? "Guardarlo igual" : "Guardar cambios"}
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

const BOTON_GRIS: React.CSSProperties = {
  height: 36,
  padding: "0 16px",
  fontSize: 13,
  borderRadius: 7,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
};
