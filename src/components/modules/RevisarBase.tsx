"use client";

import { T } from "@/lib/theme";
import { claveDePersona, type Plan } from "@/lib/planImportacion";
import type { Persona } from "@/lib/agrupar";

interface Props {
  plan: Plan;
  archivo: string | null;
  accent: string;
  /** Grupos que ya se marcaron como «no son la misma persona». */
  separados: string[];
  onSeparar: (clave: string) => void;
  onVolver: () => void;
  onConfirmar: () => void;
}

/**
 * Lo que va a pasar, antes de que pase.
 *
 * Una importación no se puede deshacer con un botón: crea fichas, las mezcla
 * con las que ya había y les cuelga oportunidades. Por eso el paso previo no
 * es un «¿seguro?» sino un detalle de las decisiones que se tomaron solas, con
 * las dudosas arriba y la posibilidad de contradecirlas.
 *
 * El orden de la pantalla es a propósito: primero lo que hay que mirar,
 * después los números. Al revés, los números tranquilizan y nadie baja.
 */
export function RevisarBase({
  plan,
  archivo,
  accent,
  separados,
  onSeparar,
  onVolver,
  onConfirmar,
}: Props) {
  const { resumen } = plan;
  const hayQueMirar = resumen.aRevisar.length > 0 || resumen.sospechas.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Revisar la base antes de importar"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
        background: "rgba(3, 27, 79, 0.38)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onVolver();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 20px 56px rgba(3, 27, 79, 0.24)",
        }}
      >
        <div style={{ padding: "18px 22px 14px" }}>
          <h2 className="dsp" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            Revisá antes de importar
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
            {archivo ? <strong style={{ color: T.ink }}>{archivo}</strong> : "El archivo"} ·{" "}
            {resumen.validas} {resumen.validas === 1 ? "fila" : "filas"} para importar.
            Nada se guarda hasta que confirmes.
          </p>
        </div>

        <div style={{ overflowY: "auto", borderTop: `1px solid ${T.border}` }}>
          {/* ---------------------------------------------- lo que hay que mirar */}
          {resumen.aRevisar.length > 0 && (
            <Seccion titulo="Se unieron, pero los nombres no se parecen">
              <p style={{ margin: "0 0 10px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
                Comparten teléfono o correo, así que casi siempre es la misma persona
                anotada de dos formas. Cuando no lo sea —un teléfono de la casa, el
                correo de la empresa— separalos acá.
              </p>
              {resumen.aRevisar.map((p) => (
                <FilaGrupo
                  key={claveDePersona(p)}
                  persona={p}
                  accent={accent}
                  separado={separados.includes(claveDePersona(p))}
                  onSeparar={() => onSeparar(claveDePersona(p))}
                />
              ))}
            </Seccion>
          )}

          {resumen.sospechas.length > 0 && (
            <Seccion titulo="Se llaman igual, pero no se unieron">
              <p style={{ margin: "0 0 10px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
                No comparten teléfono ni correo. Pueden ser la misma persona con dos
                números, o dos personas que se llaman igual — desde acá no hay cómo
                saberlo, así que quedan separadas. Si son la misma, se unen después
                desde la ficha.
              </p>
              {resumen.sospechas.slice(0, 12).map((s, i) => (
                <div
                  key={`${s.nombre}-${i}`}
                  style={{
                    padding: "8px 0",
                    fontSize: 12.5,
                    color: T.ink,
                    borderTop: i ? `1px solid ${T.border}` : "none",
                  }}
                >
                  <strong>{s.nombre}</strong>
                  <span style={{ color: T.faint }}>
                    {" "}
                    · {s.filas.length === 1 ? "1 fila del archivo" : `${s.filas.length} filas`}
                    {s.clienteId != null ? " y un contacto ya guardado" : ""}
                  </span>
                </div>
              ))}
              {resumen.sospechas.length > 12 && (
                <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.faint }}>
                  y {resumen.sospechas.length - 12} más.
                </p>
              )}
            </Seccion>
          )}

          {!hayQueMirar && (
            <Seccion titulo="Nada que revisar">
              <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
                No se encontraron uniones dudosas ni contactos que se llamen igual sin
                compartir datos.
              </p>
            </Seccion>
          )}

          {/* --------------------------------------------------------- los números */}
          <Seccion titulo="Lo que se va a guardar">
            <Numero
              valor={resumen.fichasNuevas}
              uno="ficha de cliente nueva"
              varias="fichas de cliente nuevas"
              destaca
            />
            <Numero
              valor={resumen.oportunidades}
              uno="oportunidad se agrega"
              varias="oportunidades se agregan"
              destaca
            />
            {resumen.seUnenAlCrm > 0 && (
              <Numero
                valor={resumen.seUnenAlCrm}
                uno="fila se suma a un contacto que ya estaba"
                varias="filas se suman a contactos que ya estaban"
              />
            )}
            {resumen.seJuntanEntreSi > 0 && (
              <Numero
                valor={resumen.seJuntanEntreSi}
                uno="fila repetida dentro del archivo se junta con otra"
                varias="filas repetidas dentro del archivo se juntan con otras"
              />
            )}
            {resumen.omitidas > 0 && (
              <Numero valor={resumen.omitidas} uno="fila se omite" varias="filas se omiten" />
            )}
            {resumen.conError > 0 && (
              <Numero
                valor={resumen.conError}
                uno="fila no se puede importar (tiene un error)"
                varias="filas no se pueden importar (tienen errores)"
                alerta
              />
            )}
          </Seccion>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            padding: "14px 22px",
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <span style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.4 }}>
            Ninguna ficha se borra. Unir sólo agrega datos donde faltaban.
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button
              type="button"
              onClick={onVolver}
              style={{
                height: 37,
                padding: "0 16px",
                fontSize: 13,
                borderRadius: 7,
                border: `1px solid ${T.border}`,
                background: T.surface,
                color: T.ink,
              }}
            >
              Volver
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={resumen.oportunidades === 0}
              style={{
                height: 37,
                padding: "0 18px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 7,
                background: resumen.oportunidades > 0 ? accent : T.border,
                color: resumen.oportunidades > 0 ? "#fff" : T.faint,
                cursor: resumen.oportunidades > 0 ? "pointer" : "not-allowed",
              }}
            >
              Importar {resumen.oportunidades}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 22px", borderTop: `1px solid ${T.border}` }}>
      <h3
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: T.muted,
          fontWeight: 600,
        }}
      >
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Numero({
  valor,
  uno,
  varias,
  destaca = false,
  alerta = false,
}: {
  valor: number;
  uno: string;
  varias: string;
  destaca?: boolean;
  alerta?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0" }}>
      <strong
        style={{
          fontSize: destaca ? 17 : 14,
          fontWeight: 700,
          color: alerta ? T.warn : destaca ? T.ink : T.muted,
          minWidth: 32,
        }}
      >
        {valor}
      </strong>
      <span style={{ fontSize: 12.5, color: alerta ? T.warn : T.muted, lineHeight: 1.45 }}>
        {valor === 1 ? uno : varias}
      </span>
    </div>
  );
}

