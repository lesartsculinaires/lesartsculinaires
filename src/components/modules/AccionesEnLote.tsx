"use client";

import { useState } from "react";

import { actualizarVarias, type CambioEnLote } from "@/app/actions";
import { useCatalogo } from "@/lib/catalog";
import { T } from "@/lib/theme";
import { activos } from "@/lib/types";

/**
 * Cambiar un dato en varias fichas de una vez.
 *
 * Es para el trabajo que hoy se hace abriendo una ficha tras otra: repartir
 * treinta leads entre asesores, mover a «Perdido» los que no contestaron,
 * corregir el programa de una tanda importada mal.
 *
 * DOS CUIDADOS QUE DAN FORMA A ESTO
 *
 * El primero es que un cambio en masa no se deshace: no hay un «volver atrás»
 * que devuelva treinta fichas a lo que cada una tenía antes, porque antes
 * tenían cosas distintas. Por eso no se aplica al elegir del desplegable sino
 * al confirmar, y la confirmación dice cuántas y a qué.
 *
 * El segundo es que la selección no se ve entera. Se pueden elegir veinte,
 * cambiar el filtro y quedar mirando otras: por eso el contador está siempre a
 * la vista y dice cuántas hay elegidas, no cuántas se ven.
 */
export function AccionesEnLote({
  ids,
  accent,
  onListo,
  onLimpiar,
}: {
  ids: number[];
  accent: string;
  /** Para recargar cuando el cambio ya está hecho. */
  onListo: () => void;
  onLimpiar: () => void;
}) {
  const cat = useCatalogo();
  const [campo, setCampo] = useState<keyof CambioEnLote | "">("");
  const [valor, setValor] = useState<string>("");
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const opciones: Record<
    keyof CambioEnLote,
    { etiqueta: string; items: readonly { id: number; nombre: string }[] }
  > = {
    vendedor_id: { etiqueta: "Asignar vendedor", items: activos(cat.vendedores) },
    etapa_id: { etiqueta: "Cambiar etapa", items: cat.etapas },
    producto_id: { etiqueta: "Cambiar programa", items: cat.productos },
    estado_id: { etiqueta: "Cambiar estado", items: cat.estados },
  };

  const elegido = campo ? opciones[campo] : null;
  const nombreValor =
    elegido && valor ? elegido.items.find((i) => String(i.id) === valor)?.nombre : null;

  const aplicar = async () => {
    if (!campo || !valor) return;
    setAplicando(true);
    setAviso(null);

    const r = await actualizarVarias(ids, { [campo]: Number(valor) });
    setAplicando(false);

    if (!r.ok) {
      setAviso(r.error);
      return;
    }

    // `error` con `ok` en verdadero es el caso a medias: se cambiaron algunas.
    setAviso(r.error ?? `Listo: ${r.cuantas} ${r.cuantas === 1 ? "ficha" : "fichas"}.`);
    setCampo("");
    setValor("");
    onListo();
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        marginBottom: 12,
        borderRadius: 9,
        background: T.paper,
        border: `1px solid ${accent}`,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: accent, whiteSpace: "nowrap" }}>
        {ids.length} {ids.length === 1 ? "seleccionada" : "seleccionadas"}
      </span>

      <select
        value={campo}
        onChange={(e) => {
          setCampo(e.target.value as keyof CambioEnLote | "");
          setValor("");
          setAviso(null);
        }}
        style={SELECT}
      >
        <option value="">Qué cambiar…</option>
        {(Object.keys(opciones) as (keyof CambioEnLote)[]).map((k) => (
          <option key={k} value={k}>{opciones[k].etiqueta}</option>
        ))}
      </select>

      {elegido && (
        <select
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            setAviso(null);
          }}
          style={SELECT}
        >
          <option value="">Elegí uno…</option>
          {elegido.items.map((i) => (
            <option key={i.id} value={i.id}>{i.nombre}</option>
          ))}
        </select>
      )}

      {/* El texto del botón dice exactamente qué va a pasar. Un «Aplicar» a
          secas sobre treinta fichas es lo que hace que después nadie sepa qué
          se tocó. */}
      {elegido && valor && (
        <button
          type="button"
          onClick={() => void aplicar()}
          disabled={aplicando}
          style={{
            height: 30,
            padding: "0 13px",
            fontSize: 12.5,
            fontWeight: 600,
            borderRadius: 7,
            background: accent,
            color: "#fff",
            cursor: aplicando ? "wait" : "pointer",
          }}
        >
          {aplicando
            ? "Cambiando…"
            : `Cambiar ${ids.length} a «${nombreValor}»`}
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          setCampo("");
          setValor("");
          setAviso(null);
          onLimpiar();
        }}
        style={{ fontSize: 12, color: T.muted, padding: "0 4px" }}
      >
        Quitar selección
      </button>

      {aviso && (
        <span
          style={{
            fontSize: 11.5,
            lineHeight: 1.4,
            color: aviso.startsWith("Listo") ? T.muted : T.warn,
          }}
        >
          {aviso}
        </span>
      )}
    </div>
  );
}

const SELECT: React.CSSProperties = {
  height: 30,
  padding: "0 8px",
  fontSize: 12.5,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};
