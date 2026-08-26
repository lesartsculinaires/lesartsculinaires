"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  activarTipoAutorizacion,
  cargarAutorizaciones,
  crearTipoAutorizacion,
  resolverAutorizacion,
  type Autorizacion,
  type ClaseAutorizacion,
  type TipoAutorizacion,
} from "@/app/autorizaciones-actions";
import { SelloAutorizacion } from "@/components/ui/SelloAutorizacion";
import { fechaCorta } from "@/lib/format";
import { T, softer } from "@/lib/theme";

interface Props {
  accent: string;
  /**
   * Dirección aprueba; los demás, si llegan a ver esta pantalla, miran.
   *
   * La base lo hace cumplir aparte. Esto sólo evita ofrecer botones que iban a
   * fallar: un «Autorizar» que devuelve un error se lee como que el CRM está
   * roto, no como que no te corresponde.
   */
  esAdmin: boolean;
  /** Para abrir la ficha del lead del que habla un pedido. */
  onAbrirFicha?: (oportunidadId: number) => void;
}

/**
 * Autorizaciones: el catálogo que arma dirección y los pedidos que resuelve.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ LOS PEDIDOS VAN ARRIBA
 * ------------------------------------------------------------------------
 *
 * Es lo único de esta pantalla que tiene apuro. El catálogo se arma una vez y
 * se toca cada tanto; los pedidos son gente esperando para cerrar una venta, y
 * cada día que uno queda sin responder es un día que el cliente se enfría.
 *
 * Por lo mismo los pendientes van primero dentro de su propia lista, y no por
 * fecha: lo resuelto es historial, y el historial no se lee, se consulta.
 */
export function Autorizaciones({ accent, esAdmin, onAbrirFicha }: Props) {
  const [tipos, setTipos] = useState<TipoAutorizacion[]>([]);
  const [pedidos, setPedidos] = useState<Autorizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [verResueltas, setVerResueltas] = useState(false);

  const recargar = useCallback(async () => {
    const r = await cargarAutorizaciones();
    setFaltaMigracion(r.faltaMigracion);
    if (r.ok) {
      setTipos(r.tipos);
      setPedidos(r.pedidos);
      setError(null);
    } else setError(r.error);
    setCargando(false);
  }, []);

  useEffect(() => {
    setCargando(true);
    void recargar();
  }, [recargar]);

  const pendientes = useMemo(
    () => pedidos.filter((p) => p.estado === "pendiente"),
    [pedidos],
  );
  const resueltas = useMemo(
    () => pedidos.filter((p) => p.estado !== "pendiente"),
    [pedidos],
  );

  const generales = useMemo(() => tipos.filter((t) => t.clase === "general"), [tipos]);
  const especificas = useMemo(
    () => tipos.filter((t) => t.clase === "especifica"),
    [tipos],
  );

  if (faltaMigracion) {
    return (
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700 }}>
          Falta un paso en la base
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          Para que este módulo funcione hay que correr{" "}
          <code>20261001120000_autorizaciones.sql</code> en Supabase, en el editor
          de SQL. Se puede con gente trabajando.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* ------------------------------------------------------ los pedidos */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <h2 className="dsp" style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>
            {pendientes.length === 0
              ? "No hay nada esperando"
              : pendientes.length === 1
                ? "1 pedido esperando"
                : `${pendientes.length} pedidos esperando`}
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: T.muted }}>
            Los pide el equipo desde la ficha del cliente.
          </p>
        </div>

        {esAdmin && (
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
            Crear autorización
          </button>
        )}
      </div>

      {error && (
        <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#A33", lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      {cargando ? (
        <p style={{ fontSize: 12.5, color: T.faint }}>Cargando…</p>
      ) : (
        <>
          {pendientes.map((p) => (
            <Pedido
              key={p.id}
              pedido={p}
              accent={accent}
              esAdmin={esAdmin}
              onAbrirFicha={onAbrirFicha}
              onResuelta={recargar}
            />
          ))}

          {resueltas.length > 0 && (
            <div style={{ marginTop: pendientes.length ? 14 : 0 }}>
              <button
                type="button"
                onClick={() => setVerResueltas((v) => !v)}
                style={{ fontSize: 12, color: accent, padding: "4px 0" }}
              >
                {verResueltas
                  ? "Ocultar las ya resueltas"
                  : `Ver las ${resueltas.length} ya resueltas ›`}
              </button>

              {verResueltas &&
                resueltas.map((p) => (
                  <Pedido
                    key={p.id}
                    pedido={p}
                    accent={accent}
                    esAdmin={esAdmin}
                    onAbrirFicha={onAbrirFicha}
                    onResuelta={recargar}
                  />
                ))}
            </div>
          )}
        </>
      )}

      {/* ----------------------------------------------------- el catálogo */}

      <div style={{ marginTop: 26 }}>
        <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 16, fontWeight: 700 }}>
          Qué se puede autorizar
        </h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          Esto es lo que el equipo ve para elegir al pedir. Las generales sirven
          para cualquier lead; las específicas se arman para un caso puntual.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          <ListaDeTipos
            titulo="Generales"
            explicacion="Sirven para cualquier lead."
            tipos={generales}
            accent={accent}
            esAdmin={esAdmin}
            onCambio={recargar}
          />
          <ListaDeTipos
            titulo="Específicas"
            explicacion="Armadas para un caso puntual."
            tipos={especificas}
            accent={accent}
            esAdmin={esAdmin}
            onCambio={recargar}
          />
        </div>
      </div>

      {creando && (
        <NuevaAutorizacion
          accent={accent}
          onCerrar={() => setCreando(false)}
          onCreada={recargar}
        />
      )}
    </div>
  );
}

