"use client";

import { useState } from "react";

import { guardarHorarioDePrograma } from "@/app/programas-actions";
import { NuevoPrograma } from "@/components/modules/NuevoPrograma";
import { useCatalogo } from "@/lib/catalog";
import { money } from "@/lib/format";
import { estaAbierta, esGanada, totalCerrado, valorPipeline } from "@/lib/selectors";
import { T, softer } from "@/lib/theme";
import type { Oportunidad, Producto } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  accent: string;
  categoria: string;
  onCategoria: (c: string) => void;
  onVerLeads: (productoId: number) => void;
  /**
   * Crear programas es cosa de dirección: el catálogo lo comparten todas las
   * pantallas, y un nombre de más parte los reportes de todo el equipo. La
   * base lo hace cumplir aparte; esto sólo evita ofrecer un botón que iba a
   * fallar.
   */
  esAdmin: boolean;
  /** Para volver a pedir el catálogo cuando se crea uno. */
  onRefrescar: () => void;
}

const CATEGORIAS = ["Todos", "Diplomado", "Curso corto", "Certificación", "Otro"];

export function Programas({
  oportunidades,
  accent,
  categoria,
  onCategoria,
  onVerLeads,
  esAdmin,
  onRefrescar,
}: Props) {
  const { productos } = useCatalogo();
  const soft = softer(accent);
  const [creando, setCreando] = useState(false);

  const visibles = productos.filter(
    (p) => categoria === "Todos" || p.categoria === categoria,
  );

  const stats = [
    { label: "Programas", value: String(productos.length) },
    {
      label: "Con demanda",
      value: String(
        productos.filter((p) => oportunidades.some((o) => o.productoId === p.id))
          .length,
      ),
    },
    { label: "Valor en pipeline", value: money(valorPipeline(oportunidades) || null) },
    { label: "Venta cerrada", value: money(totalCerrado(oportunidades) || null) },
  ];

  return (
    <div>
      {esAdmin && (
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
            Crear nuevo programa
          </button>
        </div>
      )}

      {creando && (
        <NuevoPrograma
          accent={accent}
          onCerrar={() => setCreando(false)}
          onCreado={onRefrescar}
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: "12px 15px",
            }}
          >
            <p style={{ margin: "0 0 5px", fontSize: 11, color: T.muted }}>{s.label}</p>
            <p className="mono dsp" style={{ margin: 0, fontSize: 21, fontWeight: 500 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {CATEGORIAS.map((c) => {
          const on = c === categoria;
          const n =
            c === "Todos"
              ? productos.length
              : productos.filter((p) => p.categoria === c).length;
          if (n === 0 && c !== "Todos") return null;
          return (
            <button
              type="button"
              key={c}
              onClick={() => onCategoria(c)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 32,
                padding: "0 13px",
                fontSize: 13,
                borderRadius: 7,
                border: `1px solid ${on ? accent : T.border}`,
                background: on ? soft : T.surface,
                color: on ? accent : T.muted,
              }}
            >
              {c}
              <span style={{ fontSize: 11, color: on ? accent : T.faint }}>{n}</span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(268px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {visibles.map((p) => {
          const leads = oportunidades.filter((o) => o.productoId === p.id);
          const abiertas = leads.filter(estaAbierta);
          const inscritos = leads.filter(esGanada).length;
          const cerrado = totalCerrado(leads);

          return (
            <section
              key={p.id}
              className="card"
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: T.faint,
                  }}
                >
                  {p.categoria}
                </span>
                {inscritos > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "3px 9px",
                      borderRadius: 20,
                      whiteSpace: "nowrap",
                      background: "#E6F0E9",
                      color: "#2F6B4F",
                    }}
                  >
                    {inscritos} {inscritos === 1 ? "inscrito" : "inscritos"}
                  </span>
                )}
              </div>

              <h3
                className="dsp"
                style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}
              >
                {p.nombre}
              </h3>

              <HorarioDelPrograma
                producto={p}
                accent={accent}
                puedeEditar={esAdmin}
                onGuardado={onRefrescar}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <div style={{ background: T.paper, borderRadius: 7, padding: "9px 11px" }}>
                  <p style={{ margin: "0 0 3px", fontSize: 10.5, color: T.muted }}>
                    En pipeline
                  </p>
                  <p className="mono" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
                    {money(abiertas.reduce((a, o) => a + (o.valor ?? 0), 0) || null)}
                  </p>
                </div>
                <div
                  style={{
                    background: cerrado ? soft : T.paper,
                    borderRadius: 7,
                    padding: "9px 11px",
                  }}
                >
                  <p style={{ margin: "0 0 3px", fontSize: 10.5, color: T.muted }}>
                    Cerrado
                  </p>
                  <p
                    className="mono"
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 500,
                      color: cerrado ? accent : T.faint,
                    }}
                  >
                    {money(cerrado || null)}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: `1px solid ${T.border}`,
                  paddingTop: 11,
                }}
              >
                <span style={{ fontSize: 12, color: T.muted }}>
                  {p.precio != null ? `Lista ${money(p.precio)}` : "Sin precio de lista"}
                </span>
                <button
                  type="button"
                  onClick={() => onVerLeads(p.id)}
                  style={{ fontSize: 12, color: accent, whiteSpace: "nowrap" }}
                >
                  {leads.length
                    ? `${leads.length} ${leads.length === 1 ? "lead" : "leads"} ›`
                    : "Sin leads"}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/**
 * El horario vigente del programa, editable por dirección.
 *
 * ------------------------------------------------------------------------
 * QUÉ ES Y QUÉ NO ES
 * ------------------------------------------------------------------------
 *
 * Es el borrador que va a ver ventas cuando cargue un lead de este programa, y
 * que entra a su ficha con un clic. NO es lo que dice ningún recibo ya
 * emitido: cada inscripción guardó su propio horario el día que se cerró.
 *
 * Eso es lo que hace que se pueda tocar sin miedo, y por eso el cartel de
 * abajo lo dice con todas las letras. La escuela cambia el horario cada año, y
 * la pregunta que se va a hacer quien esté por editarlo es exactamente «¿esto
 * le va a cambiar el horario a los que ya inscribí?».
 *
 * ------------------------------------------------------------------------
 * POR QUÉ SE VE AUNQUE NO SE PUEDA EDITAR
 * ------------------------------------------------------------------------
 *
 * Porque a un asesor le sirve leerlo: es el horario que va a copiar en la
 * ficha. Lo que se esconde es el botón de editar, no el dato.
 */
function HorarioDelPrograma({
  producto,
  accent,
  puedeEditar,
  onGuardado,
}: {
  producto: Producto;
  accent: string;
  puedeEditar: boolean;
  onGuardado: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(producto.horario ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const r = await guardarHorarioDePrograma(producto.id, texto);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar.");
      return;
    }
    setEditando(false);
    onGuardado();
  };

  if (!editando) {
    return (
      <div
        style={{
          marginBottom: 12,
          padding: "8px 11px",
          borderRadius: 7,
          background: T.paper,
          border: `1px solid ${T.border}`,
        }}
      >
        <p style={{ margin: "0 0 3px", fontSize: 10.5, color: T.muted }}>Horario vigente</p>
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            color: producto.horario ? T.ink : T.faint,
          }}
        >
          {producto.horario ?? "Sin cargar"}
        </p>
        {puedeEditar && (
          <button
            type="button"
            onClick={() => {
              setTexto(producto.horario ?? "");
              setEditando(true);
            }}
            style={{ marginTop: 5, fontSize: 11.5, color: accent }}
          >
            {producto.horario ? "Cambiar" : "Cargar horario"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 12,
        padding: "9px 11px",
        borderRadius: 7,
        background: T.paper,
        border: `1px solid ${accent}`,
      }}
    >
      <p style={{ margin: "0 0 5px", fontSize: 10.5, color: T.muted }}>Horario vigente</p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Ej.: Sábados de 8:00 a 12:00, del 15/02 al 20/06"
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: 12.5,
          lineHeight: 1.45,
          resize: "vertical",
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          background: T.surface,
          color: T.ink,
        }}
      />
      <p style={{ margin: "6px 0 0", fontSize: 11, color: T.faint, lineHeight: 1.45 }}>
        Es el borrador para los leads nuevos. Las inscripciones que ya se cerraron
        conservan el horario con el que se cerraron; esto no las toca.
      </p>
      {error && (
        <p style={{ margin: "5px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 7 }}>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando}
          style={{
            height: 28,
            padding: "0 12px",
            fontSize: 12,
            borderRadius: 6,
            background: accent,
            color: "#fff",
          }}
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditando(false);
            setError(null);
          }}
          disabled={guardando}
          style={{ fontSize: 12, color: T.muted }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
