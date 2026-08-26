"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  cargarAutorizaciones,
  solicitarAutorizacion,
  type Autorizacion,
  type ClaseAutorizacion,
  type TipoAutorizacion,
} from "@/app/autorizaciones-actions";
import { SelloAutorizacion } from "@/components/ui/SelloAutorizacion";
import { fechaCorta } from "@/lib/format";
import { T, softer } from "@/lib/theme";

interface Props {
  oportunidadId: number;
  /** Para nombrar de quién es el pedido en el cuadro. */
  cliente: string;
  accent: string;
}

/**
 * Pedir una autorización desde la ficha, y ver en qué quedaron las pedidas.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ LAS DOS COSAS EN EL MISMO LUGAR
 * ------------------------------------------------------------------------
 *
 * El botón sin la lista deja a quien pidió sin saber si le contestaron, y lo
 * que hace entonces es preguntar por WhatsApp o volver a pedir lo mismo. Un
 * pedido repetido no es sólo ruido: dirección ve dos y no sabe si son dos
 * descuentos distintos o el mismo escrito dos veces.
 *
 * Lo de esta ficha lo ve quien puede ver la ficha —eso lo decide la base, no
 * esta pantalla—. El módulo de Autorizaciones, que es donde se aprueban y
 * donde están las de toda la escuela, es de dirección.
 */
