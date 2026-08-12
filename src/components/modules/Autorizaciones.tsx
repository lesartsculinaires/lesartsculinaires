"use client";

import { useMemo, useState } from "react";

import {
  pedirAutorizacion,
  reabrirAutorizacion,
  resolverAutorizacion,
} from "@/app/actions";
import { CampoTexto } from "@/components/ui/CampoTexto";
import { fechaCorta, horaDe } from "@/lib/format";
import { T, softer } from "@/lib/theme";
import type { Autorizacion, EstadoAutorizacion, Usuario } from "@/lib/types";

interface Props {
  autorizaciones: Autorizacion[];
  /** Para mostrar quién pidió y quién resolvió, en vez del identificador. */
  usuarios: readonly Usuario[];
  /** Sólo dirección general ve los botones de resolver. */
  esAdmin: boolean;
  faltaMigracion: boolean;
  accent: string;
  onRefresh: () => void;
}

const TONO: Record<EstadoAutorizacion, { fg: string; bg: string; texto: string }> = {
  pendiente: { fg: "#8A6200", bg: "#FFF6D6", texto: "Pendiente" },
  autorizada: { fg: "#2F6B4F", bg: "#E6F0E9", texto: "Autorizada" },
  rechazada: { fg: "#B85042", bg: "#F7EBE9", texto: "Rechazada" },
};

