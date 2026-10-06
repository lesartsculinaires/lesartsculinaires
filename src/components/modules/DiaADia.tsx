"use client";

import { useMemo, useState } from "react";

import { colorDeSerie } from "@/lib/coloresDeSerie";
import { diaADia, type DiaDesglose, type Segmento } from "@/lib/diaADia";
import { parseISO } from "@/lib/format";
import { T } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";

interface Props {
  /** La lista COMPLETA: de acá sale el orden fijo de los colores. */
  oportunidades: Oportunidad[];
  /** "2026-10". */
  mesClave: string;
  /** "Octubre 2026", para los rótulos. */
  etiquetaLarga: string;
  accent: string;
}

/**
 * El mes, día por día, abierto por canal y por diplomado.
 *
 * ============================================================================
 * QUÉ REEMPLAZA Y POR QUÉ
 * ============================================================================
 *
 * Antes cada día era una barra de un solo color: decía cuántos leads entraron y
 * nada más. Dos días de ocho se veían idénticos aunque uno fuera entero de
 * WhatsApp y el otro de una feria, que para decidir dónde poner la plata del mes
 * siguiente es toda la diferencia.
 *
 * Ahora cada día es una barra PARTIDA por canal, y abajo la misma por programa.
 * Se mide día a día —qué pasó el jueves— y de un vistazo se ve el mes completo,
 * que es lo que pidió la escuela.
 *
 * ============================================================================
 * LA IDENTIDAD NUNCA DEPENDE SÓLO DEL COLOR
 * ============================================================================
 *
 * Tres de los seis tonos de la paleta quedan por debajo de 3:1 contra el blanco.
 * Como rellenos están bien, pero obliga a que el nombre de cada serie se pueda
 * leer sin distinguir el color. Por eso hay SIEMPRE tres salidas:
 *
 *   la leyenda, con el nombre escrito al lado de cada tono
 *   el detalle del día, con las barras rotuladas y sus números
 *   la vista de tabla, que no tiene color ninguno
 *
 * No son adornos: quitar cualquiera de las tres deja la pantalla apoyada nada
 * más que en el color.
 */
