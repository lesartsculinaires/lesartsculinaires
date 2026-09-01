"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { mandarTanda, prepararEnvio, type Preparado } from "@/app/envios-actions";
import { aprobadas } from "@/components/ui/SelectorPlantilla";
import { POR_QUE, type Valor } from "@/lib/envios";
import { T } from "@/lib/theme";
import { conValores, huecosDe } from "@/lib/whatsapp/huecos";
import type { Plantilla } from "@/lib/types";

/**
 * Mandarle una plantilla a los leads seleccionados.
 *
 * ============================================================================
 * TRES PASOS, Y NINGUNO SOBRA
 * ============================================================================
 *
 *   1. A QUIÉNES     Se arma la lista en el servidor y se muestra a quién se
 *                    le va a escribir y a quién NO. «Se van a mandar 240 de
 *                    300» es un número que no se puede revisar; con el detalle
 *                    —sesenta sin teléfono, cuatro que pidieron que no les
 *                    escriban— quien manda puede decidir si eso está bien.
 *
 *   2. QUÉ           Sólo plantillas aprobadas por Meta. Es lo único que
 *                    WhatsApp deja mandarle a alguien que no escribió en las
 *                    últimas 24 horas, y un envío masivo por definición le
 *                    llega a gente fuera de esa ventana.
 *
 *   3. MANDAR        De a tandas, con la barra avanzando. La pantalla llama
 *                    una vez por tanda: una función de Netlify tiene diez
 *                    segundos y trescientos mensajes no entran.
 *
 * ============================================================================
 * EL NOMBRE DE CADA QUIEN
 * ============================================================================
 *
 * Cada hueco de la plantilla se llena con un texto fijo para todos, o con el
 * nombre de la persona. Lo segundo es lo que hace que un envío masivo no se
 * lea como un envío masivo, y es lo que la escuela no podía hacer: su
 * plantilla tiene un hueco para el nombre y hasta ahora no había forma de
 * llenarlo con trescientos nombres distintos.
 */
