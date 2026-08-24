"use client";

import { useMemo, useState } from "react";
import { Buscador } from "@/components/ui/Buscador";

import { sincronizarPlantillas, type EstadoPlantillas } from "@/app/plantillas-actions";
import { cuandoConHora } from "@/lib/format";
import { T } from "@/lib/theme";
import type { Plantilla } from "@/lib/types";

/**
 * Las plantillas de WhatsApp.
 *
 * Es una pantalla de sólo lectura, y eso no es una limitación del CRM sino de
 * cómo funciona WhatsApp: las plantillas se crean y se aprueban en el panel de
 * Meta, y hasta que Meta no aprueba una, no se puede mandar. Por eso lo único
 * que se puede hacer desde acá es mirarlas, traer los cambios, e irse a Meta a
 * crear la siguiente.
 *
 * El estado es la columna que importa. Una plantilla en revisión figura igual
 * en la lista y es fácil creer que ya sirve; mandarla falla. Por eso se
 * muestra en grande y no como un detalle.
 */
export function Plantillas({
  estado,
  accent,
  onRefrescar,
}: {
  estado: EstadoPlantillas;
  accent: string;
  onRefrescar: () => void;
}) {
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [idioma, setIdioma] = useState("");

  const idiomas = useMemo(
    () => [...new Set(estado.plantillas.map((p) => p.idioma))].sort(),
    [estado.plantillas],
  );

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return estado.plantillas.filter(
      (p) =>
        (!idioma || p.idioma === idioma) &&
        (!q ||
          p.nombre.toLowerCase().includes(q) ||
          (p.cuerpo ?? "").toLowerCase().includes(q)),
    );
  }, [estado.plantillas, busqueda, idioma]);

  const sincronizar = async () => {
    setSincronizando(true);
    setAviso(null);
    const r = await sincronizarPlantillas();
    setSincronizando(false);
    setAviso(r.ok ? "Listo, ya están al día." : r.error);
    onRefrescar();
  };

  return (
    <div style={{ maxWidth: 940 }}>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
        Las plantillas se crean y se aprueban en Meta, no acá. Esta pantalla las
        muestra tal como están allá.
      </p>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: T.faint, lineHeight: 1.6 }}>
        Sirven para una cosa concreta: cuando pasaron más de 24 horas desde el
        último mensaje de una persona, WhatsApp no deja escribirle libremente y
        una plantilla aprobada es la única forma de retomar la conversación.
      </p>

      {/* ------------------------------------------------------- controles */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <Buscador
          valor={busqueda}
          onCambio={setBusqueda}
          placeholder="Buscar por nombre o contenido…"
          style={{ minWidth: 230 }}
        />

        {idiomas.length > 1 && (
          <select
            value={idioma}
            onChange={(e) => setIdioma(e.target.value)}
            style={{
              height: 32,
              padding: "0 8px",
              fontSize: 12.5,
              border: `1px solid ${T.border}`,
              borderRadius: 7,
              background: T.surface,
              color: T.ink,
            }}
          >
            <option value="">Todos los idiomas</option>
            {idiomas.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        )}

        <span className="mono" style={{ fontSize: 11.5, color: T.faint }}>
          {lista.length} {lista.length === 1 ? "plantilla" : "plantillas"}
        </span>

        <span style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => void sincronizar()}
          disabled={sincronizando || !estado.puedeSincronizar}
          title={
            estado.puedeSincronizar
              ? "Trae de Meta los cambios y las nuevas"
              : "Faltan WHATSAPP_TOKEN y WHATSAPP_WABA_ID en el servidor"
          }
          style={{
            height: 32,
            padding: "0 14px",
            fontSize: 12.5,
            borderRadius: 7,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: estado.puedeSincronizar ? T.ink : T.faint,
            cursor: sincronizando ? "wait" : estado.puedeSincronizar ? "pointer" : "not-allowed",
          }}
        >
          {sincronizando ? "Sincronizando…" : "↻ Sincronizar"}
        </button>

        {/* El botón que lleva a crear una. Abre el panel de Meta en otra
            pestaña: crear una plantilla es un formulario de ellos, con su
            propia revisión, y no hay forma de hacerlo desde acá. */}
        <a
          href={estado.panel}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 32,
            padding: "0 14px",
            fontSize: 12.5,
            fontWeight: 600,
            borderRadius: 7,
            background: accent,
            color: "#fff",
            textDecoration: "none",
          }}
        >
          Crear plantilla en Meta ↗
        </a>
      </div>

      <p style={{ margin: "0 0 14px", fontSize: 11.5, color: T.faint }}>
        {estado.intentadoEn
          ? `Último intento de sincronización: ${cuandoConHora(estado.intentadoEn)}`
          : "Todavía no se sincronizó nunca."}
        {estado.logradoEn && estado.logradoEn !== estado.intentadoEn
          ? ` · última vez que funcionó: ${cuandoConHora(estado.logradoEn)}`
          : ""}
      </p>

      {estado.faltaMigracion && (
        <Nota tono={T.warn}>
          Falta correr la migración <code>20260831120000_plantillas.sql</code> en
          Supabase. Hasta entonces no hay dónde guardar lo que devuelva Meta.
        </Nota>
      )}

      {!estado.puedeSincronizar && !estado.faltaMigracion && (
        <Nota tono={T.muted}>
          Para traer las plantillas hacen falta <code>WHATSAPP_TOKEN</code> y{" "}
          <code>WHATSAPP_WABA_ID</code> en el servidor. El segundo es el
          identificador de la <strong>cuenta de WhatsApp Business</strong>, que no
          es el mismo que el del número. Mientras tanto el botón de crear sí
          funciona: lleva al panel de Meta.
        </Nota>
      )}

      {estado.error && <Nota tono={T.warn}>La última sincronización falló: {estado.error}</Nota>}
      {aviso && <Nota tono={aviso.startsWith("Listo") ? T.muted : T.warn}>{aviso}</Nota>}

      {/* ----------------------------------------------------------- lista */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
        {lista.length === 0 ? (
          <p style={{ margin: 0, padding: 18, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
            {estado.plantillas.length === 0
              ? "Todavía no hay plantillas. Creá la primera en Meta y después tocá «Sincronizar» para verla acá."
              : "Ninguna coincide con lo que buscaste."}
          </p>
        ) : (
          lista.map((p, i) => <Fila key={p.id} plantilla={p} primera={i === 0} />)
        )}
      </div>
    </div>
  );
}

function Fila({ plantilla: p, primera }: { plantilla: Plantilla; primera: boolean }) {
  const [fg, bg, texto] = tono(p.estado);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "12px 14px",
        borderTop: primera ? "none" : `1px solid ${T.border}`,
        background: T.surface,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="mono" style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600 }}>
          {p.nombre}
        </p>
        <p style={{ margin: "0 0 5px", fontSize: 11, color: T.faint }}>
          {p.idioma}
          {p.categoria ? ` · ${categoria(p.categoria)}` : ""}
          {p.variables > 0
            ? ` · ${p.variables} ${p.variables === 1 ? "dato por llenar" : "datos por llenar"}`
            : ""}
        </p>
        {p.cuerpo && (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: T.muted,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {p.cuerpo}
          </p>
        )}
      </div>

      <span
        className="pill"
        style={{
          flexShrink: 0,
          padding: "3px 9px",
          fontSize: 10.5,
          fontWeight: 600,
          borderRadius: 11,
          background: bg,
          color: fg,
        }}
        title={explicarEstado(p.estado)}
      >
        {texto}
      </span>
    </div>
  );
}

