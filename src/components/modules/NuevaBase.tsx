"use client";

import { useState } from "react";

import { crearBaseConLeads } from "@/app/bases-actions";
import { T } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";

/**
 * Armar una base con los leads marcados en Clientes.
 *
 * ============================================================================
 * POR QUÉ HAY UNA VENTANA Y NO UN BOTÓN QUE LO HAGA Y LISTO
 * ============================================================================
 *
 * Por dos cosas que hay que decir ANTES, no después.
 *
 * LA PRIMERA es el nombre. Una base sin nombre es una fila más en la lista de
 * Bases que nadie va a poder distinguir de las otras dentro de un mes; y el
 * nombre no se puede adivinar desde acá, porque lo que hace que esa selección
 * tenga sentido —«los de la feria de agosto», «los que preguntaron por
 * Barismo»— está en la cabeza de quien marcó las filas, no en los datos.
 *
 * LA SEGUNDA es lo que se rompe. Un lead pertenece a UNA sola base: la columna
 * es una. Meter en una base nueva un lead que ya estaba en otra lo saca de
 * aquélla, y la vieja pasa a mostrar menos filas de las que dice haber
 * cargado. Eso no se puede hacer en silencio, así que se cuenta acá y se dice
 * con el número puesto antes de tocar nada.
 *
 * Y no se impide: agrupar leads que vinieron de una planilla vieja es una
 * razón perfectamente buena para armar una base nueva. Lo que no puede pasar
 * es que ocurra sin que se sepa.
 */
export function NuevaBase({
  ids,
  oportunidades,
  accent,
  onCerrar,
  onListo,
}: {
  /** Los leads marcados. */
  ids: readonly number[];
  /** Todas las de la pantalla, para poder contar cuáles ya tienen base. */
  oportunidades: readonly Oportunidad[];
  accent: string;
  onCerrar: () => void;
  /** Recibe el resumen ya escrito, para mostrarlo donde estaba la selección. */
  onListo: (resumen: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Cuántos de los marcados ya están en una base.
   *
   * Se cuenta acá con lo que ya está en pantalla, sin preguntarle al servidor:
   * es para avisar, y el número que vale —el que se dice después— lo devuelve
   * la acción, que es la que mira la base de datos en el momento de escribir.
   */
  const yaEnOtra = oportunidades.filter(
    (o) => ids.includes(o.id) && o.importacionId != null,
  ).length;

  const crear = async () => {
    setGuardando(true);
    setError(null);

    const r = await crearBaseConLeads(nombre, [...ids]);
    setGuardando(false);

    if (!r.ok) {
      setError(r.error);
      return;
    }

    onListo(
      `Se creó la base «${nombre.trim()}» con ${r.leads} ${r.leads === 1 ? "lead" : "leads"}.` +
        (r.movidos > 0
          ? ` ${r.movidos} ${r.movidos === 1 ? "venía" : "venían"} de otra base y ${r.movidos === 1 ? "se movió" : "se movieron"} a ésta.`
          : ""),
    );
  };

  return (
    <div
      role="dialog"
      aria-label="Crear una base nueva"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "grid",
        placeItems: "center",
        background: "rgba(3, 27, 79, 0.35)",
        padding: 16,
      }}
      onClick={(e) => {
        // Sólo el fondo cierra. Un clic adentro no puede tirar lo escrito.
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div
        style={{
          width: "min(460px, 100%)",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 20px 50px rgba(3, 27, 79, 0.25)",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 500 }}>
          Crear una base nueva
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
          Con {ids.length} {ids.length === 1 ? "lead marcado" : "leads marcados"}. Va a
          aparecer en <strong>Bases</strong>, igual que las que se suben por planilla.
        </p>

        <label style={{ display: "block", marginBottom: 4, fontSize: 11, color: T.muted }}>
          Nombre de la base
        </label>
        <input
          autoFocus
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nombre.trim() && !guardando) void crear();
            if (e.key === "Escape" && !guardando) onCerrar();
          }}
          placeholder="Ej: Feria de agosto — interesados en Barismo"
          style={{
            width: "100%",
            height: 34,
            boxSizing: "border-box",
            padding: "0 9px",
            fontSize: 13,
            borderRadius: 7,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.ink,
          }}
        />

        {/*
          El aviso de lo que se mueve.

          Va con el número puesto y antes del botón, no después de apretarlo.
          Un lead está en una sola base: si ya estaba en otra, ésta se lo lleva
          y la vieja queda con menos filas de las que dice haber cargado.
        */}
        {yaEnOtra > 0 && (
          <p
            style={{
              margin: "12px 0 0",
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              background: "#F6EEDC",
              color: "#7A5A12",
            }}
          >
            {yaEnOtra === 1
              ? "1 de los marcados ya está en otra base y se va a mover a ésta: un lead pertenece a una sola."
              : `${yaEnOtra} de los marcados ya están en otras bases y se van a mover a ésta: un lead pertenece a una sola.`}
          </p>
        )}

        {error && (
          <p
            role="alert"
            style={{ margin: "12px 0 0", fontSize: 12, color: "#B85042", lineHeight: 1.45 }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            style={{
              height: 32,
              padding: "0 13px",
              fontSize: 12.5,
              borderRadius: 7,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.muted,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void crear()}
            disabled={guardando || !nombre.trim()}
            style={{
              height: 32,
              padding: "0 15px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 7,
              background: nombre.trim() ? accent : T.border,
              color: nombre.trim() ? "#fff" : T.faint,
              cursor: guardando ? "wait" : nombre.trim() ? "pointer" : "not-allowed",
            }}
          >
            {guardando ? "Creando…" : "Crear base"}
          </button>
        </div>
      </div>
    </div>
  );
}