/** Un pedido, con los dos botones cuando corresponde. */
function Pedido({
  pedido: p,
  accent,
  esAdmin,
  onAbrirFicha,
  onResuelta,
}: {
  pedido: Autorizacion;
  accent: string;
  esAdmin: boolean;
  onAbrirFicha?: (oportunidadId: number) => void;
  onResuelta: () => Promise<void>;
}) {
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState<"autorizada" | "rechazada" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolver = async (decision: "autorizada" | "rechazada") => {
    setGuardando(decision);
    setError(null);
    const r = await resolverAutorizacion(p.id, decision, comentario);
    setGuardando(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setComentario("");
    await onResuelta();
  };

  const puedeResolver = esAdmin && p.estado === "pendiente";

  return (
    <section
      className="card"
      style={{
        background: T.surface,
        border: `1px solid ${p.estado === "pendiente" ? softer(accent) : T.border}`,
        borderLeft: `3px solid ${p.estado === "pendiente" ? accent : T.border}`,
        borderRadius: 10,
        padding: "13px 15px",
        marginBottom: 9,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          flexWrap: "wrap",
          marginBottom: 6,
        }}
      >
        <SelloAutorizacion estado={p.estado} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
          {p.tipo ?? "Autorización"}
        </span>
        {p.clase && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: T.faint,
            }}
          >
            {p.clase === "general" ? "general" : "específica"}
          </span>
        )}
      </div>

      {/* De quién es. Sin esto dirección lee «descuento» y tiene que
          preguntar de quién, que es lo que este módulo vino a evitar. */}
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        {p.oportunidadId != null && onAbrirFicha ? (
          <button
            type="button"
            onClick={() => onAbrirFicha(p.oportunidadId as number)}
            style={{ fontSize: 12.5, color: accent, padding: 0 }}
          >
            {[p.codigo, p.cliente].filter(Boolean).join(" · ") || "Ver la ficha"} ›
          </button>
        ) : (
          <span style={{ fontSize: 12.5, color: T.faint }}>
            {[p.codigo, p.cliente].filter(Boolean).join(" · ") || "Sin lead asociado"}
          </span>
        )}
        <span style={{ fontSize: 11, color: T.faint }}>
          {[p.solicitadoPor && `pidió ${p.solicitadoPor}`, fechaCorta(p.solicitadoEn)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <p
        style={{
          margin: "8px 0 0",
          fontSize: 12.5,
          color: T.ink,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        {p.descripcion}
      </p>

      {p.estado !== "pendiente" && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 11.5,
            color: T.muted,
            lineHeight: 1.5,
            paddingLeft: 9,
            borderLeft: `2px solid ${T.border}`,
          }}
        >
          {p.estado === "autorizada" ? "Autorizada" : "Rechazada"}
          {p.resueltoPor ? ` por ${p.resueltoPor}` : ""}
          {p.resueltoEn ? ` el ${fechaCorta(p.resueltoEn)}` : ""}
          {p.comentario ? `: ${p.comentario}` : "."}
        </p>
      )}

      {error && (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#A33", lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      {puedeResolver && (
        <div style={{ marginTop: 11 }}>
          {/*
            El comentario es opcional al autorizar y vale oro al rechazar: un
            «no» sin motivo vuelve como el mismo pedido escrito de otra forma.
            No se hace obligatorio igual, porque frenar un «sí» por un campo de
            texto es peor que un sí sin explicación.
          */}
          <input
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Comentario para quien pidió (sobre todo si la rechazás)"
            style={{
              width: "100%",
              height: 32,
              padding: "0 9px",
              fontSize: 12.5,
              border: `1px solid ${T.border}`,
              borderRadius: 7,
              background: T.paper,
              color: T.ink,
              marginBottom: 8,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void resolver("autorizada")}
              disabled={guardando != null}
              style={{
                height: 33,
                padding: "0 15px",
                fontSize: 12.5,
                fontWeight: 600,
                borderRadius: 7,
                background: "#2F6B4F",
                color: "#fff",
                cursor: guardando ? "wait" : "pointer",
              }}
            >
              {guardando === "autorizada" ? "Autorizando…" : "Autorizar"}
            </button>
            <button
              type="button"
              onClick={() => void resolver("rechazada")}
              disabled={guardando != null}
              style={{
                height: 33,
                padding: "0 15px",
                fontSize: 12.5,
                fontWeight: 600,
                borderRadius: 7,
                border: `1px solid ${T.border}`,
                background: T.surface,
                color: "#A33",
                cursor: guardando ? "wait" : "pointer",
              }}
            >
              {guardando === "rechazada" ? "Rechazando…" : "Rechazar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Una de las dos columnas del catálogo. */
function ListaDeTipos({
  titulo,
  explicacion,
  tipos,
  accent,
  esAdmin,
  onCambio,
}: {
  titulo: string;
  explicacion: string;
  tipos: TipoAutorizacion[];
  accent: string;
  esAdmin: boolean;
  onCambio: () => Promise<void>;
}) {
  const [tocando, setTocando] = useState<number | null>(null);

  const cambiar = async (t: TipoAutorizacion) => {
    setTocando(t.id);
    await activarTipoAutorizacion(t.id, !t.activo);
    setTocando(null);
    await onCambio();
  };

  return (
    <section
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: 15,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 2,
        }}
      >
        <h4 className="dsp" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          {titulo}
        </h4>
        <span className="mono" style={{ fontSize: 11, color: T.faint }}>
          {tipos.length}
        </span>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 11, color: T.faint }}>{explicacion}</p>

      {tipos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: T.faint, lineHeight: 1.5 }}>
          Todavía no hay ninguna.
        </p>
      ) : (
        tipos.map((t, i) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "9px 0",
              borderTop: i ? `1px solid ${T.border}` : "none",
              opacity: t.activo ? 1 : 0.55,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: T.ink, fontWeight: 600 }}>
                {t.nombre}
                {!t.activo && (
                  <span style={{ fontWeight: 400, color: T.faint }}> · fuera de uso</span>
                )}
              </div>
              {t.descripcion && (
                <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.45 }}>
                  {t.descripcion}
                </div>
              )}
            </div>

            {esAdmin && (
              <button
                type="button"
                onClick={() => void cambiar(t)}
                disabled={tocando === t.id}
                title={
                  t.activo
                    ? "Dejar de ofrecerla al pedir. Los pedidos ya hechos no se tocan."
                    : "Volver a ofrecerla al pedir."
                }
                style={{
                  fontSize: 11.5,
                  padding: "3px 9px",
                  borderRadius: 6,
                  border: `1px solid ${T.border}`,
                  background: T.surface,
                  color: t.activo ? T.muted : accent,
                  whiteSpace: "nowrap",
                }}
              >
                {tocando === t.id ? "…" : t.activo ? "Dar de baja" : "Reactivar"}
              </button>
            )}
          </div>
        ))
      )}
    </section>
  );
}

