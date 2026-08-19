"use client";

import { useMemo, useState } from "react";

import { reactivarVendedor } from "@/app/vendedores-actions";
import { NuevoVendedor } from "@/components/modules/NuevoVendedor";
import { QuitarVendedor } from "@/components/modules/QuitarVendedor";
import { useCatalogo } from "@/lib/catalog";
import { leadCount, money } from "@/lib/format";
import { porMes, variacion } from "@/lib/periodos";
import {
  estaAbierta,
  esGanada,
  groupBars,
  totalCerrado,
  valorPipeline,
} from "@/lib/selectors";
import { T, openTone, softer } from "@/lib/theme";
import { activos } from "@/lib/types";
import type { Oportunidad, Vendedor } from "@/lib/types";

/** Clave del selector para ver todo junto, sin recortar por mes. */
const ACUMULADO = "acumulado";

/** "▲ +12%" contra el mes anterior, o nada si no hay con qué comparar. */
function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const sube = pct >= 0;
  const n = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return (
    <span className="mono" style={{ fontSize: 11, color: sube ? "#2F6B4F" : "#B85042" }}>
      {sube ? "▲ +" : "▼ −"}
      {Math.abs(n)}%
    </span>
  );
}

interface Props {
  oportunidades: Oportunidad[];
  accent: string;
  vend: number;
  onSelectVend: (i: number) => void;
  onOpen: (id: number) => void;
  onVerTodos: (vendedorId: number) => void;
  /**
   * Agregar vendedores es cosa de dirección: la lista la comparten los
   * desplegables de todo el CRM y el reparto automático de leads. La base lo
   * hace cumplir aparte; esto sólo evita ofrecer un botón que iba a fallar.
   */
  esAdmin: boolean;
  /** Para volver a pedir el catálogo cuando se agrega uno. */
  onRefrescar: () => void;
}

