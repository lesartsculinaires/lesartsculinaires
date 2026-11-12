import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SelectorDeMarca } from "@/components/marca/SelectorDeMarca";
import { money } from "@/lib/format";
import { CLAVES_DE_MARCA, MARCAS, MODO_UNIFICADO, type ClaveMarca } from "@/lib/marcas";
import {
  armarReporte,
  hoyEnElSalvador,
  periodoPedido,
  type DatosDelReporte,
  type Indicador,
  type Periodo,
} from "@/lib/reporte";
import { getServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CRM Peñagroup · Ambas marcas",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * «Ambas marcas»: la vista de Dirección de crm-peñagroup (12/11/2026).
 *
 * Las cifras de LAC y HC lado a lado, SOLO LECTURA. Cada columna se lee de su
 * propia base con la sesión que la persona tiene en esa marca, así que cada
 * base sigue aplicando sus permisos: nada se copia ni se mezcla, y quien no
 * tiene cuenta (o permiso) en una marca ve el aviso en vez de sus números.
 *
 * Las cifras salen del mismo cálculo que el reporte mensual
 * (`datos_del_reporte` + `armarReporte`): son las mismas que ve cada CRM.
 *
 * Ven esta pantalla los administradores y los roles con «Ver ambas marcas».
 */

type ClavePeriodo = "mes" | "anterior" | "anio";

const PERIODOS: { clave: ClavePeriodo; nombre: string }[] = [
  { clave: "mes", nombre: "Este mes" },
  { clave: "anterior", nombre: "Mes anterior" },
  { clave: "anio", nombre: "Año" },
];

const FILAS: { clave: string; nombre: string }[] = [
  { clave: "nuevos", nombre: "Leads nuevos" },
  { clave: "ganados", nombre: "Inscripciones ganadas" },
  { clave: "monto", nombre: "Monto de lo ganado" },
  { clave: "tasa", nombre: "Tasa de cierre" },
  { clave: "perdidos", nombre: "Leads perdidos" },
  { clave: "conversaciones", nombre: "Conversaciones contestadas" },
];

type Columna =
  | { estado: "ok"; indicadores: Map<string, Indicador>; sinLeer: number | null }
  | { estado: "sin-sesion" | "sin-permiso" | "error"; mensaje?: string };

function rango(clave: ClavePeriodo): Periodo {
  const hoy = hoyEnElSalvador();
  const mes = hoy.slice(0, 7);
  if (clave === "anio") {
    const a = Number(hoy.slice(0, 4));
    return { tipo: "mes", desde: `${a}-01-01`, hasta: `${a + 1}-01-01`, etiqueta: `Año ${a}`, anteriorDicho: "" };
  }
  const { actual, anterior } = periodoPedido(undefined, mes);
  return clave === "mes" ? actual : anterior;
}

async function puedeVerAmbas(supabase: SupabaseClient, uid: string): Promise<boolean> {
  const { data: yo } = await supabase.from("usuarios").select("rol_id, activo").eq("id", uid).maybeSingle();
  if (!yo || yo.activo === false || yo.rol_id == null) return false;
  const { data: rol } = await supabase.from("roles").select("es_admin").eq("id", yo.rol_id).maybeSingle();
  if (rol?.es_admin === true) return true;
  // La columna puede no estar todavía (migración 20261202120000): sin ella, no.
  const { data: casilla, error } = await supabase
    .from("roles")
    .select("ve_ambas_marcas")
    .eq("id", yo.rol_id)
    .maybeSingle();
  return !error && casilla?.ve_ambas_marcas === true;
}

async function columnaDe(marca: ClaveMarca, periodo: Periodo): Promise<Columna> {
  const supabase = await getServerClient(marca);
  if (!supabase) return { estado: "error", mensaje: "Esta marca no está configurada en el servidor." };
  const { data: quien } = await supabase.auth.getUser();
  if (!quien?.user) return { estado: "sin-sesion" };
  if (!(await puedeVerAmbas(supabase, quien.user.id))) return { estado: "sin-permiso" };

  const [datos, chats] = await Promise.all([
    supabase.rpc("datos_del_reporte", { p_desde: periodo.desde, p_hasta: periodo.hasta }),
    supabase
      .from("conversaciones")
      .select("id", { count: "exact", head: true })
      .gt("sin_leer", 0)
      .eq("archivada", false),
  ]);
  if (datos.error || !datos.data) {
    return { estado: "error", mensaje: datos.error?.message ?? "La base no devolvió datos." };
  }
  const reporte = armarReporte(periodo, datos.data as DatosDelReporte, null, null, {
    programas: [],
    etiquetas: [],
  });
  return {
    estado: "ok",
    indicadores: new Map(reporte.indicadores.map((i) => [i.clave, i])),
    sinLeer: chats.error ? null : (chats.count ?? 0),
  };
}

const formato = (valor: number, f: Indicador["formato"]): string =>
  f === "dinero" ? money(valor) : f === "porcentaje" ? `${Math.round(valor)}%` : valor.toLocaleString("es-SV");

export default async function PaginaAmbas({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  if (!MODO_UNIFICADO) notFound();
  const { p } = await searchParams;
  const clave: ClavePeriodo = p === "anterior" || p === "anio" ? p : "mes";
  const periodo = rango(clave);

  const columnas = Object.fromEntries(
    await Promise.all(CLAVES_DE_MARCA.map(async (k) => [k, await columnaDe(k, periodo)] as const)),
  ) as Record<ClaveMarca, Columna>;

  // Hay que poder ver al menos una de las dos: si no, esta pantalla no es para esta persona.
  const algunaConPermiso = CLAVES_DE_MARCA.some((k) => columnas[k].estado === "ok");
  const ninguna = CLAVES_DE_MARCA.every((k) => columnas[k].estado === "sin-sesion");

  const valor = (k: ClaveMarca, fila: string): Indicador | null => {
    const c = columnas[k];
    return c.estado === "ok" ? (c.indicadores.get(fila) ?? null) : null;
  };

  const total = (fila: string): string => {
    const todas = CLAVES_DE_MARCA.map((k) => valor(k, fila));
    if (todas.some((x) => x == null)) return "—";
    if (fila === "tasa") {
      const nuevos = CLAVES_DE_MARCA.reduce((s, k) => s + (valor(k, "nuevos")?.valor ?? 0), 0);
      const ganados = CLAVES_DE_MARCA.reduce((s, k) => s + (valor(k, "ganados")?.valor ?? 0), 0);
      return nuevos ? `${Math.round((ganados / nuevos) * 100)}%` : "0%";
    }
    const f = todas[0]!.formato;
    return formato(todas.reduce((s, x) => s + (x?.valor ?? 0), 0), f);
  };

  const avisoDe = (c: Columna, k: ClaveMarca): string | null =>
    c.estado === "sin-sesion"
      ? `Entra también a ${MARCAS[k].prefijo} para ver sus cifras.`
      : c.estado === "sin-permiso"
        ? `Tu rol en ${MARCAS[k].prefijo} no tiene «Ver ambas marcas».`
        : c.estado === "error"
          ? `No se pudo leer ${MARCAS[k].prefijo}: ${c.mensaje}`
          : null;

  const borde = "1px solid #E3E7EF";

  return (
    <div className="lac" style={{ minHeight: "100vh", background: "#F6F7FA", color: "#141826" }}>
      <div style={{ display: "flex" }} aria-hidden>
        <div style={{ flex: 1, height: 5, background: MARCAS.lac.paleta.ink }} />
        <div style={{ flex: 1, height: 5, background: MARCAS.hc.paleta.resalte }} />
      </div>
      <div
        role="status"
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          padding: "7px 20px",
          background: "#141826",
          color: "#fff",
          fontSize: 12.5,
        }}
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
        <aside style={{ flex: "0 0 240px", padding: 16, background: "#fff", borderRight: borde, minHeight: "calc(100vh - 40px)", boxSizing: "border-box" }}>
          <SelectorDeMarca veAmbas enAmbas />
          <a href="/" style={{ display: "block", padding: "8px 10px", fontSize: 13, color: "#39425A" }}>
            ← Volver al CRM
          </a>
        </aside>

        <main style={{ flex: "999 1 560px", minWidth: 0, padding: "24px 28px", display: "grid", gap: 18, alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p className="mono" style={{ margin: 0, fontSize: 11, letterSpacing: "0.08em", color: "#5B6478" }}>
                DIRECCIÓN · {MARCAS.lac.rotulo} + {MARCAS.hc.rotulo}
              </p>
              <h1 className="dsp" style={{ margin: "4px 0 0", fontSize: 30 }}>
                Cómo vamos · {periodo.etiqueta}
              </h1>
            </div>
            <nav aria-label="Período" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PERIODOS.map((x) => (
                <a
                  key={x.clave}
                  href={x.clave === "mes" ? "/ambas" : `/ambas?p=${x.clave}`}
                  aria-current={x.clave === clave ? "page" : undefined}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 18,
                    fontSize: 13,
                    textDecoration: "none",
                    border: borde,
                    background: x.clave === clave ? "#141826" : "#fff",
                    color: x.clave === clave ? "#fff" : "#39425A",
                    fontWeight: x.clave === clave ? 600 : 400,
                  }}
                >
                  {x.nombre}
                </a>
              ))}
            </nav>
          </div>

          {ninguna && (
            <p style={{ margin: 0, padding: 14, borderRadius: 10, background: "#FFF4E0", color: "#7A4B00" }}>
              No hay sesión abierta en ninguna marca. <a href="/login">Entra</a> para ver las cifras.
            </p>
          )}
          {!ninguna && !algunaConPermiso && (
            <p style={{ margin: 0, padding: 14, borderRadius: 10, background: "#FFF4E0", color: "#7A4B00" }}>
              Esta vista es para Dirección: tu rol no tiene «Ver ambas marcas». Pídelo a administración si lo necesitas.
            </p>
          )}

          {algunaConPermiso && (
            <div style={{ background: "#fff", border: borde, borderRadius: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
                <thead>
                  <tr style={{ background: "#F3F5F9", textAlign: "left" }}>
                    <th scope="col" style={{ padding: "12px 16px", fontSize: 12.5, color: "#5B6478", fontWeight: 600 }}>
                      {periodo.etiqueta}
                    </th>
                    {CLAVES_DE_MARCA.map((k) => (
                      <th key={k} scope="col" style={{ padding: "12px 16px", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={MARCAS[k].simbolo} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                          {MARCAS[k].nombre}
                        </span>
                      </th>
                    ))}
                    <th scope="col" style={{ padding: "12px 16px", textAlign: "right" }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FILAS.map((f) => (
                    <tr key={f.clave} style={{ borderTop: borde }}>
                      <th scope="row" style={{ padding: "12px 16px", textAlign: "left", fontWeight: 500 }}>
                        {f.nombre}
                      </th>
                      {CLAVES_DE_MARCA.map((k) => {
                        const v = valor(k, f.clave);
                        return (
                          <td key={k} className="mono" style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>
                            {v ? formato(v.valor, v.formato) : "—"}
                          </td>
                        );
                      })}
                      <td className="mono" style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700 }}>
                        {total(f.clave)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {algunaConPermiso && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              {CLAVES_DE_MARCA.map((k) => {
                const c = columnas[k];
                const aviso = avisoDe(c, k);
                return (
                  <section key={k} style={{ background: "#fff", border: borde, borderRadius: 12, padding: 16 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={MARCAS[k].logo}
                      alt={MARCAS[k].nombre}
                      style={{ width: "100%", height: 30, objectFit: "contain", objectPosition: "left center" }}
                    />
                    {aviso ? (
                      <p style={{ margin: "12px 0 0", fontSize: 13, color: "#7A4B00" }}>{aviso}</p>
                    ) : (
                      <p style={{ margin: "12px 0 0", fontSize: 13, color: "#39425A" }}>
                        Chats sin leer ahora:{" "}
                        <strong className="mono">{c.estado === "ok" && c.sinLeer != null ? c.sinLeer : "—"}</strong>
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          <p style={{ margin: 0, fontSize: 12, color: "#5B6478" }}>
            Las cifras salen del mismo cálculo que el reporte mensual de cada marca. Nada de esta pantalla se puede
            editar.
          </p>
        </main>
      </div>
    </div>
  );
}
