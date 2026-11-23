"use client";

import { useEffect, useState } from "react";

import { carteraDe, repartirCartera, traspasarCartera, type Cartera } from "@/app/vendedores-actions";
import { T } from "@/lib/theme";
import type { Vendedor } from "@/lib/types";

/**
 * Lo que hay que hacer DESPUÉS de reasignar, cuando la ventana se abrió por
 * otra cosa: cambiarle el rol a alguien o eliminar su cuenta en «Usuarios y
 * Roles». La ventana pregunta primero qué pasa con sus leads y recién después
 * hace el cambio que se pidió.
 */
export interface ContinuarConCambio {
  /** Qué se está por hacer, dicho para quien lo pidió: «sacarla de ventas». */
  que: string;
  /** El botón final: «Cambiar el rol», «Eliminar la cuenta». */
  boton: string;
  /** Hace el cambio. `darDeBaja`: además dar de baja su ficha de vendedor. Devuelve el error o null. */
  hacer: (darDeBaja: boolean) => Promise<string | null>;
}

interface Props {
  de: Vendedor;
  /** A quiénes se le puede pasar: los activos, menos la misma persona. */
  candidatas: Vendedor[];
  /**
   * Entre quiénes se reparte al azar. Por defecto, las mismas candidatas; desde
   * «Usuarios y Roles» se pasan sólo las que reciben leads.
   */
  paraElAzar?: Vendedor[];
  accent: string;
  onCerrar: () => void;
  onHecho: () => void;
  continuar?: ContinuarConCambio;
}

const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

/**
 * Pasar la cartera de una persona a otra, repartirla entre varias elegidas a
 * mano (23/11/2026: «poder elegir múltiples nombres»), o al azar entre todas
 * las que reciben leads.
 *
 * Primero muestra qué se va a mover —contado en el momento, no lo que vio la
 * pantalla hace un rato— y recién con el clic lo mueve todo junto.
 *
 * El reparto al azar es PAREJO: la base baraja los clientes y los da por
 * turnos, así que nadie recibe más de uno de diferencia con otra. Antes de
 * mandarlo se muestra cuánto le toca a cada una, para que no sea una sorpresa.
 */
