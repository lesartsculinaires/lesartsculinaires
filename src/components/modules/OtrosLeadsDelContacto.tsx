"use client";

import { fechaCorta, money } from "@/lib/format";
import { otrosLeadsDe, type OtroLead } from "@/lib/otrosLeads";
import { T } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";

/**
 * «Esta persona también tiene otros leads».
 *
 * ============================================================================
 * QUÉ PREGUNTA CONTESTA
 * ============================================================================
 *
 * «¿Esto está duplicado?», que es la pregunta que se hace mirando la lista de
 * Clientes cuando la misma persona aparece dos veces. Hasta ahora no había
 * dónde contestarla: la ficha no decía una palabra de los otros leads de la
 * persona, así que quien abría uno no tenía forma de saber que existía el otro
 * ni por qué.
 *
 * Casi siempre la respuesta es que no está duplicado, y es información buena:
 * se le cayó Pastelería y compró Suprême Diplôme un mes después. Eso es lo que
 * este bloque pone a la vista.
 *
 * ============================================================================
 * POR QUÉ LOS CERRADOS SE VEN DISTINTO
 * ============================================================================
 *
 * Porque significan otra cosa. Un lead abierto de la misma persona es algo que
 * alguien está trabajando ahora, y conviene saber quién para no llamarla dos
 * veces el mismo día. Uno cerrado es historia —ya cursó, o ya dijo que no— y
 * sirve para atenderla mejor, no para coordinar.
 */
export function OtrosLeadsDelContacto({
  oportunidad,
  todas,
  accent,
  onIr,
}: {
  oportunidad: Oportunidad;
  todas: readonly Oportunidad[];
  accent: string;
  /** Saltar a otro lead de la misma persona. */
  onIr: (id: number) => void;
}) {
  const otros = otrosLeadsDe(oportunidad, todas);

  // Con un solo lead no hay nada que aclarar, y un bloque que dijera «no tiene
  // otros» sería un renglón de ruido en todas las fichas menos treinta y cuatro.
  if (otros.length === 0) return null;

  const abiertos = otros.filter((o) => !o.cerrado).length;

  return (
    <section
      style={{
        margin: "14px 0 0",
        padding: "11px 13px 12px",
        borderRadius: 9,
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <p style={{ margin: "0 0 3px", fontSize: 12.5, fontWeight: 700, color: T.ink }}>
        {otros.length === 1
          ? "Esta persona tiene otro lead"
          : `Esta persona tiene otros ${otros.length} leads`}
      </p>

      {/*
        La frase que evita la sospecha. Sin ella, ver dos leads de la misma
        persona invita a «unificarlos», que es justo lo que no hay que hacer
        cuando son programas distintos: son dos ventas.
      */}
      <p style={{ margin: "0 0 9px", fontSize: 11.5, lineHeight: 1.5, color: T.muted }}>
        No es un duplicado: cada programa es un trato aparte, con su monto y su
        cierre.
        {abiertos > 0 &&
          ` ${abiertos === 1 ? "Uno sigue abierto" : `${abiertos} siguen abiertos`}.`}
      </p>

      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
        {otros.map((o) => (
          <Fila key={o.id} lead={o} accent={accent} onIr={() => onIr(o.id)} />
        ))}
      </ul>
    </section>
  );
}

function Fila({
  lead,
  accent,
  onIr,
}: {
  lead: OtroLead;
  accent: string;
  onIr: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onIr}
        title={`Abrir ${lead.codigo}`}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "7px 9px",
          borderRadius: 7,
          border: `1px solid ${T.border}`,
          background: T.surface,
          cursor: "pointer",
          // Lo cerrado se apaga un poco: está para consultarlo, no para
          // trabajarlo.
          opacity: lead.cerrado ? 0.78 : 1,
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: accent }}>
            {lead.codigo}
          </span>
          <span style={{ fontSize: 12.5, color: T.ink }}>
            {lead.programa ?? "sin programa"}
          </span>
          {lead.estado && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 20,
                color: lead.estado === "Ganado" ? "#2F6B4F" : lead.estado === "Perdido" ? "#B85042" : T.muted,
                background: lead.estado === "Ganado" ? "#E6F0E9" : lead.estado === "Perdido" ? "#F7EBE9" : T.paper,
              }}
            >
              {lead.estado}
            </span>
          )}
        </span>

        <span
          style={{
            display: "block",
            marginTop: 2,
            fontSize: 11,
            color: T.faint,
          }}
        >
          {fechaCorta(lead.fechaRegistro)}
          {lead.etapa ? ` · ${lead.etapa}` : ""}
          {lead.vendedor ? ` · ${lead.vendedor}` : ""}
          {lead.valor != null ? ` · ${money(lead.valor)}` : ""}
        </span>
      </button>
    </li>
  );
}
