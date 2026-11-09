"use client";

/**
 * Las piezas que comparten las hojas del Tablero Comercial: cómo se escribe un
 * número, la celda que se llena, el semáforo y el comentario de cada área.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Estado } from "@/lib/tablero/calculos";
import type { Formato } from "@/lib/tablero/campos";
import { T } from "@/lib/theme";

// ------------------------------------------------------------------ formatos

const ENTERO = new Intl.NumberFormat("es-SV", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("es-SV", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const DINERO = new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Un número como se lee en el Tablero. Vacío = «—». */
export function formatear(v: number | null | undefined, formato: Formato | "numero" = "numero"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (formato) {
    case "dinero": return DINERO.format(v);
    case "porcentaje": return `${ENTERO.format(v * 100)}%`;
    case "decimal": return DECIMAL.format(v);
    default: return Number.isInteger(v) ? ENTERO.format(v) : DECIMAL.format(v);
  }
}

/** Lo que se escribió en una celda, como número. Vacío = null. Acepta coma decimal y «%». */
export function leerNumero(texto: string, formato: Formato | "numero" = "numero"): number | null | "malo" {
  const limpio = texto.replace(/[$\s,]/g, (c) => (c === "," ? "." : "")).replace(/%$/, "");
  if (limpio === "") return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) return "malo";
  return formato === "porcentaje" && texto.trim().endsWith("%") ? n / 100 : n;
}

// ------------------------------------------------------------------- estilos

export const tabla: CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: 12.5 };
export const th: CSSProperties = {
  textAlign: "left", padding: "7px 8px", background: T.paper, color: T.muted, fontWeight: 600,
  fontSize: 11.5, borderBottom: `1px solid ${T.border}`, verticalAlign: "bottom", position: "sticky", top: 0,
};
export const td: CSSProperties = { padding: "5px 8px", borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
export const tdNum: CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
/** El título de una columna de números: a la derecha, como sus números. */
export const thNum: CSSProperties = { ...th, textAlign: "right" };
/**
 * La primera columna de una hoja ancha (la semana, la persona, el mes): queda
 * fija al correr la tabla hacia la derecha, como «inmovilizar» en el Excel.
 */
export const fija: CSSProperties = { position: "sticky", left: 0, zIndex: 1, background: T.surface, boxShadow: `1px 0 0 ${T.border}` };

/** La caja con scroll horizontal para las hojas anchas, como el Excel. */
export function Ancha({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 10, background: T.surface }}>
      {children}
    </div>
  );
}

