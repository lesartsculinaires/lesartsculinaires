"use client";

/**
 * El Tablero Comercial: la plantilla de la Dirección, dentro del CRM.
 *
 * Las mismas once hojas, con los mismos nombres, para que quien venía del
 * Excel se encuentre. Lo que el CRM ya sabe aparece solo (en gris dentro de
 * la celda); lo demás lo llena cada área en sus hojas. La base decide quién
 * puede escribir qué —acá sólo se esconden los lápices que no corresponden—.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  borrarAccion,
  cargarTablero,
  guardarAccion,
  guardarActividad,
  guardarComentario,
  guardarGrupo,
  guardarMeta,
  guardarSemanal,
  guardarVentasPersona,
  quitarGrupo,
  type AccionGuardada,
  type DatosTablero,
  type GrupoGuardado,
} from "@/app/tablero-actions";
import {
  kpisDelMes,
  resumenDelMes,
  type Accion,
  type FilaActividad,
  type Metas,
  type ResumenMes,
  type SemanaDeDatos,
} from "@/lib/tablero/calculos";
import { mesAnterior, mesDe, nombreDelMes } from "@/lib/tablero/semanas";
import { hoyEnSalvador } from "@/lib/seguimientos";
import { T } from "@/lib/theme";
import { HojaGuia } from "@/components/modules/tablero/HojaGuia";
import { HojaTablero } from "@/components/modules/tablero/HojaTablero";
import { HojaSemanal } from "@/components/modules/tablero/HojaSemanal";
import { HojaGrupos } from "@/components/modules/tablero/HojaGrupos";
import { HojaAcciones } from "@/components/modules/tablero/HojaAcciones";
import { HojaActividad } from "@/components/modules/tablero/HojaActividad";
import { HojaVentasPersona } from "@/components/modules/tablero/HojaVentasPersona";
import { HojaMetas } from "@/components/modules/tablero/HojaMetas";
import { HojaResumen } from "@/components/modules/tablero/HojaResumen";
import { HojaEvolucion } from "@/components/modules/tablero/HojaEvolucion";

export const HOJAS = [
  "Guía",
  "Tablero",
  "MK semanal",
  "Ventas semanal",
  "Grupos en venta",
  "Plan de acciones",
  "Actividad de ventas",
  "Ventas por persona",
  "Metas",
  "Resumen mensual",
  "Evolución",
] as const;
export type Hoja = (typeof HOJAS)[number];

/** Qué puede llenar quien mira. Lo decide la base; esto sólo ordena la vista. */
export interface PermisosTablero {
  mk: boolean;
  ventas: boolean;
  actividad: boolean;
  metas: boolean;
}

/** Lo que cada hoja recibe: los datos, los cálculos y cómo guardar. */
export interface Contexto {
  mes: string;
  hoy: string;
  empresa: string;
  accent: string;
  datos: DatosTablero;
  semanas: Map<string, SemanaDeDatos>;
  acciones: Accion[];
  actividad: FilaActividad[];
  metas: Metas;
  /** Los 13 meses, del más viejo al elegido. */
  meses: string[];
  resumenes: Map<string, ResumenMes>;
  permisos: PermisosTablero;
  miFicha: number | null;
  /** Cada uno devuelve el error para mostrar, o null si se guardó. */
  guardar: {
    semanal: (lunes: string, campo: string, valor: number | null) => Promise<string | null>;
    meta: (mes: string | null, clave: string, valor: number | null) => Promise<string | null>;
    actividad: (lunes: string, vendedorId: number, campo: string, valor: number | null) => Promise<string | null>;
    ventasPersona: (vendedorId: number, campo: string, valor: number | null) => Promise<string | null>;
    comentario: (hoja: string, texto: string) => Promise<string | null>;
    grupo: (g: Omit<GrupoGuardado, "id"> & { id?: number }) => Promise<string | null>;
    quitarGrupo: (id: number) => Promise<string | null>;
    accion: (a: Omit<AccionGuardada, "id"> & { id?: number }) => Promise<string | null>;
    borrarAccion: (id: number) => Promise<string | null>;
  };
}

const mesesHasta = (mes: string, cuantos: number): string[] => {
  const lista = [mes];
  while (lista.length < cuantos) lista.unshift(mesAnterior(lista[0]));
  return lista;
};

