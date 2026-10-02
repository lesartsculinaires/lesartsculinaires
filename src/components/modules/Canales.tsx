"use client";

import { useCallback, useEffect, useState } from "react";

import { desconectarCuenta, estadoDeCanales, type EstadoCanales } from "@/app/conexiones-actions";
import { T } from "@/lib/theme";

/**
 * Las cuentas de WhatsApp, Instagram y Messenger que el CRM tiene conectadas.
 *
 * ============================================================================
 * POR QUÉ ESTA PANTALLA, Y POR QUÉ AHORA
 * ============================================================================
 *
 * Hasta ahora conectar un canal era editar variables en Netlify y volver a
 * desplegar. Funciona para quien tiene esa llave y es invisible para el resto:
 * cuando la escuela preguntó «¿están conectados los tres canales?», contestarlo
 * costó media hora de consultas a Meta.
 *
 * Y hace falta por algo más concreto: para aprobar los mensajes de Instagram,
 * META MANDA A UNA PERSONA A PROBAR EL PRODUCTO, y esa persona tiene que poder
 * conectar SU PROPIA cuenta de Instagram. Si lo único que existe es editar
 * Netlify, el revisor no puede hacer la prueba y la revisión se rechaza. El
 * botón de abajo es, literalmente, lo que esa revisión pide ver.
 *
 * ============================================================================
 * LAS VARIABLES NO DESAPARECEN
 * ============================================================================
 *
 * La cuenta de la escuela sigue viniendo de las variables del servidor y cada
 * tarjeta lo dice. Conectar desde acá AGREGA cuentas; no reemplaza la que ya
 * funciona, y por eso desconectar lo que se conectó desde acá nunca deja al
 * CRM sin poder contestarle a nadie.
 */

const COMO_SE_LLAMA: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger (Facebook)",
};

/** Lo que dice la vuelta del diálogo de Meta, en castellano. */
const COMO_FUE: Record<string, { bien: boolean; dice: string }> = {
  conectado: { bien: true, dice: "Cuenta conectada." },
  conectado_con_avisos: {
    bien: false,
    dice:
      "La cuenta quedó guardada, pero algo no salió del todo. Si no entran mensajes, " +
      "lo más probable es que falte suscribir la Página al webhook: volvé a conectar.",
  },
  cancelado: { bien: false, dice: "Se canceló en la pantalla de Facebook, así que no se conectó nada." },
  sin_paginas: {
    bien: false,
    dice:
      "Esa cuenta no administra ninguna Página, o no se eligió ninguna en el diálogo. " +
      "Instagram necesita estar ligado a una Página de Facebook para poder recibir mensajes.",
  },
  sin_codigo: { bien: false, dice: "Facebook volvió sin código. Probá de nuevo." },
  state_invalido: {
    bien: false,
    dice: "La vuelta no coincide con la salida. Volvé a empezar desde el botón, sin usar atrás.",
  },
  falta_secreto: { bien: false, dice: "Falta el secreto de la app en el servidor." },
  faltan_variables: {
    bien: false,
    dice: "Faltan NEXT_PUBLIC_FACEBOOK_APP_ID o NEXT_PUBLIC_FACEBOOK_CONFIG_ID en el servidor.",
  },
  canje_fallo: { bien: false, dice: "Facebook no aceptó el código." },
  no_se_guardo: { bien: false, dice: "No se pudo guardar la conexión." },
  error: { bien: false, dice: "No se pudo completar la conexión." },
};

