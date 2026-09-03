"use client";

import { useMemo, useState } from "react";

import { Evolucion } from "@/components/modules/Evolucion";
import { money } from "@/lib/format";
import { variacion } from "@/lib/periodos";
import {
  TODO,
  comoSeExplicaElVacio,
  periodoAnterior,
  periodoInicial,
  periodosDisponibles,
  recortar,
  type Periodo,
} from "@/lib/periodoDelTablero";
import { estaAbierta, esGanada, groupBars, motivosDePerdida, totalCerrado } from "@/lib/selectors";
import { T, openTone } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  accent: string;
}

/**
 * El tablero, siempre de un mes.
 *
 * ============================================================================
 * POR QUÉ ABRE EN EL MES EN CURSO Y NO EN TODO EL HISTÓRICO
 * ============================================================================
 *
 * Lo que pidió la escuela: «que cada mes se vea reflejado un nuevo comienzo y
 * poder comparar los datos de los meses anteriores».
 *
 * Antes los cuatro números de arriba y los seis gráficos contaban TODO lo que
 * hubiera cargado, desde que existe el CRM. Con 79 oportunidades decía «79»
 * tanto el 1 de septiembre como el 30, y los cinco leads que entraron en
 * septiembre no aparecían en ningún lado. Un número que nunca baja no dice
 * cómo va el mes: dice cuánto tiempo lleva abierto el CRM.
 *
 * Ahora el mes manda sobre la pantalla entera. «Todo el histórico» sigue
 * estando, a un clic, porque hay preguntas que se contestan así —de dónde vino
 * la gente en dos años, qué programa vende más siempre— pero deja de ser lo
 * primero que se ve.
 *
 * ============================================================================
 * EL MES ES EL DE REGISTRO DEL LEAD
 * ============================================================================
 *
 * Y se dice en pantalla, porque cambia lo que significan los números. «Agosto:
 * 33 leads, $4.790» son los leads que ENTRARON en agosto y lo que esos leads
 * dejaron, se hayan cerrado en agosto o después. Es una cohorte, no una caja
 * mensual: no contesta «¿cuánto facturamos en agosto?».
 *
 * No es un capricho: `fecha_cierre` está vacía en casi todas las filas, así
 * que agrupar por ella escondería casi toda la plata. El día que la escuela
 * empiece a cargar la fecha de cierre, se puede ofrecer la otra lectura al
 * lado; mientras tanto, mostrar una sola y decir cuál es, es lo honesto.
 */
export function Dashboard({ oportunidades, accent }: Props) {
  const open = openTone(accent);

  const periodos = useMemo(() => periodosDisponibles(oportunidades), [oportunidades]);
  const [clave, setClave] = useState<string>(() => periodoInicial());

  const periodo =
    periodos.find((p) => p.clave === clave) ?? periodos[0] ?? { clave: TODO, etiqueta: "Todo el histórico", cuando: "" };

  const delPeriodo = useMemo(
    () => recortar(oportunidades, periodo.clave),
    [oportunidades, periodo.clave],
  );

  /*
   * El período anterior se recorta de la lista COMPLETA, no de la recortada.
   *
   * Parece obvio y es el error que haría que toda comparación diera «sin
   * comparación»: filtrando septiembre y buscando agosto adentro no queda
   * nada, y el tablero diría que nunca hay con qué comparar.
   */
  const previo = periodoAnterior(periodo.clave);
  const delPrevio = useMemo(
    () => (previo ? recortar(oportunidades, previo.clave) : []),
    [oportunidades, previo],
  );

  const metrics = medir(delPeriodo);
  const antes = previo ? medir(delPrevio) : null;

  const charts = [
    { title: "Vendedores", hint: "por cartera", bars: groupBars(delPeriodo, "vendedor") },
    { title: "Etapas", hint: "embudo", bars: groupBars(delPeriodo, "etapa") },
    { title: "Canales", hint: "origen del lead", bars: groupBars(delPeriodo, "canal", 8) },
    { title: "Territorio", hint: "top 8 departamentos", bars: groupBars(delPeriodo, "territorio", 8) },
    { title: "Programas", hint: "top 8 del catálogo", bars: groupBars(delPeriodo, "producto", 8) },
    { title: "Estados", hint: "situación actual", bars: groupBars(delPeriodo, "estado") },
  ];

  return (
    <div>
      <SelectorDePeriodo
        periodos={periodos}
        elegido={periodo}
        previo={previo}
        accent={accent}
        onElegir={setClave}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {metrics.map((m, i) => (
          <div
            key={m.label}
            /* Marcas para poder comprobar los números desde una prueba sin
               depender de cómo esté maquetada la caja. */
            data-kpi={m.label}
            style={{ background: T.paper, borderRadius: 8, padding: "14px 16px" }}
          >
            <p style={{ margin: "0 0 6px", fontSize: 12, color: T.muted }}>{m.label}</p>
            <p data-valor className="mono dsp" style={{ margin: 0, fontSize: 24, fontWeight: 500 }}>
              {m.texto}
            </p>
            {antes && (
              <Contra
                ahora={m.crudo}
                antes={antes[i].crudo}
                cuando={previo?.etiqueta ?? ""}
                /* La tasa de cierre ya es un porcentaje: su variación se dice
                   en puntos, no en «porcentaje de un porcentaje», que no
                   significa nada para nadie. */
                enPuntos={m.esPorcentaje}
              />
            )}
          </div>
        ))}
      </div>

      {delPeriodo.length === 0 && (
        <p
          style={{
            margin: "0 0 20px",
            padding: "12px 15px",
            fontSize: 12.5,
            lineHeight: 1.5,
            color: T.muted,
            background: T.paper,
            borderRadius: 8,
          }}
        >
          {comoSeExplicaElVacio(periodo)}
        </p>
      )}

      {/* Evolución mira SIEMPRE todos los meses, sin recortar: es la pantalla
          que compara unos con otros, y recortarla al mes elegido la dejaría
          con una sola barra y sin nada que comparar. */}
      <Evolucion oportunidades={oportunidades} accent={accent} />

      <PorQueSePierden oportunidades={delPeriodo} />

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: accent }} />
          Venta cerrada
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: open }} />
          En pipeline
        </span>
        <span style={{ fontSize: 11, color: T.faint }}>
          Las barras se escalan contra el grupo más grande, no contra el total.
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: 14,
        }}
      >
        {charts.map((ch) => (
          <section
            key={ch.title}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <h3 className="dsp" style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                {ch.title}
              </h3>
              <span style={{ fontSize: 11, color: T.faint }}>{ch.hint}</span>
            </div>
            {ch.bars.map((b) => (
              <div key={b.label} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                    marginBottom: 5,
                  }}
                >
                  <span style={{ fontSize: 12.5 }}>{b.label}</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, color: T.faint }}>{b.count}</span>
                    <span className="mono" style={{ fontSize: 12, color: T.muted }}>
                      {b.value}
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    height: 7,
                    background: "#E4E9F3",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ width: `${b.wonPct}%`, background: accent }} />
                  <div style={{ width: `${b.openPct}%`, background: open }} />
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}


