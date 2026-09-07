"use client";

import { T } from "@/lib/theme";
import { comoSeLlama } from "@/lib/envios";
import { conValores } from "@/lib/whatsapp/huecos";
import type { Envio } from "@/lib/supabase/envios";

/**
 * Los envíos masivos, dentro de la bandeja.
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA, Y QUÉ SE PUEDE DE VERDAD
 * ============================================================================
 *
 * «Cuando se envíen los mensajes, que aparezcan como un grupo de chat en el
 * módulo de Inbox, o en otra pestaña que diga "grupos de whatsapp", para no
 * confundirlos con la lista de whatsapp.»
 *
 * La segunda mitad es exactamente esto. La primera no se puede, y conviene
 * decirlo acá antes que descubrirlo:
 *
 *   NO EXISTEN LOS GRUPOS EN LA API   La API de WhatsApp Business no crea
 *                                     grupos, no manda mensajes a un grupo y
 *                                     no puede entrar a uno. Es una decisión
 *                                     de Meta, no algo que falte programar. Un
 *                                     envío masivo son trescientos mensajes
 *                                     individuales: cada persona lo recibe como
 *                                     un mensaje suyo y no ve a los demás.
 *
 * Y eso, para vender, es MEJOR que un grupo: quien contesta lo hace en su
 * propio chat, con su asesora, sin que trescientas personas lean la respuesta.
 * Lo que faltaba no era el grupo sino poder ver el envío como una sola cosa en
 * vez de trescientas, y eso es lo que hay acá.
 *
 * ============================================================================
 * POR QUÉ NO SE INVENTAN CONVERSACIONES
 * ============================================================================
 *
 * La otra forma de hacerlo era crear una fila en `conversaciones` por cada
 * envío, para que apareciera sola en la lista de chats. Sería más fácil y
 * rompería dos cosas:
 *
 *   EL CONTADOR ROJO      La barra cuenta hilos con mensajes sin leer. Un envío
 *                         no es un pendiente de nadie: nadie tiene que
 *                         contestarlo.
 *
 *   LA BANDEJA COMO FILA  La lista de chats es la cola de trabajo del equipo.
 *   DE TRABAJO            Metiéndole los envíos, cada campaña empujaría los
 *                         chats de gente real hacia abajo.
 *
 * Por eso es una pestaña aparte que lee de `envios`, que es donde ya está todo.
 */
