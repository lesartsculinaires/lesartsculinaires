"use client";

import { useCallback, useEffect, useState } from "react";

import { buscarActividad, type FiltrosActividad } from "@/app/actividad-actions";
import {
  ACCIONES,
  ENTIDADES,
  POR_TANDA,
  detallar,
  quien,
  redactar,
  type Evento,
} from "@/lib/actividad";
import { cuandoConHora } from "@/lib/format";
import { T } from "@/lib/theme";
import type { Catalogo, Usuario } from "@/lib/types";

interface Props {
  accent: string;
  catalogo: Catalogo;
  /** Para poder filtrar por persona. */
  usuarios: readonly Usuario[];
  esAdmin: boolean;
  /**
   * Abre la ficha de la que habla el renglón. Sin esto el módulo cuenta lo que
   * pasó y deja a quien lo lee buscando la ficha a mano, que es justo lo que
   * viene a hacer después de leerlo.
   */
  onAbrirFicha?: (oportunidadId: number) => void;
}

/**
 * El módulo Notificaciones: todo lo que se hizo, con el detalle.
 *
 * Convive con la campana y no la reemplaza, porque resuelven cosas distintas.
 * La campana es para enterarse de paso —«¿qué pasó mientras no miraba?»— y por
 * eso resume y se cierra sola. Esto es para buscar: quién tocó qué, cuándo, y
 * de qué valor a qué valor. Los dos leen la misma tabla.
 *
 * El archivo se llama `RegistroActividad` y no `Notificaciones` para no chocar
 * con el de la campana; en el menú aparece con el nombre que se pidió.
 *
 * Quién ve qué NO se decide acá: lo hace cumplir la política de la base, que
 * deja a ventas ver lo suyo y a dirección ver todo. Este módulo muestra lo que
 * le devuelvan.
 */
