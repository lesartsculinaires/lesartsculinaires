"use client";

import { useState, type CSSProperties } from "react";

import { refrescarNombresMeta } from "@/app/meta-nombres-actions";
import { CANALES, CAPACIDADES, COMO_SE_DICE, canalDe, type Canal } from "@/lib/canales";
import { T } from "@/lib/theme";

/**
 * La fila para cambiar de red social, arriba de los hilos.
 *
 * ============================================================================
 * POR QUÉ SE VEN LOS QUE TODAVÍA NO ANDAN
 * ============================================================================
 *
 * Podrían mostrarse sólo los conectados y aparecer los demás el día que se
 * enchufen. Se hizo al revés, y a propósito:
 *
 *   PORQUE ES LA PREGUNTA QUE SE HACE      «¿Se puede contestar el Instagram
 *                                          desde acá?» tiene que tener una
 *                                          respuesta en la pantalla, no en una
 *                                          conversación. Y la respuesta —qué
 *                                          falta y quién lo tiene que hacer—
 *                                          está a un clic.
 *
 *   PORQUE NO SON TODOS IGUALES            Instagram y Messenger se conectan en
 *                                          el mismo panel de Meta donde ya está
 *                                          WhatsApp. TikTok no: hay que ser un
 *                                          socio aprobado por ellos. Verlos
 *                                          juntos con esa diferencia escrita
 *                                          evita planificar sobre algo que no
 *                                          depende de nosotros.
 *
 * Lo que NO se hace es dejarlos apagados sin explicación. Una pestaña que no
 * responde y no dice por qué es peor que no tenerla.
 *
 * ============================================================================
 * Y POR QUÉ LA FILA APARECE IGUAL CON UN SOLO CANAL
 * ============================================================================
 *
 * Hoy todas las conversaciones son de WhatsApp, así que filtrar no sirve para
 * nada todavía. La fila está para lo otro: para que se vea el lugar que ya
 * tienen los demás, que es justamente lo que la escuela pidió dejar preparado.
 */
export function CanalesDeLaBandeja({
  /** Cuántos hilos hay por canal, para poder decirlo en la pestaña. */
  cuantos,
  elegido,
  conectados,
  accent,
  onElegir,
}: {
  cuantos: Record<string, number>;
  /** Null = todos los canales juntos. */
  elegido: string | null;
  /**
   * Cuáles tienen sus credenciales puestas en el servidor.
   *
   * ==========================================================================
   * SON TRES ESTADOS, NO DOS
   * ==========================================================================
   *
   * Hasta ahora había «anda» y «no anda». Con Instagram apareció el del medio,
   * y es el que más confunde si no se dice:
   *
   *   NO ESTÁ HECHO      El CRM no sabe hablar ese canal. Messenger, TikTok.
   *                      Falta programarlo.
   *
   *   HECHO, SIN ENCHUFAR  El código está —webhook, envío, base— pero los
   *                      tokens todavía no se cargaron en el servidor. La
   *                      pestaña se enciende con el despliegue; los tokens los
   *                      pone una persona después.
   *
   *   ANDANDO            Las dos cosas.
   *
   * Sin el estado del medio, entre desplegar y cargar los tokens la pestaña
   * queda encendida y filtrando a una lista vacía, sin decir qué falta. Y lo
   * que falta —dos variables en Netlify— no se adivina mirando una lista
   * vacía.
   */
  conectados: Record<string, boolean>;
  accent: string;
  onElegir: (clave: string | null) => void;
}) {
  /** Cuál se está mirando en la ficha de abajo. Null = ninguna abierta. */
  const [mirando, setMirando] = useState<string | null>(null);

  const total = Object.values(cuantos).reduce((a, b) => a + b, 0);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          padding: "8px 12px 7px",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => onElegir(null)}
          style={pestana(elegido == null, accent)}
        >
          Todos
          {total > 0 && <span style={numerito(elegido == null)}>{total}</span>}
        </button>

        {CANALES.map((c) => {
          const n = cuantos[c.clave] ?? 0;
          const puesto = elegido === c.clave;
          // Sabe hablarlo, pero todavía no tiene con qué. Ver `conectados`.
          const faltaElToken = c.disponible && conectados[c.clave] === false;

          return (
            <button
              key={c.clave}
              type="button"
              onClick={() => {
                // Un canal que no anda no filtra nada: lo que hace es explicar
                // qué le falta. Filtrar por él dejaría la lista vacía y eso no
                // dice nada. Lo mismo el que está hecho pero sin credenciales:
                // su lista está vacía por una razón que hay que contar.
                if (c.disponible && !faltaElToken) onElegir(puesto ? null : c.clave);
                setMirando(mirando === c.clave ? null : c.clave);
              }}
              title={
                faltaElToken
                  ? `${c.nombre}: listo en el CRM, falta cargar las credenciales`
                  : c.disponible
                    ? `Ver sólo ${c.nombre}`
                    : `${c.nombre}: todavía no está conectado`
              }
              style={{
                ...pestana(puesto, accent),
                // Los que no andan van en gris y con el borde punteado: se ve
                // que están y se ve que todavía no. El que está hecho pero sin
                // enchufar va igual, porque desde la bandeja da lo mismo: no se
                // puede usar. Lo que cambia es lo que dice al tocarlo.
                borderStyle: c.disponible && !faltaElToken ? "solid" : "dashed",
                opacity: c.disponible && !faltaElToken ? 1 : 0.72,
              }}
            >
              <span aria-hidden style={{ fontSize: 11 }}>{c.icono}</span>
              {c.nombre}
              {c.disponible && !faltaElToken && n > 0 && (
                <span style={numerito(puesto)}>{n}</span>
              )}
              {!c.disponible && (
                <span style={{ fontSize: 9.5, color: T.faint, fontWeight: 600 }}>pronto</span>
              )}
              {/*
                «Falta la llave» y no «pronto».

                Son dos esperas distintas y quien las resuelve es distinto:
                «pronto» es trabajo de programación y no depende de la escuela;
                esto es una variable en Netlify que la escuela sí puede cargar
                hoy. Decir lo mismo en los dos casos haría que nadie cargue
                nada, esperando algo que ya está listo.
              */}
              {faltaElToken && (
                <span style={{ fontSize: 9.5, color: "#8A7020", fontWeight: 600 }}>
                  falta la llave
                </span>
              )}
            </button>
          );
        })}
      </div>

      {mirando && (
        <Ficha
          canal={canalDe(mirando)}
          faltaElToken={conectados[mirando] === false && canalDe(mirando).disponible}
          onCerrar={() => setMirando(null)}
        />
      )}
    </div>
  );
}

