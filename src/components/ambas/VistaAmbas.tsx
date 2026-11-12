"use client";

/**
 * «Ambas marcas» de crm-peñagroup: el Tablero Comercial de LAC y HC juntos y
 * cada uno por separado, SOLO LECTURA (12/11/2026).
 *
 * Es el mismo visor que el sitio de Dirección (tablero-comercial,
 * `src/components/Sitio.tsx`): las mismas hojas y los mismos cálculos que el
 * módulo «Tablero Comercial» de cada CRM, así que lo que cada área llena en
 * su marca se ve acá al momento. El servidor trae los datos de cada base y acá
 * se arman; la página se vuelve a pedir sola cada minuto mientras está a la
 * vista.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { DatosTablero } from "@/app/tablero-actions";
import { HojaTableroConjunto, type EmpresaDelSitio } from "@/components/ambas/HojaTableroConjunto";
import { SelectorDeMarca } from "@/components/marca/SelectorDeMarca";
import { HojaAcciones } from "@/components/modules/tablero/HojaAcciones";
import { HojaActividad } from "@/components/modules/tablero/HojaActividad";
import { HojaEvolucion } from "@/components/modules/tablero/HojaEvolucion";
import { HojaGrupos } from "@/components/modules/tablero/HojaGrupos";
import { HojaGuia } from "@/components/modules/tablero/HojaGuia";
import { HojaMetas } from "@/components/modules/tablero/HojaMetas";
import { HojaResumen } from "@/components/modules/tablero/HojaResumen";
import { HojaSemanal } from "@/components/modules/tablero/HojaSemanal";
import { HojaTablero } from "@/components/modules/tablero/HojaTablero";
import { HojaVentasPersona } from "@/components/modules/tablero/HojaVentasPersona";
import { HOJAS, type Contexto, type Hoja, type PermisosTablero } from "@/components/modules/tablero/TableroComercial";
import { MARCAS } from "@/lib/marcas";
import { armar } from "@/lib/tablero/armar";
import { kpisDelMes } from "@/lib/tablero/calculos";
import { mesAnterior, nombreDelMes } from "@/lib/tablero/semanas";

const CADA_CUANTO_MS = 60_000;
const TINTA = "#141826";
const BORDE = "#E3E7EF";

type Vista = "juntas" | "lac" | "hc";

interface DeLaEmpresa {
  nombre: string;
  corto: string;
  datos: DatosTablero;
  /** Cómo se leyó: con la sesión de la persona o con la llave del sitio. */
  como: "sesion" | "llave";
}

const SIN_PERMISOS: PermisosTablero = { mk: false, ventas: false, actividad: false, metas: false };
const soloLectura = async () => "Esta vista es sólo de lectura: cada área llena su parte en el CRM de su marca.";
const SIN_GUARDAR: Contexto["guardar"] = {
  semanal: soloLectura,
  meta: soloLectura,
  actividad: soloLectura,
  ventasPersona: soloLectura,
  comentario: soloLectura,
  grupo: soloLectura,
  quitarGrupo: soloLectura,
  accion: soloLectura,
  borrarAccion: soloLectura,
};

