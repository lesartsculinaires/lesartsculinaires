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

type Modo = "una" | "azar";

const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

/**
 * Pasar la cartera de una persona a otra, o repartirla al azar entre varias.
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
  const [modo, setModo] = useState<Modo>("una");
  const [a, setA] = useState<number | "">("");
  const [entre, setEntre] = useState<number[]>(() => azarPosibles.map((x) => x.id));
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
  const destino = candidatas.find((x) => x.id === a);
  const nombreDe = (id: number) =>
    [...candidatas, ...azarPosibles].find((x) => x.id === id)?.nombre ?? `#${id}`;

  /** Cuántos le tocan a cada una al repartir parejo: el piso, y algunas uno más. */
  const porCabeza = cartera && entre.length > 0 ? Math.floor(cartera.leads / entre.length) : 0;
  const conUnoMas = cartera && entre.length > 0 ? cartera.leads % entre.length : 0;

  const listoParaMover = modo === "una" ? a !== "" : entre.length > 0;

  const mover = async () => {
    if (!listoParaMover) return;
    setTrabajando(true);
    setError(null);
    if (modo === "una") {
      if (a === "") return;
      const r = await traspasarCartera(de.id, a);
      setTrabajando(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const movido = r.movido ?? { leads: 0, conversaciones: 0, citas: 0 };
      setListo({
        movido,
        texto: `${destino?.nombre ?? "La nueva asesora"} recibió ${n(movido.leads, "lead abierto", "leads abiertos")}, ${n(movido.conversaciones, "chat", "chats")} y ${n(movido.citas, "cita", "citas")}.`,
      });
    } else {
      const r = await repartirCartera(de.id, entre);
      setTrabajando(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const movido = r.movido ?? { leads: 0, conversaciones: 0, citas: 0 };
      const reparto = (r.porPersona ?? [])
        .sort((x, y) => y.leads - x.leads)
        .map((p) => `${nombreDe(p.id)}: ${p.leads}`)
        .join(" · ");
      setListo({
        movido,
        texto:
          `Se repartieron ${n(movido.leads, "lead abierto", "leads abiertos")}, ` +
          `${n(movido.conversaciones, "chat", "chats")} y ${n(movido.citas, "cita", "citas")} al azar` +
          (reparto ? ` (${reparto}).` : "."),
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

            <div role="radiogroup" aria-label="Cómo reasignar" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {(
                [
                  ["una", "A una persona"],
                  ["azar", "Al azar entre varias"],
                ] as const
              ).map(([m, texto]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={modo === m}
                  data-modo={m}
                  onClick={() => {
                    setModo(m);
                    setError(null);
                  }}
                  disabled={trabajando}
                  style={{
                    ...BOTON,
                    flex: 1,
                    height: 34,
                    fontSize: 12.5,
                    fontWeight: modo === m ? 600 : 400,
                    border: `1px solid ${modo === m ? accent : T.border}`,
                    background: modo === m ? accent : T.surface,
                    color: modo === m ? "#fff" : T.ink,
                  }}
                >
                  {texto}
                </button>
              ))}
            </div>

            {modo === "una" ? (
              <>
                <label htmlFor="traspaso-a" style={{ display: "block", fontSize: 12, color: T.muted, marginBottom: 4 }}>
                  Pasarle todo a
                </label>
                <select
                  id="traspaso-a"
                  value={a}
                  onChange={(e) => setA(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={trabajando}
                  style={{
                    width: "100%",
                    height: 36,
                    font: "inherit",
                    fontSize: 13,
                    padding: "0 10px",
                    border: `1px solid ${T.border}`,
                    borderRadius: 7,
                    background: T.surface,
                    color: T.ink,
                    marginBottom: 12,
                  }}
                >
                  <option value="">Elegí a alguien…</option>
                  {candidatas.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <fieldset data-azar style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px 10px", margin: "0 0 12px" }}>
                <legend style={{ fontSize: 12, color: T.muted, padding: "0 4px" }}>Repartir entre</legend>
                {azarPosibles.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: T.warn }}>No hay nadie más que reciba leads.</p>
                ) : (
                  azarPosibles.map((x) => (
                    <label key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.ink, padding: "3px 0" }}>
                      <input
                        type="checkbox"
                        data-entre={x.id}
                        checked={entre.includes(x.id)}
                        disabled={trabajando}
                        onChange={(e) =>
                          setEntre((v) => (e.target.checked ? [...v, x.id] : v.filter((id) => id !== x.id)))
                        }
                      />
                      {x.nombre}
                    </label>
                  ))
                )}
                {entre.length > 0 && cartera.leads > 0 && (
                  <p data-por-cabeza style={{ margin: "6px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.45 }}>
                    {conUnoMas === 0
                      ? `A cada una le tocan ${n(porCabeza, "lead", "leads")}.`
                      : `A cada una le tocan ${porCabeza} o ${porCabeza + 1} leads.`}{" "}
                    Quién recibe cuál lo decide el sorteo.
                  </p>
                )}
              </fieldset>
            )}

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
                onClick={() => void mover()}
                disabled={trabajando || !listoParaMover}
                style={{
                  ...BOTON,
                  fontWeight: 600,
                  border: "none",
                  background: !listoParaMover ? T.border : accent,
                  color: "#fff",
                  cursor: trabajando ? "wait" : !listoParaMover ? "not-allowed" : "pointer",
                }}
              >
                {trabajando
                  ? "Un momento…"
                  : modo === "azar"
                    ? "Asignar aleatoriamente"
                    : destino
                      ? `Pasarle todo a ${destino.nombre}`
                      : "Traspasar"}
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
