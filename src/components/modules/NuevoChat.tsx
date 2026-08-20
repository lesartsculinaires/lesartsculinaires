"use client";

import { useMemo, useState } from "react";

import { abrirChat } from "@/app/inbox-actions";
import { T } from "@/lib/theme";
import { aInternacional, bonito } from "@/lib/whatsapp/numero";
import type { Oportunidad } from "@/lib/types";

/**
 * Abrir un chat con alguien que ya está en la base.
 *
 * Se elige de los contactos que ya existen y no se escribe un número suelto:
 * un chat con un número que no es de nadie queda huérfano —sin ficha, sin
 * vendedor, sin historia— y es exactamente lo que la bandeja evita.
 *
 * LO QUE SE MUESTRA ANTES DE ABRIR, Y POR QUÉ
 *
 * El número tal como se va a usar. Los teléfonos del CRM vienen de planillas y
 * están escritos de diez maneras; para WhatsApp hay que armarlos con código de
 * país, y eso implica suponer. Escribirle a un desconocido por una suposición
 * silenciosa es peor que un paso de más, así que el número se muestra, se dice
 * qué se le cambió, y se puede corregir.
 */
export function NuevoChat({
  oportunidades,
  accent,
  onCerrar,
  onAbierta,
}: {
  oportunidades: Oportunidad[];
  accent: string;
  onCerrar: () => void;
  /** Recibe la conversación lista, para que la bandeja la muestre abierta. */
  onAbierta: (conversacionId: number) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<Oportunidad | null>(null);
  const [numero, setNumero] = useState("");
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Un contacto por persona, no una fila por oportunidad.
   *
   * La misma persona puede tener tres oportunidades y sería confuso verla tres
   * veces en una lista de «a quién le escribo». Se queda la más reciente.
   */
  const contactos = useMemo(() => {
    const porCliente = new Map<number, Oportunidad>();
    for (const o of oportunidades) {
      if (!porCliente.has(o.clienteId)) porCliente.set(o.clienteId, o);
    }
    return [...porCliente.values()];
  }, [oportunidades]);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    const digitos = q.replace(/\D/g, "");
    return contactos
      .filter(
        (o) =>
          o.cliente.toLowerCase().includes(q) ||
          o.codigo.toLowerCase().includes(q) ||
          (digitos.length >= 4 && (o.telefono ?? "").replace(/\D/g, "").includes(digitos)),
      )
      .slice(0, 40);
  }, [contactos, busqueda]);

  const elegir = (o: Oportunidad) => {
    const propuesta = aInternacional(o.telefono);
    setElegido(o);
    setNumero(propuesta.numero ?? "");
    setError(null);
  };

  const propuesta = elegido ? aInternacional(elegido.telefono) : null;

  const abrir = async () => {
    if (!elegido) return;
    setAbriendo(true);
    setError(null);
    const r = await abrirChat(elegido.clienteId, numero);
    setAbriendo(false);
    if (!r.ok || r.conversacionId == null) {
      setError(r.error ?? "No se pudo abrir el chat.");
      return;
    }
    onAbierta(r.conversacionId);
  };

  const listo = numero.replace(/\D/g, "").length >= 8;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo chat"
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
        if (e.target === e.currentTarget && !abriendo) onCerrar();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          Nuevo chat
        </h2>
        <p style={{ margin: "0 0 13px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          Buscá a quién le querés escribir entre los contactos que ya están en el CRM.
        </p>

        <input
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setElegido(null);
            setError(null);
          }}
          placeholder="Nombre, código o teléfono…"
          autoFocus
          style={{
            width: "100%",
            height: 34,
            padding: "0 10px",
            fontSize: 13,
            border: `1px solid ${T.border}`,
            borderRadius: 7,
            background: T.surface,
            color: T.ink,
          }}
        />

        {!elegido && (
          <div style={{ flex: 1, overflowY: "auto", marginTop: 10, minHeight: 60 }}>
            {busqueda.trim() === "" ? (
              <p style={{ margin: 0, fontSize: 12, color: T.faint, lineHeight: 1.6 }}>
                Escribí algo para buscar.
              </p>
            ) : resultados.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                Nadie con ese nombre ni ese número. Si es alguien nuevo, primero hay que
                darlo de alta en Clientes.
              </p>
            ) : (
              resultados.map((o) => (
                <button
                  key={o.clienteId}
                  type="button"
                  onClick={() => elegir(o)}
                  className="row"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 9px",
                    borderRadius: 7,
                    borderBottom: `1px solid ${T.border}`,
                  }}
                >
                  <span style={{ display: "block", fontSize: 13, color: T.ink }}>{o.cliente}</span>
                  <span className="mono" style={{ fontSize: 11, color: T.faint }}>
                    {o.telefono ? bonito(o.telefono) : "sin teléfono"} · {o.codigo}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {elegido && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 9px", fontSize: 13, color: T.ink }}>
              <strong>{elegido.cliente}</strong>{" "}
              <button
                type="button"
                onClick={() => setElegido(null)}
                style={{ fontSize: 11.5, color: accent }}
              >
                cambiar
              </button>
            </p>

            <label style={{ display: "block" }}>
              <span
                style={{
                  display: "block",
                  marginBottom: 3,
                  fontSize: 10.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: T.faint,
                }}
              >
                Número de WhatsApp
              </span>
              <input
                value={numero}
                onChange={(e) => {
                  setNumero(e.target.value);
                  setError(null);
                }}
                inputMode="numeric"
                // El marcador no es un número de ejemplo a propósito: uno que
                // parezca real se lee como si el campo ya tuviera valor, justo
                // en el caso en que está vacío porque el contacto no tiene
                // teléfono. Acá lo que se muestre tiene que ser lo que se va a
                // usar, o nada.
                placeholder="Escribilo con código de país"
                className="mono"
                style={{
                  width: "100%",
                  height: 34,
                  padding: "0 10px",
                  fontSize: 13,
                  border: `1px solid ${listo ? T.border : T.warn}`,
                  borderRadius: 7,
                  background: T.surface,
                  color: T.ink,
                }}
              />
            </label>

            {/* Qué se le hizo al número guardado. Se dice siempre que se lo
                haya tocado: es una suposición y quien manda tiene que verla. */}
            {propuesta?.nota && (
              <p style={{ margin: "5px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                {propuesta.nota}
                {elegido.telefono ? ` Guardado: ${elegido.telefono}.` : ""}
              </p>
            )}

            <p style={{ margin: "9px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.55 }}>
              Se abre el hilo, no se manda nada. Si esta persona nunca escribió al
              WhatsApp de la escuela, WhatsApp sólo deja llegarle con una plantilla
              aprobada, y la bandeja te la va a ofrecer.
            </p>
          </div>
        )}

        {error && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 14 }}>
          <button
            type="button"
            onClick={onCerrar}
            disabled={abriendo}
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
            onClick={() => void abrir()}
            disabled={abriendo || !elegido || !listo}
            style={{
              height: 36,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 7,
              background: elegido && listo ? accent : T.border,
              color: elegido && listo ? "#fff" : T.faint,
              cursor: abriendo ? "wait" : elegido && listo ? "pointer" : "not-allowed",
            }}
          >
            {abriendo ? "Abriendo…" : "Abrir chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
