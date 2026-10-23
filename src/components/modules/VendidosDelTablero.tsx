"use client";

import { useMemo } from "react";

import { money } from "@/lib/format";
import { ganadaEnElPeriodo, type Periodo } from "@/lib/periodoDelTablero";
import { esGanada, montoGanado } from "@/lib/selectors";
import { hoyEnSalvador } from "@/lib/seguimientos";
import { T } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";
import { contarVendidos, type Vendidos } from "@/lib/vendidos";

const COLOR_CURSO = "#2E6FBF";
const COLOR_DIPLOMADO = "#B8862B";
const COLOR_OTRO = "#8792AC";

const comoVenta = (o: Oportunidad) => ({
  quien: o.vendedor && o.vendedor !== "—" ? o.vendedor : null,
  programa: o.productoId != null ? o.producto : null,
  categoria: o.categoria,
  monto: montoGanado(o),
});

/**
 * Cursos y diplomados vendidos: hoy, y en el período que mira el tablero.
 *
 * Pedido el 23/10/2026 para leer las ventas rápido: cuántos cursos, cuántos
 * diplomados y quién vendió cada cosa. Las cuentas son las de `vendidos.ts`,
 * las mismas que el reporte del día y del mes. Un ganado cuenta el día de su
 * fecha de cierre, igual que en el resto del tablero.
 */
export function VendidosDelTablero({
  oportunidades,
  periodo,
}: {
  oportunidades: readonly Oportunidad[];
  periodo: Periodo;
}) {
  const hoy = hoyEnSalvador();
  const deHoy = useMemo(
    () =>
      contarVendidos(
        oportunidades.filter((o) => esGanada(o) && (o.fechaCierre ?? o.fechaRegistro) === hoy).map(comoVenta),
      ),
    [oportunidades, hoy],
  );
  const delPeriodo = useMemo(
    () =>
      contarVendidos(
        oportunidades.filter((o) => esGanada(o) && ganadaEnElPeriodo(o, periodo.clave)).map(comoVenta),
      ),
    [oportunidades, periodo.clave],
  );

  return (
    <section data-vendidos-tablero style={{ marginBottom: 20 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>Cursos y diplomados vendidos</h3>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: T.muted }}>
        Inscripciones ganadas por fecha de cierre, según el tipo de programa. «Otros»: certificaciones, workshops
        y ganados sin programa elegido.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <Bloque titulo="Hoy" v={deHoy} vacio="Todavía no se vendió nada hoy." datos="hoy" />
        <Bloque titulo={periodo.etiqueta} v={delPeriodo} vacio="No se vendió nada en este período." datos="periodo" />
      </div>
    </section>
  );
}

function Bloque({ titulo, v, vacio, datos }: { titulo: string; v: Vendidos; vacio: string; datos: string }) {
  const mayor = Math.max(1, ...v.porAsesora.map((a) => a.total));
  const tarjetas = [
    { clave: "cursos", nombre: "Cursos", valor: v.cursos, monto: v.montoCursos, color: COLOR_CURSO },
    { clave: "diplomados", nombre: "Diplomados", valor: v.diplomados, monto: v.montoDiplomados, color: COLOR_DIPLOMADO },
    { clave: "otros", nombre: "Otros", valor: v.otros, monto: v.montoOtros, color: COLOR_OTRO },
  ];
  return (
    <div data-vendidos-bloque={datos} style={{ background: T.paper, borderRadius: 8, padding: "12px 14px" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: T.muted, fontWeight: 600 }}>{titulo}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {tarjetas.map((t) => (
          <div key={t.clave} data-vendidos-tipo={t.clave} style={{ background: T.surface, borderRadius: 7, padding: "8px 10px", borderLeft: `4px solid ${t.color}` }}>
            <p style={{ margin: 0, fontSize: 11, color: T.muted }}>{t.nombre}</p>
            <p data-valor className="mono dsp" style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 500 }}>{t.valor}</p>
            <p style={{ margin: 0, fontSize: 10.5, color: T.faint }}>{t.monto ? money(t.monto) : "—"}</p>
          </div>
        ))}
      </div>

      {v.porAsesora.length === 0 ? (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: T.faint }}>{vacio}</p>
      ) : (
        <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
          {v.porAsesora.map((a) => (
            <div key={a.quien} data-vendio={a.quien} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 130px) 1fr auto", gap: 10, alignItems: "center", fontSize: 12 }}>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.quien}</span>
              <div aria-hidden="true" style={{ display: "flex", height: 10, background: T.surface, borderRadius: 3, overflow: "hidden" }}>
                {[[a.cursos, COLOR_CURSO], [a.diplomados, COLOR_DIPLOMADO], [a.otros, COLOR_OTRO]].map(([k, c], i) =>
                  Number(k) > 0 ? <div key={i} style={{ width: `${(Number(k) / mayor) * 100}%`, background: String(c) }} /> : null,
                )}
              </div>
              <span className="mono" style={{ whiteSpace: "nowrap", color: T.muted }}>
                <span data-cursos style={{ color: COLOR_CURSO, fontWeight: 600 }}>{a.cursos}</span> C ·{" "}
                <span data-diplomados style={{ color: COLOR_DIPLOMADO, fontWeight: 600 }}>{a.diplomados}</span> D
                {a.otros > 0 ? ` · ${a.otros} O` : ""}
              </span>
            </div>
          ))}
          <p style={{ margin: "2px 0 0", fontSize: 10.5, color: T.faint }}>C: cursos · D: diplomados · O: otros</p>
        </div>
      )}
    </div>
  );
}