function Nota({ children, tono }: { children: React.ReactNode; tono: string }) {
  return (
    <p
      style={{
        margin: "0 0 12px",
        padding: "10px 12px",
        fontSize: 12,
        color: tono,
        lineHeight: 1.6,
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
      }}
    >
      {children}
    </p>
  );
}

/** Color y palabra de cada estado. Los nombres vienen en inglés de Meta. */
function tono(estado: string): [string, string, string] {
  switch (estado.toUpperCase()) {
    case "APPROVED":
      return ["#2F6B4F", "#E6F0E9", "Aprobada"];
    case "PENDING":
    case "IN_APPEAL":
      return ["#8A5200", "#FFF6D6", "En revisión"];
    case "REJECTED":
      return ["#B85042", "#F7EBE9", "Rechazada"];
    case "PAUSED":
    case "DISABLED":
      return ["#6B665F", "#EFEDE8", "Pausada"];
    default:
      return ["#6B665F", "#EFEDE8", estado];
  }
}

function explicarEstado(estado: string): string {
  switch (estado.toUpperCase()) {
    case "APPROVED":
      return "Se puede mandar.";
    case "PENDING":
      return "Meta todavía la está revisando. Hasta que la apruebe no se puede mandar.";
    case "REJECTED":
      return "Meta la rechazó. Hay que corregirla en su panel y volver a mandarla a revisión.";
    case "PAUSED":
    case "DISABLED":
      return "Meta la pausó, normalmente por muchas quejas de los que la reciben.";
    default:
      return estado;
  }
}

function categoria(c: string): string {
  const nombres: Record<string, string> = {
    MARKETING: "Marketing",
    UTILITY: "Utilidad",
    AUTHENTICATION: "Autenticación",
  };
  return nombres[c.toUpperCase()] ?? c;
}
