"use client";

import { useState } from "react";

import { guardarTelefonoEnFicha } from "@/app/inbox-actions";
import type { TelefonoCompartido } from "@/lib/whatsapp/contactos";
import { T } from "@/lib/theme";
import { useT } from "@/lib/i18n/idioma";

/**
 * Los números que el cliente ESCRIBIÓ en su mensaje, con qué hacer con ellos.
 *
 * Es la misma tarjeta que la de un contacto compartido (`ContactoDelMensaje`),
 * pero para cuando el número viene escrito —«mi número es 7880 3928»— en vez de
 * compartido desde la agenda de WhatsApp. Pedido el 25/11/2026 para LAC y HC:
 * que el número se pueda copiar o guardar en la ficha sin transcribirlo.
 *
 * Qué se reconoce como teléfono, y qué no, está en `@/lib/telefonosEnTexto`.
 */
export function TelefonosDelMensaje({
  telefonos,
  conversacionId,
  onGuardado,
}: {
  telefonos: TelefonoCompartido[];
  conversacionId: number;
  /** Se llama cuando se guardó en la ficha, para refrescar. */
  onGuardado: () => void;
}) {
  const tr = useT();
  const [copiado, setCopiado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [dicho, setDicho] = useState<string | null>(null);

  if (telefonos.length === 0) return null;

  const copiar = async (numero: string) => {
    try {
      await navigator.clipboard.writeText(numero);
      setCopiado(numero);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      // Sin permiso del navegador no se copia; el número sigue a la vista.
    }
  };

  const guardar = async (numero: string) => {
    setGuardando(numero);
    setDicho(null);
    const r = await guardarTelefonoEnFicha(conversacionId, numero);
    setGuardando(null);
    setDicho(r.ok ? (r.dicho ?? "Guardado en la ficha.") : (r.error ?? "No se pudo guardar."));
    if (r.ok) onGuardado();
  };

  const boton: React.CSSProperties = {
    padding: "2px 8px",
    fontSize: 10.5,
    fontWeight: 600,
    color: T.ink,
    background: "transparent",
    border: `1px solid ${T.border}`,
    borderRadius: 5,
    cursor: "pointer",
  };

  return (
    <div
      data-telefonos-del-mensaje
      style={{
        marginTop: 6,
        padding: "7px 9px",
        border: `1px solid ${T.border}`,
        borderRadius: 7,
        background: T.surface,
      }}
    >
      <strong style={{ display: "block", fontSize: 11.5, color: T.ink }}>
        {telefonos.length === 1 ? tr("Número en el mensaje") : tr("Números en el mensaje")}
      </strong>
      {telefonos.map((t) => (
        <div key={t.paraMarcar} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          <span className="mono" style={{ fontSize: 12, color: T.ink }}>
            {t.comoSeVe}
          </span>
          <button type="button" data-copiar-telefono={t.paraMarcar} onClick={() => void copiar(t.paraMarcar)} style={boton}>
            {copiado === t.paraMarcar ? tr("Copiado") : tr("Copiar")}
          </button>
          <button
            type="button"
            data-guardar-telefono={t.paraMarcar}
            onClick={() => void guardar(t.paraMarcar)}
            disabled={guardando === t.paraMarcar}
            style={{ ...boton, opacity: guardando === t.paraMarcar ? 0.6 : 1 }}
          >
            {guardando === t.paraMarcar ? tr("Guardando…") : tr("Guardar en la ficha")}
          </button>
        </div>
      ))}
      {dicho && (
        <span data-telefono-dicho style={{ display: "block", marginTop: 5, fontSize: 11, lineHeight: 1.4, color: T.faint }}>
          {tr(dicho)}
        </span>
      )}
    </div>
  );
}