/**
 * Qué se puede hacer en este canal, y qué le falta.
 *
 * Es la pantalla que contesta «¿por qué no puedo contestar el Instagram?» sin
 * que nadie tenga que preguntar. Y para el que ya anda sirve igual: dice
 * cuánto dura su ventana, que es el dato que más se olvida.
 */
function Ficha({
  canal,
  faltaElToken,
  onCerrar,
}: {
  canal: Canal;
  /** Está programado pero sin credenciales en el servidor. */
  faltaElToken: boolean;
  onCerrar: () => void;
}) {
  return (
    <div
      style={{
        padding: "10px 13px 12px",
        margin: "0 10px 10px",
        borderRadius: 9,
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${canal.color}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{canal.nombre}</span>
        <span
          style={{
            fontSize: 11,
            color: faltaElToken ? "#8A7020" : canal.disponible ? "#2F6B4F" : T.faint,
          }}
        >
          {faltaElToken
            ? "listo en el CRM, falta la llave"
            : canal.disponible
              ? "conectado"
              : "todavía no conectado"}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{ fontSize: 14, color: T.faint, lineHeight: 1, padding: "0 3px" }}
        >
          ×
        </button>
      </div>

      {/*
        Qué falta, con el nombre exacto de lo que hay que cargar.

        Las variables se nombran acá y no se explican en un manual aparte
        porque es donde se hace la pregunta. No son secretas —son NOMBRES, no
        valores— y sin ellas el mensaje sería «falta configurar algo», que no
        le sirve a nadie.
      */}
      {faltaElToken && (
        <p style={{ margin: "7px 0 0", fontSize: 11.5, lineHeight: 1.55, color: "#6B5200" }}>
          El CRM ya sabe recibir y contestar por acá: están el webhook, el envío y la
          base. Lo que falta es cargar las credenciales en el servidor —en Netlify,
          {" "}
          <strong>{VARIABLES[canal.clave] ?? "las variables del canal"}</strong>— y
          apuntar el webhook de Meta a <strong>/api/{canal.clave}/webhook</strong>.
        </p>
      )}

      {!faltaElToken && canal.falta && (
        <p style={{ margin: "7px 0 0", fontSize: 11.5, lineHeight: 1.55, color: "#6B5200" }}>
          {canal.falta}
        </p>
      )}

      <p style={{ margin: "8px 0 0", fontSize: 11.5, lineHeight: 1.55, color: T.muted }}>
        {canal.laVentana}
      </p>

      <ul
        style={{
          margin: "9px 0 0",
          padding: 0,
          listStyle: "none",
          display: "grid",
          gap: 2,
          fontSize: 11.5,
        }}
      >
        {CAPACIDADES.map((cap) => {
          const v = canal.puede[cap.clave];
          return (
            <li key={cap.clave} style={{ display: "flex", gap: 7 }}>
              <span
                aria-hidden
                style={{
                  width: 12,
                  flexShrink: 0,
                  color: v === "si" ? "#2F6B4F" : v === "no" ? "#9E2F29" : "#8A7020",
                }}
              >
                {v === "si" ? "✓" : v === "no" ? "×" : "?"}
              </span>
              <span style={{ color: T.muted }}>
                {cap.nombre}
                {v !== "si" && (
                  <span style={{ color: T.faint }}> — {COMO_SE_DICE[v]}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {(canal.clave === "instagram" || canal.clave === "messenger") && (
        <NombresDeMeta canal={canal.nombre} />
      )}
    </div>
  );
}

/**
 * «¿Por qué los hilos salen con un número en vez del nombre?»
 *
 * ============================================================================
 * POR QUÉ ESTO ESTÁ ACÁ Y NO EN UNA PANTALLA DE AJUSTES
 * ============================================================================
 *
 * Porque es acá donde se hace la pregunta. Quien la hace está mirando la lista
 * de hilos con diecisiete dígitos por título, y este cuadro es justo el que
 * explica qué puede y qué no puede hacer este canal. Mandarlo a buscar la
 * respuesta a otro lado sería mandarlo a buscar.
 *
 * El botón hace dos cosas de una: arregla los que se puedan arreglar, y cuando
 * no se puede DICE POR QUÉ, con lo que contestó Meta traducido. Esa segunda
 * mitad es la que importa más: sin ella, «sigue saliendo el número» es
 * indistinguible de «el CRM está roto», y no son lo mismo.
 *
 * ============================================================================
 * POR QUÉ NO SE HACE SOLO
 * ============================================================================
 *
 * Se hace solo, de a poco: cada vez que esa persona vuelve a escribir, el
 * servidor le vuelve a preguntar el nombre a Meta mientras falte. Lo que este
 * botón agrega es no tener que esperar a que escriban —que puede ser nunca— y
 * poder comprobar en el momento si Meta ya está dejando.
 */
function NombresDeMeta({ canal }: { canal: string }) {
  const [andando, setAndando] = useState(false);
  const [dicho, setDicho] = useState<string | null>(null);

  const pedir = async () => {
    setAndando(true);
    setDicho(null);
    try {
      const r = await refrescarNombresMeta();

      if (!r.ok) {
        setDicho(r.error ?? "No se pudo consultar.");
      } else if (r.revisados === 0) {
        setDicho("Todos los hilos ya tienen nombre.");
      } else if (r.resueltos > 0) {
        setDicho(
          `Se resolvieron ${r.resueltos} de ${r.revisados}.` +
            (r.motivo ? ` Los demás, no: ${r.motivo}` : ""),
        );
      } else {
        // Ninguno se pudo: el motivo ES la respuesta. Si Meta contestó bien y
        // esa gente sencillamente no tiene nombre visible, no hay motivo que
        // mostrar y hay que decir eso, no inventar una falla.
        setDicho(
          r.motivo ??
            `Meta no devolvió nombre para ninguno de los ${r.revisados} hilos revisados.`,
        );
      }
    } catch (e) {
      setDicho(e instanceof Error ? e.message : "No se pudo consultar.");
    } finally {
      setAndando(false);
    }
  };

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 9 }}>
      <button
        type="button"
        onClick={pedir}
        disabled={andando}
        data-refrescar-nombres={canal}
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: andando ? T.faint : T.ink,
          textDecoration: "underline",
          cursor: andando ? "default" : "pointer",
        }}
      >
        {andando ? "Preguntándole a Meta…" : "Buscar los nombres que faltan"}
      </button>

      <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5, color: T.faint }}>
        {dicho ??
          `${canal} no manda el nombre junto al mensaje: hay que pedirlo aparte, y ` +
            "mientras Meta no lo permita el hilo entra con el identificador por título."}
      </p>
    </div>
  );
}

