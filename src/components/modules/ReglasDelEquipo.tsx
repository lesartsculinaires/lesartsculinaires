"use client";

import { useEffect, useState } from "react";

import { useT } from "@/lib/i18n/idioma";
import { T, softer } from "@/lib/theme";

/**
 * Las reglas del equipo de ventas en el Inbox (12/11/2026).
 *
 * Las ve sólo quien tiene la casilla «Ver las reglas del equipo» en su rol
 * (`inbox.reglas`, ver la migración 20261130120000_reglas_del_inbox.sql). Se
 * pidieron para Raquel, Estefany y Alexandra, que atienden la misma bandeja y
 * se pisaban: una abría el chat de otra, quedaba leído y la dueña no se
 * enteraba; o se contestaba un chat sin dueña y después nadie lo seguía.
 *
 * Son reglas escritas, no candados: el CRM no impide nada. Las dos primeras
 * además tienen su aviso en el chat abierto (`AvisoDeReglas`), que es donde
 * se olvidan.
 *
 * Es el mismo archivo en LAC y en HC: si se cambia una regla, en los dos.
 */
export const REGLAS: { titulo: string; detalle: string }[] = [
  {
    titulo: "Si el chat es de otra persona, déjalo en «No leído»",
    detalle:
      "Abrir un chat lo marca como leído. Si está asignado a otra vendedora y solo lo revisaste, déjalo en «No leído» para que su dueña lo vea.",
  },
  {
    titulo: "Antes de contestar, revisa que tenga vendedora asignada",
    detalle:
      "Si el chat dice «Sin asignar», asígnalo primero (a ti o a quien le toque). Un chat sin dueña no lo sigue nadie.",
  },
  {
    titulo: "No contestes el chat de otra vendedora",
    detalle:
      "Si hace falta intervenir, deja una nota interna en el chat y avísale. Al cliente le escribe una sola persona.",
  },
  {
    titulo: "Si traspasas un chat, deja una nota interna",
    detalle:
      "Cambia la vendedora en el chat y escribe en una nota interna qué falta, para que quien lo recibe no empiece de cero.",
  },
  {
    titulo: "Lo que es para el equipo va en nota interna",
    detalle:
      "Comentarios, recordatorios y contexto se escriben como nota interna: el cliente no los ve. Nunca como mensaje al cliente.",
  },
  {
    titulo: "Pasadas 24 horas, solo con plantilla",
    detalle:
      "Si el cliente no escribió en las últimas 24 horas, WhatsApp solo deja escribirle con una plantilla aprobada.",
  },
  {
    titulo: "Después de cada conversación, actualiza el lead",
    detalle:
      "Mueve la etapa y el estado en el Pipeline para que el Dashboard y el Tablero cuenten lo mismo que pasó en el chat.",
  },
  {
    titulo: "Archiva solo lo terminado",
    detalle:
      "Lo pendiente se deja en «No leído» o se fija arriba; archivar es para conversaciones cerradas. Fija solo lo urgente del día y desfíjalo al resolverlo.",
  },
];

/** El día en El Salvador, para mostrar el recordatorio una vez por día. */
const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());

const CLAVE_VISTO = "crm.reglas.visto";

/**
 * El botón «Reglas del equipo» y la lista.
 *
 * La primera vez del día el botón se destaca con «léelas» hasta que se abre;
 * no se abre solo encima de la bandeja, para no tapar un chat que alguien
 * está por contestar.
 */