export function TableroComercial({
  accent,
  empresa,
  permisos,
  miFicha,
}: {
  accent: string;
  empresa: string;
  permisos: PermisosTablero;
  miFicha: number | null;
}) {
  const hoy = hoyEnSalvador();
  const [mes, setMes] = useState(mesDe(hoy));
  const [hoja, setHoja] = useState<Hoja>("Tablero");
  const [datos, setDatos] = useState<DatosTablero | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    setCargando(true);
    const d = await cargarTablero(mes);
    setDatos(d);
    setCargando(false);
  }, [mes]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  // --------------------------------------------------- los datos, ya armados
  const semanas = useMemo(() => {
    const m = new Map<string, SemanaDeDatos>();
    const de = (lunes: string) => {
      let s = m.get(lunes);
      if (!s) {
        s = { lunes, manual: {}, crm: {} };
        m.set(lunes, s);
      }
      return s as { lunes: string; manual: Record<string, number>; crm: Record<string, number> };
    };
    for (const r of datos?.semanal ?? []) de(r.lunes).manual[r.campo] = r.valor;
    for (const r of datos?.crmSemanal ?? []) de(r.lunes).crm[r.campo] = r.valor;
    return m;
  }, [datos]);

  const acciones = useMemo<Accion[]>(() => (datos?.acciones ?? []).map((a) => ({ ...a })), [datos]);

  const actividad = useMemo<FilaActividad[]>(() => {
    const m = new Map<string, { lunes: string; vendedorId: number; manual: Record<string, number>; crm: Record<string, number> }>();
    const de = (lunes: string, vendedorId: number) => {
      const k = `${lunes}|${vendedorId}`;
      let f = m.get(k);
      if (!f) {
        f = { lunes, vendedorId, manual: {}, crm: {} };
        m.set(k, f);
      }
      return f;
    };
    for (const r of datos?.actividad ?? []) de(r.lunes, r.vendedorId).manual[r.campo] = r.valor;
    for (const r of datos?.crmActividad ?? []) de(r.lunes, r.vendedorId).crm[r.campo] = r.valor;
    return [...m.values()];
  }, [datos]);

  const metas = useMemo<Metas>(() => {
    const delMes: Record<string, Record<string, number>> = {};
    const fijas: Record<string, number> = {};
    for (const r of datos?.metas ?? []) {
      if (r.mes) (delMes[r.mes] ??= {})[r.clave] = r.valor;
      else fijas[r.clave] = r.valor;
    }
    return { delMes, fijas };
  }, [datos]);

  const meses = useMemo(() => mesesHasta(mes, 13), [mes]);
  const resumenes = useMemo(() => {
    const lista = [...semanas.values()];
    return new Map(meses.map((m) => [m, resumenDelMes(m, lista, acciones, actividad, hoy)]));
  }, [meses, semanas, acciones, actividad, hoy]);

  // ------------------------------------------------------------- guardar
  // Cada guardado actualiza la copia local en vez de volver a pedir todo: el
  // número aparece en el Tablero al salir de la celda.
  const guardar: Contexto["guardar"] = useMemo(() => ({
    semanal: async (lunes, campo, valor) => {
      const r = await guardarSemanal(lunes, campo, valor);
      if (r.ok) setDatos((d) => d && {
        ...d,
        semanal: [...d.semanal.filter((x) => !(x.lunes === lunes && x.campo === campo)), ...(valor == null ? [] : [{ lunes, campo, valor }])],
      });
      return r.error;
    },
    meta: async (m, clave, valor) => {
      const r = await guardarMeta(m, clave, valor);
      if (r.ok) setDatos((d) => d && {
        ...d,
        metas: [...d.metas.filter((x) => !(x.mes === m && x.clave === clave)), ...(valor == null ? [] : [{ mes: m, clave, valor }])],
      });
      return r.error;
    },
    actividad: async (lunes, vendedorId, campo, valor) => {
      const r = await guardarActividad(lunes, vendedorId, campo, valor);
      if (r.ok) setDatos((d) => d && {
        ...d,
        actividad: [
          ...d.actividad.filter((x) => !(x.lunes === lunes && x.vendedorId === vendedorId && x.campo === campo)),
          ...(valor == null ? [] : [{ lunes, vendedorId, campo, valor }]),
        ],
      });
      return r.error;
    },
    ventasPersona: async (vendedorId, campo, valor) => {
      const r = await guardarVentasPersona(mes, vendedorId, campo, valor);
      if (r.ok) setDatos((d) => d && {
        ...d,
        ventasPersona: [
          ...d.ventasPersona.filter((x) => !(x.vendedorId === vendedorId && x.campo === campo)),
          ...(valor == null ? [] : [{ vendedorId, campo, valor }]),
        ],
      });
      return r.error;
    },
    comentario: async (h, texto) => {
      const r = await guardarComentario(mes, h, texto);
      if (r.ok) setDatos((d) => d && {
        ...d,
        comentarios: [...d.comentarios.filter((x) => x.hoja !== h), { hoja: h, texto: texto.trim(), actualizadoEn: new Date().toISOString() }],
      });
      return r.error;
    },
    grupo: async (g) => {
      const r = await guardarGrupo(g);
      if (r.ok) setDatos((d) => d && {
        ...d,
        grupos: g.id
          ? d.grupos.map((x) => (x.id === g.id ? { ...x, ...g, id: x.id } : x))
          : [...d.grupos, { ...g, id: r.id! }],
      });
      return r.error;
    },
    quitarGrupo: async (id) => {
      const r = await quitarGrupo(id);
      if (r.ok) setDatos((d) => d && { ...d, grupos: d.grupos.filter((x) => x.id !== id) });
      return r.error;
    },
    accion: async (a) => {
      const r = await guardarAccion(a);
      if (r.ok) setDatos((d) => d && {
        ...d,
        acciones: a.id
          ? d.acciones.map((x) => (x.id === a.id ? { ...x, ...a, id: x.id } : x))
          : [...d.acciones, { ...a, id: r.id! }],
      });
      return r.error;
    },
    borrarAccion: async (id) => {
      const r = await borrarAccion(id);
      if (r.ok) setDatos((d) => d && { ...d, acciones: d.acciones.filter((x) => x.id !== id) });
      return r.error;
    },
  }), [mes]);

  const opcionesDeMes = useMemo(() => {
    // Desde enero del año pasado hasta diciembre del año que viene.
    const anio = Number(hoy.slice(0, 4));
    const lista: string[] = [];
    for (let a = anio - 1; a <= anio + 1; a++) for (let m = 1; m <= 12; m++) lista.push(`${a}-${String(m).padStart(2, "0")}-01`);
    return lista;
  }, [hoy]);

  const ctx: Contexto | null = datos && {
    mes, hoy, empresa, accent, datos, semanas, acciones, actividad, metas, meses, resumenes, permisos, miFicha, guardar,
  };

  return (
    <div data-tablero-comercial>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.muted }}>
          Mes a revisar
          <select
            aria-label="Mes a revisar"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "#FFFDF4", color: T.ink, textTransform: "capitalize" }}
          >
            {opcionesDeMes.map((m) => (
              <option key={m} value={m} style={{ textTransform: "capitalize" }}>{nombreDelMes(m)}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void recargar()}
          style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, cursor: "pointer", color: T.ink }}
        >
          {cargando ? "Cargando…" : "Actualizar"}
        </button>
        <span style={{ fontSize: 12, color: T.faint }}>
          Lo que viene del CRM se ve en gris dentro de la celda. Escribe solo lo que falta o hay que corregir.
        </span>
      </div>

      <nav aria-label="Hojas del Tablero" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, marginBottom: 16 }}>
        {HOJAS.map((h) => (
          <button
            key={h}
            type="button"
            data-hoja={h}
            aria-current={h === hoja ? "page" : undefined}
            onClick={() => setHoja(h)}
            style={{
              fontSize: 12.5, padding: "7px 11px", border: "none", cursor: "pointer", background: "transparent",
              borderBottom: h === hoja ? `2px solid ${accent}` : "2px solid transparent",
              color: h === hoja ? T.ink : T.muted, fontWeight: h === hoja ? 700 : 500,
            }}
          >
            {h}
          </button>
        ))}
      </nav>

      {datos?.faltaMigracion && (
        <p role="alert" style={{ padding: 14, background: "#FFF4D6", borderRadius: 10, color: "#7A5A12", fontSize: 13 }}>
          Falta instalar el Tablero Comercial en la base: hay que correr la migración
          <code> 20261125120000_tablero_comercial.sql</code>.
        </p>
      )}
      {datos?.error && !datos.faltaMigracion && (
        <p role="alert" style={{ padding: 10, background: "#FBE4E2", borderRadius: 10, color: "#9E2F29", fontSize: 12.5 }}>{datos.error}</p>
      )}

      {!ctx || datos?.faltaMigracion ? (
        !datos?.faltaMigracion && <p style={{ color: T.faint, fontSize: 13 }}>Cargando el Tablero…</p>
      ) : (
        <div data-hoja-abierta={hoja}>
          {hoja === "Guía" && <HojaGuia />}
          {hoja === "Tablero" && <HojaTablero ctx={ctx} kpis={kpisDelMes(ctx.resumenes.get(mes)!, metas, ctx.resumenes.get(mesAnterior(mes)))} />}
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
      )}
    </div>
  );
}