/**
 * Los cuatro números de arriba.
 *
 * Se devuelven con el valor crudo al lado del texto porque hacen dos cosas
 * distintas: el texto se dibuja y el crudo se compara contra el mes anterior.
 * Sacando el número de vuelta del texto —«$4,790» a 4790— habría que
 * desarmar el formato, y bastaría un separador de miles distinto para que la
 * comparación empezara a mentir en silencio.
 */
interface Indicador {
  label: string;
  texto: string;
  crudo: number;
  /** Ya viene en porcentaje: su variación se dice en puntos. */
  esPorcentaje?: boolean;
}

function medir(list: readonly Oportunidad[]): Indicador[] {
  const total = list.length;
  const abiertas = list.filter(estaAbierta).length;
  const cerrado = totalCerrado(list);
  const ganadas = list.filter(esGanada).length;
  const tasa = total ? Math.round((ganadas / total) * 100) : 0;

  return [
    { label: "Oportunidades", texto: String(total), crudo: total },
    { label: "En pipeline", texto: String(abiertas), crudo: abiertas },
    { label: "Venta cerrada", texto: money(cerrado || null), crudo: cerrado },
    {
      label: "Tasa de cierre",
      texto: total ? `${tasa}%` : "—",
      crudo: tasa,
      esPorcentaje: true,
    },
  ];
}

/**
 * Cuánto cambió contra el período anterior.
 *
 * ----------------------------------------------------------------------------
 * DE CERO A ALGO NO ES «+100 %»
 * ----------------------------------------------------------------------------
 *
 * Es la primera venta, y ponerle un porcentaje inventaría una tendencia que el
 * dato no tiene. Ahí se dice cuánto había antes —«el mes pasado: 0»— que es la
 * información que sí existe.
 *
 * La tasa de cierre se compara en PUNTOS y no en porcentaje: pasar de 20 % a
 * 25 % es «+5 puntos», no «+25 %». Las dos frases son ciertas y una de ellas
 * se entiende.
 */
function Contra({
  ahora,
  antes,
  cuando,
  enPuntos,
}: {
  ahora: number;
  antes: number;
  cuando: string;
  enPuntos?: boolean;
}) {
  if (!cuando) return null;

  const sinComparar = (
    <span style={{ display: "block", marginTop: 5, fontSize: 11, color: T.faint }}>
      {cuando}: {antes === 0 ? "0" : antes}
    </span>
  );

  if (enPuntos) {
    const d = Math.round(ahora - antes);
    if (d === 0) return sinComparar;
    return (
      <span
        className="mono"
        style={{ display: "block", marginTop: 5, fontSize: 11, color: d > 0 ? "#2F6B4F" : "#B85042" }}
        title={`${cuando}: ${antes}%`}
      >
        {d > 0 ? "▲ +" : "▼ −"}
        {Math.abs(d)} pts
      </span>
    );
  }

  const pct = variacion(ahora, antes);
  if (pct == null) return sinComparar;

  const redondeado = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  if (redondeado === 0) return sinComparar;

  return (
    <span
      className="mono"
      style={{ display: "block", marginTop: 5, fontSize: 11, color: pct >= 0 ? "#2F6B4F" : "#B85042" }}
      title={`${cuando}: ${antes}`}
    >
      {pct >= 0 ? "▲ +" : "▼ −"}
      {Math.abs(redondeado)}% vs {cuando}
    </span>
  );
}

