"use client";

import { useCallback, useEffect, useState } from "react";

import {
  descartarDuplicado,
  duplicadosSugeridos,
  unificarDuplicado,
  type LadoDelPar,
  type ParSugerido,
} from "@/app/duplicados-actions";
import { T } from "@/lib/theme";

/**
 * La cola de fichas que podrían ser la misma persona.
 *
 * ============================================================================
 * QUÉ PROBLEMA RESUELVE
 * ============================================================================
 *
 * Alguien escribe por Instagram el martes y por WhatsApp el jueves. Son la misma
 * persona, pero Meta no entrega teléfono ni correo de quien escribe por
 * Instagram, así que el CRM no tiene con qué saberlo: quedan dos fichas, dos
 * leads y —lo caro— dos asesoras trabajando al mismo cliente sin enterarse.
 *
 * Antes eso sólo se descubría de casualidad. El aviso de duplicado existía, pero
 * únicamente en el momento de cargar un contacto a mano o de importar una base;
 * lo que entraba por los webhooks no lo miraba nadie nunca.
 *
 * ============================================================================
 * POR QUÉ NO SE UNIFICA SOLO
 * ============================================================================
 *
 * Porque juntar a dos personas distintas es mucho más caro que dejarlas
 * separadas. Un duplicado se ve y se arregla; dos fichas fundidas por error se
 * descubren meses después, cuando alguien le contesta a una de las cosas que
 * dijo la otra, y ya no hay cómo separarlas.
 *
 * Por eso el CRM propone y una persona decide. Lo que sí hace la pantalla es
 * ordenar: arriba lo concluyente —mismo correo, mismo teléfono—, que se resuelve
 * de un vistazo; abajo los nombres iguales, que hay que pensar.
 */