export function DiaADia({ oportunidades, mesClave, etiquetaLarga, accent }: Props) {
  const mes = useMemo(() => diaADia(oportunidades, mesClave), [oportunidades, mesClave]);

  /** El día fijado con un clic. Null es «ninguno», y entonces manda el del ratón. */
  const [fijado, setFijado] = useState<number | null>(null);
  const [encima, setEncima] = useState<number | null>(null);
  /** La serie resaltada desde la leyenda. Apaga las demás, no las esconde. */
  const [serie, setSerie] = useState<string | null>(null);
  const [tabla, setTabla] = useState(false);

  const diaMostrado = fijado ?? encima;
  const detalle = mes.dias.find((d) => d.dia === diaMostrado) ?? null;

  if (mes.dias.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 12.5, color: T.faint }}>
        No hay días que mostrar para {etiquetaLarga}.
      </p>
    );
  }

  return (
    <div data-dia-a-dia={mesClave}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>
          <strong style={{ fontWeight: 500, color: T.ink }}>{mes.totalLeads}</strong> leads en{" "}
          {etiquetaLarga}
          {mes.totalLeads > 0 && (
            <>
              {" · "}
              el día más alto tuvo {mes.tope}
            </>
          )}
        </p>
        <button
          type="button"
          data-ver-tabla
          onClick={() => setTabla((v) => !v)}
          style={{
            padding: "5px 11px",
            fontSize: 11.5,
            borderRadius: 6,
            border: `1px solid ${tabla ? accent : T.border}`,
            background: tabla ? accent : "transparent",
            color: tabla ? "#fff" : T.muted,
          }}
        >
          {tabla ? "Ver gráficos" : "Ver tabla"}
        </button>
      </div>

      {tabla ? (
        <Tabla mes={mes} />
      ) : (
        <>
          <Grafico
            titulo="Leads por día, según el canal por el que entraron"
            dias={mes.dias}
            series={mes.seriesCanales}
            campo="canales"
            tope={mes.tope}
            totales={mes.totalCanales}
            fijado={fijado}
            encima={encima}
            serie={serie}
            accent={accent}
            onFijar={(d) => setFijado((v) => (v === d ? null : d))}
            onEncima={setEncima}
            onSerie={(s) => setSerie((v) => (v === s ? null : s))}
          />

          <Grafico
            titulo="Leads por día, según el diplomado o curso"
            dias={mes.dias}
            series={mes.seriesProgramas}
            campo="programas"
            tope={mes.tope}
            totales={mes.totalProgramas}
            fijado={fijado}
            encima={encima}
            serie={serie}
            accent={accent}
            onFijar={(d) => setFijado((v) => (v === d ? null : d))}
            onEncima={setEncima}
            onSerie={(s) => setSerie((v) => (v === s ? null : s))}
          />

          <Detalle
            dia={detalle}
            fijado={fijado != null}
            seriesCanales={mes.seriesCanales}
            seriesProgramas={mes.seriesProgramas}
          />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- gráfico

function Grafico({
  titulo,
  dias,
  series,
  campo,
  tope,
  totales,
  fijado,
  encima,
  serie,
  accent,
  onFijar,
  onEncima,
  onSerie,
}: {
  titulo: string;
  dias: DiaDesglose[];
  series: string[];
  campo: "canales" | "programas";
  tope: number;
  totales: Segmento[];
  fijado: number | null;
  encima: number | null;
  serie: string | null;
  accent: string;
  onFijar: (dia: number) => void;
  onEncima: (dia: number | null) => void;
  onSerie: (s: string) => void;
}) {
  const conLeads = totales.filter((s) => s.leads > 0);

  return (
    <section style={{ marginBottom: 22 }} data-grafico={campo}>
      <p
        className="mono"
        style={{
          margin: "0 0 10px",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: T.faint,
          textTransform: "uppercase",
        }}
      >
        {titulo}
      </p>

      {/* La leyenda va ARRIBA del gráfico y siempre: es lo que hace que cada
          tono tenga un nombre antes de que alguien tenga que adivinarlo. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: 12 }}>
        {conLeads.map((s) => {
          const apagada = serie != null && serie !== s.etiqueta;
          return (
            <button
              key={s.etiqueta}
              type="button"
              data-serie={s.etiqueta}
              onClick={() => onSerie(s.etiqueta)}
              title={
                serie === s.etiqueta
                  ? "Quitar el resalte"
                  : `Resaltar ${s.etiqueta} en los dos gráficos`
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: 0,
                background: "transparent",
                border: "none",
                fontSize: 11.5,
                color: apagada ? T.faint : T.muted,
                opacity: apagada ? 0.55 : 1,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: colorDeSerie(s.etiqueta, series),
                }}
              />
              {s.etiqueta}
              <span className="mono" style={{ fontSize: 11, color: T.faint }}>
                {s.leads}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
        <Escala tope={tope} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 2,
              height: 132,
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            {dias.map((d) => (
              <Columna
                key={d.dia}
                dia={d}
                segmentos={d[campo]}
                series={series}
                tope={tope}
                resaltada={fijado === d.dia || encima === d.dia}
                hayFijado={fijado != null}
                esFijado={fijado === d.dia}
                serie={serie}
                accent={accent}
                onFijar={onFijar}
                onEncima={onEncima}
              />
            ))}
          </div>

          <EjeDeDias dias={dias} fijado={fijado} />
        </div>
      </div>
    </section>
  );
}

/** Los tres números del eje vertical. Recesivos: son referencia, no contenido. */
function Escala({ tope }: { tope: number }) {
  const medio = Math.round(tope / 2);
  const marcas = medio > 0 && medio < tope ? [tope, medio, 0] : [tope, 0];
  return (
    <div
      className="mono"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: 132,
        fontSize: 9.5,
        color: T.faint,
        textAlign: "right",
        minWidth: 16,
      }}
    >
      {marcas.map((m) => (
        <span key={m}>{m}</span>
      ))}
    </div>
  );
}

/**
 * Un día.
 *
 * Es un `button` y no un `div` a propósito: se puede llegar con el tabulador y
 * activar con el teclado, que es la diferencia entre un gráfico que se puede
 * usar sin ratón y uno que no.
 */
function Columna({
  dia,
  segmentos,
  series,
  tope,
  resaltada,
  hayFijado,
  esFijado,
  serie,
  accent,
  onFijar,
  onEncima,
}: {
  dia: DiaDesglose;
  segmentos: Segmento[];
  series: string[];
  tope: number;
  resaltada: boolean;
  hayFijado: boolean;
  esFijado: boolean;
  serie: string | null;
  accent: string;
  onFijar: (dia: number) => void;
  onEncima: (dia: number | null) => void;
}) {
  const conLeads = segmentos.filter((s) => s.leads > 0);
  const alto = (dia.leads / tope) * 100;

  return (
    <button
      type="button"
      data-dia={dia.dia}
      data-leads={dia.leads}
      aria-pressed={esFijado}
      aria-label={`${dia.dia}: ${dia.leads} leads`}
      onClick={() => onFijar(dia.dia)}
      onMouseEnter={() => onEncima(dia.dia)}
      onMouseLeave={() => onEncima(null)}
      onFocus={() => onEncima(dia.dia)}
      onBlur={() => onEncima(null)}
      style={{
        flex: 1,
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        padding: 0,
        border: "none",
        background: resaltada ? T.paper : "transparent",
        borderRadius: "3px 3px 0 0",
        cursor: "pointer",
      }}
    >
      {/* La barra, con tope de 24px: una columna más gruesa llena la ranura y
          el mes se lee como un bloque en vez de como días. */}
      <div
        style={{
          width: "100%",
          maxWidth: 24,
          height: `${alto}%`,
          display: "flex",
          flexDirection: "column-reverse",
          gap: 2,
        }}
      >
        {conLeads.map((s, i) => {
          const apagado = serie != null && serie !== s.etiqueta;
          const esLaDeArriba = i === conLeads.length - 1;
          return (
            <div
              key={s.etiqueta}
              style={{
                flex: s.leads,
                minHeight: 2,
                background: colorDeSerie(s.etiqueta, series),
                /* Punta redondeada arriba y cuadrada en la base: la base es la
                   línea del cero y redondearla despegaría la barra del eje. */
                borderRadius: esLaDeArriba ? "4px 4px 0 0" : 0,
                opacity: apagado ? 0.25 : hayFijado && !esFijado ? 0.5 : 1,
              }}
            />
          );
        })}
      </div>
    </button>
  );
}

/**
 * El eje de días.
 *
 * No se escriben los 31 números: a este ancho se pisan y se vuelven ilegibles.
 * Van los múltiplos de cinco, el día 1, el último, y SIEMPRE el fijado —que es
 * el que alguien está mirando—.
 */
function EjeDeDias({ dias, fijado }: { dias: DiaDesglose[]; fijado: number | null }) {
  const ultimo = dias.length;
  return (
    <div style={{ display: "flex", gap: 2, marginTop: 5 }}>
      {dias.map((d) => {
        const hito = d.dia === 1 || d.dia === ultimo || d.dia % 5 === 0;
        const mostrar = hito || d.dia === fijado;
        return (
          <span
            key={d.dia}
            className="mono"
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              fontSize: 9,
              color: d.dia === fijado ? T.ink : T.faint,
              fontWeight: d.dia === fijado ? 600 : 400,
            }}
          >
            {mostrar ? d.dia : ""}
          </span>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------- detalle

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Cómo se lee un día: «jueves 4». */
function comoSeLlama(fecha: string, dia: number): string {
  const d = parseISO(fecha);
  if (!d) return `Día ${dia}`;
  return `${DIAS_SEMANA[d.getDay()]} ${dia}`;
}

/**
 * El día que se está mirando, con sus números escritos.
 *
 * Es la mitad del pedido que no es un gráfico —«que se pueda medir cada día»— y
 * además el relieve que obliga la paleta: acá cada serie tiene su nombre y su
 * cuenta, sin que haya que distinguir un tono de otro.
 */
function Detalle({
  dia,
  fijado,
  seriesCanales,
  seriesProgramas,
}: {
  dia: DiaDesglose | null;
  fijado: boolean;
  seriesCanales: string[];
  seriesProgramas: string[];
}) {
  if (!dia) {
    return (
      <p
        data-detalle-vacio
        style={{
          margin: 0,
          padding: "11px 14px",
          fontSize: 12,
          color: T.faint,
          background: T.paper,
          borderRadius: 8,
        }}
      >
        Pasá el ratón por un día para verlo, o hacé clic para dejarlo fijo.
      </p>
    );
  }

  return (
    <div
      data-detalle-dia={dia.dia}
      style={{ background: T.paper, borderRadius: 8, padding: "14px 16px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          marginBottom: dia.leads > 0 ? 12 : 0,
        }}
      >
        <h4 className="dsp" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
          {comoSeLlama(dia.fecha, dia.dia)} — {dia.leads} {dia.leads === 1 ? "lead" : "leads"}
        </h4>
        <span style={{ fontSize: 10.5, color: T.faint }}>
          {fijado ? "fijado · clic de nuevo para soltar" : "al pasar el ratón"}
        </span>
      </div>

      {dia.leads === 0 ? (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: T.faint }}>
          Ese día no entró ningún lead.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 18,
          }}
        >
          <Reparto titulo="Por canal" segmentos={dia.canales} series={seriesCanales} total={dia.leads} />
          <Reparto
            titulo="Por diplomado o curso"
            segmentos={dia.programas}
            series={seriesProgramas}
            total={dia.leads}
          />
        </div>
      )}
    </div>
  );
}

function Reparto({
  titulo,
  segmentos,
  series,
  total,
}: {
  titulo: string;
  segmentos: Segmento[];
  series: string[];
  total: number;
}) {
  const conLeads = segmentos.filter((s) => s.leads > 0);
  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: T.muted }}>{titulo}</p>
      {conLeads.map((s) => (
        <div key={s.etiqueta} style={{ marginBottom: 7 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 3,
            }}
          >
            <span style={{ fontSize: 12 }}>{s.etiqueta}</span>
            <span className="mono" style={{ fontSize: 11.5, color: T.muted }}>
              {s.leads}
            </span>
          </div>
          <div style={{ height: 6, background: T.border, borderRadius: 3 }}>
            <div
              style={{
                height: "100%",
                width: `${(s.leads / total) * 100}%`,
                background: colorDeSerie(s.etiqueta, series),
                borderRadius: 3,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------- tabla

/**
 * El mes entero sin un solo color.
 *
 * Es la salida para cuando el gráfico no sirve: para imprimir, para copiar a una
 * planilla, y para quien no distingue los tonos de la paleta.
 */
function Tabla({ mes }: { mes: ReturnType<typeof diaADia> }) {
  const celda = { padding: "5px 8px", fontSize: 11.5, whiteSpace: "nowrap" } as const;
  const conLeads = mes.seriesCanales.filter((s) =>
    mes.totalCanales.some((t) => t.etiqueta === s && t.leads > 0),
  );
  const programasConLeads = mes.seriesProgramas.filter((s) =>
    mes.totalProgramas.some((t) => t.etiqueta === s && t.leads > 0),
  );

  const dameSegmento = (lista: Segmento[], etiqueta: string) =>
    lista.find((s) => s.etiqueta === etiqueta)?.leads ?? 0;

  return (
    <div style={{ overflowX: "auto" }}>
      <table data-tabla-dia-a-dia style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: T.paper }}>
            <th style={{ ...celda, textAlign: "left" }}>Día</th>
            <th style={{ ...celda, textAlign: "right" }}>Leads</th>
            {conLeads.map((s) => (
              <th key={`c-${s}`} style={{ ...celda, textAlign: "right", color: T.muted }}>
                {s}
              </th>
            ))}
            {programasConLeads.map((s) => (
              <th key={`p-${s}`} style={{ ...celda, textAlign: "right", color: T.muted }}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mes.dias.map((d) => (
            <tr key={d.dia} style={{ borderTop: `1px solid ${T.border}` }}>
              <td style={{ ...celda, textAlign: "left" }}>{d.dia}</td>
              <td className="mono" style={{ ...celda, textAlign: "right" }}>
                {d.leads || ""}
              </td>
              {conLeads.map((s) => (
                <td key={`c-${s}`} className="mono" style={{ ...celda, textAlign: "right", color: T.muted }}>
                  {dameSegmento(d.canales, s) || ""}
                </td>
              ))}
              {programasConLeads.map((s) => (
                <td key={`p-${s}`} className="mono" style={{ ...celda, textAlign: "right", color: T.muted }}>
                  {dameSegmento(d.programas, s) || ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `2px solid ${T.borderStrong}`, background: T.paper }}>
            <td style={{ ...celda, textAlign: "left", fontWeight: 500 }}>Mes</td>
            <td className="mono" style={{ ...celda, textAlign: "right", fontWeight: 500 }}>
              {mes.totalLeads}
            </td>
            {conLeads.map((s) => (
              <td key={`c-${s}`} className="mono" style={{ ...celda, textAlign: "right" }}>
                {dameSegmento(mes.totalCanales, s) || ""}
              </td>
            ))}
            {programasConLeads.map((s) => (
              <td key={`p-${s}`} className="mono" style={{ ...celda, textAlign: "right" }}>
                {dameSegmento(mes.totalProgramas, s) || ""}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
