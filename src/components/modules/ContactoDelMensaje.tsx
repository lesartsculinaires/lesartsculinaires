"use client";

import { useState } from "react";

import { altaYChat } from "@/app/inbox-actions";
import { comoSeDice, type ContactoCompartido } from "@/lib/whatsapp/contactos";
import { T } from "@/lib/theme";

/**
 * El contacto que alguien compartió, con su número y qué hacer con él.
 *
 * ============================================================================
 * QUÉ RESUELVE
 * ============================================================================
 *
 * El hilo mostraba «Contacto: Mami❤️» y nada más. El número venía en el
 * mensaje —Meta lo manda entero— pero no se leía, así que para usarlo había
 * que abrir WhatsApp en el teléfono y copiarlo a mano.
 *
 * Acá se ve el número y se puede hacer con él las dos cosas que se hacen de
 * verdad: copiarlo, o darle de alta como lead y abrirle su chat. Lo segundo es
 * el caso normal —«acá le comparto el número de mi mamá, hable con ella»— y
 * era justo el que obligaba a rehacer a mano lo que el mensaje ya traía.
 *
 * ============================================================================
 * POR QUÉ EL ALTA PUEDE FRENARSE, Y ESTÁ BIEN
 * ============================================================================
 *
 * `altaYChat` revisa duplicados antes de crear a nadie. Si ese número ya está
 * en la base, no da de alta a una segunda persona con el mismo teléfono: avisa.
 * Es lo correcto —dos fichas del mismo cliente parten su historial en dos— y
 * acá se muestra tal cual en vez de esconderlo detrás de un «no se pudo».
 */
export function ContactoDelMensaje({
  contactos,
  mio,
  onAbierto,
}: {
  contactos: ContactoCompartido[];
  /** Si la burbuja es nuestra, para que el texto se lea sobre su fondo. */
  mio: boolean;
  /** Se llama cuando se creó la ficha, para refrescar la bandeja. */
  onAbierto: () => void;
}) {
  const [haciendo, setHaciendo] = useState<string | null>(null);
  const [dicho, setDicho] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  if (contactos.length === 0) return null;

  const tinta = mio ? "#fff" : T.ink;
  const suave = mio ? "rgba(255,255,255,.75)" : T.faint;
  const borde = mio ? "rgba(255,255,255,.25)" : T.border;

  const copiar = async (numero: string) => {
    try {
      await navigator.clipboard.writeText(numero);
      setCopiado(numero);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      // Sin permiso del navegador no se puede copiar, y el número igual está a
      // la vista para leerlo. No vale la pena un cartel por esto.
    }
  };

  const darDeAlta = async (nombre: string, numero: string) => {
    setHaciendo(numero);
    setDicho(null);

    const r = await altaYChat({ nombre, telefono: numero, correo: null, vendedorId: null });
    setHaciendo(null);

    if (r.ok) {
      setDicho(r.yaExistia ? "Ya tenía ficha: su chat quedó abierto." : "Ficha creada y chat abierto.");
      onAbierto();
      return;
    }

    /*
     * Un duplicado no es un error: es la respuesta correcta.
     *
     * Se dice con el nombre de quien ya está, porque «ya existe» a secas deja
     * a quien atiende sin saber si es la misma persona o un número repetido
     * por error.
     */
    const quien = (r.coincidencias ?? []).map((c) => c.nombre).filter(Boolean).join(", ");
    setDicho(quien !== "" ? `Ese número ya es de ${quien}.` : (r.error ?? "No se pudo."));
  };

  const boton: React.CSSProperties = {
    padding: "2px 8px",
    fontSize: 10.5,
    fontWeight: 600,
    color: tinta,
    background: "transparent",
    border: `1px solid ${borde}`,
    borderRadius: 5,
    cursor: "pointer",
  };

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
      {contactos.map((c, i) => (
        <div
          key={`${c.nombre}-${i}`}
          style={{
            padding: "7px 9px",
            border: `1px solid ${borde}`,
            borderRadius: 7,
            background: mio ? "rgba(255,255,255,.07)" : T.surface,
          }}
        >
          <strong style={{ display: "block", fontSize: 12.5, color: tinta }}>{c.nombre}</strong>

          {c.telefonos.length === 0 ? (
            /*
              Un contacto sin número: pasa cuando se comparte una ficha que sólo
              tenía correo o dirección. Se dice, porque el hueco callado se lee
              como que el CRM no pudo.
            */
            <span style={{ fontSize: 11, color: suave }}>Este contacto no traía teléfono.</span>
          ) : (
            c.telefonos.map((t) => (
              <div
                key={t.paraMarcar}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 4,
                }}
              >
                {/*
                  El número en tipografía de ancho fijo, como el resto de los
                  datos del CRM: un teléfono se lee de a grupos de dígitos y
                  con ancho variable se confunden el 1 y el 7.
                */}
                <span className="mono" style={{ fontSize: 12, color: tinta }}>
                  {t.comoSeVe}
                </span>

                {comoSeDice(t.clase) && (
                  <span style={{ fontSize: 10, color: suave }}>{comoSeDice(t.clase)}</span>
                )}

                <button type="button" onClick={() => void copiar(t.paraMarcar)} style={boton}>
                  {copiado === t.paraMarcar ? "Copiado" : "Copiar"}
                </button>

                <button
                  type="button"
                  onClick={() => void darDeAlta(c.nombre, t.paraMarcar)}
                  disabled={haciendo === t.paraMarcar}
                  style={{ ...boton, opacity: haciendo === t.paraMarcar ? 0.6 : 1 }}
                >
                  {haciendo === t.paraMarcar ? "Creando…" : "Crear ficha y abrir chat"}
                </button>
              </div>
            ))
          )}
        </div>
      ))}

      {dicho && (
        <span style={{ fontSize: 11, lineHeight: 1.4, color: suave }}>{dicho}</span>
      )}
    </div>
  );
}
