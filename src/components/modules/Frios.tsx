"use client";

import { useMemo, useState } from "react";

import { fechaCorta, money } from "@/lib/format";
import {
  DIAS_PARA_ENFRIARSE,
  comoSeLeeLaEspera,
  friosDe,
  type LeadFrio,
} from "@/lib/frios";
import { T, softer } from "@/lib/theme";
import { SIN_DUENO, activos } from "@/lib/types";
import { useCatalogo } from "@/lib/catalog";
import type { Oportunidad } from "@/lib/types";

/**
 * Leads fríos: los que están vivos y nadie tocó hace quince días o más.
 *
 * ============================================================================
 * POR QUÉ UNA PANTALLA Y NO UN RECORDATORIO POR LEAD
 * ============================================================================
 *
 * La escuela pidió primero un recordatorio automático a los quince días. Antes
 * de construirlo se miró su base: de 979 leads vivos, 410 llevaban más de
 * quince días sin que nadie los tocara. Un recordatorio por cada uno es una
 * lista de 410 renglones, y una lista de 410 no se lee: se ignora entera, y
 * con ella se ignoran los tres que sí importaban esa semana.
 *
 * Con los números a la vista la escuela eligió esto. La diferencia no es
 * cosmética: un recordatorio pide una acción por renglón, y esta pantalla es
 * para mirar una cartera y decidir por dónde empezar.
 *
 * ============================================================================
 * QUÉ NO HACE, A PROPÓSITO
 * ============================================================================
 *
 * NO REPARTE SOLA. El pedido original incluía asignar los fríos al azar. En la
 * base de la escuela, de esos 410 leads fríos NINGUNO estaba sin asesora: el
 * problema no es que estén sin dueña, es que están asignados y quietos.
 * Repartirlos al azar les cambiaría la dueña sin avisar y le sacaría a alguien
 * un lead que quizá pensaba llamar mañana.
 *
 * NO ES UNA LISTA DE PENDIENTES. No hay «marcar como hecho»: un lead sale de
 * acá solo, en cuanto alguien le escribe una nota o le cambia algo. Un botón
 * de «ya lo atendí» que no exija atenderlo sería una manera de vaciar la lista
 * sin llamar a nadie.
 */
