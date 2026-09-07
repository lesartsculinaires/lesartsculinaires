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

/**
 * Cómo le fue al envío, en porcentajes.
 *
 * ============================================================================
 * POR QUÉ EL PORCENTAJE Y NO SÓLO EL NÚMERO
 * ============================================================================
 *
 * Porque «210 leídos» no dice si el envío fue bueno. Sobre 300 es muy bueno;
 * sobre 2.000, malo. La escuela pidió verlo «de una manera más gráfica y
 * visual, para entender si fue efectivo el envío», y eso es exactamente lo que
 * falta cuando hay cuatro números sueltos: el término de comparación.
 *
 * ============================================================================
 * TODO SE MIDE SOBRE LOS QUE RECIBIERON, NO SOBRE EL TOTAL
 * ============================================================================
 *
 * Es la decisión que hace que estos números signifiquen algo. Si de 300 se
 * entregaron 100 y lo leyeron 80, la tasa de lectura es 80% —de los que lo
 * recibieron, casi todos lo abrieron— y no 27%. Medir sobre el total mezcla dos
 * cosas distintas: cuántos teléfonos servían, que es un problema de la base, y
 * cuánto interesó el mensaje, que es lo que se quiere saber acá.
 *
 * La entrega sí se mide sobre el total, porque eso es justamente lo que mide:
 * cuántos de los que se intentó llegaron.
 */
function Barra({ envio: e, accent }: { envio: Envio; accent: string }) {
  /*
   * La base de cada porcentaje.
   *
   * `entregados` cuando lo hay. Cuando no llegó ninguno —lo que le pasó a la
   * escuela— dividir por cero daría NaN en pantalla, así que esas filas se
   * muestran en cero: es la verdad, no hubo a quién leerle nada.
   */
  const recibieron = Math.max(e.entregados, 0);
  const pct = (n: number, sobre: number) =>
    sobre > 0 ? Math.round((n / sobre) * 100) : 0;

  const filas: {
    que: string;
    n: number;
    porcentaje: number;
    sobre: string;
    color: string;
  }[] = [
    {
      que: "Llegaron al teléfono",
      n: e.entregados,
      porcentaje: pct(e.entregados, e.total),
      sobre: "de los que se mandaron",
      color: "#B8C4DC",
    },
    {
      que: "Lo abrieron",
      n: e.leidos,
      porcentaje: pct(e.leidos, recibieron),
      sobre: "de los que lo recibieron",
      color: "#8FA3C8",
    },
    {
      que: "Contestaron",
      n: e.respondieron,
      porcentaje: pct(e.respondieron, recibieron),
      sobre: "de los que lo recibieron",
      color: accent,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {filas.map((f) => (
        <div key={f.que} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 132, fontSize: 12, color: T.muted, flexShrink: 0 }}>
            {f.que}
          </span>
          <span
            style={{
              flex: 1,
              height: 18,
              borderRadius: 4,
              background: T.paper,
              overflow: "hidden",
              minWidth: 60,
            }}
          >
            <span
              style={{
                display: "block",
                width: `${f.porcentaje}%`,
                height: "100%",
                background: f.color,
                transition: "width .3s",
              }}
            />
          </span>
          {/*
            El porcentaje grande y el número al lado, chico.

            Quien mira quiere saber si funcionó, y eso lo dice el porcentaje.
            El número absoluto hace falta igual —para saber a cuánta gente hay
            que darle seguimiento— pero es el segundo dato, no el primero.
          */}
          <span
            className="mono"
            style={{ width: 46, fontSize: 13, fontWeight: 600, textAlign: "right", color: T.ink }}
          >
            {f.porcentaje}%
          </span>
          <span
            className="mono"
            style={{ width: 54, fontSize: 11.5, textAlign: "right", color: T.faint }}
            title={`${f.n} ${f.sobre}`}
          >
            {f.n}
          </span>
        </div>
      ))}

      {/*
        Lo que dijo Meta, con sus palabras.

        Acá decía «el número no tiene WhatsApp o Meta los rechazó», que era una
        suposición escrita a mano: mandaba a revisar los teléfonos aunque el
        problema fuera la forma de pago de la cuenta o una plantilla pausada.
        El motivo real ya venía guardado; ahora se muestra.
      */}
      {e.motivos.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 8,
            background: "#FBF0EE",
            border: "1px solid #EBD5D1",
          }}
        >
          <p style={{ margin: "0 0 6px", fontSize: 11.5, fontWeight: 600, color: "#9E2F29" }}>
            {e.fallidos === 1 ? "1 no llegó" : `${e.fallidos} no llegaron`} — esto contestó Meta
          </p>
          {e.motivos.map((m) => (
            <p
              key={m.motivo}
              style={{
                margin: "0 0 4px",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#7A2B26",
                display: "flex",
                gap: 8,
              }}
            >
              <span className="mono" style={{ flexShrink: 0, fontWeight: 600 }}>
                {m.cuantos}×
              </span>
              <span>{m.motivo}</span>
            </p>
          ))}
          {/*
            Si TODOS fallaron por lo mismo, no son los teléfonos.

            Es la lectura que el CRM puede hacer y quien mira no tiene por qué
            saber hacer: un motivo único repetido en todos es siempre algo de la
            cuenta o de la plantilla, y no hay nada que revisar en la base.
          */}
          {e.motivos.length === 1 && e.fallidos === e.total && e.total > 1 && (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 11.5,
                lineHeight: 1.5,
                color: "#7A2B26",
                fontWeight: 600,
              }}
            >
              Fallaron todos por lo mismo, así que no son los números: es algo de la cuenta
              o de la plantilla. Arreglá eso y volvé a mandar.
            </p>
          )}
        </div>
      )}

      {e.omitidos > 0 && (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
          {e.omitidos} quedaron sin salir porque se frenó el envío.
        </p>
      )}

      {/*
        Con quiénes hubo conversación.

        «Contestaron 34» es un número; los nombres son la lista de a quién
        llamar mañana, que es para lo que se hizo la campaña.
      */}
      {e.contestaron.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: "0 0 5px", fontSize: 11, color: T.faint, textTransform: "uppercase", letterSpacing: ".05em" }}>
            Contestaron
          </p>
          <p style={{ margin: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {e.contestaron.map((c) => (
              <span
                key={c.telefono}
                className="pill"
                style={{
                  fontSize: 11.5,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "#E8F0EA",
                  color: "#2F6B4F",
                }}
              >
                {c.nombre ?? `+${c.telefono}`}
              </span>
            ))}
          </p>
        </div>
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
