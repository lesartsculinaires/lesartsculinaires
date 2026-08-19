"use client";

import { useEffect, useState } from "react";

import {
  dependenciasVendedor,
  desactivarVendedor,
  eliminarVendedor,
  type Dependencias,
} from "@/app/vendedores-actions";
import { T } from "@/lib/theme";

interface Props {
  id: number;
  nombre: string;
  accent: string;
  onCerrar: () => void;
  onHecho: () => void;
}

/**
 * Quitar a un vendedor.
 *
 * Quitar a alguien casi nunca quiere decir borrarlo, y la diferencia importa
 * porque no se nota el mismo día:
 *
 *   dar de baja  deja de aparecer para asignarle nada, y su historial sigue
 *                con su nombre. Se puede deshacer.
 *   eliminar     lo saca de la tabla. Las tres referencias que le apuntan
 *                —oportunidades, eventos, conversaciones— son `on delete set
 *                null`, así que nada se borra: queda huérfano. Los leads que
 *                atendió aparecerían «sin asignar» y ya no habría manera de
 *                saber quién los llevaba.
 *
 * Por eso lo que se ofrece depende de lo que se encuentre: si de esa persona
 * cuelga trabajo, la única salida es la baja. Eliminar queda sólo para el
 * nombre cargado por error, que es el caso en que de verdad no se pierde nada.
 */
export function QuitarVendedor({ id, nombre, accent, onCerrar, onHecho }: Props) {
  const [dep, setDep] = useState<Dependencias | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void dependenciasVendedor(id).then((d) => {
      if (vigente) setDep(d);
    });
    return () => {
      vigente = false;
    };
  }, [id]);

  const correr = async (accion: () => Promise<{ ok: boolean; error: string | null }>) => {
    setTrabajando(true);
    setError(null);
    const r = await accion();
    setTrabajando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onHecho();
    onCerrar();
  };

  const limpio = dep != null && dep.total === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Quitar a ${nombre}`}
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
        if (e.target === e.currentTarget && !trabajando) onCerrar();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          Quitar a {nombre}
        </h2>

        {dep == null ? (
          <p style={{ margin: "8px 0 14px", fontSize: 12.5, color: T.muted }}>
            Viendo qué tiene a su nombre…
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
              {limpio
                ? "No tiene nada a su nombre todavía."
                : "Tiene trabajo a su nombre, así que su ficha no se puede borrar sin dejarlo huérfano."}
            </p>

            {!limpio && (
              <ul
                style={{
                  margin: "0 0 12px",
                  paddingLeft: 18,
                  fontSize: 12.5,
                  color: T.ink,
                  lineHeight: 1.7,
                }}
              >
                {dep.oportunidades > 0 && (
                  <li>
                    {dep.oportunidades}{" "}
                    {dep.oportunidades === 1 ? "oportunidad" : "oportunidades"}
                  </li>
                )}
                {dep.eventos > 0 && (
                  <li>
                    {dep.eventos} {dep.eventos === 1 ? "evento" : "eventos"} en el calendario
                  </li>
                )}
                {dep.conversaciones > 0 && (
                  <li>
                    {dep.conversaciones}{" "}
                    {dep.conversaciones === 1 ? "conversación" : "conversaciones"} en la bandeja
                  </li>
                )}
              </ul>
            )}

            <div
              style={{
                padding: "11px 12px",
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: T.paper,
                marginBottom: 14,
              }}
            >
              <p style={{ margin: 0, fontSize: 12.5, color: T.ink, lineHeight: 1.55 }}>
                <strong>Darlo de baja</strong> lo saca de los desplegables, de este
                módulo y del reparto de leads. Lo que ya atendió sigue diciendo su
                nombre y los números de los meses cerrados no cambian. Se puede
                reactivar cuando haga falta.
              </p>
            </div>

            {error && (
              <p style={{ margin: "0 0 10px", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>
                {error}
              </p>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 9,
                flexWrap: "wrap",
              }}
            >
              <button type="button" onClick={onCerrar} disabled={trabajando} style={BOTON_GRIS}>
                Cancelar
              </button>

              {limpio && (
                <button
                  type="button"
                  onClick={() => void correr(() => eliminarVendedor(id))}
                  disabled={trabajando}
                  style={{
                    ...BOTON_GRIS,
                    borderColor: T.warn,
                    color: T.warn,
                    cursor: trabajando ? "wait" : "pointer",
                  }}
                >
                  Eliminar del todo
                </button>
              )}

              <button
                type="button"
                onClick={() => void correr(() => desactivarVendedor(id))}
                disabled={trabajando}
                style={{
                  height: 36,
                  padding: "0 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 7,
                  background: accent,
                  color: "#fff",
                  cursor: trabajando ? "wait" : "pointer",
                }}
              >
                {trabajando ? "Un momento…" : "Darlo de baja"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const BOTON_GRIS: React.CSSProperties = {
  height: 36,
  padding: "0 16px",
  fontSize: 13,
  borderRadius: 7,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
};
