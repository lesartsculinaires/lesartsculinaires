"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { cancelarEnvio } from "@/app/envios-actions";
import { T } from "@/lib/theme";
import { comoSeLlama } from "@/lib/envios";
import { conValores } from "@/lib/whatsapp/huecos";
import type { Envio } from "@/lib/supabase/envios";

/**
 * Los envíos masivos y cómo les fue.
 *
 * ============================================================================
 * LO QUE ESTA PANTALLA TIENE QUE CONTESTAR
 * ============================================================================
 *
 * La escuela lo pidió así: «un total análisis y métricas de quiénes
 * contestaron a ese mensaje masivo». Una campaña se juzga por una sola cosa
 * —cuánta gente contestó— y todo lo demás está para explicar ese número
 * cuando es bajo:
 *
 *   NO LLEGÓ            teléfonos malos, números sin WhatsApp. Se arregla
 *                       limpiando la base.
 *   LLEGÓ Y NO SE LEYÓ  la hora a la que se mandó, o el mensaje no interesó
 *                       lo suficiente ni para abrirlo.
 *   SE LEYÓ Y NO CONTESTÓ  el mensaje no pedía nada, o pedía demasiado.
 *
 * Son tres problemas distintos con tres soluciones distintas, y un número solo
 * de «respuestas» no los separa.
 *
 * ============================================================================
 * EL EMBUDO BAJA SIEMPRE
 * ============================================================================
 *
 * Cada número incluye a los que avanzaron más: quien contestó también está
 * contado en «entregado» y en «leído». Sin eso, un envío que anduvo bien
 * mostraría «2 entregados» —los únicos que no avanzaron— y parecería un
 * desastre. La explicación de por qué está en `@/lib/supabase/envios`.
 */

export function Envios({
  envios,
  faltaMigracion,
  accent,
  onRefrescar,
}: {
  envios: Envio[];
  faltaMigracion: boolean;
  accent: string;
  onRefrescar: () => void;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);

  if (faltaMigracion) {
    return (
      <p style={aviso}>
        Los envíos masivos todavía no tienen sus tablas. Corré{" "}
        <code>supabase/migrations/20261014120000_envios_masivos.sql</code> en Supabase →
        SQL Editor y recargá.
      </p>
    );
  }

  if (envios.length === 0) {
    return (
      <div style={{ ...aviso, background: T.surface, color: T.muted }}>
        <p style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 600, color: T.ink }}>
          Todavía no se mandó ninguna campaña.
        </p>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
          Los envíos se arman desde <strong>Clientes</strong>: se filtra a quién se le
          quiere escribir —por programa, por etapa, por vendedor—, se marcan las filas
          con la casilla y aparece el botón «Escribirles por WhatsApp».
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6, color: T.faint }}>
          Se arma desde ahí y no desde acá a propósito: elegir a quién escribirle es un
          trabajo de filtrar, y esos filtros ya están en Clientes. Repetirlos en otra
          pantalla sería mantener dos buscadores que se van a ir pareciendo cada vez
          menos.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {envios.map((e) => (
        <Tarjeta
          key={e.id}
          envio={e}
          accent={accent}
          abierto={abierto === e.id}
          onAbrir={() => setAbierto(abierto === e.id ? null : e.id)}
          onRefrescar={onRefrescar}
        />
      ))}
    </div>
  );
}