export function VistaAmbas({
  mes,
  hoy,
  lac,
  hc,
  leidoEn,
}: {
  mes: string;
  hoy: string;
  lac: DeLaEmpresa;
  hc: DeLaEmpresa;
  leidoEn: string;
}) {
  const router = useRouter();
  const [cargando, empezar] = useTransition();
  const [vista, setVista] = useState<Vista>("juntas");
  const [hoja, setHoja] = useState<Hoja>("Tablero");

  // Se dibuja sólo en el navegador: los montos y horas salen de `Intl`, y
  // Node y el navegador no siempre los escriben igual (aviso #418 de React).
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") empezar(() => router.refresh());
    }, CADA_CUANTO_MS);
    return () => clearInterval(id);
  }, [router]);

  const empresas = useMemo<Record<"lac" | "hc", EmpresaDelSitio>>(
    () => ({
      lac: { clave: "lac", ...lac, armado: armar(lac.datos, mes, hoy) },
      hc: { clave: "hc", ...hc, armado: armar(hc.datos, mes, hoy) },
    }),
    [lac, hc, mes, hoy],
  );

  const opcionesDeMes = useMemo(() => {
    const anio = Number(hoy.slice(0, 4));
    const lista: string[] = [];
    for (let a = anio - 1; a <= anio + 1; a++)
      for (let m = 1; m <= 12; m++) lista.push(`${a}-${String(m).padStart(2, "0")}-01`);
    return lista;
  }, [hoy]);

  const elegida = vista === "juntas" ? null : empresas[vista];
  const ctx: Contexto | null = elegida && {
    mes,
    hoy,
    empresa: elegida.nombre,
    accent: vista === "hc" ? "#000000" : MARCAS.lac.paleta.ink,
    datos: elegida.datos,
    ...elegida.armado,
    permisos: SIN_PERMISOS,
    miFicha: null,
    guardar: SIN_GUARDAR,
  };

  const avisos = (["lac", "hc"] as const)
    .map((k) => ({ e: empresas[k], d: empresas[k].datos }))
    .filter(({ d }) => d.faltaMigracion || d.error);

  const boton = (activo: boolean) => ({
    fontSize: 13,
    padding: "7px 14px",
    borderRadius: 20,
    cursor: "pointer",
    border: `1px solid ${activo ? TINTA : BORDE}`,
    background: activo ? TINTA : "#fff",
    color: activo ? "#fff" : TINTA,
    fontWeight: activo ? 700 : 500,
  });

  return (
    <div className="lac" style={{ minHeight: "100vh", background: "#F6F7FA", color: TINTA }}>
      <div style={{ display: "flex" }} aria-hidden>
        <div style={{ flex: 1, height: 5, background: MARCAS.lac.paleta.ink }} />
        <div style={{ flex: 1, height: 5, background: MARCAS.hc.paleta.resalte }} />
      </div>
      <div
        role="status"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "7px 20px", background: TINTA, color: "#fff", fontSize: 12.5 }}
      >
        <span>
          Estás viendo <strong>Ambas marcas</strong>
        </span>
        <span style={{ opacity: 0.8 }}>
          Solo lectura: cada base de datos sigue separada. Para contestar o editar, entra a la marca.
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ opacity: 0.75 }}>crm-peñagroup</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <aside
          style={{ flex: "0 0 240px", padding: 16, background: "#fff", borderRight: `1px solid ${BORDE}`, minHeight: "calc(100vh - 40px)", boxSizing: "border-box" }}
        >
          <SelectorDeMarca veAmbas enAmbas />
          <a href="/" style={{ display: "block", padding: "8px 10px", fontSize: 13, color: "#39425A" }}>
            ← Volver al CRM
          </a>
        </aside>

        <main style={{ flex: "999 1 640px", minWidth: 0, padding: "20px 24px 48px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p className="mono" style={{ margin: 0, fontSize: 11, letterSpacing: "0.08em", color: "#5B6478" }}>
                DIRECCIÓN · {MARCAS.lac.rotulo} + {MARCAS.hc.rotulo}
              </p>
              <h1 className="dsp" style={{ margin: "4px 0 0", fontSize: 28 }}>
                Tablero Comercial
              </h1>
            </div>
            <span data-en-vivo style={{ fontSize: 12.5, color: "#5B6478" }}>
              <span style={{ color: "#1E6B3A" }}>●</span> En vivo · leído a las{" "}
              {montado
                ? new Date(leidoEn).toLocaleTimeString("es-SV", { timeZone: "America/El_Salvador", hour: "numeric", minute: "2-digit" })
                : "…"}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#5B6478" }}>
              Mes a revisar
              <select
                aria-label="Mes a revisar"
                value={mes}
                onChange={(e) => empezar(() => router.push(`/ambas?mes=${e.target.value}`))}
                style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: `1px solid ${BORDE}`, background: "#fff", color: TINTA, textTransform: "capitalize" }}
              >
                {opcionesDeMes.map((m) => (
                  <option key={m} value={m}>
                    {nombreDelMes(m)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => empezar(() => router.refresh())}
              style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 8, border: `1px solid ${BORDE}`, background: "#fff", cursor: "pointer", color: TINTA }}
            >
              {cargando ? "Leyendo…" : "Actualizar"}
            </button>
            <span style={{ fontSize: 12, color: "#8A93A6" }}>
              Cada área llena su parte en el módulo «Tablero Comercial» de su marca.
            </span>
          </div>

          <nav aria-label="Empresa" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <button type="button" data-vista="juntas" aria-current={vista === "juntas" ? "page" : undefined} onClick={() => setVista("juntas")} style={boton(vista === "juntas")}>
              LAC + HC
            </button>
            <button type="button" data-vista="lac" aria-current={vista === "lac" ? "page" : undefined} onClick={() => setVista("lac")} style={boton(vista === "lac")}>
              {lac.nombre}
            </button>
            <button type="button" data-vista="hc" aria-current={vista === "hc" ? "page" : undefined} onClick={() => setVista("hc")} style={boton(vista === "hc")}>
              {hc.nombre}
            </button>
          </nav>

          {avisos.map(({ e, d }) => (
            <p
              key={e.clave}
              role="alert"
              style={{ padding: 10, background: d.faltaMigracion ? "#FFF4D6" : "#FBE4E2", borderRadius: 10, color: d.faltaMigracion ? "#7A5A12" : "#9E2F29", fontSize: 12.5, margin: "0 0 12px" }}
            >
              <b>{e.nombre}:</b> {d.faltaMigracion ? "el Tablero Comercial todavía no está instalado en esta base." : d.error}
            </p>
          ))}

          {!montado ? (
            <p style={{ fontSize: 13, color: "#8A93A6" }}>Cargando el Tablero…</p>
          ) : vista === "juntas" ? (
            <HojaTableroConjunto lac={empresas.lac} hc={empresas.hc} mes={mes} hoy={hoy} />
          ) : (
            ctx && (
              <>
                <nav aria-label="Hojas del Tablero" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: `1px solid ${BORDE}`, marginBottom: 16 }}>
                  {HOJAS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      data-hoja={h}
                      aria-current={h === hoja ? "page" : undefined}
                      onClick={() => setHoja(h)}
                      style={{
                        fontSize: 12.5,
                        padding: "7px 11px",
                        border: "none",
                        cursor: "pointer",
                        background: "transparent",
                        borderBottom: h === hoja ? `2px solid ${TINTA}` : "2px solid transparent",
                        color: h === hoja ? TINTA : "#5B6478",
                        fontWeight: h === hoja ? 700 : 500,
                      }}
                    >
                      {h}
                    </button>
                  ))}
                </nav>
                <div data-hoja-abierta={hoja} data-empresa={vista}>
                  {hoja === "Guía" && <HojaGuia />}
                  {hoja === "Tablero" && (
                    <HojaTablero ctx={ctx} kpis={kpisDelMes(ctx.resumenes.get(mes)!, ctx.metas, ctx.resumenes.get(mesAnterior(mes)))} />
                  )}
                  {hoja === "MK semanal" && <HojaSemanal ctx={ctx} area="mk" />}
                  {hoja === "Ventas semanal" && <HojaSemanal ctx={ctx} area="ventas" />}
                  {hoja === "Grupos en venta" && <HojaGrupos ctx={ctx} />}
                  {hoja === "Plan de acciones" && <HojaAcciones ctx={ctx} />}
                  {hoja === "Actividad de ventas" && <HojaActividad ctx={ctx} />}
                  {hoja === "Ventas por persona" && <HojaVentasPersona ctx={ctx} />}
                  {hoja === "Metas" && <HojaMetas ctx={ctx} />}
                  {hoja === "Resumen mensual" && <HojaResumen ctx={ctx} />}
                  {hoja === "Evolución" && <HojaEvolucion ctx={ctx} />}
                </div>
              </>
            )
          )}
        </main>
      </div>
    </div>
  );
}