const pestana = (puesta: boolean, accent: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  whiteSpace: "nowrap",
  height: 24,
  boxSizing: "border-box",
  padding: "0 9px",
  fontSize: 11.5,
  fontWeight: 600,
  borderRadius: 20,
  background: puesta ? accent : "transparent",
  color: puesta ? "#fff" : T.muted,
  border: `1px solid ${puesta ? "transparent" : T.border}`,
  cursor: "pointer",
});

const numerito = (puesta: boolean): CSSProperties => ({
  minWidth: 15,
  padding: "0 4px",
  borderRadius: 8,
  fontSize: 10,
  fontWeight: 700,
  lineHeight: "14px",
  textAlign: "center",
  background: puesta ? "rgba(255,255,255,0.25)" : T.paper,
  color: puesta ? "#fff" : T.muted,
});

/**
 * Cómo se llaman las credenciales de cada canal en el servidor.
 *
 * Los NOMBRES, nunca los valores: los valores son secretos y viven sólo en
 * Netlify. Un nombre no abre nada y es lo único que hace accionable el aviso de
 * «falta la llave» —sin él habría que ir a buscar a otro lado qué cargar—.
 */
const VARIABLES: Partial<Record<string, string>> = {
  whatsapp: "WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID",
  instagram: "INSTAGRAM_TOKEN y INSTAGRAM_ACCOUNT_ID",
};