export function DuplicadosSugeridos({
  accent,
  onCerrar,
  onCambio,
}: {
  accent: string;
  onCerrar: () => void;
  /** Para que Clientes se refresque cuando se unifica algo. */
  onCambio: () => void;
}) {
  const [pares, setPares] = useState<ParSugerido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [hechos, setHechos] = useState<string[]>([]);

  const clave = (p: ParSugerido) => `${p.menor}-${p.mayor}`;

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await duplicadosSugeridos();
    setPares(r.pares);
    setError(r.error);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Saca el par de la lista sin recargar todo: la pantalla no debe parpadear. */
  const sacar = (p: ParSugerido, nota: string) => {
    setPares((ps) => ps.filter((x) => clave(x) !== clave(p)));
    setHechos((h) => [nota, ...h].slice(0, 6));
  };

  const descartar = async (p: ParSugerido) => {
    setTrabajando(clave(p));
    const r = await descartarDuplicado(p.menor, p.mayor);
    setTrabajando(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    sacar(p, `«${p.izquierda.nombre}» y «${p.derecha.nombre}» quedaron como dos personas.`);
  };

  const unificar = async (p: ParSugerido, conservar: LadoDelPar, absorber: LadoDelPar) => {
    setTrabajando(clave(p));
    const r = await unificarDuplicado(conservar.id, absorber.id, p.motivos);
    setTrabajando(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    sacar(p, `Se unificaron en «${conservar.nombre}». ${r.detalle ?? ""}`.trim());
    onCambio();
  };

  return (
    <div style={{ padding: "4px 2px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h2 className="dsp" style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>
          Duplicados sugeridos
        </h2>
        <button type="button" onClick={onCerrar} style={{ fontSize: 12.5, color: accent }}>
          volver a Clientes
        </button>
      </div>

      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: T.muted, lineHeight: 1.55, maxWidth: "72ch" }}>
        Fichas que podrían ser la misma persona. Pasa sobre todo cuando alguien
        escribe por dos canales distintos: Instagram y Messenger no entregan
        teléfono ni correo, así que el CRM no puede saberlo solo.{" "}
        <strong>Nada se unifica sin que vos lo decidas.</strong>
      </p>

      {/* Lo que se acaba de resolver, para no dudar de si el botón hizo algo. */}
      {hechos.length > 0 && (
        <div
          style={{
            marginBottom: 12,
            padding: "9px 11px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.paper,
          }}
        >
          {hechos.map((h, i) => (
            <p key={i} style={{ margin: i ? "4px 0 0" : 0, fontSize: 12, color: T.muted }}>
              ✓ {h}
            </p>
          ))}
        </div>
      )}

      {error && (
        <p
          style={{
            margin: "0 0 12px",
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${T.warn}`,
            fontSize: 12.5,
            color: T.ink,
            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
      )}

      {cargando ? (
        <p style={{ fontSize: 12.5, color: T.faint }}>Buscando…</p>
      ) : pares.length === 0 && !error ? (
        <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, maxWidth: "60ch" }}>
          No hay fichas parecidas sin revisar. Cuando entre alguien por un canal
          nuevo que se parezca a un contacto que ya está, va a aparecer acá.
        </p>
      ) : (
        pares.map((p) => (
          <ParEnRevision
            key={clave(p)}
            par={p}
            accent={accent}
            ocupado={trabajando === clave(p)}
            onUnificar={unificar}
            onDescartar={descartar}
          />
        ))
      )}
    </div>
  );
}

/** Una pareja, con sus dos fichas enfrentadas y las tres decisiones posibles. */
function ParEnRevision({
  par,
  accent,
  ocupado,
  onUnificar,
  onDescartar,
}: {
  par: ParSugerido;
  accent: string;
  ocupado: boolean;
  onUnificar: (p: ParSugerido, conservar: LadoDelPar, absorber: LadoDelPar) => void;
  onDescartar: (p: ParSugerido) => void;
}) {
  return (
    <div
      data-par={`${par.menor}-${par.mayor}`}
      style={{
        marginBottom: 10,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        background: T.surface,
        opacity: ocupado ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {par.motivos.map((m) => (
          <Senal key={m} motivo={m} />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          alignItems: "stretch",
        }}
      >
        <Ficha lado={par.izquierda} />
        <Ficha lado={par.derecha} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 11 }}>
        {/*
          Dos botones de unificar, uno por ficha, y no uno solo.

          Cuál se conserva importa: es la que se queda con el código de lead que
          la escuela viene usando. Un único botón «unificar» obligaría a elegir
          en otra pantalla, o peor, elegiría solo.
        */}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onUnificar(par, par.izquierda, par.derecha)}
          style={botonPrincipal(accent, ocupado)}
        >
          Conservar «{recortar(par.izquierda.nombre)}»
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onUnificar(par, par.derecha, par.izquierda)}
          style={botonPrincipal(accent, ocupado)}
        >
          Conservar «{recortar(par.derecha.nombre)}»
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onDescartar(par)}
          style={{
            height: 32,
            padding: "0 13px",
            fontSize: 12.5,
            borderRadius: 7,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.ink,
            cursor: ocupado ? "wait" : "pointer",
          }}
        >
          No es la misma persona
        </button>
      </div>
    </div>
  );
}

/** Una de las dos fichas del par, con lo que hace falta para decidir. */
function Ficha({ lado }: { lado: LadoDelPar }) {
  return (
    <div
      style={{
        padding: "10px 11px",
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        background: T.paper,
      }}
    >
      <p style={{ margin: "0 0 5px", fontSize: 13.5, fontWeight: 600, color: T.ink }}>
        {lado.nombre || "(sin nombre)"}
      </p>
      <Dato titulo="Teléfono" valor={lado.telefono} mono />
      <Dato titulo="Correo" valor={lado.correo} />
      <Dato titulo="Canales" valor={lado.canales} />
      {/*
        El último mensaje es lo que decide un par de nombres iguales.

        Si una ficha tiene un mensaje de esta semana y la otra uno de hace dos
        años, casi seguro son dos personas. Si las dos escribieron el mismo día
        por canales distintos, casi seguro son la misma.
      */}
      <Dato titulo="Último mensaje" valor={cuando(lado.ultimoMensaje)} />
    </div>
  );
}

function Dato({ titulo, valor, mono }: { titulo: string; valor: string | null; mono?: boolean }) {
  return (
    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
      <span style={{ color: T.faint }}>{titulo}: </span>
      <span className={mono ? "mono" : undefined} style={{ color: valor ? T.ink : T.faint }}>
        {valor ?? "—"}
      </span>
    </p>
  );
}

/**
 * La etiqueta de por qué se propuso, con su color.
 *
 * El color no es decoración: dice cuánto confiar. Correo y teléfono son
 * concluyentes —es raro que dos personas compartan uno— y el nombre no lo es
 * para nada. Quien revisa cien pares no lee cada uno: mira el color.
 */
function Senal({ motivo }: { motivo: string }) {
  const fuerte = motivo === "correo" || motivo === "telefono";
  const texto =
    motivo === "correo"
      ? "Mismo correo"
      : motivo === "telefono"
        ? "Mismo teléfono"
        : "Mismo nombre";

  return (
    <span
      title={
        fuerte
          ? "Señal concluyente: es raro que dos personas compartan esto."
          : "Señal débil: dos personas pueden llamarse igual. Mirá los canales y la fecha."
      }
      style={{
        padding: "2px 9px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 999,
        border: `1px solid ${fuerte ? "#1F7A4D" : T.borderStrong}`,
        color: fuerte ? "#1F7A4D" : T.muted,
        background: fuerte ? "rgba(31,122,77,0.07)" : "transparent",
      }}
    >
      {texto}
    </span>
  );
}

const botonPrincipal = (accent: string, ocupado: boolean): React.CSSProperties => ({
  height: 32,
  padding: "0 13px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 7,
  background: accent,
  color: "#fff",
  cursor: ocupado ? "wait" : "pointer",
});

const recortar = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s || "sin nombre");

/** La fecha en corto, que es lo único que se compara de un vistazo. */
function cuando(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}