export function RegistroActividad({
  accent,
  catalogo,
  usuarios,
  esAdmin,
  onAbrirFicha,
}: Props) {
  const [filtros, setFiltros] = useState<FiltrosActividad>({});
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [trayendoMas, setTrayendoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);

  const buscar = useCallback(async (f: FiltrosActividad) => {
    setCargando(true);
    const r = await buscarActividad(f);
    setFaltaMigracion(r.faltaMigracion);
    if (r.ok) {
      setEventos(r.eventos);
      setTotal(r.total);
      setError(null);
    } else {
      setError(r.error);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void buscar(filtros);
  }, [buscar, filtros]);

  /** Trae la tanda siguiente y la suma abajo, sin perder lo ya leído. */
  const traerMas = async () => {
    setTrayendoMas(true);
    const r = await buscarActividad({ ...filtros, saltar: eventos.length });
    if (r.ok) setEventos((previos) => [...previos, ...r.eventos]);
    else setError(r.error);
    setTrayendoMas(false);
  };

  const poner = (cambio: Partial<FiltrosActividad>) =>
    setFiltros((f) => ({ ...f, ...cambio }));

  const hayFiltros = Object.values(filtros).some((v) => v);

  if (faltaMigracion) {
    return (
      <p style={{ fontSize: 13, color: T.warn, lineHeight: 1.6 }}>
        Para ver el registro falta correr la migración{" "}
        <code>20260823120000_actividad.sql</code> en Supabase.
      </p>
    );
  }

  return (
    <div>
      {/* --------------------------------------------------------- filtros */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: 14,
        }}
      >
        {/* Filtrar por persona sólo tiene sentido para quien ve a más de una.
            A ventas la base ya le devuelve nada más lo suyo, así que el menú
            ofrecería opciones que siempre dan vacío. */}
        {esAdmin && (
          <Campo etiqueta="Quién">
            <select
              value={filtros.actor ?? ""}
              onChange={(e) => poner({ actor: e.target.value || undefined })}
              style={SELECT}
            >
              <option value="">Cualquiera</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre || u.correo}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo etiqueta="Qué">
          <select
            value={filtros.entidad ?? ""}
            onChange={(e) => poner({ entidad: e.target.value || undefined })}
            style={SELECT}
          >
            <option value="">Todo</option>
            {ENTIDADES.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Acción">
          <select
            value={filtros.accion ?? ""}
            onChange={(e) => poner({ accion: e.target.value || undefined })}
            style={SELECT}
          >
            <option value="">Todas</option>
            {ACCIONES.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Desde">
          <input
            type="date"
            value={filtros.desde ?? ""}
            onChange={(e) => poner({ desde: e.target.value || undefined })}
            style={SELECT}
          />
        </Campo>

        <Campo etiqueta="Hasta">
          <input
            type="date"
            value={filtros.hasta ?? ""}
            onChange={(e) => poner({ hasta: e.target.value || undefined })}
            style={SELECT}
          />
        </Campo>

        {hayFiltros && (
          <button
            type="button"
            onClick={() => setFiltros({})}
            style={{
              height: 32,
              padding: "0 12px",
              fontSize: 12.5,
              borderRadius: 7,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.muted,
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      <p style={{ margin: "0 0 12px", fontSize: 12, color: T.muted }}>
        {cargando
          ? "Buscando…"
          : total === 0
            ? "Sin resultados"
            : `${total} ${total === 1 ? "acción" : "acciones"}${
                hayFiltros ? " con estos filtros" : ""
              }`}
        {!esAdmin && " · sólo se muestran tus acciones"}
      </p>

      {error && (
        <p style={{ fontSize: 12.5, color: T.warn, lineHeight: 1.5 }}>
          No se pudo leer el registro: {error}
        </p>
      )}

      {/* ----------------------------------------------------------- lista */}
      {eventos.length > 0 && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 9, overflow: "hidden" }}>
          {eventos.map((e, i) => (
            <Fila
              key={e.id}
              evento={e}
              catalogo={catalogo}
              primera={i === 0}
              accent={accent}
              onAbrir={onAbrirFicha}
            />
          ))}
        </div>
      )}

      {eventos.length < total && (
        <button
          type="button"
          onClick={() => void traerMas()}
          disabled={trayendoMas}
          style={{
            marginTop: 12,
            height: 34,
            padding: "0 16px",
            fontSize: 12.5,
            borderRadius: 7,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: accent,
          }}
        >
          {trayendoMas
            ? "Trayendo…"
            : `Ver ${Math.min(POR_TANDA, total - eventos.length)} más`}
        </button>
      )}
    </div>
  );
}

const SELECT: React.CSSProperties = {
  height: 32,
  padding: "0 8px",
  fontSize: 12.5,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint }}>
        {etiqueta}
      </span>
      {children}
    </label>
  );
}

function Fila({
  evento: e,
  catalogo,
  primera,
  accent,
  onAbrir,
}: {
  evento: Evento;
  catalogo: Catalogo;
  primera: boolean;
  accent: string;
  onAbrir?: (oportunidadId: number) => void;
}) {
  const cambios = detallar(e, catalogo);

  // No todo renglón lleva a algún lado: un vendedor o un programa del catálogo
  // no cuelgan de ninguna ficha. Los que sí, se abren con un clic.
  const abrible = e.oportunidadId != null && onAbrir != null;

  return (
    <div
      onClick={abrible ? () => onAbrir(e.oportunidadId as number) : undefined}
      style={{
        padding: "10px 13px",
        borderTop: primera ? "none" : `1px solid ${T.border}`,
        background: T.surface,
        cursor: abrible ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.45 }}>
        {redactar(e, catalogo)}
        {abrible && (
          <span style={{ marginLeft: 6, fontSize: 11.5, color: accent }}>Ver ficha ›</span>
        )}
      </div>
      <div style={{ marginTop: 2, fontSize: 11.5, color: T.faint }}>
        {quien(e.actor)} · {cuandoConHora(e.creadoEn)}
      </div>

      {/* El antes y el después, que es para lo que existe este módulo. La
          campana no los muestra porque ahí sólo hace falta enterarse. */}
      {cambios.length > 0 && (
        <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
          {cambios.map((c) => (
            <div
              key={c.campo}
              style={{
                display: "flex",
                gap: 7,
                flexWrap: "wrap",
                alignItems: "baseline",
                fontSize: 11.5,
              }}
            >
              <span style={{ color: T.muted, minWidth: 108 }}>{c.campo}</span>
              <span style={{ color: T.faint, textDecoration: "line-through" }}>{c.antes}</span>
              <span aria-hidden style={{ color: T.faint }}>→</span>
              <span style={{ color: accent, fontWeight: 600 }}>{c.despues}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