export function BotonReglas({ accent }: { accent: string }) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, setPendiente] = useState(false);

  useEffect(() => {
    try {
      setPendiente(localStorage.getItem(CLAVE_VISTO) !== hoy());
    } catch {
      // Sin almacenamiento: el botón queda sin destacar, sigue funcionando.
    }
  }, []);

  const abrir = () => {
    setAbierto(true);
    setPendiente(false);
    try {
      localStorage.setItem(CLAVE_VISTO, hoy());
    } catch {
      // Ídem.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        data-reglas-del-equipo
        title={t("Las reglas del equipo para trabajar la bandeja")}
        style={{
          fontSize: 11.5,
          height: 24,
          padding: "0 10px",
          borderRadius: 12,
          border: `1px solid ${pendiente ? accent : T.border}`,
          background: pendiente ? softer(accent) : T.surface,
          color: pendiente ? accent : T.muted,
          fontWeight: pendiente ? 600 : 400,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        📋 {t("Reglas del equipo")}
        {pendiente ? ` · ${t("léelas")}` : ""}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Reglas del equipo")}
          onClick={() => setAbierto(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(3, 27, 79, 0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              maxHeight: "85vh",
              overflowY: "auto",
              background: T.surface,
              borderRadius: 12,
              border: `1px solid ${T.border}`,
              padding: "18px 20px",
              boxShadow: "0 12px 40px rgba(3, 27, 79, 0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ fontSize: 17, margin: 0, color: T.ink }}>📋 {t("Reglas del equipo")}</h2>
              <span style={{ fontSize: 11.5, color: T.faint }}>{t("Inbox · equipo de ventas")}</span>
            </div>
            <p style={{ fontSize: 12.5, color: T.muted, margin: "6px 0 14px", lineHeight: 1.5 }}>
              {t("Para trabajar la misma bandeja sin pisarnos. Las dos primeras también aparecen como aviso dentro del chat.")}
            </p>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {REGLAS.map((r) => (
                <li key={r.titulo} style={{ fontSize: 13, color: T.ink, lineHeight: 1.45 }}>
                  <strong>{t(r.titulo)}</strong>
                  <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{t(r.detalle)}</div>
                </li>
              ))}
            </ol>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  height: 32,
                  padding: "0 16px",
                  borderRadius: 6,
                  border: "none",
                  background: accent,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {t("Entendido")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * El aviso dentro del chat abierto, para las dos reglas que se olvidan ahí.
 *
 *   SIN VENDEDORA      El chat no tiene dueña: asignarlo antes de contestar.
 *   DE OTRA PERSONA    El chat es de otra vendedora: si sólo se revisó,
 *                      dejarlo en «No leído». El botón lo hace y cierra el
 *                      chat, porque si se queda abierto se vuelve a marcar
 *                      leído con el próximo mensaje.
 *
 * Quien no tiene ficha de vendedor (dirección) ve el segundo aviso en todos
 * los chats asignados: para ella todos son «de otra persona».
 */
export function AvisoDeReglas({
  vendedorId,
  miVendedorId,
  nombreDeLaDuena,
  onDejarNoLeido,
}: {
  vendedorId: number | null;
  miVendedorId: number | null;
  nombreDeLaDuena: string | null;
  onDejarNoLeido: () => Promise<void>;
}) {
  const t = useT();
  const [haciendo, setHaciendo] = useState(false);

  if (vendedorId == null) {
    return (
      <div
        data-aviso-de-reglas="sin-asignar"
        style={{
          fontSize: 12.5,
          lineHeight: 1.45,
          padding: "7px 14px",
          background: "#FFF6D6",
          color: "#6B4A00",
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        📋 <strong>{t("Regla del equipo:")}</strong>{" "}
        {t("este chat no tiene vendedora asignada. Asígnalo arriba antes de contestar.")}
      </div>
    );
  }

  if (vendedorId === miVendedorId) return null;

  return (
    <div
      data-aviso-de-reglas="de-otra-persona"
      style={{
        fontSize: 12.5,
        lineHeight: 1.45,
        padding: "7px 14px",
        background: "#EAF1FF",
        color: "#1D3A7A",
        borderBottom: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: "1 1 260px" }}>
        📋 <strong>{t("Regla del equipo:")}</strong>{" "}
        {nombreDeLaDuena
          ? `${t("este chat es de")} ${nombreDeLaDuena}. `
          : `${t("este chat es de otra persona.")} `}
        {t("Si solo lo revisaste, déjalo en «No leído» para que lo vea.")}
      </span>
      <button
        type="button"
        disabled={haciendo}
        onClick={async () => {
          setHaciendo(true);
          try {
            await onDejarNoLeido();
          } finally {
            setHaciendo(false);
          }
        }}
        style={{
          fontSize: 12,
          height: 28,
          padding: "0 11px",
          borderRadius: 6,
          border: "1px solid #1D3A7A",
          background: "#fff",
          color: "#1D3A7A",
          cursor: haciendo ? "wait" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {haciendo ? t("Dejando…") : t("Dejar en «No leído» y salir")}
      </button>
    </div>
  );
}