/**
 * Alta de un tipo de autorización.
 *
 * La clase se elige acá y no se puede cambiar después a propósito: el equipo
 * aprende dónde buscar cada una, y una autorización que se muda de columna es
 * una que dejan de encontrar.
 */
function NuevaAutorizacion({
  accent,
  onCerrar,
  onCreada,
}: {
  accent: string;
  onCerrar: () => void;
  onCreada: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [clase, setClase] = useState<ClaseAutorizacion>("general");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const r = await crearTipoAutorizacion({ nombre, descripcion, clase });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await onCreada();
    onCerrar();
  };

  const listo = nombre.trim() !== "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crear autorización"
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
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          Crear autorización
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          Va a aparecer en la ficha de cada cliente, para que el equipo la elija
          al pedirte permiso.
        </p>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={ETIQUETA}>Nombre</span>
          <input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setError(null);
            }}
            placeholder="Descuento sobre el precio de lista"
            autoFocus
            style={CAMPO}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={ETIQUETA}>Tipo</span>
          <select
            value={clase}
            onChange={(e) => setClase(e.target.value as ClaseAutorizacion)}
            style={CAMPO}
          >
            <option value="general">General — sirve para cualquier lead</option>
            <option value="especifica">Específica — para un caso puntual</option>
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={ETIQUETA}>Para qué es (opcional)</span>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            placeholder="Una línea que le aclare al equipo cuándo corresponde pedirla."
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
            onClick={() => void guardar()}
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
            {guardando ? "Creando…" : "Crear autorización"}
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