export function Equipos({
  oportunidades,
  accent,
  vend,
  onSelectVend,
  onOpen,
  onVerTodos,
  esAdmin,
  onRefrescar,
}: Props) {
  const { vendedores: todos, etapas } = useCatalogo();
  const soft = softer(accent);
  const open = openTone(accent);
  const [creando, setCreando] = useState(false);
  const [quitando, setQuitando] = useState<Vendedor | null>(null);

  // El catálogo llega entero para que el resto del CRM pueda seguir poniéndole
  // nombre a lo que atendió alguien que ya no está. Acá se trabaja sólo con los
  // que siguen: los dados de baja tienen su propia lista al final, y esa la ve
  // dirección nada más.
  const vendedores = activos(todos);
  const bajas = todos.filter((x) => !x.activo);

  /** El botón, arriba a la derecha. Se dibuja igual con la lista vacía. */
  const boton = esAdmin ? (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setCreando(true)}
        style={{
          height: 34,
          padding: "0 15px",
          fontSize: 12.5,
          fontWeight: 600,
          borderRadius: 7,
          background: accent,
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Nuevo vendedor
      </button>
    </div>
  ) : null;

  const dialogo = (
    <>
      {creando && (
        <NuevoVendedor
          accent={accent}
          onCerrar={() => setCreando(false)}
          onCreado={onRefrescar}
        />
      )}
      {quitando && (
        <QuitarVendedor
          id={quitando.id}
          nombre={quitando.nombre}
          accent={accent}
          onCerrar={() => setQuitando(null)}
          onHecho={onRefrescar}
        />
      )}
    </>
  );

  // Sin vendedores el módulo no tiene nada que graficar, pero es justo cuando
  // más falta hace poder agregar el primero: el botón va antes del aviso y no
  // después del `return`.
  if (vendedores.length === 0) {
    return (
      <div>
        {boton}
        {dialogo}
        <p style={{ fontSize: 13, color: T.muted }}>
          No hay vendedores cargados en el catálogo.
        </p>
      </div>
    );
  }

  const vi = Math.min(vend, vendedores.length - 1);
  const v = vendedores[vi];

  const deVendedor = (id: number | null) =>
    oportunidades.filter((o) => o.vendedorId === id);

  const sinAsignar = oportunidades.filter((o) => o.vendedorId == null);
  const todasSuyas = deVendedor(v.id);

  /**
   * Los contadores no se reinician borrando nada: se calculan sobre el mes
   * elegido. Cada lead ya trae su fecha, así que al cambiar de mes los
   * números arrancan de cero solos y los meses anteriores quedan intactos,
   * incluidos los que pasaron antes de que existiera esta pantalla.
   */
  const meses = useMemo(() => porMes(todasSuyas), [todasSuyas]);
  const [mesSel, setMesSel] = useState<string | null>(null);

  // Por defecto, el mes más reciente con actividad de esta persona. Si se
  // cambia de vendedor y el mes elegido no es uno de los suyos, se cae al
  // último que sí tiene: mostrar ceros de un mes ajeno confundiría más.
  const elegido = mesSel ?? meses[meses.length - 1]?.clave ?? null;
  const claveMes =
    elegido === ACUMULADO || meses.some((m) => m.clave === elegido)
      ? elegido
      : (meses[meses.length - 1]?.clave ?? null);
  const acumulado = claveMes === ACUMULADO;
  const idxMes = meses.findIndex((m) => m.clave === claveMes);
  const mesActual = idxMes >= 0 ? meses[idxMes] : null;
  const mesPrevio = idxMes > 0 ? meses[idxMes - 1] : null;

  const propias = acumulado
    ? todasSuyas
    : todasSuyas.filter((o) => o.mes?.slice(0, 7) === claveMes);
  const ganadas = propias.filter(esGanada);

  const tasa = (g: number, t: number) => (t ? `${Math.round((g / t) * 100)}%` : "—");

  const kpis = acumulado
    ? [
        { label: "Oportunidades", value: String(todasSuyas.length), pct: null },
        { label: "En pipeline", value: money(valorPipeline(todasSuyas) || null), pct: null },
        { label: "Venta cerrada", value: money(totalCerrado(todasSuyas) || null), pct: null },
        { label: "Tasa de cierre", value: tasa(todasSuyas.filter(esGanada).length, todasSuyas.length), pct: null },
      ]
    : [
        {
          label: "Oportunidades",
          value: String(mesActual?.leads ?? 0),
          pct: mesPrevio ? variacion(mesActual?.leads ?? 0, mesPrevio.leads) : null,
        },
        {
          label: "En pipeline",
          value: money((mesActual?.pipeline ?? 0) || null),
          pct: mesPrevio ? variacion(mesActual?.pipeline ?? 0, mesPrevio.pipeline) : null,
        },
        {
          label: "Venta cerrada",
          value: money((mesActual?.cerrado ?? 0) || null),
          pct: mesPrevio ? variacion(mesActual?.cerrado ?? 0, mesPrevio.cerrado) : null,
        },
        {
          label: "Tasa de cierre",
          value: tasa(mesActual?.ganados ?? 0, mesActual?.leads ?? 0),
          pct: null,
        },
      ];

  const territorios = [...new Set(propias.map((o) => o.territorio))].filter(
    (t) => t !== "—",
  );

  return (
    <div>
      {boton}
      {dialogo}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
        <div
          style={{
            flex: "1 1 240px",
            maxWidth: 300,
            minWidth: 0,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 14, borderBottom: `1px solid ${T.border}` }}>
            <p className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
              Equipo de ventas
            </p>
            <p className="mono" style={{ margin: 0, fontSize: 11, color: T.faint }}>
              {vendedores.length} ejecutivos · {oportunidades.length} oportunidades
            </p>
          </div>

          {vendedores.map((x, i) => {
            const xs = deVendedor(x.id);
            const cerrado = totalCerrado(xs);
            return (
              <button
                type="button"
                key={x.id}
                className="nav"
                onClick={() => onSelectVend(i)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "13px 14px",
                  borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                  background: i === vi ? soft : "transparent",
                }}
              >
                <p
                  style={{
                    margin: "0 0 3px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: i === vi ? accent : T.ink,
                  }}
                >
                  {x.nombre}
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                    marginTop: 5,
                  }}
                >
                  <span className="mono" style={{ fontSize: 11, color: T.faint }}>
                    {leadCount(xs.length)}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: T.muted }}>
                    {money(cerrado || null)}
                  </span>
                </div>
              </button>
            );
          })}

          {esAdmin && bajas.length > 0 && <Bajas bajas={bajas} onHecho={onRefrescar} />}

          {sinAsignar.length > 0 && (
            <div
              style={{
                padding: "13px 14px",
                borderTop: `1px solid ${T.border}`,
                background: "#F6EEDC",
                color: "#7A5A12",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
                {sinAsignar.length}{" "}
                {sinAsignar.length === 1 ? "oportunidad" : "oportunidades"} sin
                vendedor asignado. Nadie les da seguimiento.
              </p>
            </div>
          )}
        </div>

        <div
          style={{
            flex: "999 1 400px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <section
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              padding: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <h2 className="dsp" style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>
                {v.nombre}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {esAdmin && (
                  <button
                    type="button"
                    onClick={() => setQuitando(v)}
                    style={{ fontSize: 12.5, color: T.muted }}
                  >
                    Quitar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onVerTodos(v.id)}
                  style={{ fontSize: 12.5, color: accent }}
                >
                  Ver en Clientes ›
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {[...meses.map((m) => ({ clave: m.clave, texto: m.etiqueta })),
                { clave: ACUMULADO, texto: "Acumulado" }].map((op) => {
                const activo = op.clave === claveMes;
                return (
                  <button
                    key={op.clave}
                    type="button"
                    onClick={() => setMesSel(op.clave)}
                    style={{
                      padding: "5px 11px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: `1px solid ${activo ? accent : T.border}`,
                      background: activo ? soft : "transparent",
                      color: activo ? accent : T.muted,
                    }}
                  >
                    {op.texto}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
                gap: 9,
              }}
            >
              {kpis.map((k) => (
                <div key={k.label} style={{ background: T.paper, borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 5px", fontSize: 11, color: T.muted }}>{k.label}</p>
                  <p className="mono dsp" style={{ margin: "0 0 3px", fontSize: 20, fontWeight: 500 }}>
                    {k.value}
                  </p>
                  <div style={{ minHeight: 15 }}>
                    <Delta pct={k.pct} />
                    {k.pct != null && mesPrevio && (
                      <span style={{ marginLeft: 5, fontSize: 10.5, color: T.faint }}>
                        vs {mesPrevio.etiqueta}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p style={{ margin: "12px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
              {acumulado
                ? "Todo el histórico de esta persona, sin recortar por mes."
                : `Sólo ${mesActual?.etiquetaLarga ?? "el mes elegido"}. Los meses anteriores no se borran: quedan guardados abajo.`}
            </p>
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(252px, 1fr))",
              gap: 14,
            }}
          >
            <section
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: 20,
              }}
            >
              <h3 className="dsp" style={{ margin: "0 0 15px", fontSize: 15, fontWeight: 500 }}>
                Sus oportunidades por etapa
              </h3>
              {etapas.map((e) => {
                const n = propias.filter((o) => o.etapaId === e.id).length;
                return (
                  <div
                    key={e.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
                  >
                    <span
                      style={{
                        flex: "0 1 110px",
                        minWidth: 0,
                        fontSize: 11.5,
                        color: n ? T.ink : T.faint,
                        lineHeight: 1.2,
                      }}
                    >
                      {e.nombre}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: "#E4E9F3",
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${(n / Math.max(propias.length, 1)) * 100}%`,
                          background: accent,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span
                      className="mono"
                      style={{ width: 26, textAlign: "right", fontSize: 12, color: n ? T.muted : T.faint }}
                    >
                      {n}
                    </span>
                  </div>
                );
              })}
            </section>

            <section
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: 20,
              }}
            >
              <h3 className="dsp" style={{ margin: "0 0 15px", fontSize: 15, fontWeight: 500 }}>
                Programas que vende
              </h3>
              {groupBars(propias, "producto", 5).map((p) => (
                <div key={p.label} style={{ marginBottom: 11 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 10,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 12.5 }}>{p.label}</span>
                    <span className="mono" style={{ fontSize: 12, color: T.muted }}>{p.value}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      height: 6,
                      background: "#E4E9F3",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ width: `${p.wonPct}%`, background: accent }} />
                    <div style={{ width: `${p.openPct}%`, background: open }} />
                  </div>
                </div>
              ))}

              {territorios.length > 0 && (
                <>
                  <p
                    className="mono"
                    style={{
                      margin: "16px 0 8px",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      color: T.faint,
                      textTransform: "uppercase",
                    }}
                  >
                    Territorios que cubre
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {territorios.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 11.5,
                          padding: "5px 10px",
                          borderRadius: 6,
                          background: T.paper,
                          border: `1px solid ${T.border}`,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>

          <section
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
              <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
                Mes a mes
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
                Cada mes cerrado queda guardado acá. Clic en una fila para ver ese mes
                arriba.
              </p>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: T.paper }}>
                    {["Mes", "Leads", "Ganados", "Tasa", "Venta cerrada", "Pipeline"].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 0 ? "left" : "right",
                          padding: "9px 20px",
                          fontWeight: 500,
                          fontSize: 11.5,
                          color: T.muted,
                          whiteSpace: "nowrap",
                          borderBottom: `1px solid ${T.border}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...meses].reverse().map((m, i) => (
                    <tr
                      key={m.clave}
                      className="row"
                      onClick={() => setMesSel(m.clave)}
                      style={{
                        borderTop: i ? `1px solid ${T.border}` : "none",
                        cursor: "pointer",
                        background: m.clave === claveMes ? soft : "transparent",
                      }}
                    >
                      <td style={{ padding: "10px 20px" }}>{m.etiquetaLarga}</td>
                      <td className="mono" style={{ padding: "10px 20px", textAlign: "right" }}>{m.leads}</td>
                      <td className="mono" style={{ padding: "10px 20px", textAlign: "right" }}>{m.ganados}</td>
                      <td className="mono" style={{ padding: "10px 20px", textAlign: "right", color: T.muted }}>
                        {m.leads ? `${Math.round((m.ganados / m.leads) * 100)}%` : "—"}
                      </td>
                      <td className="mono" style={{ padding: "10px 20px", textAlign: "right" }}>
                        {money(m.cerrado || null)}
                      </td>
                      <td className="mono" style={{ padding: "10px 20px", textAlign: "right", color: T.muted }}>
                        {money(m.pipeline || null)}
                      </td>
                    </tr>
                  ))}
                  {meses.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "22px 20px", fontSize: 12.5, color: T.faint }}>
                        {v.nombre} todavía no tiene actividad registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
              <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
                {acumulado ? "Cartera asignada" : `Leads de ${mesActual?.etiquetaLarga ?? "el mes"}`}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
                {propias.length} {propias.length === 1 ? "lead" : "leads"} ·{" "}
                {money(valorPipeline(propias) || null)} en oportunidades abiertas
              </p>
            </div>

            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {propias.slice(0, 60).map((o, i) => (
                <div
                  key={o.id}
                  className="row"
                  onClick={() => onOpen(o.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto 90px",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 20px",
                    cursor: "pointer",
                    borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: "0 0 2px", fontSize: 13 }}>{o.cliente}</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: T.faint }}>{o.producto}</p>
                  </div>
                  <span className="pill"
                    style={{
                      fontSize: 11.5,
                      padding: "3px 9px",
                      borderRadius: 20,
                      whiteSpace: "nowrap",
                      background: soft,
                      color: accent,
                    }}
                  >
                    {o.etapa}
                  </span>
                  <span className="mono" style={{ fontSize: 12.5, textAlign: "right" }}>
                    {money(o.valor)}
                  </span>
                </div>
              ))}
              {propias.length > 60 && (
                <p style={{ margin: 0, padding: "12px 20px", fontSize: 12, color: T.faint }}>
                  Mostrando 60 de {propias.length}. Elegí un mes para acotar la lista,
                  o usá Clientes para verla completa.
                </p>
              )}
              {propias.length === 0 && (
                <p style={{ margin: 0, padding: "26px 20px", fontSize: 12.5, color: T.faint }}>
                  {acumulado
                    ? `${v.nombre} no tiene oportunidades asignadas.`
                    : `${v.nombre} no registró leads en ${mesActual?.etiquetaLarga ?? "ese mes"}.`}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Los que están dados de baja.
 *
 * Va escondido detrás de un renglón, y sólo para dirección, porque no es
 * información del día a día. Existe por una razón concreta: sin esta lista, dar
 * de baja sería una puerta de una sola dirección —la persona desaparece de
 * todos lados y no queda ningún lugar donde volver a activarla—. También sirve
 * para entender por qué alguien «ya no aparece» sin tener que preguntar.
 */
function Bajas({ bajas, onHecho }: { bajas: Vendedor[]; onHecho: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reactivar = async (id: number) => {
    setTrabajando(id);
    setError(null);
    const r = await reactivarVendedor(id);
    setTrabajando(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onHecho();
  };

  return (
    <div style={{ borderTop: `1px solid ${T.border}` }}>
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "11px 14px",
          fontSize: 11.5,
          color: T.faint,
        }}
      >
        {abierto ? "▾" : "▸"} {bajas.length} dado{bajas.length === 1 ? "" : "s"} de baja
      </button>

      {abierto && (
        <div style={{ padding: "0 14px 12px" }}>
          {bajas.map((x) => (
            <div
              key={x.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "5px 0",
              }}
            >
              <span style={{ fontSize: 12.5, color: T.muted }}>{x.nombre}</span>
              <button
                type="button"
                onClick={() => void reactivar(x.id)}
                disabled={trabajando != null}
                style={{
                  fontSize: 11.5,
                  color: trabajando === x.id ? T.faint : T.ink,
                  cursor: trabajando != null ? "wait" : "pointer",
                }}
              >
                {trabajando === x.id ? "…" : "Reactivar"}
              </button>
            </div>
          ))}
          {error && (
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