export function TraspasarCartera({ de, candidatas, paraElAzar, accent, onCerrar, onHecho, continuar }: Props) {
  const azarPosibles = paraElAzar ?? candidatas;
  const [cartera, setCartera] = useState<Cartera | null>(null);
  /** Las personas elegidas a mano: una recibe todo; varias, se reparte parejo. */
  const [elegidas, setElegidas] = useState<number[]>([]);
  const [darDeBaja, setDarDeBaja] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ movido: Cartera; texto: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    void carteraDe(de.id).then((c) => {
      if (vigente) setCartera(c);
    });
    return () => {
      vigente = false;
    };
  }, [de.id]);

  const vacia = cartera != null && cartera.leads + cartera.conversaciones + cartera.citas === 0;
  const destino = elegidas.length === 1 ? candidatas.find((x) => x.id === elegidas[0]) : undefined;
  const nombreDe = (id: number) =>
    [...candidatas, ...azarPosibles].find((x) => x.id === id)?.nombre ?? `#${id}`;

  /** Cuántos le tocan a cada una al repartir parejo entre `k`: el piso, y algunas uno más. */
  const reparto = (k: number) => {
    if (!cartera || k === 0) return "";
    const piso = Math.floor(cartera.leads / k);
    return cartera.leads % k === 0
      ? `A cada una le tocan ${n(piso, "lead", "leads")}.`
      : `A cada una le tocan ${piso} o ${piso + 1} leads.`;
  };

  /**
   * Mueve la cartera. Sin `alAzar`, a las elegidas a mano: una recibe todo y
   * varias se la reparten parejo. Con `alAzar` («Asignar aleatoriamente»),
   * parejo entre todas las que reciben leads.
   */
  const mover = async (alAzar: boolean) => {
    const entre = alAzar ? azarPosibles.map((x) => x.id) : elegidas;
    if (entre.length === 0) return;
    setTrabajando(true);
    setError(null);
    if (entre.length === 1) {
      const a = entre[0];
      const quien = nombreDe(a);
      const r = await traspasarCartera(de.id, a);
      setTrabajando(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const movido = r.movido ?? { leads: 0, conversaciones: 0, citas: 0 };
      setListo({
        movido,
        texto: `${quien} recibió ${n(movido.leads, "lead abierto", "leads abiertos")}, ${n(movido.conversaciones, "chat", "chats")} y ${n(movido.citas, "cita", "citas")}.`,
      });
    } else {
      const r = await repartirCartera(de.id, entre);
      setTrabajando(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const movido = r.movido ?? { leads: 0, conversaciones: 0, citas: 0 };
      const cuanto = (r.porPersona ?? [])
        .sort((x, y) => y.leads - x.leads)
        .map((p) => `${nombreDe(p.id)}: ${p.leads}`)
        .join(" · ");
      setListo({
        movido,
        texto:
          `Se repartieron ${n(movido.leads, "lead abierto", "leads abiertos")}, ` +
          `${n(movido.conversaciones, "chat", "chats")} y ${n(movido.citas, "cita", "citas")} ` +
          (alAzar ? "al azar" : `entre ${n(entre.length, "persona", "personas")}`) +
          (cuanto ? ` (${cuanto}).` : "."),
      });
    }
    onHecho();
  };

  /** El cambio que abrió la ventana, con o sin reasignar antes. */
  const seguir = async () => {
    if (!continuar) return;
    setTrabajando(true);
    setError(null);
    const e = await continuar.hacer(darDeBaja);
    setTrabajando(false);
    if (e) {
      setError(e);
      return;
    }
    onHecho();
    onCerrar();
  };

  const casillaDeBaja = continuar && (
    <label
      style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: T.ink, margin: "0 0 12px", lineHeight: 1.45 }}
    >
      <input
        type="checkbox"
        data-dar-de-baja
        checked={darDeBaja}
        onChange={(e) => setDarDeBaja(e.target.checked)}
        disabled={trabajando}
        style={{ marginTop: 2 }}
      />
      <span>
        Dar de baja también su ficha de vendedor
        <span style={{ display: "block", fontSize: 11.5, color: T.faint }}>
          Deja de aparecer para asignarle leads y chats. Su historial queda con su nombre y se puede reactivar desde Equipos.
        </span>
      </span>
    </label>
  );

  const botonSeguir = (texto: string, principal: boolean) =>
    continuar && (
      <button
        type="button"
        data-continuar
        onClick={() => void seguir()}
        disabled={trabajando}
        style={principal ? { ...BOTON, fontWeight: 600, border: "none", background: accent, color: "#fff" } : BOTON}
      >
        {trabajando ? "Un momento…" : texto}
      </button>
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Reasignar la cartera de ${de.nombre}`}
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
          maxWidth: 480,
          maxHeight: "90vh",
          overflowY: "auto",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          {continuar ? `Antes de ${continuar.que}` : `Traspasar la cartera de ${de.nombre}`}
        </h2>
        {continuar && (
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
            {de.nombre} lleva leads a su nombre. Si sale de ventas sin pasarlos, quedan sin nadie que los siga.
          </p>
        )}

        {listo ? (
          <>
            <p data-traspaso-listo style={{ margin: "8px 0 14px", fontSize: 13, color: T.ink, lineHeight: 1.55 }}>
              Listo: {listo.texto} Ya aparecen en su Pipeline, su Inbox, Clientes y el Dashboard.
            </p>
            {casillaDeBaja}
            {error && <p style={{ margin: "0 0 10px", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              {continuar ? (
                botonSeguir(continuar.boton, true)
              ) : (
                <button type="button" onClick={onCerrar} style={{ ...BOTON, background: accent, color: "#fff" }}>
                  Cerrar
                </button>
              )}
            </div>
          </>
        ) : cartera == null ? (
          <p style={{ margin: "8px 0 14px", fontSize: 12.5, color: T.muted }}>Viendo qué tiene a su nombre…</p>
        ) : vacia ? (
          <>
            <p style={{ margin: "8px 0 14px", fontSize: 12.5, color: T.muted }}>
              No tiene leads abiertos, chats ni citas por venir. No hay nada que reasignar.
            </p>
            {casillaDeBaja}
            {error && <p style={{ margin: "0 0 10px", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              <button type="button" onClick={onCerrar} disabled={trabajando} style={BOTON}>
                {continuar ? "Cancelar" : "Cerrar"}
              </button>
              {continuar && botonSeguir(continuar.boton, true)}
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
              Lo que tiene a su nombre:
            </p>
            <ul data-cartera style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 12.5, color: T.ink, lineHeight: 1.7 }}>
              <li>{n(cartera.leads, "lead abierto", "leads abiertos")}</li>
              <li>{n(cartera.conversaciones, "chat del Inbox", "chats del Inbox")}</li>
              <li>{n(cartera.citas, "cita por venir", "citas por venir")}</li>
            </ul>

            <fieldset data-elegir-personas style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px 10px", margin: "0 0 10px" }}>
              <legend style={{ fontSize: 12, color: T.muted, padding: "0 4px" }}>
                Pasárselos a… (una o varias personas)
              </legend>
              <div style={{ maxHeight: 190, overflowY: "auto" }}>
                {candidatas.map((x) => (
                  <label key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.ink, padding: "3px 0" }}>
                    <input
                      type="checkbox"
                      data-elegir={x.id}
                      checked={elegidas.includes(x.id)}
                      disabled={trabajando}
                      onChange={(e) =>
                        setElegidas((v) => (e.target.checked ? [...v, x.id] : v.filter((id) => id !== x.id)))
                      }
                    />
                    {x.nombre}
                  </label>
                ))}
              </div>
              {elegidas.length > 1 && cartera.leads > 0 && (
                <p data-por-cabeza style={{ margin: "6px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.45 }}>
                  {reparto(elegidas.length)} Se reparten parejo entre las elegidas.
                </p>
              )}
            </fieldset>

            <div
              data-al-azar-caja
              style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 12px", fontSize: 11.5, color: T.faint, lineHeight: 1.45 }}
            >
              <button
                type="button"
                data-al-azar
                onClick={() => void mover(true)}
                disabled={trabajando || azarPosibles.length === 0}
                style={{ ...BOTON, height: 32, fontSize: 12.5, border: `1px solid ${accent}`, color: accent, fontWeight: 600 }}
              >
                Asignar aleatoriamente
              </button>
              <span style={{ flex: "1 1 180px" }}>
                {azarPosibles.length === 0
                  ? "No hay nadie más que reciba leads."
                  : azarPosibles.length === 1
                    ? `Solo ${azarPosibles[0].nombre} recibe leads ahora: se le pasa todo.`
                    : `Reparte parejo y al azar entre las ${azarPosibles.length} personas que reciben leads. ${reparto(azarPosibles.length)}`}
              </span>
            </div>

            <p style={{ margin: "0 0 12px", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
              Los leads ya ganados o perdidos se quedan con {de.nombre}: son su historia y cuentan en sus números de
              cada mes. Los chats van con su lead. Cada cambio queda en el historial del lead.
            </p>

            {error && (
              <p style={{ margin: "0 0 10px", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>{error}</p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
              <button type="button" onClick={onCerrar} disabled={trabajando} style={BOTON}>
                Cancelar
              </button>
              {botonSeguir("Seguir sin reasignar", false)}
              <button
                type="button"
                data-traspasar
                onClick={() => void mover(false)}
                disabled={trabajando || elegidas.length === 0}
                style={{
                  ...BOTON,
                  fontWeight: 600,
                  border: "none",
                  background: elegidas.length === 0 ? T.border : accent,
                  color: "#fff",
                  cursor: trabajando ? "wait" : elegidas.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {trabajando
                  ? "Un momento…"
                  : destino
                    ? `Pasarle todo a ${destino.nombre}`
                    : elegidas.length > 1
                      ? `Repartir entre las ${elegidas.length}`
                      : "Elegí a quién"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const BOTON: React.CSSProperties = {
  height: 36,
  padding: "0 16px",
  fontSize: 13,
  borderRadius: 7,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
};