/**
 * Qué mes se está mirando.
 *
 * Los meses van sueltos y no dentro de un desplegable: elegir el mes es lo que
 * más se hace en esta pantalla, y esconderlo detrás de un clic de más lo
 * volvería algo que nadie usa. Los años y «Todo el histórico» sí van al final,
 * porque se miran de vez en cuando.
 *
 * Se muestran seis meses. Para atrás de eso están los años, y el detalle mes a
 * mes de cualquier época está en «Evolución», acá abajo.
 */
function SelectorDePeriodo({
  periodos,
  elegido,
  previo,
  accent,
  onElegir,
}: {
  periodos: Periodo[];
  elegido: Periodo;
  previo: Periodo | null;
  accent: string;
  onElegir: (clave: string) => void;
}) {
  const meses = periodos.filter((p) => /^\d{4}-\d{2}$/.test(p.clave));
  const resto = periodos.filter((p) => !/^\d{4}-\d{2}$/.test(p.clave));

  // Los seis más nuevos, más el elegido si quedó fuera de esa ventana.
  const aLaVista = meses.slice(0, 6);
  if (!aLaVista.some((m) => m.clave === elegido.clave) && /^\d{4}-\d{2}$/.test(elegido.clave)) {
    aLaVista.push(elegido);
  }

  const boton = (p: Periodo) => {
    const puesto = p.clave === elegido.clave;
    return (
      <button
        key={p.clave}
        type="button"
        data-periodo={p.clave}
        data-puesto={puesto ? "si" : "no"}
        onClick={() => onElegir(p.clave)}
        style={{
          padding: "6px 12px",
          fontSize: 12.5,
          borderRadius: 7,
          border: `1px solid ${puesto ? accent : T.border}`,
          background: puesto ? accent : T.surface,
          color: puesto ? "#fff" : T.muted,
          fontWeight: puesto ? 600 : 400,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {p.etiqueta}
      </button>
    );
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {aLaVista.map(boton)}
        <span style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
        {resto.map(boton)}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
        {/*
          Que esto esté escrito no es decoración: sin la aclaración, «Agosto:
          $4.790» se lee como «en agosto facturamos $4.790», que no es lo que
          dice el número. Dice cuánto dejaron los leads que ENTRARON en agosto.
        */}
        Todo lo de abajo es de <strong style={{ color: T.muted }}>{elegido.etiqueta}</strong>, por
        mes de registro del lead
        {previo ? ` · comparado contra ${previo.etiqueta}` : ""}.
      </p>
    </div>
  );
}

/**
 * Por qué se pierden los leads.
 *
 * Va en su propio bloque y no como una barra más porque contesta otra cosa. El
 * resto del tablero mide dinero en movimiento; esto mide una causa, y de una
 * causa lo que se quiere saber es cuánta gente se va por ahí —no cuánto valían
 * esas fichas—. Por eso ordena por cantidad y muestra el porcentaje adelante.
 *
 * Si no hay ninguna perdida, no se dibuja: un bloque vacío que dice «0» ocupa
 * el lugar de algo que sí tiene qué decir.
 */
function PorQueSePierden({ oportunidades }: { oportunidades: Oportunidad[] }) {
  const motivos = motivosDePerdida(oportunidades);
  if (motivos.length === 0) return null;

  const perdidas = oportunidades.filter((o) => o.estado === "Perdido").length;
  const anotados = motivos.filter((m) => !m.sinDecir).reduce((s, m) => s + m.leads, 0);

  return (
    <section
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: 18,
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <h3 className="dsp" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          Por qué se pierden
        </h3>
        <span style={{ fontSize: 11.5, color: T.faint }}>
          {perdidas} {perdidas === 1 ? "oportunidad perdida" : "oportunidades perdidas"}
          {anotados < perdidas && ` · ${anotados} con motivo anotado`}
        </span>
      </div>

      <div style={{ display: "grid", gap: 9 }}>
        {motivos.map((m) => (
          <div key={m.nombre}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 4,
                fontSize: 12.5,
              }}
            >
              <span style={{ color: m.sinDecir ? T.faint : T.ink }}>{m.nombre}</span>
              <span className="mono" style={{ fontSize: 11.5, color: T.muted, flexShrink: 0 }}>
                {m.leads} {m.leads === 1 ? "lead" : "leads"} · {m.porcentaje}%
                {m.valor > 0 && ` · ${money(m.valor)}`}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: T.paper, overflow: "hidden" }}>
              <div
                style={{
                  width: `${m.porcentaje}%`,
                  height: "100%",
                  // Los sin motivo en gris: no son una causa, son un hueco, y
                  // pintarlos del mismo rojo los haría leer como una razón más.
                  background: m.sinDecir ? T.border : "#B85042",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