export function EnvioMasivo({
  oportunidadIds,
  plantillas,
  accent,
  onCerrar,
  onListo,
}: {
  /** Los leads marcados en la tabla. */
  oportunidadIds: number[];
  plantillas: Plantilla[];
  accent: string;
  onCerrar: () => void;
  /** Terminó: hay que releer los datos. */
  onListo: (resumen: string) => void;
}) {
  const [nombre, setNombre] = useState(
    `Envío del ${new Date().toLocaleDateString("es-SV", { day: "2-digit", month: "long" })}`,
  );
  const [paso, setPaso] = useState<"nombrar" | "revisar" | "mandando">("nombrar");
  const [prep, setPrep] = useState<Preparado | null>(null);
  const [elegida, setElegida] = useState("");
  const [valores, setValores] = useState<Valor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [avance, setAvance] = useState({ hechos: 0, fallidos: 0, total: 0 });
  /**
   * Cómo terminó, para decirlo al cerrar.
   *
   * Se guarda en vez de avisarle al padre apenas termina el bucle, y ahí está
   * la diferencia: el padre cierra la ventana cuando se le avisa, así que
   * avisarle al terminar hacía desaparecer la pantalla justo cuando aparecía
   * el resultado. Con un error —el token vencido, por ejemplo— eso dejaba a la
   * persona sin saber por qué no salió nada.
   */
  const [resumen, setResumen] = useState<string | null>(null);
  const corriendo = useRef(false);

  const listas = aprobadas(plantillas);
  const plantilla = listas.find((p) => p.id === elegida) ?? null;
  const huecos = huecosDe(plantilla?.cuerpo ?? null);

  // Al cambiar de plantilla se rearman los huecos. El primero se propone con
  // el nombre del cliente, que es lo que lleva en el noventa por ciento de las
  // plantillas de esta escuela.
  useEffect(() => {
    setValores(huecos.map((_, i) => (i === 0 ? { de: "nombre" } : { de: "texto", texto: "" })));
    // Depende del id y no del arreglo: `huecos` se recalcula en cada pintada.
  }, [elegida]); // eslint-disable-line react-hooks/exhaustive-deps

  const completa =
    plantilla != null &&
    valores.length === huecos.length &&
    valores.every((v) => v.de === "nombre" || v.texto.trim() !== "");

  const preparar = async () => {
    setError(null);
    const r = await prepararEnvio(oportunidadIds, nombre);
    setPrep(r);
    if (!r.ok) {
      setError(r.error);
      // Si igual devolvió el detalle de descartes, se muestra: es la
      // explicación de por qué no queda nadie.
      if (r.fuera.length > 0) setPaso("revisar");
      return;
    }
    setPaso("revisar");
  };

  /**
   * Manda, tanda tras tanda, hasta que no queden.
   *
   * El bucle vive acá y no en el servidor porque una función tiene diez
   * segundos. Cada vuelta es una llamada corta; si el navegador se cierra a la
   * mitad, lo que salió salió y lo que falta queda en «pendiente» para
   * reanudar.
   */
  const mandar = async () => {
    if (!prep?.envioId || !plantilla || corriendo.current) return;
    corriendo.current = true;
    setPaso("mandando");
    setError(null);
    setAvance({ hechos: 0, fallidos: 0, total: prep.van });

    let hechos = 0;
    let fallidos = 0;

    try {
      // Un tope de vueltas por si algo devolviera siempre lo mismo: sin esto,
      // un error que no avanza dejaría la pantalla girando para siempre.
      for (let vuelta = 0; vuelta < 500; vuelta++) {
        const r = await mandarTanda(prep.envioId, plantilla.id, valores);

        hechos += r.enviados;
        fallidos += r.fallidos;
        setAvance({ hechos, fallidos, total: prep.van });

        if (!r.ok) {
          setError(r.error);
          break;
        }
        if (r.faltan === 0) break;
        if (r.enviados === 0 && r.fallidos === 0) break;
      }
    } finally {
      corriendo.current = false;
    }

    setResumen(
      `${hechos} ${hechos === 1 ? "mensaje enviado" : "mensajes enviados"}` +
        (fallidos > 0 ? `, ${fallidos} no llegaron` : "") +
        ".",
    );
  };

  return (
    <>
      <div
        onClick={paso === "mandando" ? undefined : onCerrar}
        style={{ position: "fixed", inset: 0, background: "rgba(31,29,26,0.35)", zIndex: 90 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Escribirles por WhatsApp"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(620px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          padding: 22,
          background: T.paper,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          zIndex: 100,
          boxShadow: "0 12px 40px rgba(31,29,26,0.18)",
        }}
      >
        <p className="dsp" style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>
          Escribirles por WhatsApp
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
          {oportunidadIds.length} {oportunidadIds.length === 1 ? "lead marcado" : "leads marcados"}.
          Sólo se puede con una plantilla aprobada por Meta: es lo único que WhatsApp deja
          mandarle a alguien que no escribió en las últimas 24 horas.
        </p>

        {/* ------------------------------------------------------- 1. nombrar */}
        {paso === "nombrar" && (
          <>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={etiqueta}>Cómo se va a llamar esta campaña</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Diplomado de Cocina — agosto"
                style={campo}
              />
              <span style={{ display: "block", marginTop: 4, fontSize: 11, color: T.faint }}>
                Es para encontrarla después en Envíos, junto a sus resultados.
              </span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={onCerrar} style={secundario}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void preparar()}
                style={principal(accent)}
              >
                Ver a quiénes les llega
              </button>
            </div>
          </>
        )}

        {/* ------------------------------------------------------- 2. revisar */}
        {paso === "revisar" && prep && (
          <>
            <div style={caja}>
              <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: T.ink }}>
                Le llega a {prep.van} {prep.van === 1 ? "persona" : "personas"}
              </p>
              {prep.mandadosHoy > 0 && (
                <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>
                  Hoy ya salieron {prep.mandadosHoy} en total. Meta le pone un tope diario
                  a cada número; pasarse hace que los mensajes empiecen a fallar.
                </p>
              )}
            </div>

            {prep.fuera.length > 0 && (
              <div style={{ ...caja, background: "#FFF6D6", border: "1px solid #F0CE55" }}>
                <p style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 600, color: "#6B5200" }}>
                  Quedan afuera {prep.fuera.reduce((a, f) => a + f.cuantos, 0)}
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: "#6B5200" }}>
                  {prep.fuera.map((f) => (
                    <li key={f.porque}>
                      <strong>{f.cuantos}</strong> {POR_QUE[f.porque]}
                      <span style={{ color: "#8A7020" }}> — {f.ejemplos.join(", ")}…</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {prep.van > 0 && (
              <>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={etiqueta}>Con qué plantilla</span>
                  <select
                    value={elegida}
                    onChange={(e) => setElegida(e.target.value)}
                    style={campo}
                  >
                    <option value="">Elegí una…</option>
                    {listas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({p.idioma})
                      </option>
                    ))}
                  </select>
                  {listas.length === 0 && (
                    <span style={{ display: "block", marginTop: 4, fontSize: 11.5, color: "#9E2F29" }}>
                      No hay ninguna plantilla aprobada. Se sincronizan desde el módulo
                      Plantillas.
                    </span>
                  )}
                </label>

                {plantilla &&
                  huecos.map((h, i) => (
                    <div key={h.clave} style={{ marginBottom: 10 }}>
                      <span style={etiqueta}>{h.etiqueta}</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <select
                          value={valores[i]?.de ?? "texto"}
                          onChange={(e) =>
                            setValores((v) =>
                              v.map((x, k) =>
                                k === i
                                  ? e.target.value === "nombre"
                                    ? { de: "nombre" }
                                    : { de: "texto", texto: "" }
                                  : x,
                              ),
                            )
                          }
                          style={{ ...campo, width: 190, flexShrink: 0 }}
                        >
                          <option value="nombre">El nombre del cliente</option>
                          <option value="texto">Un texto fijo</option>
                        </select>

                        {valores[i]?.de === "texto" && (
                          <input
                            value={valores[i].texto}
                            onChange={(e) =>
                              setValores((v) =>
                                v.map((x, k) =>
                                  k === i ? { de: "texto", texto: e.target.value } : x,
                                ),
                              )
                            }
                            placeholder="Lo que va en este hueco"
                            style={campo}
                          />
                        )}
                      </div>
                    </div>
                  ))}

                {plantilla && (
                  <>
                    <p style={etiqueta}>Cómo le va a llegar</p>
                    <p
                      style={{
                        margin: "0 0 14px",
                        padding: "10px 12px",
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderRadius: 8,
                      }}
                    >
                      {conValores(
                        plantilla.cuerpo,
                        valores.map((v) => (v.de === "nombre" ? "María" : v.texto)),
                      )}
                    </p>
                    {valores.some((v) => v.de === "nombre") && (
                      <p style={{ margin: "-10px 0 14px", fontSize: 11, color: T.faint }}>
                        «María» es un ejemplo: a cada quien le va a llegar con su propio
                        nombre de pila.
                      </p>
                    )}
                  </>
                )}
              </>
            )}

            {error && <p style={malo}>{error}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={onCerrar} style={secundario}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void mandar()}
                disabled={!completa || prep.van === 0}
                style={{
                  ...principal(accent),
                  background: completa && prep.van > 0 ? accent : T.border,
                  color: completa && prep.van > 0 ? "#fff" : T.faint,
                }}
              >
                Mandar a {prep.van}
              </button>
            </div>
          </>
        )}

        {/* ------------------------------------------------------- 3. mandando */}
        {paso === "mandando" && (
          <>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, color: T.ink }}>
              {resumen != null
                ? error
                  ? "Se cortó."
                  : "Listo."
                : `Mandando… ${avance.hechos + avance.fallidos} de ${avance.total}`}
            </p>
            <div style={{ height: 10, borderRadius: 5, background: T.border, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.round(
                    ((avance.hechos + avance.fallidos) / Math.max(avance.total, 1)) * 100,
                  )}%`,
                  height: "100%",
                  background: accent,
                  transition: "width .2s",
                }}
              />
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 12, color: T.muted }}>
              {avance.hechos} enviados
              {avance.fallidos > 0 && `, ${avance.fallidos} no llegaron`}
            </p>
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.55 }}>
              No cierres esta ventana. Si se corta, lo que salió no se vuelve a mandar: el
              envío se puede reanudar desde donde quedó.
            </p>

            {error && <p style={malo}>{error}</p>}

            {resumen != null && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => onListo(resumen)}
                  style={principal(accent)}
                >
                  Cerrar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

const etiqueta: CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
};

const campo: CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 9px",
  fontSize: 13,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

const caja: CSSProperties = {
  padding: "11px 13px",
  marginBottom: 14,
  borderRadius: 8,
  background: T.surface,
  border: `1px solid ${T.border}`,
};

const secundario: CSSProperties = {
  fontSize: 13,
  color: T.muted,
  padding: "0 10px",
};

const principal = (accent: string): CSSProperties => ({
  height: 36,
  padding: "0 18px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 7,
  background: accent,
  color: "#fff",
});

const malo: CSSProperties = {
  margin: "0 0 14px",
  padding: "10px 13px",
  fontSize: 12.5,
  lineHeight: 1.5,
  borderRadius: 7,
  background: "#F7EBE9",
  color: "#8C3B2F",
};
