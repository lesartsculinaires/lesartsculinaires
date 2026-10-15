"use client";

import { useCallback, useEffect, useState } from "react";

import {
  alinearChatsConLeads,
  revisionDelEquipo,
  type ProblemaDelEquipo,
} from "@/app/vendedores-actions";
import { T } from "@/lib/theme";

interface Props {
  /** Abre el traspaso de la cartera de esa persona. */
  onTraspasar: (vendedorId: number) => void;
  /** Cambia cuando algo se movió, para volver a revisar. */
  sello: number;
  onHecho: () => void;
}

const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

function frase(p: ProblemaDelEquipo): string {
  switch (p.tipo) {
    case "baja_con_leads":
      return `${p.nombre} está de baja y tiene ${n(p.cantidad, "lead abierto", "leads abiertos")} a su nombre.`;
    case "baja_con_chats":
      return `${p.nombre} está de baja y tiene ${n(p.cantidad, "chat", "chats")} sin archivar en el Inbox.`;
    case "chat_de_otra":
      return `${n(p.cantidad, "chat", "chats")} de ${p.nombre} ${p.cantidad === 1 ? "es" : "son"} de clientes cuyo lead lleva otra asesora.`;
    case "cuenta_sin_ficha":
      return `${p.nombre} entra al CRM con un rol de ventas pero no tiene ficha de vendedor: no le llegan leads.`;
    case "ficha_sin_cuenta":
      return `${p.nombre} tiene ficha de vendedor pero no una cuenta activa: no puede entrar ni recibe leads.`;
  }
}

/**
 * Lo que está desparejo en el equipo, arriba de todo en Equipos y sólo para
 * dirección. Si no hay nada, no ocupa lugar.
 *
 * Nació del caso de Estefany: entró, se le pasaron leads a mano, los chats no
 * los acompañaron y nadie se enteró hasta que los números no cerraban. Cada
 * aviso trae el botón que lo arregla.
 */
export function RevisionDelEquipo({ onTraspasar, sello, onHecho }: Props) {
  const [problemas, setProblemas] = useState<ProblemaDelEquipo[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const revisar = useCallback(() => {
    void revisionDelEquipo().then(setProblemas);
  }, []);

  useEffect(revisar, [revisar, sello]);

  if (!problemas || problemas.length === 0) {
    return aviso ? (
      <p data-revision-aviso style={{ margin: "0 0 12px", fontSize: 12.5, color: "#2F6B4F" }}>
        {aviso}
      </p>
    ) : null;
  }

  const hayChatsDeOtra = problemas.some((p) => p.tipo === "chat_de_otra");

  const alinear = async () => {
    setTrabajando(true);
    setAviso(null);
    const r = await alinearChatsConLeads();
    setTrabajando(false);
    if (!r.ok) {
      setAviso(r.error);
      return;
    }
    setAviso(`Listo: ${n(r.movidos ?? 0, "chat quedó", "chats quedaron")} con la dueña de su lead.`);
    revisar();
    onHecho();
  };

  return (
    <section
      data-revision-equipo
      style={{
        background: "#F6EEDC",
        border: "1px solid #E7D6AE",
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 14,
        color: "#5C4410",
      }}
    >
      <p className="dsp" style={{ margin: "0 0 8px", fontSize: 14.5, fontWeight: 600 }}>
        Revisión del equipo
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
        {problemas.map((p) => (
          <li key={`${p.tipo}-${p.vendedorId ?? p.nombre}`} data-problema={p.tipo}>
            {frase(p)}{" "}
            {(p.tipo === "baja_con_leads" || p.tipo === "baja_con_chats") && p.vendedorId != null && (
              <button
                type="button"
                onClick={() => onTraspasar(p.vendedorId as number)}
                style={{ fontSize: 12, fontWeight: 600, color: "#7A5A12", textDecoration: "underline" }}
              >
                Traspasar su cartera
              </button>
            )}
          </li>
        ))}
      </ul>
      {hayChatsDeOtra && (
        <button
          type="button"
          data-alinear-chats
          onClick={() => void alinear()}
          disabled={trabajando}
          style={{
            marginTop: 10,
            height: 32,
            padding: "0 14px",
            fontSize: 12.5,
            fontWeight: 600,
            borderRadius: 7,
            background: "#7A5A12",
            color: "#fff",
            cursor: trabajando ? "wait" : "pointer",
          }}
        >
          {trabajando ? "Un momento…" : "Pasar cada chat a la dueña de su lead"}
        </button>
      )}
      {aviso && <p style={{ margin: "8px 0 0", fontSize: 12 }}>{aviso}</p>}
    </section>
  );
}