export function Titulo({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <div style={{ margin: "22px 0 8px" }}>
      <h3 style={{ margin: 0, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: T.ink }}>{children}</h3>
      {nota && <p style={{ margin: "4px 0 0", fontSize: 12, color: T.muted, lineHeight: 1.45 }}>{nota}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- semáforo

const COLORES: Record<Estado, { fondo: string; texto: string }> = {
  Cumple: { fondo: "#E3F4E8", texto: "#1E6B3A" },
  Cerca: { fondo: "#FFF4D6", texto: "#8A5A00" },
  "No cumple": { fondo: "#FBE4E2", texto: "#9E2F29" },
  "Sin meta": { fondo: T.paper, texto: T.faint },
};

export function Semaforo({ estado }: { estado: Estado | null }) {
  if (!estado) return <span style={{ color: T.faint }}>—</span>;
  const c = COLORES[estado];
  return (
    <span data-estado={estado} style={{ background: c.fondo, color: c.texto, borderRadius: 20, padding: "1px 9px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>
      {estado}
    </span>
  );
}

/** «▲ Mejoró» / «▼ Empeoró», según el sentido del KPI. */
export function Tendencia({ mejoro }: { mejoro: boolean | null }) {
  if (mejoro == null) return <span style={{ color: T.faint }}>—</span>;
  return mejoro
    ? <span style={{ color: "#1E6B3A", fontWeight: 600 }}>▲ Mejoró</span>
    : <span style={{ color: "#9E2F29", fontWeight: 600 }}>▼ Empeoró</span>;
}

// ------------------------------------------------------- la celda que se llena

/**
 * Una celda de número que se guarda sola al salir de ella.
 *
 * `delCrm` es lo que el CRM ya sabe de ese dato: se muestra en gris adentro
 * de la celda vacía, así se ve que está cubierto sin que nadie lo escriba. Si
 * alguien escribe encima, manda lo escrito y la celda se marca «corregido».
 */
export function CeldaNumero({
  valor,
  delCrm,
  formato = "numero",
  puede,
  onGuardar,
  ancho = 86,
  etiqueta,
}: {
  valor: number | null;
  delCrm?: number | null;
  formato?: Formato | "numero";
  puede: boolean;
  onGuardar: (v: number | null) => Promise<string | null>;
  ancho?: number;
  etiqueta: string;
}) {
  const aTexto = (v: number | null) =>
    v == null ? "" : formato === "porcentaje" ? String(Math.round(v * 1000) / 10) + "%" : String(v);
  const [texto, setTexto] = useState(aTexto(valor));
  const [estado, setEstado] = useState<"" | "guardando" | "error">("");
  const [error, setError] = useState<string | null>(null);

  // Si el dato cambia desde afuera (recarga, otra persona), se refleja.
  useEffect(() => setTexto(aTexto(valor)), [valor]); // eslint-disable-line react-hooks/exhaustive-deps

  const corregido = valor != null && delCrm != null && valor !== delCrm;

  if (!puede) {
    const mostrado = valor ?? delCrm ?? null;
    return (
      <span title={corregido ? `El CRM dice ${formatear(delCrm, formato)}` : undefined} style={{ color: valor == null && delCrm != null ? T.muted : T.ink }}>
        {formatear(mostrado, formato)}
        {corregido && <sup style={{ color: "#8A5A00", marginLeft: 2 }}>✎</sup>}
      </span>
    );
  }

  const salir = async () => {
    const leido = leerNumero(texto, formato);
    if (leido === "malo") {
      setEstado("error");
      setError("Eso no es un número.");
      return;
    }
    if (leido === valor) return;
    setEstado("guardando");
    const e = await onGuardar(leido);
    if (e) {
      setEstado("error");
      setError(e);
      setTexto(aTexto(valor));
    } else {
      setEstado("");
      setError(null);
    }
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
      <input
        aria-label={etiqueta}
        inputMode="decimal"
        value={texto}
        placeholder={delCrm != null ? formatear(delCrm, formato) : ""}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => void salir()}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        title={error ?? (corregido ? `Corregido a mano. El CRM dice ${formatear(delCrm, formato)}` : delCrm != null ? "Lo trae el CRM. Escribe solo si hay que corregirlo." : undefined)}
        data-corregido={corregido ? "si" : undefined}
        style={{
          width: ancho, textAlign: "right", fontSize: 12.5, padding: "4px 6px", borderRadius: 6,
          border: `1px solid ${estado === "error" ? "#C0392B" : corregido ? "#E0B44C" : T.border}`,
          background: estado === "guardando" ? T.paper : corregido ? "#FFFBEF" : "#FFFDF4",
          color: T.ink, fontVariantNumeric: "tabular-nums",
        }}
      />
      {estado === "error" && error && <span role="alert" style={{ color: "#9E2F29", fontSize: 10.5, maxWidth: 220 }}>{error}</span>}
    </span>
  );
}

/**
 * Una celda de texto, fecha o lista que se guarda sola al salir (o al elegir,
 * si es lista). `obligatorio` no deja guardarla vacía.
 */
export function CeldaTexto({
  valor,
  puede,
  onGuardar,
  etiqueta,
  ancho = 140,
  tipo = "text",
  opciones,
  obligatorio = false,
}: {
  valor: string | null;
  puede: boolean;
  onGuardar: (v: string | null) => Promise<string | null>;
  etiqueta: string;
  ancho?: number;
  tipo?: "text" | "date";
  opciones?: readonly string[];
  obligatorio?: boolean;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setTexto(valor ?? ""), [valor]);

  if (!puede) return <span style={{ color: valor ? T.ink : T.faint }}>{valor || "—"}</span>;

  const guardar = async (nuevo: string) => {
    const limpio = nuevo.trim();
    if (limpio === (valor ?? "")) return;
    if (!limpio && obligatorio) {
      setError("No puede quedar vacío.");
      setTexto(valor ?? "");
      return;
    }
    const e = await onGuardar(limpio || null);
    setError(e);
    if (e) setTexto(valor ?? "");
  };

  const estilo: CSSProperties = {
    width: ancho, fontSize: 12.5, padding: "4px 6px", borderRadius: 6,
    border: `1px solid ${error ? "#C0392B" : T.border}`, background: "#FFFDF4", color: T.ink, fontFamily: "inherit",
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column" }}>
      {opciones ? (
        <select aria-label={etiqueta} value={texto} style={estilo} onChange={(e) => { setTexto(e.target.value); void guardar(e.target.value); }}>
          {!obligatorio && <option value="">—</option>}
          {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          aria-label={etiqueta}
          type={tipo}
          value={texto}
          title={texto || undefined}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => void guardar(texto)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          style={estilo}
        />
      )}
      {error && <span role="alert" style={{ color: "#9E2F29", fontSize: 10.5, maxWidth: 220 }}>{error}</span>}
    </span>
  );
}

/** Un botón chico, como los de las hojas. */
export function Boton({ children, onClick, peligro = false, deshabilitado = false }: { children: ReactNode; onClick: () => void; peligro?: boolean; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      style={{
        fontSize: 12, padding: "5px 11px", borderRadius: 8, cursor: deshabilitado ? "default" : "pointer",
        border: `1px solid ${peligro ? "#E3B4AE" : T.border}`, background: peligro ? "#FDF2F1" : T.surface,
        color: peligro ? "#9E2F29" : T.ink, opacity: deshabilitado ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------- el comentario del área

/**
 * Lo que el área quiere decir de su hoja este mes. Lo pidió la escuela al
 * traer la plantilla: un número solo no explica por qué bajó.
 */
export function Comentario({
  titulo,
  texto,
  actualizadoEn,
  puede,
  onGuardar,
}: {
  titulo: string;
  texto: string;
  actualizadoEn?: string;
  puede: boolean;
  onGuardar: (t: string) => Promise<string | null>;
}) {
  const [borrador, setBorrador] = useState(texto);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => setBorrador(texto), [texto]);

  return (
    <section data-comentario style={{ marginTop: 22, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", background: T.paper }}>
      <h4 style={{ margin: "0 0 6px", fontSize: 12.5, color: T.ink }}>{titulo}</h4>
      {puede ? (
        <>
          <textarea
            aria-label={titulo}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            rows={3}
            placeholder="Qué explica los números de este mes, qué se hará distinto, qué hace falta…"
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
            <button
              type="button"
              disabled={borrador.trim() === texto.trim()}
              onClick={async () => {
                const e = await onGuardar(borrador);
                setAviso(e ?? "Guardado.");
              }}
              style={{ fontSize: 12.5, padding: "5px 12px", borderRadius: 8, border: `1px solid ${T.ink}`, background: T.ink, color: "#fff", cursor: "pointer", opacity: borrador.trim() === texto.trim() ? 0.4 : 1 }}
            >
              Guardar comentario
            </button>
            {aviso && <span style={{ fontSize: 12, color: aviso === "Guardado." ? "#1E6B3A" : "#9E2F29" }}>{aviso}</span>}
          </div>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: texto ? T.ink : T.faint, whiteSpace: "pre-wrap" }}>
          {texto || "Sin comentario este mes."}
        </p>
      )}
      {actualizadoEn && texto && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: T.faint }}>
          Última edición: {new Date(actualizadoEn).toLocaleString("es-SV", { timeZone: "America/El_Salvador", dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </section>
  );
}
