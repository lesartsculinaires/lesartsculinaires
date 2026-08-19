"use client";

import { useState } from "react";

import { crearVendedor } from "@/app/vendedores-actions";
import { T } from "@/lib/theme";

interface Props {
  accent: string;
  onCerrar: () => void;
  /** Se llama al crear, para que la pantalla vuelva a pedir el catálogo. */
  onCreado: () => void;
}

/**
 * Alta de un vendedor.
 *
 * Dos cosas ocupan más lugar acá que el formulario en sí, y las dos por el
 * mismo motivo: lo que se escriba se propaga a todo el CRM.
 *
 * La primera es el aviso de parecidos, igual que con los programas: la base
 * sólo rechaza el nombre idéntico, así que «Katya» entra al lado de «Katya
 * Villatoro» y a partir de ahí sus números quedan partidos entre dos personas
 * que son una.
 *
 * La segunda es lo de la cuenta. Un vendedor no es un usuario del CRM: son
 * tablas distintas y ninguna crea la otra. Alguien que atiende y entra al
 * sistema necesita las dos, y si falta una el síntoma aparece tarde —recibe
 * leads y no puede entrar a verlos— y lejos de acá. Por eso se dice al
 * terminar, cuando todavía se está pensando en esa persona.
 */
export function NuevoVendedor({ accent, onCerrar, onCreado }: Props) {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parecidos, setParecidos] = useState<string[] | null>(null);
  const [listo, setListo] = useState<{ tieneCuenta: boolean } | null>(null);

  const guardar = async (forzar: boolean) => {
    setGuardando(true);
    setError(null);

    const r = await crearVendedor({
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

    onCreado();
    // No se cierra solo: queda el aviso de la cuenta, que es justo lo que hay
    // que leer antes de irse.
    setListo({ tieneCuenta: r.tieneCuenta === true });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo vendedor"
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
        {listo ? (
          <Terminado
            tieneCuenta={listo.tieneCuenta}
            nombre={nombre.trim()}
            accent={accent}
            onCerrar={onCerrar}
          />
        ) : (
          <>
            <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
              Nuevo vendedor
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
              Va a aparecer para asignarle oportunidades, en el calendario, en la bandeja
              y en el reparto automático de leads.
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
                placeholder="Katya Villatoro"
                autoFocus
                style={CAMPO}
              />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              <span style={ETIQUETA}>Correo</span>
              <input
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                type="email"
                placeholder="opcional, pero hace falta para la cuenta del CRM"
                style={CAMPO}
              />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={ETIQUETA}>WhatsApp</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                inputMode="numeric"
                placeholder="50371000001"
                style={CAMPO}
              />
              <span style={{ fontSize: 10.5, color: T.faint, lineHeight: 1.4 }}>
                Con código de país y sólo dígitos. Es a donde n8n le avisa de un lead nuevo.
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
                  Ya hay {parecidos.length === 1 ? "alguien parecido" : "gente parecida"}:
                </p>
                <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 12.5, color: T.ink }}>
                  {parecidos.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                  Si es la misma persona, cerrá y usá la que ya está: dos fichas parten
                  sus números al medio.
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
                style={BOTON_GRIS}
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
                {guardando ? "Creando…" : parecidos ? "Agregarlo igual" : "Agregar vendedor"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Lo que hay que leer antes de irse.
 *
 * El alta salió bien; lo que queda es si esta persona puede entrar al CRM. Se
 * dice acá y no en un aviso que se desvanece, porque es la mitad del trabajo
 * que casi siempre se olvida.
 */
function Terminado({
  tieneCuenta,
  nombre,
  accent,
  onCerrar,
}: {
  tieneCuenta: boolean;
  nombre: string;
  accent: string;
  onCerrar: () => void;
}) {
  return (
    <>
      <h2 className="dsp" style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 700 }}>
        {nombre} ya está en la lista
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
        Ya se le pueden asignar oportunidades y aparece en el calendario, en la bandeja
        y en el reparto de leads.
      </p>

      <div
        style={{
          padding: "11px 12px",
          borderRadius: 8,
          border: `1px solid ${tieneCuenta ? T.border : T.warn}`,
          background: T.paper,
          marginBottom: 14,
        }}
      >
        {tieneCuenta ? (
          <p style={{ margin: 0, fontSize: 12.5, color: T.ink, lineHeight: 1.55 }}>
            Ya tiene cuenta para entrar al CRM con ese correo, así que no falta nada más.
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: T.ink, lineHeight: 1.55 }}>
            <strong>Todavía no puede entrar al CRM.</strong> Ser vendedor y tener cuenta
            son cosas distintas: esto lo hace visible para asignarle leads, pero la cuenta
            y su rol se crean en <strong>Usuarios y Roles</strong>. Sin eso va a recibir
            oportunidades que no puede abrir.
          </p>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCerrar}
          style={{
            height: 36,
            padding: "0 18px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 7,
            background: accent,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Entendido
        </button>
      </div>
    </>
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