export function Autorizaciones({
  autorizaciones,
  usuarios,
  esAdmin,
  faltaMigracion,
  accent,
  onRefresh,
}: Props) {
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [comentario, setComentario] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const nombreDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usuarios) m.set(u.id, u.nombre || u.correo);
    return (id: string | null) => (id ? (m.get(id) ?? "—") : "—");
  }, [usuarios]);

  // Lo que espera decisión va arriba: es lo único accionable.
  const ordenadas = useMemo(() => {
    const peso = (e: EstadoAutorizacion) => (e === "pendiente" ? 0 : 1);
    return [...autorizaciones].sort(
      (a, b) =>
        peso(a.estado) - peso(b.estado) ||
        b.solicitadoEn.localeCompare(a.solicitadoEn),
    );
  }, [autorizaciones]);

  const pendientes = ordenadas.filter((a) => a.estado === "pendiente").length;

  const pedir = async () => {
    setBusy(true);
    setError(null);
    const r = await pedirAutorizacion(nombre, descripcion);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setNombre("");
    setDescripcion("");
    setAbierta(false);
    setAviso("Autorización solicitada. Queda pendiente de dirección general.");
    onRefresh();
  };

  const resolver = async (id: number, estado: "autorizada" | "rechazada") => {
    setBusy(true);
    setError(null);
    const r = await resolverAutorizacion(id, estado, comentario[id] ?? "");
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setComentario((c) => ({ ...c, [id]: "" }));
    setAviso(estado === "autorizada" ? "Autorizada." : "Rechazada.");
    onRefresh();
  };

  const reabrir = async (id: number) => {
    setBusy(true);
    setError(null);
    const r = await reabrirAutorizacion(id);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setAviso("Volvió a quedar pendiente.");
      onRefresh();
    }
  };

  if (faltaMigracion) {
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
        La tabla de autorizaciones todavía no existe. Corré{" "}
        <code>supabase/migrations/20260731130000_autorizaciones.sql</code> en
        Supabase → SQL Editor y recargá. Esa migración también deja escrito en la
        base que sólo un administrador puede autorizar, así que no alcanza con
        crear la tabla a mano.
      </p>
    );
  }

  const boton = (fondo: string) => ({
    height: 30,
    padding: "0 13px",
    fontSize: 12.5,
    borderRadius: 6,
    background: fondo,
    color: "#fff",
  });

  return (
    <div>
      {error && (
        <p
          style={{
            margin: "0 0 14px",
            padding: "10px 14px",
            fontSize: 12.5,
            borderRadius: 9,
            background: "#F7EBE9",
            color: "#8C3B2F",
          }}
        >
          {error}
        </p>
      )}
      {aviso && !error && (
        <p
          style={{
            margin: "0 0 14px",
            padding: "10px 14px",
            fontSize: 12.5,
            borderRadius: 9,
            background: "#E6F0E9",
            color: "#2F6B4F",
          }}
        >
          {aviso}
        </p>
      )}

      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            padding: "14px 18px",
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
              Autorizaciones de dirección general
            </p>
            <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
              {pendientes === 0
                ? "No hay nada esperando decisión."
                : `${pendientes} ${pendientes === 1 ? "espera" : "esperan"} decisión.`}{" "}
              {esAdmin
                ? "Podés autorizar o rechazar cada una."
                : "Sólo dirección general puede autorizarlas."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAbierta((v) => !v);
              setError(null);
              setAviso(null);
            }}
            style={{
              flexShrink: 0,
              height: 32,
              padding: "0 14px",
              fontSize: 12.5,
              borderRadius: 6,
              background: abierta ? T.paper : accent,
              color: abierta ? T.muted : "#fff",
            }}
          >
            {abierta ? "Cancelar" : "+ Pedir autorización"}
          </button>
        </div>

        {abierta && (
          <div
            style={{
              padding: "16px 18px",
              borderBottom: `1px solid ${T.border}`,
              background: softer(accent),
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <label style={{ display: "block" }}>
              <span style={{ display: "block", marginBottom: 4, fontSize: 11.5, color: T.muted }}>
                Nombre
              </span>
              <CampoTexto
                valor={nombre}
                onCambio={setNombre}
                placeholder="Ej: Beca del 30% para Diplomado de Cocina"
                accent={accent}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", marginBottom: 4, fontSize: 11.5, color: T.muted }}>
                Descripción
              </span>
              <CampoTexto
                valor={descripcion}
                onCambio={setDescripcion}
                multilinea
                filas={3}
                placeholder="A quién aplica, por qué, hasta cuándo y qué impacto tiene en el precio."
                accent={accent}
              />
            </label>
            <div>
              <button
                type="button"
                onClick={pedir}
                disabled={busy || !nombre.trim()}
                style={{
                  height: 34,
                  padding: "0 16px",
                  fontSize: 13,
                  borderRadius: 7,
                  background: !busy && nombre.trim() ? accent : T.border,
                  color: !busy && nombre.trim() ? "#fff" : T.faint,
                }}
              >
                {busy ? "Enviando…" : "Pedir autorización"}
              </button>
            </div>
          </div>
        )}

        {ordenadas.map((a, i) => {
          const t = TONO[a.estado];
          return (
            <div
              key={a.id}
              style={{
                padding: "15px 18px",
                borderTop: i ? `1px solid ${T.border}` : "none",
                background: a.estado === "pendiente" ? T.surface : T.paper,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>{a.nombre}</p>
                  {a.descripcion && (
                    <p
                      style={{
                        margin: "0 0 6px",
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        color: T.muted,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {a.descripcion}
                    </p>
                  )}
                  <p className="mono" style={{ margin: 0, fontSize: 11, color: T.faint }}>
                    Pedida por {nombreDe(a.solicitadoPor)} · {fechaCorta(a.solicitadoEn)}{" "}
                    {horaDe(a.solicitadoEn)}
                    {a.resueltoEn && (
                      <>
                        {" · "}
                        {a.estado === "autorizada" ? "Autorizada" : "Rechazada"} por{" "}
                        {nombreDe(a.resueltoPor)} · {fechaCorta(a.resueltoEn)}
                      </>
                    )}
                  </p>
                  {a.comentario && (
                    <p
                      style={{
                        margin: "7px 0 0",
                        padding: "7px 11px",
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        borderRadius: 7,
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        color: T.muted,
                      }}
                    >
                      {a.comentario}
                    </p>
                  )}
                </div>

                <span
                  className="pill"
                  style={{
                    flexShrink: 0,
                    fontSize: 11.5,
                    padding: "4px 11px",
                    borderRadius: 20,
                    background: t.bg,
                    color: t.fg,
                    fontWeight: 500,
                  }}
                >
                  {t.texto}
                </span>
              </div>

              {esAdmin && a.estado === "pendiente" && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginTop: 11,
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    value={comentario[a.id] ?? ""}
                    onChange={(e) =>
                      setComentario((c) => ({ ...c, [a.id]: e.target.value }))
                    }
                    placeholder="Comentario (opcional, obligatorio si rechazás)"
                    style={{
                      flex: "1 1 240px",
                      height: 30,
                      padding: "0 10px",
                      fontSize: 12.5,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      background: T.paper,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => resolver(a.id, "autorizada")}
                    disabled={busy}
                    style={boton("#2F6B4F")}
                  >
                    Autorizar
                  </button>
                  <button
                    type="button"
                    onClick={() => resolver(a.id, "rechazada")}
                    disabled={busy || !(comentario[a.id] ?? "").trim()}
                    title={
                      (comentario[a.id] ?? "").trim()
                        ? "Rechazar"
                        : "Escribí el motivo del rechazo"
                    }
                    style={{
                      ...boton((comentario[a.id] ?? "").trim() ? "#B85042" : T.border),
                      color: (comentario[a.id] ?? "").trim() ? "#fff" : T.faint,
                    }}
                  >
                    Rechazar
                  </button>
                </div>
              )}

              {esAdmin && a.estado !== "pendiente" && (
                <button
                  type="button"
                  onClick={() => reabrir(a.id)}
                  disabled={busy}
                  style={{ marginTop: 9, fontSize: 12, color: T.muted, textDecoration: "underline" }}
                >
                  Volver a pendiente
                </button>
              )}
            </div>
          );
        })}

        {ordenadas.length === 0 && (
          <p style={{ margin: 0, padding: "28px 18px", fontSize: 12.5, color: T.faint }}>
            Todavía no hay autorizaciones. Usá «Pedir autorización» para la primera.
          </p>
        )}
      </div>
    </div>
  );
}
