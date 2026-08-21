"use client";

import { useState } from "react";

import { responderFormulario } from "@/app/formularios-actions";
import { Aviso } from "@/components/ui/Aviso";
import { revisar, type Formulario, type Respuestas } from "@/lib/formularios";
import { T } from "@/lib/theme";
import type { Coincidencia } from "@/lib/duplicados";

/**
 * El formulario tal como lo llena el asesor en la feria.
 *
 * Se parece a un Google Forms a propósito: una pregunta por bloque, el texto
 * grande, y nada más en pantalla. En un stand se llena de pie, con el teléfono
 * en una mano y hablando con alguien; cualquier cosa que obligue a buscar dónde
 * seguir cuesta un lead.
 *
 * QUÉ PASA AL GUARDAR
 *
 * Sale un lead de verdad: cliente, oportunidad y código «CRM-0582», por el
 * mismo camino que el alta de siempre. Por eso también hereda su aviso de
 * duplicados, y por eso la pantalla tiene que saber pedir confirmación cuando
 * la persona ya estaba cargada —en una feria eso pasa seguido: el mismo chico
 * pasa por el stand dos veces—.
 */
export function LlenarFormulario({
  formulario,
  accent,
  onCerrar,
  onVerFicha,
}: {
  formulario: Formulario;
  accent: string;
  onCerrar: () => void;
  onVerFicha: (oportunidadId: number) => void;
}) {
  const [respuestas, setRespuestas] = useState<Respuestas>({});
  const [problemas, setProblemas] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parecidos, setParecidos] = useState<Coincidencia[] | null>(null);
  const [listo, setListo] = useState<{ codigo?: string; oportunidadId?: number } | null>(null);
  /**
   * El aviso flotante de «se guardó».
   *
   * Es un estado aparte del de «listo» a propósito: `listo` se apaga al
   * apretar «Cargar el siguiente», y el aviso tiene que sobrevivir a eso. En
   * una feria se cargan veinte seguidos, y la duda de si el anterior entró
   * aparece justo cuando ya se está tecleando el que sigue.
   */
  const [guardado, setGuardado] = useState<{ codigo?: string; oportunidadId?: number } | null>(null);
  /** Cuántos van en esta sesión. Es lo que se cuenta al final de la feria. */
  const [cuantos, setCuantos] = useState(0);

  const poner = (id: number, valor: string | string[]) => {
    setRespuestas((r) => ({ ...r, [id]: valor }));
    // El aviso de una pregunta se va en cuanto se la toca: dejarlo puesto
    // mientras la persona corrige se lee como que la corrección no sirvió.
    setProblemas((p) => {
      if (!(id in p)) return p;
      const { [id]: _, ...resto } = p;
      return resto;
    });
    setError(null);
  };

  const enviar = async (forzar: boolean) => {
    const encontrados = revisar(formulario.campos, respuestas);
    if (Object.keys(encontrados).length > 0) {
      setProblemas(encontrados);
      setError("Faltan cosas por contestar.");
      return;
    }

    setGuardando(true);
    setError(null);
    const r = await responderFormulario(formulario, respuestas, forzar);
    setGuardando(false);

    if (r.coincidencias?.length) {
      setParecidos(r.coincidencias);
      return;
    }
    if (!r.ok) {
      setError(r.error);
      if (r.problemas) setProblemas(r.problemas);
      return;
    }
    // Puede venir bien Y con un aviso: el lead entró, pero algo de lo de
    // alrededor no se pudo guardar. Se muestra en la pantalla de «listo», no
    // como un fallo, porque el lead sí está.
    setError(r.error);
    setListo({ codigo: r.codigo, oportunidadId: r.oportunidadId });
    setGuardado({ codigo: r.codigo, oportunidadId: r.oportunidadId });
    setCuantos((n) => n + 1);
  };

  /** El aviso, igual en las dos pantallas de acá abajo. */
  const aviso = guardado && (
    <Aviso
      texto={guardado.codigo ? `Guardado en la base · ${guardado.codigo}` : "Guardado en la base"}
      detalle={
        cuantos > 1
          ? `Ya podés buscarlo en Clientes. Van ${cuantos} con este formulario.`
          : "Ya podés buscarlo en Clientes."
      }
      accion={
        guardado.oportunidadId != null
          ? { texto: "Ver su ficha", onClick: () => onVerFicha(guardado.oportunidadId as number) }
          : undefined
      }
      onCerrar={() => setGuardado(null)}
    />
  );

  // ------------------------------------------------------------- ya entró
  if (listo) {
    return (
      <div style={{ maxWidth: 620 }}>
        {aviso}
        <div style={CAJA}>
          <h2 className="dsp" style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 700 }}>
            Listo, quedó cargado
          </h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
            {listo.codigo ? (
              <>
                Entró como <strong style={{ color: T.ink }}>{listo.codigo}</strong>, ya
                asignado a vos y con todo lo que contestó anotado en su ficha.
              </>
            ) : (
              "El lead quedó cargado con todo lo que contestó anotado en su ficha."
            )}
            {cuantos > 1 && ` Van ${cuantos} con este formulario.`}
          </p>
          {error && (
            <p
              style={{
                margin: "0 0 14px",
                padding: "10px 12px",
                fontSize: 12.5,
                lineHeight: 1.5,
                borderRadius: 8,
                background: "#F6EEDC",
                color: "#7A5A12",
              }}
            >
              {error}
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                // Lo más probable en una feria es que venga el siguiente, no
                // que uno quiera revisar el que acaba de cargar.
                setRespuestas({});
                setListo(null);
                setParecidos(null);
                setError(null);
              }}
              style={{ ...BOTON, background: accent, color: "#fff", border: "none" }}
            >
              Cargar el siguiente
            </button>
            {listo.oportunidadId != null && (
              <button
                type="button"
                onClick={() => onVerFicha(listo.oportunidadId as number)}
                style={BOTON}
              >
                Ver su ficha
              </button>
            )}
            <button type="button" onClick={onCerrar} style={BOTON}>
              Volver a los formularios
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620 }}>
      {aviso}
      {/*
        La portada: el nombre del formulario y su descripción, con una barra de
        color arriba. Es lo que hace que se lea como un formulario y no como
        una pantalla más del CRM, y en la feria eso ayuda: quien contesta a
        veces mira de reojo.
      */}
      <div style={{ ...CAJA, borderTop: `6px solid ${accent}`, marginBottom: 12 }}>
        <h2 className="dsp" style={{ margin: "0 0 6px", fontSize: 23, fontWeight: 700 }}>
          {formulario.nombre}
        </h2>
        {formulario.descripcion && (
          <p style={{ margin: 0, fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>
            {formulario.descripcion}
          </p>
        )}
      </div>

      {formulario.campos.map((campo) => {
        const problema = problemas[campo.id];
        const valor = respuestas[campo.id];

        return (
          <div
            key={campo.id}
            style={{ ...CAJA, marginBottom: 12, borderLeft: problema ? `4px solid ${T.warn}` : undefined }}
          >
            <label style={{ display: "block", fontSize: 14.5, color: T.ink, lineHeight: 1.45 }}>
              {campo.etiqueta}
              {campo.requerido && <span style={{ color: T.warn, marginLeft: 3 }}>*</span>}
            </label>
            {campo.ayuda && (
              <p style={{ margin: "3px 0 0", fontSize: 12, color: T.faint, lineHeight: 1.45 }}>
                {campo.ayuda}
              </p>
            )}

            <div style={{ marginTop: 11 }}>
              {campo.tipo === "opcion" || campo.tipo === "opciones" ? (
                <Opciones
                  campo={campo}
                  valor={valor}
                  accent={accent}
                  onElegir={(v) => poner(campo.id, v)}
                />
              ) : campo.tipo === "parrafo" ? (
                <textarea
                  value={typeof valor === "string" ? valor : ""}
                  onChange={(e) => poner(campo.id, e.target.value)}
                  rows={3}
                  style={{ ...CAMPO, height: "auto", padding: "8px 10px", resize: "vertical" }}
                />
              ) : (
                <input
                  value={typeof valor === "string" ? valor : ""}
                  onChange={(e) => poner(campo.id, e.target.value)}
                  // El teclado del teléfono se abre en la tecla correcta: en
                  // una feria se escribe con el pulgar y de pie.
                  type={campo.tipo === "correo" ? "email" : "text"}
                  inputMode={
                    campo.tipo === "telefono" || campo.tipo === "numero" ? "numeric" : undefined
                  }
                  autoComplete="off"
                  style={CAMPO}
                />
              )}
            </div>

            {problema && (
              <p style={{ margin: "7px 0 0", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>
                {problema}
              </p>
            )}
          </div>
        );
      })}

      {parecidos && (
        <div
          style={{
            ...CAJA,
            marginBottom: 12,
            border: `1px solid ${T.warn}`,
          }}
        >
          <p style={{ margin: "0 0 6px", fontSize: 13.5, fontWeight: 600, color: T.ink }}>
            {parecidos.length === 1
              ? "Esta persona ya podría estar cargada"
              : "Estas personas ya podrían estar cargadas"}
          </p>
          <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>
            {parecidos.map((c) => (
              <li key={c.clienteId}>
                {c.nombre}
                {c.telefono ? ` · ${c.telefono}` : ""}
                {c.codigo ? ` · ${c.codigo}` : ""}
              </li>
            ))}
          </ul>
          <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            En una feria pasa: la misma persona vuelve al stand. Si es otra, cargala
            igual.
          </p>
        </div>
      )}

      {error && (
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 9 }}>
        <button
          type="button"
          onClick={() => void enviar(parecidos != null)}
          disabled={guardando}
          style={{
            ...BOTON,
            height: 40,
            padding: "0 20px",
            fontSize: 13.5,
            fontWeight: 600,
            background: accent,
            color: "#fff",
            border: "none",
            cursor: guardando ? "wait" : "pointer",
          }}
        >
          {guardando ? "Guardando…" : parecidos ? "Cargarlo igual" : "Guardar el lead"}
        </button>
        <button type="button" onClick={onCerrar} disabled={guardando} style={BOTON}>
          Cancelar
        </button>
        <span style={{ fontSize: 11.5, color: T.faint }}>
          Los campos con <span style={{ color: T.warn }}>*</span> son obligatorios.
        </span>
      </div>
    </div>
  );
}

/**
 * Las opciones de una pregunta.
 *
 * Botones grandes y no un desplegable: en un stand se elige con el pulgar, y
 * un menú que hay que abrir, leer y cerrar es tres gestos donde alcanza uno.
 * Con muchas opciones ocupa más pantalla, y está bien: se ve todo junto.
 */
function Opciones({
  campo,
  valor,
  accent,
  onElegir,
}: {
  campo: Formulario["campos"][number];
  valor: string | string[] | undefined;
  accent: string;
  onElegir: (v: string | string[]) => void;
}) {
  const multiple = campo.tipo === "opciones";
  const elegidas = Array.isArray(valor) ? valor : valor ? [valor] : [];

  const alternar = (texto: string) => {
    if (!multiple) {
      // Volver a tocar la elegida la suelta. Sin eso, una pregunta que no era
      // obligatoria queda contestada para siempre por un toque sin querer.
      onElegir(elegidas.includes(texto) ? "" : texto);
      return;
    }
    onElegir(
      elegidas.includes(texto) ? elegidas.filter((t) => t !== texto) : [...elegidas, texto],
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {campo.opciones.map((o) => {
        const puesta = elegidas.includes(o.texto);
        return (
          <button
            key={o.texto}
            type="button"
            onClick={() => alternar(o.texto)}
            aria-pressed={puesta}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              fontSize: 13.5,
              border: `1px solid ${puesta ? accent : T.border}`,
              borderRadius: 9,
              background: puesta ? accent : T.surface,
              color: puesta ? "#fff" : T.ink,
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 15,
                height: 15,
                flexShrink: 0,
                // Redondo para elegir una, cuadrado para elegir varias: es la
                // convención de todos los formularios y dice cuántas se pueden
                // marcar sin tener que escribirlo.
                borderRadius: multiple ? 4 : "50%",
                border: `2px solid ${puesta ? "#fff" : T.borderStrong}`,
                background: puesta ? "transparent" : T.surface,
                boxShadow: puesta ? "inset 0 0 0 3px currentColor" : undefined,
              }}
            />
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

const CAJA: React.CSSProperties = {
  padding: "18px 20px",
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 10,
};

const CAMPO: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 10px",
  fontSize: 14,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  background: T.surface,
  color: T.ink,
};

const BOTON: React.CSSProperties = {
  height: 36,
  padding: "0 15px",
  fontSize: 13,
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
  cursor: "pointer",
};