function FilaGrupo({
  persona,
  accent,
  separado,
  onSeparar,
}: {
  persona: Persona;
  accent: string;
  separado: boolean;
  onSeparar: () => void;
}) {
  const unePor = persona.motivos
    .map((m) => (m === "correo" ? "el correo" : "el teléfono"))
    .join(" y ");

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 0",
        borderTop: `1px solid ${T.border}`,
        opacity: separado ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>
          {persona.nombre}
        </div>
        {persona.otrosNombres.length > 0 && (
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.45 }}>
            también aparece como{" "}
            {persona.otrosNombres.map((n) => `«${n}»`).join(", ")}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.45 }}>
          coinciden en {unePor}
          {persona.telefono ? ` · ${persona.telefono}` : ""}
          {persona.correo ? ` · ${persona.correo}` : ""}
          {persona.clienteId != null ? " · uno ya está en el CRM" : ""}
        </div>
      </div>

      <button
        type="button"
        onClick={onSeparar}
        style={{
          flexShrink: 0,
          height: 28,
          padding: "0 10px",
          fontSize: 11.5,
          borderRadius: 6,
          border: `1px solid ${separado ? accent : T.border}`,
          background: T.surface,
          color: separado ? accent : T.muted,
          whiteSpace: "nowrap",
        }}
      >
        {separado ? "Separadas ✓" : "No es la misma"}
      </button>
    </div>
  );
}