export function AutorizacionesDelLead({ oportunidadId, cliente, accent }: Props) {
  const [tipos, setTipos] = useState<TipoAutorizacion[]>([]);
  const [pedidos, setPedidos] = useState<Autorizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  /**
   * Al desmontar se deja de escribir en el estado: la ficha se cierra sola
   * mientras una consulta está en camino más seguido de lo que parece.
   */
  const [vivo, setVivo] = useState(true);
  useEffect(() => {
    setVivo(true);
    return () => setVivo(false);
  }, []);

  const recargar = useCallback(async () => {
    const r = await cargarAutorizaciones(oportunidadId);
    setFaltaMigracion(r.faltaMigracion);
    if (r.ok) {
      setTipos(r.tipos);
      setPedidos(r.pedidos);
    } else setError(r.error);
    setCargando(false);
  }, [oportunidadId]);

  useEffect(() => {
    setCargando(true);
    void recargar();
  }, [recargar]);

  // Las de baja se siguen mostrando en los pedidos viejos, pero ya no se
  // ofrecen para pedir una nueva.
  const disponibles = useMemo(() => tipos.filter((t) => t.activo), [tipos]);

  if (faltaMigracion) {
    return (
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.5 }}>
        Para pedir autorizaciones falta correr la migración{" "}
        <code>20261001120000_autorizaciones.sql</code> en Supabase.
      </p>
    );
  }

  const sinTipos = !cargando && disponibles.length === 0;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setPidiendo(true)}
          disabled={cargando || sinTipos}
          style={{
            height: 34,
            padding: "0 14px",
            fontSize: 12.5,
            borderRadius: 7,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: sinTipos ? T.faint : T.ink,
            cursor: sinTipos ? "not-allowed" : "pointer",
          }}
        >
          Solicitar autorización
        </button>
        <span style={{ fontSize: 11, color: T.faint, lineHeight: 1.4 }}>
          {sinTipos
            ? "Todavía no hay autorizaciones cargadas. Las crea dirección."
            : "Un descuento, un plan de pago distinto: lo resuelve dirección."}
        </span>
      </div>

      {error && (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#A33", lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      {!cargando && pedidos.length > 0 && (
        <div
          style={{
            marginTop: 10,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {pedidos.map((p, i) => (
            <div
              key={p.id}
              style={{
                padding: "9px 11px",
                borderTop: i ? `1px solid ${T.border}` : "none",
                background: T.surface,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 3,
                }}
              >
                <SelloAutorizacion estado={p.estado} />
                <span style={{ fontSize: 12.5, color: T.ink, fontWeight: 600 }}>
                  {p.tipo ?? "Autorización"}
                </span>
                <span style={{ fontSize: 11, color: T.faint }}>
                  {[p.solicitadoPor, fechaCorta(p.solicitadoEn)].filter(Boolean).join(" · ")}
                </span>
              </div>

              <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
                {p.descripcion}
              </p>

              {/* La respuesta de dirección, cuando la hay. Es lo que esta
                  persona vino a buscar, así que se destaca del pedido. */}
              {(p.comentario || p.estado !== "pendiente") && (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 11.5,
                    color: T.ink,
                    lineHeight: 1.5,
                    paddingLeft: 9,
                    borderLeft: `2px solid ${softer(accent)}`,
                  }}
                >
                  {p.estado === "autorizada" ? "Autorizada" : "Rechazada"}
                  {p.resueltoPor ? ` por ${p.resueltoPor}` : ""}
                  {p.resueltoEn ? ` el ${fechaCorta(p.resueltoEn)}` : ""}
                  {p.comentario ? `: ${p.comentario}` : "."}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {pidiendo && (
        <PedirAutorizacion
          oportunidadId={oportunidadId}
          cliente={cliente}
          tipos={disponibles}
          accent={accent}
          onCerrar={() => setPidiendo(false)}
          onPedida={() => {
            if (vivo) void recargar();
          }}
        />
      )}
    </div>
  );
}

/**
 * El cuadro de pedir: qué autorización y por qué.
 *
 * El motivo es obligatorio y el botón queda apagado hasta que haya uno. No es
 * burocracia: dirección aprueba o rechaza leyendo eso y nada más, y un pedido
 * que dice «descuento» a secas termina en una llamada para preguntar cuánto.
 */
function PedirAutorizacion({
  oportunidadId,
  cliente,
  tipos,
  accent,
  onCerrar,
  onPedida,
}: {
  oportunidadId: number;
  cliente: string;
  tipos: TipoAutorizacion[];
  accent: string;
  onCerrar: () => void;
  onPedida: () => void;
}) {
  const [tipoId, setTipoId] = useState<number | null>(tipos[0]?.id ?? null);
  const [detalle, setDetalle] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegido = tipos.find((t) => t.id === tipoId) ?? null;
  const porClase = (clase: ClaseAutorizacion) => tipos.filter((t) => t.clase === clase);

  const pedir = async () => {
    if (tipoId == null) return;
    setGuardando(true);
    setError(null);

    const r = await solicitarAutorizacion({ oportunidadId, tipoId, detalle });

    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onPedida();
    onCerrar();
  };

  const listo = detalle.trim() !== "" && tipoId != null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Solicitar autorización"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
        background: "rgba(3, 27, 79, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          Solicitar autorización
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          Para {cliente}. Va a la lista de Autorizaciones, donde dirección la
          aprueba o la rechaza.
        </p>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={ETIQUETA}>Qué estás pidiendo</span>
          <select
            value={tipoId ?? ""}
            onChange={(e) => setTipoId(Number(e.target.value))}
            autoFocus
            style={CAMPO}
          >
            {/*
              Agrupadas por clase, que es como las pidió la escuela: de un
              vistazo se ve cuáles son las de siempre y cuáles se armaron para
              un caso puntual. Un grupo vacío no se dibuja: un encabezado sin
              nada debajo se lee como que algo no cargó.
            */}
            {(["general", "especifica"] as const).map((clase) =>
              porClase(clase).length === 0 ? null : (
                <optgroup
                  key={clase}
                  label={clase === "general" ? "Generales" : "Específicas"}
                >
                  {porClase(clase).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </label>

        {elegido?.descripcion && (
          <p style={{ margin: "-4px 0 12px", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
            {elegido.descripcion}
          </p>
        )}

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={ETIQUETA}>Por qué</span>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            rows={4}
            placeholder="Cuánto, desde cuándo, qué dijo el cliente. Es lo único que dirección va a leer."
            style={{
              ...CAMPO,
              height: "auto",
              padding: "8px 9px",
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
        </label>

        {error && (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
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
            onClick={() => void pedir()}
            disabled={guardando || !listo}
            style={{
              height: 36,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 7,
              background: listo ? accent : T.border,
              color: listo ? "#fff" : T.faint,
              cursor: guardando ? "wait" : listo ? "pointer" : "not-allowed",
            }}
          >
            {guardando ? "Enviando…" : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CAMPO: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 9px",
  fontSize: 13,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

const ETIQUETA: React.CSSProperties = {
  display: "block",
  marginBottom: 3,
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.faint,
};
