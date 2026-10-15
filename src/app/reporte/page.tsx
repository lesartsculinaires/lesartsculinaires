import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReporteVista } from "@/components/reporte/ReporteVista";
import {
  armarReporte,
  periodoPedido,
  reporteACsv,
  type DatosDelReporte,
  type EtiquetaDelCatalogo,
  type ProgramaDelCatalogo,
} from "@/lib/reporte";
import { getServerClient, quienEs } from "@/lib/supabase/server";

/** Cada reporte se arma con los datos de ese momento: nunca de caché. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reporte · CRM Les Arts Culinaires",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * El reporte del día (`/reporte?dia=2026-10-14`) o del mes
 * (`/reporte?mes=2026-10`). Ver `@/lib/reporte`.
 *
 * Los datos salen de `datos_del_reporte`, que corre como quien lo pide: el
 * reporte muestra lo mismo que esa persona ve en el CRM, ni un lead más.
 */
export default async function PaginaReporte({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; mes?: string }>;
}) {
  const sp = await searchParams;
  const { user, respondio } = await quienEs();
  if (!user && respondio) redirect("/login");

  const supabase = await getServerClient();
  const { actual, anterior } = periodoPedido(sp.dia, sp.mes);

  if (!supabase || !user) {
    return <NoSePudo texto="No pudimos confirmar tu sesión. Volvé a intentar en unos segundos." />;
  }

  const [ahora, antes, programas, etiquetas] = await Promise.all([
    supabase.rpc("datos_del_reporte", { p_desde: actual.desde, p_hasta: actual.hasta }),
    supabase.rpc("datos_del_reporte", { p_desde: anterior.desde, p_hasta: anterior.hasta }),
    supabase.from("productos").select("id, nombre, categoria, precio, horario, activo").order("nombre"),
    supabase.from("etiquetas").select("id, nombre, color").order("nombre"),
  ]);

  if (ahora.error || !ahora.data) {
    return (
      <NoSePudo
        texto={
          ahora.error?.code === "PGRST202"
            ? "El reporte todavía no está habilitado en la base. Avisale a sistemas."
            : `No se pudo armar el reporte: ${ahora.error?.message ?? "la base no devolvió datos"}. Probá de nuevo en un momento.`
        }
      />
    );
  }

  const reporte = armarReporte(
    actual,
    ahora.data as DatosDelReporte,
    antes.error ? null : (antes.data as DatosDelReporte),
    antes.error ? null : anterior,
    {
      programas: (programas.data ?? []).map((p) => ({
        id: Number(p.id),
        nombre: String(p.nombre),
        categoria: String(p.categoria ?? "Otro"),
        precio: p.precio == null ? null : Number(p.precio),
        horario: p.horario ?? null,
        activo: p.activo !== false,
      })) as ProgramaDelCatalogo[],
      etiquetas: (etiquetas.data ?? []).map((e) => ({
        id: Number(e.id),
        nombre: String(e.nombre),
        color: String(e.color ?? "#4C5A7A"),
      })) as EtiquetaDelCatalogo[],
    },
  );

  const generado = new Date().toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
    dateStyle: "long",
    timeStyle: "short",
  });

  return <ReporteVista reporte={reporte} csv={reporteACsv(reporte)} generado={generado} />;
}

function NoSePudo({ texto }: { texto: string }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", color: "#031B4F" }}>
      <div style={{ maxWidth: 440, textAlign: "center", lineHeight: 1.55 }}>
        <h1 style={{ fontSize: 20 }}>No se pudo armar el reporte</h1>
        <p style={{ fontSize: 14, color: "#4C5A7A" }}>{texto}</p>
        <a href="/" style={{ color: "#031B4F" }}>Volver al CRM</a>
      </div>
    </main>
  );
}