export function Difusiones({
  envios,
  elegido,
  accent,
  onElegir,
}: {
  envios: Envio[];
  elegido: number | null;
  accent: string;
  onElegir: (id: number | null) => void;
}) {
  if (envios.length === 0) {
    return (
      <p style={{ margin: 0, padding: 16, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
        Todavía no se mandó ningún envío masivo. Se arman desde <strong>Clientes</strong>:
        se marcan los leads y se aprieta «Escribirles por WhatsApp».
      </p>
    );
  }

  return (
    <div>
      {envios.map((e) => {
        const activo = e.id === elegido;
        const llegaron = e.total > 0 ? Math.round((e.entregados / e.total) * 100) : 0;

        return (
          <button
            key={e.id}
            type="button"
            className="row"
            onClick={() => onElegir(activo ? null : e.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              border: "none",
              borderBottom: `1px solid ${T.border}`,
              borderLeft: `3px solid ${activo ? accent : "transparent"}`,
              background: activo ? T.paper : "transparent",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 13,
                fontWeight: 600,
                color: T.ink,
              }}
            >
              <span aria-hidden style={{ fontSize: 11 }}>📣</span>
              <span
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {e.nombre}
              </span>
              <span style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 10.5, color: T.faint, flexShrink: 0 }}>
                {dia(e.creadoEn)}
              </span>
            </span>

            <span
              style={{
                display: "block",
                marginTop: 3,
                fontSize: 12,
                color: T.muted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {e.cuerpo
                ? conValores(
                    e.cuerpo,
                    e.valores.map((v) => (v.de === "nombre" ? "María" : v.texto)),
                  ).replace(/\s+/g, " ")
                : "Sin plantilla todavía"}
            </span>

            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 5,
                fontSize: 11,
                color: T.faint,
              }}
            >
              <span>
                {e.total} {e.total === 1 ? "persona" : "personas"}
              </span>
              {/*
                Cuando nada llegó se dice en rojo y no con un 0% gris.

                Es el caso que le pasó a la escuela, y en gris se lee como «no
                hay datos todavía» en vez de «esto falló». La diferencia decide
                si alguien va a mirar el detalle.
              */}
              {e.fallidos > 0 && e.entregados === 0 ? (
                <span style={{ color: "#B85042", fontWeight: 600 }}>· no llegó ninguno</span>
              ) : (
                <span>· {llegaron}% llegó</span>
              )}
              {e.respondieron > 0 && (
                <span style={{ color: "#2F6B4F", fontWeight: 600 }}>
                  · {e.respondieron} {e.respondieron === 1 ? "contestó" : "contestaron"}
                </span>
              )}
              {e.pendientes > 0 && <span>· {e.pendientes} por salir</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * El detalle de una difusión, en la columna de la derecha.
 *
 * Va donde va la conversación abierta y con la misma forma: quien mira una
 * difusión está haciendo lo mismo que cuando mira un chat —leer qué se dijo y
 * qué pasó— y cambiar la disposición lo obligaría a reaprender la pantalla.
 */
export function DifusionAbierta({
  envio: e,
  accent,
  onVerEnvios,
}: {
  envio: Envio;
  accent: string;
  /** Para ir al módulo de Envíos, donde está el detalle completo. */
  onVerEnvios: () => void;
}) {
  const recibieron = Math.max(e.entregados, 0);
  const pct = (n: number, sobre: number) => (sobre > 0 ? Math.round((n / sobre) * 100) : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          padding: "11px 14px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span>
          <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>
            📣 {e.nombre}
          </span>
          <span className="mono" style={{ fontSize: 11, color: T.faint }}>
            Difusión · {e.total} {e.total === 1 ? "persona" : "personas"} ·{" "}
            {cuando(e.creadoEn)}
            {e.plantillaNombre && ` · ${e.plantillaNombre}`}
          </span>
        </span>

        <button
          type="button"
          onClick={onVerEnvios}
          style={{
            height: 30,
            padding: "0 12px",
            fontSize: 12.5,
            borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.muted,
            cursor: "pointer",
          }}
        >
          Ver el detalle en Envíos
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {/*
          El mensaje, como una burbuja saliente.

          Es lo mismo que recibió cada persona, así que se muestra como se
          muestra en un chat: si se viera como una ficha de datos habría que
          traducir mentalmente de «campaña» a «lo que le llegó a la gente».
        */}
        {e.cuerpo && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            <div
              style={{
                maxWidth: "min(560px, 85%)",
                padding: "9px 12px",
                borderRadius: "12px 12px 3px 12px",
                background: "#DCF3E4",
                color: T.ink,
                fontSize: 13,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {conValores(
                e.cuerpo,
                e.valores.map((v) => (v.de === "nombre" ? "María" : v.texto)),
              )}
            </div>
          </div>
        )}

        {e.valores.some((v) => v.de === "nombre") && (
          <p style={{ margin: "0 0 14px", fontSize: 11, color: T.faint, textAlign: "right" }}>
            «María» es un ejemplo: a cada quien le llegó con su propio nombre.
          </p>
        )}
        {e.valores.length > 0 && !e.valores.some((v) => v.de === "nombre") && (
          <p style={{ margin: "0 0 14px", fontSize: 11, color: T.faint, textAlign: "right" }}>
            Datos: {e.valores.map(comoSeLlama).join(" · ")}
          </p>
        )}

        <p style={rotulo}>Cómo le fue</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <Cuadro n={e.entregados} de={pct(e.entregados, e.total)} que="llegaron" />
          <Cuadro n={e.leidos} de={pct(e.leidos, recibieron)} que="lo abrieron" />
          <Cuadro
            n={e.respondieron}
            de={pct(e.respondieron, recibieron)}
            que="contestaron"
            color={accent}
          />
          {e.fallidos > 0 && (
            <Cuadro n={e.fallidos} de={pct(e.fallidos, e.total)} que="no llegaron" color="#B85042" />
          )}
        </div>

        {e.motivos.length > 0 && (
          <>
            <p style={rotulo}>Esto contestó Meta</p>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#FBF0EE",
                border: "1px solid #EBD5D1",
                marginBottom: 14,
              }}
            >
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
            </div>
          </>
        )}

        {e.contestaron.length > 0 && (
          <>
            <p style={rotulo}>Contestaron</p>
            <p style={{ margin: "0 0 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {e.contestaron.map((c) => (
                <span
                  key={c.telefono}
                  style={{
                    fontSize: 11.5,
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: "#E8F0EA",
                    color: "#2F6B4F",
                    fontWeight: 600,
                  }}
                >
                  {c.nombre ?? `+${c.telefono}`}
                </span>
              ))}
            </p>
          </>
        )}

        {/*
          Lo que hay que saber para no buscar un grupo que no existe.

          Va al pie y no arriba: quien entra viene a ver cómo le fue, no a leer
          una explicación. Pero tiene que estar, porque «¿dónde está el grupo?»
          es la pregunta que sigue.
        */}
        <p
          style={{
            margin: "18px 0 0",
            padding: "10px 12px",
            borderRadius: 8,
            background: T.paper,
            fontSize: 11.5,
            lineHeight: 1.6,
            color: T.muted,
          }}
        >
          Esto no es un grupo de WhatsApp: la API de Meta no permite crearlos ni escribirles.
          Cada persona recibió el mensaje en su propio chat, sin ver a las demás, y quien
          conteste va a aparecer en la lista de conversaciones con su asesora.
        </p>
      </div>
    </div>
  );
}

function Cuadro({
  n,
  de,
  que,
  color,
}: {
  n: number;
  de: number;
  que: string;
  color?: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 110px",
        padding: "9px 11px",
        borderRadius: 9,
        border: `1px solid ${T.border}`,
        background: T.surface,
      }}
    >
      <span
        className="mono"
        style={{ display: "block", fontSize: 19, fontWeight: 700, color: color ?? T.ink }}
      >
        {de}%
      </span>
      <span style={{ display: "block", fontSize: 11.5, color: T.muted }}>
        {que} <span style={{ color: T.faint }}>({n})</span>
      </span>
    </div>
  );
}

const rotulo = {
  margin: "0 0 6px",
  fontSize: 10.5,
  fontWeight: 600,
  color: T.faint,
  textTransform: "uppercase",
  letterSpacing: ".06em",
} as const;

const dia = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short" });
};

const cuando = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("es-SV", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};