function Tarjeta({
  envio: e,
  accent,
  abierto,
  onAbrir,
  onRefrescar,
}: {
  envio: Envio;
  accent: string;
  abierto: boolean;
  onAbrir: () => void;
  onRefrescar: () => void;
}) {
  const [cancelando, setCancelando] = useState(false);

  /** De los que recibieron, cuántos contestaron. */
  const tasa = useMemo(() => {
    if (e.entregados === 0) return null;
    return Math.round((e.respondieron / e.entregados) * 100);
  }, [e.entregados, e.respondieron]);

  const enCurso = e.estado === "enviando" && e.pendientes > 0;

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onAbrir}
        className="row"
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "13px 16px",
          background: "transparent",
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <span className="dsp" style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
            {e.nombre}
          </span>
          <span className="pill" style={pastilla(e.estado, accent)}>
            {COMO_SE_DICE[e.estado] ?? e.estado}
          </span>
          {e.plantillaNombre && (
            <span className="mono" style={{ fontSize: 11, color: T.faint }}>
              {e.plantillaNombre}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: T.faint }}>
            {cuando(e.creadoEn)}
          </span>
        </span>

        {/*
          El embudo, en una línea.

          «De 300 se entregaron 288, se leyeron 210 y contestaron 34» se lee de
          corrido y dice dónde se cayó. Cuatro números sueltos con sus rótulos
          ocuparían el doble y habría que compararlos a ojo.
        */}
        <span
          style={{
            display: "flex",
            gap: 14,
            marginTop: 7,
            fontSize: 12.5,
            color: T.muted,
            flexWrap: "wrap",
          }}
        >
          <Dato n={e.total} que="destinatarios" />
          <Dato n={e.entregados} que="entregados" />
          <Dato n={e.leidos} que="leídos" />
          <Dato n={e.respondieron} que="contestaron" fuerte accent={accent} />
          {tasa != null && (
            <span style={{ color: T.faint }}>
              ({tasa}% de los que recibieron)
            </span>
          )}
          {e.fallidos > 0 && <Dato n={e.fallidos} que="no llegaron" malo />}
          {enCurso && <Dato n={e.pendientes} que="por salir" />}
        </span>
      </button>

      {abierto && (
        <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${T.border}` }}>
          {e.cuerpo && (
            <>
              <p style={titulito}>Lo que se mandó</p>
              <p
                style={{
                  margin: "0 0 12px",
                  padding: "10px 12px",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  background: T.paper,
                  borderRadius: 8,
                  color: T.ink,
                }}
              >
                {/* Con un nombre de ejemplo: la plantilla cruda con «{{1}}» a
                    la vista no se parece a lo que recibió nadie. */}
                {conValores(
                  e.cuerpo,
                  e.valores.map((v) => (v.de === "nombre" ? "María" : v.texto)),
                )}
              </p>
              {e.valores.some((v) => v.de === "nombre") && (
                <p style={{ margin: "-8px 0 12px", fontSize: 11, color: T.faint }}>
                  «María» es un ejemplo: a cada quien le llegó con su propio nombre.
                </p>
              )}
              {e.valores.length > 0 && (
                <p style={{ margin: "-8px 0 12px", fontSize: 11, color: T.faint }}>
                  Datos: {e.valores.map(comoSeLlama).join(" · ")}
                </p>
              )}
            </>
          )}

          <p style={titulito}>Cómo le fue</p>
          <Barra envio={e} accent={accent} />

          {enCurso && (
            <button
              type="button"
              onClick={() => {
                setCancelando(true);
                void cancelarEnvio(e.id).then(() => {
                  setCancelando(false);
                  onRefrescar();
                });
              }}
              disabled={cancelando}
              style={{
                marginTop: 12,
                height: 30,
                padding: "0 12px",
                fontSize: 12.5,
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: T.surface,
                color: "#9E2F29",
                cursor: cancelando ? "wait" : "pointer",
              }}
            >
              {cancelando ? "Frenando…" : `Frenar: quedan ${e.pendientes} por salir`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** El embudo dibujado, para verlo sin leer números. */
function Barra({ envio: e, accent }: { envio: Envio; accent: string }) {
  const filas: { que: string; n: number; color: string }[] = [
    { que: "Se mandaron", n: e.enviados, color: T.border },
    { que: "Llegaron al teléfono", n: e.entregados, color: "#B8C4DC" },
    { que: "Se leyeron", n: e.leidos, color: "#8FA3C8" },
    { que: "Contestaron", n: e.respondieron, color: accent },
  ];

  const tope = Math.max(e.total, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {filas.map((f) => (
        <div key={f.que} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 150, fontSize: 12, color: T.muted, flexShrink: 0 }}>
            {f.que}
          </span>
          <span
            style={{
              flex: 1,
              height: 16,
              borderRadius: 4,
              background: T.paper,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                width: `${Math.round((f.n / tope) * 100)}%`,
                height: "100%",
                background: f.color,
              }}
            />
          </span>
          <span className="mono" style={{ width: 44, fontSize: 12, textAlign: "right" }}>
            {f.n}
          </span>
        </div>
      ))}

      {(e.fallidos > 0 || e.omitidos > 0) && (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
          {e.fallidos > 0 && (
            <>
              {e.fallidos} no llegaron: el número no tiene WhatsApp o Meta los rechazó.{" "}
            </>
          )}
          {e.omitidos > 0 && <>{e.omitidos} quedaron sin salir porque se frenó el envío.</>}
        </p>
      )}
    </div>
  );
}

const Dato = ({
  n,
  que,
  fuerte,
  malo,
  accent,
}: {
  n: number;
  que: string;
  fuerte?: boolean;
  malo?: boolean;
  accent?: string;
}) => (
  <span style={{ color: malo ? "#9E2F29" : fuerte ? accent : T.muted }}>
    <strong className="mono" style={{ fontWeight: fuerte ? 700 : 600 }}>{n}</strong> {que}
  </span>
);

const COMO_SE_DICE: Record<string, string> = {
  borrador: "sin mandar",
  enviando: "mandando",
  terminado: "terminado",
  cancelado: "frenado",
};

const cuando = (iso: string) =>
  new Date(iso).toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const pastilla = (estado: string, accent: string): CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 700,
  padding: "1px 8px",
  borderRadius: 20,
  background:
    estado === "enviando" ? accent : estado === "cancelado" ? "#F7EBE9" : T.paper,
  color: estado === "enviando" ? "#fff" : estado === "cancelado" ? "#8C3B2F" : T.muted,
});

const titulito: CSSProperties = {
  margin: "12px 0 6px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: T.faint,
};

const aviso: CSSProperties = {
  margin: 0,
  padding: "16px 18px",
  fontSize: 13,
  lineHeight: 1.6,
  borderRadius: 9,
  background: "#F6EEDC",
  color: "#7A5A12",
};