export function Frios({
  oportunidades,
  puedeElegirAsesor,
  accent,
  onAbrirFicha,
}: {
  oportunidades: readonly Oportunidad[];
  /** Dirección y gerencia eligen de quién ver la cartera; una asesora ve la suya. */
  puedeElegirAsesor: boolean;
  accent: string;
  onAbrirFicha: (oportunidadId: number) => void;
}) {
  const { vendedores } = useCatalogo();
  const [vendedorId, setVendedorId] = useState<number | null>(null);

  const todos = useMemo(() => friosDe(oportunidades), [oportunidades]);

  const visibles = todos.filter(
    (f) =>
      vendedorId == null ||
      (vendedorId === SIN_DUENO
        ? f.oportunidad.vendedorId == null
        : f.oportunidad.vendedorId === vendedorId),
  );

  const helados = visibles.filter((f) => f.temperatura === "helado").length;
  const enJuego = visibles.reduce((s, f) => s + (f.oportunidad.valor ?? 0), 0);

  /*
   * ¿Hay datos para contestar la pregunta?
   *
   * Sin la vista corrida, todos los leads llegan sin fecha y `friosDe` los
   * deja afuera —lo correcto: sin el dato no se puede afirmar que nadie los
   * tocó—. Pero en pantalla eso se ve igual que «no hay ninguno frío», que es
   * una respuesta muy distinta y muy tranquilizadora. Se distingue.
   */
  const faltaLaVista =
    oportunidades.length > 0 && oportunidades.every((o) => o.ultimoToque == null);

  if (faltaLaVista) {
    return (
      <p
        style={{
          margin: 0,
          padding: "12px 15px",
          fontSize: 12.5,
          lineHeight: 1.55,
          borderRadius: 9,
          background: "#F6EEDC",
          color: "#7A5A12",
        }}
      >
        Para saber cuándo se tocó cada lead falta correr{" "}
        <code>supabase/migrations/20261023120000_leads_frios.sql</code> en Supabase →
        SQL Editor. Hasta entonces esta pantalla no puede decir nada: mostrarla
        vacía se leería como «no hay ninguno frío», que es lo contrario de lo que
        se sabe.
      </p>
    );
  }

  return (
    <div>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: 13,
          color: T.muted,
          lineHeight: 1.55,
          maxWidth: 660,
        }}
      >
        Leads abiertos que nadie tocó en {DIAS_PARA_ENFRIARSE} días o más — ni una
        nota, ni un cambio en la ficha. Los que más tiempo llevan, primero. Un lead
        sale de esta lista solo, en cuanto alguien le escribe algo.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 600, color: T.ink }}>
          {visibles.length}
        </span>
        <span style={{ fontSize: 12.5, color: T.muted }}>
          {visibles.length === 1 ? "lead frío" : "leads fríos"}
          {helados > 0 && ` · ${helados} de más de mes y medio`}
        </span>
        {enJuego > 0 && (
          <span className="mono" style={{ fontSize: 12, color: T.faint }}>
            {money(enJuego)} en juego
          </span>
        )}
      </div>

      {puedeElegirAsesor && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
          {[
            { id: null as number | null, nombre: "Todo el equipo" },
            ...activos(vendedores).map((v) => ({ id: v.id as number | null, nombre: v.nombre })),
            // «Sin asignar» sólo si hay alguno: un botón que no filtra nada es
            // una promesa que no se cumple.
            ...(todos.some((f) => f.oportunidad.vendedorId == null)
              ? [{ id: SIN_DUENO as number | null, nombre: "Sin asignar" }]
              : []),
          ].map((b) => {
            const puesto = vendedorId === b.id;
            /* Cuántos le tocan a cada una, en el propio botón. Es lo que
               convierte la fila de filtros en un reparto de un vistazo. */
            const cuantos =
              b.id == null
                ? todos.length
                : todos.filter((f) =>
                    b.id === SIN_DUENO
                      ? f.oportunidad.vendedorId == null
                      : f.oportunidad.vendedorId === b.id,
                  ).length;

            return (
              <button
                key={b.id ?? "todos"}
                type="button"
                onClick={() => setVendedorId(b.id)}
                aria-pressed={puesto}
                data-asesor={b.nombre}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  height: 30,
                  padding: "0 12px",
                  fontSize: 12.5,
                  fontWeight: puesto ? 600 : 400,
                  border: `1px solid ${puesto ? accent : T.border}`,
                  borderRadius: 15,
                  background: puesto ? accent : T.surface,
                  color: puesto ? "#fff" : T.ink,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {b.nombre}
                <span
                  style={{
                    minWidth: 17,
                    padding: "0 5px",
                    borderRadius: 9,
                    fontSize: 10.5,
                    fontWeight: 700,
                    lineHeight: "16px",
                    textAlign: "center",
                    background: puesto ? "rgba(255,255,255,0.25)" : T.paper,
                    color: puesto ? "#fff" : T.muted,
                  }}
                >
                  {cuantos}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {visibles.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: "14px 16px",
            fontSize: 13,
            lineHeight: 1.6,
            color: T.muted,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
          }}
        >
          {vendedorId == null
            ? "Ningún lead abierto lleva quince días sin que alguien lo toque. La cartera está al día."
            : "Esta persona no tiene leads fríos."}
        </p>
      ) : (
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Sin tocar", "Lead", "Cliente", "Asesora", "Etapa", "Valor", "Entró"].map(
                  (h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: "9px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                        color: T.faint,
                        textAlign: i === 5 ? "right" : "left",
                        borderBottom: `1px solid ${T.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <Fila key={f.oportunidad.id} frio={f} accent={accent} onAbrir={onAbrirFicha} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Fila({
  frio: f,
  accent,
  onAbrir,
}: {
  frio: LeadFrio;
  accent: string;
  onAbrir: (id: number) => void;
}) {
  const o = f.oportunidad;
  const helado = f.temperatura === "helado";

  return (
    <tr
      onClick={() => onAbrir(o.id)}
      data-frio={o.codigo}
      data-dias={f.dias}
      style={{ cursor: "pointer", borderBottom: `1px solid ${T.border}` }}
    >
      <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
        {/* El tiempo primero y en color: es la columna por la que está
            ordenada la lista y la única que dice qué tan urgente es. */}
        <span
          className="pill"
          style={{
            display: "inline-block",
            padding: "2px 9px",
            borderRadius: 11,
            fontSize: 11.5,
            fontWeight: 600,
            background: helado ? "#F7EBE9" : softer(accent),
            color: helado ? "#B85042" : accent,
          }}
        >
          {comoSeLeeLaEspera(f.dias)}
        </span>
      </td>
      <td className="mono" style={{ padding: "9px 12px", fontSize: 12, color: T.muted }}>
        {o.codigo}
      </td>
      <td style={{ padding: "9px 12px", fontSize: 12.5 }}>{o.cliente}</td>
      <td style={{ padding: "9px 12px", fontSize: 12.5, color: o.vendedorId == null ? T.faint : T.ink }}>
        {o.vendedorId == null ? "sin asignar" : o.vendedor}
      </td>
      <td style={{ padding: "9px 12px", fontSize: 12.5, color: T.muted }}>{o.etapa}</td>
      <td className="mono" style={{ padding: "9px 12px", fontSize: 12, textAlign: "right" }}>
        {money(o.valor)}
      </td>
      <td style={{ padding: "9px 12px", fontSize: 12, color: T.faint, whiteSpace: "nowrap" }}>
        {fechaCorta(o.fechaRegistro)}
      </td>
    </tr>
  );
}