export function Canales({ accent }: { accent: string }) {
  const [estado, setEstado] = useState<EstadoCanales | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [vuelta, setVuelta] = useState<{ bien: boolean; dice: string; detalle: string | null } | null>(
    null,
  );

  const releer = useCallback(async () => {
    setEstado(await estadoDeCanales());
  }, []);

  useEffect(() => {
    void releer();
  }, [releer]);

  /*
   * El resultado de la conexión llega por la dirección, no por un estado.
   *
   * Es inevitable y está bien: el diálogo de Meta se lleva el navegador a otro
   * sitio y lo devuelve. Lo que no puede quedar es el aviso pegado en la barra
   * para siempre, así que se lee y se limpia.
   */
  useEffect(() => {
    const u = new URL(window.location.href);
    const que = u.searchParams.get("conectar");
    if (!que) return;

    setVuelta({
      ...(COMO_FUE[que] ?? { bien: false, dice: `Meta contestó «${que}».` }),
      detalle: u.searchParams.get("detalle"),
    });

    u.searchParams.delete("conectar");
    u.searchParams.delete("detalle");
    window.history.replaceState({}, "", u.toString());
  }, []);

  if (!estado) {
    return <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Leyendo las conexiones…</p>;
  }

  if (!estado.ok) {
    return (
      <p style={{ margin: 0, padding: 14, fontSize: 13, color: "#8C3B2F", background: "#FBF0EE", borderRadius: 8 }}>
        {estado.error}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: T.muted }}>
        Con qué cuentas habla el CRM. La cuenta de la escuela viene de las variables del
        servidor; desde acá se pueden conectar otras —por ejemplo, la de quien revisa la
        aplicación en Meta— sin tocar nada del servidor.
      </p>

      {vuelta && (
        <div
          data-vuelta-conectar
          style={{
            padding: "11px 13px",
            borderRadius: 8,
            fontSize: 12.5,
            lineHeight: 1.55,
            background: vuelta.bien ? "#EDF4EE" : "#FBF0EE",
            border: `1px solid ${vuelta.bien ? "#CFE3D4" : "#EBD5D1"}`,
            color: vuelta.bien ? "#2F5D3A" : "#8C3B2F",
          }}
        >
          {vuelta.dice}
          {vuelta.detalle && (
            <span style={{ display: "block", marginTop: 4, fontSize: 11.5, opacity: 0.85 }}>
              {vuelta.detalle}
            </span>
          )}
        </div>
      )}

      {estado.canales.map((c) => (
        <div
          key={c.canal}
          data-canal={c.canal}
          style={{
            padding: 15,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            <span className="dsp" style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
              {COMO_SE_LLAMA[c.canal] ?? c.canal}
            </span>
            <span
              className="pill"
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                background: c.porVariables || c.conectadas.some((x) => x.activo) ? "#EDF4EE" : "#F7EBE9",
                color: c.porVariables || c.conectadas.some((x) => x.activo) ? "#2F5D3A" : "#8C3B2F",
              }}
            >
              {c.porVariables || c.conectadas.some((x) => x.activo) ? "conectado" : "sin conectar"}
            </span>
          </div>

          <p style={{ margin: "7px 0 0", fontSize: 12.5, color: T.muted }}>
            {c.porVariables
              ? "La cuenta de la escuela, configurada en el servidor."
              : "No hay cuenta configurada en el servidor."}
          </p>

          {c.conectadas.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
              {c.conectadas.map((x) => (
                <div
                  key={x.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    background: T.paper,
                    borderRadius: 7,
                    fontSize: 12.5,
                    opacity: x.activo ? 1 : 0.55,
                  }}
                >
                  <span style={{ flex: 1, color: T.ink }}>
                    {x.pageNombre ?? "Página sin nombre"}
                    <span className="mono" style={{ marginLeft: 7, fontSize: 11, color: T.faint }}>
                      {x.igId ? `IG ${x.igId}` : `Página ${x.pageId}`}
                    </span>
                  </span>
                  {x.activo ? (
                    <button
                      type="button"
                      data-desconectar={x.id}
                      disabled={trabajando}
                      onClick={() => {
                        setTrabajando(true);
                        void desconectarCuenta(x.id).then(async () => {
                          await releer();
                          setTrabajando(false);
                        });
                      }}
                      style={{
                        height: 26,
                        padding: "0 10px",
                        fontSize: 12,
                        borderRadius: 6,
                        border: `1px solid ${T.border}`,
                        background: T.surface,
                        color: "#9E2F29",
                        cursor: trabajando ? "wait" : "pointer",
                      }}
                    >
                      Desconectar
                    </button>
                  ) : (
                    <span style={{ fontSize: 11.5, color: T.faint }}>desconectada</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {c.canal !== "whatsapp" && (
            <div style={{ marginTop: 12 }}>
              {estado.sePuedeConectar ? (
                /*
                 * Un enlace y no un botón con `fetch`.
                 *
                 * Conectar termina en otro sitio —el diálogo de Facebook— y eso
                 * es una navegación, no una llamada. Con un enlace funciona
                 * aunque el JavaScript falle, se puede abrir en otra pestaña, y
                 * el revisor de Meta ve a dónde va antes de apretar.
                 */
                <a
                  href="/api/meta/conectar"
                  data-conectar-meta={c.canal}
                  style={{
                    display: "inline-block",
                    height: 32,
                    lineHeight: "32px",
                    padding: "0 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 7,
                    background: accent,
                    color: "#fff",
                    textDecoration: "none",
                  }}
                >
                  {c.canal === "instagram" ? "Conectar Instagram" : "Conectar Facebook"}
                </a>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: "#8C3B2F" }}>
                  Para poder conectar falta {estado.queFalta} en el servidor.
                </p>
              )}
              <p style={{ margin: "7px 0 0", fontSize: 11.5, lineHeight: 1.55, color: T.faint }}>
                Se abre Facebook para elegir la Página y la cuenta de Instagram. Hay que ser
                administrador de esa Página; el CRM no puede conectar una cuenta ajena.
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
