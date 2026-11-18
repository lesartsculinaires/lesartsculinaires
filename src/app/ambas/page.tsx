import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { cargarTablero, type DatosTablero } from "@/app/tablero-actions";
import { VistaAmbas } from "@/components/ambas/VistaAmbas";
import { puedeVerAmbas } from "@/lib/marca/ambas";
import { MARCAS, MODO_UNIFICADO } from "@/lib/marcas";
import { cargarConLlave, lecturaHcConLlave } from "@/lib/tablero/conLlave";
import { mesDe } from "@/lib/tablero/semanas";
import { getServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CRM Peñagroup · Ambas marcas",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * «Ambas marcas»: el Tablero Comercial de LAC y HC, solo lectura (12/11/2026).
 *
 * Es lo mismo que el sitio de Dirección, dentro de crm-peñagroup: lo que cada
 * área llena en el módulo «Tablero Comercial» de su marca se ve acá al momento,
 * con los mismos cálculos. Nada se copia ni se guarda en otro lado: en cada
 * visita se lee de las dos bases.
 *
 * Puerta: la de Dirección (`puedeVerAmbas`). Cada Tablero se lee con la sesión
 * que la persona tiene en esa marca; si en HC no tiene cuenta, HC se lee como
 * en el sitio de Dirección, con la llave que sólo abre el Tablero.
 */

const hoyEnSalvador = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="lac" style={{ maxWidth: 560, margin: "12vh auto", padding: "0 20px", color: "#141826" }}>
      <h1 className="dsp" style={{ fontSize: 22, margin: "0 0 10px" }}>{titulo}</h1>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: "#39425A" }}>{children}</div>
      <p style={{ marginTop: 18 }}>
        <a href="/" style={{ color: "#141826" }}>← Volver al CRM</a>
      </p>
    </main>
  );
}

async function hayUsuarioEn(marca: "hc"): Promise<boolean> {
  const c = await getServerClient(marca);
  if (!c) return false;
  const { data } = await c.auth.getUser();
  return Boolean(data?.user);
}

export default async function PaginaAmbas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  if (!MODO_UNIFICADO) notFound();
  const { mes: pedido } = await searchParams;
  const hoy = hoyEnSalvador();
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(pedido) ? pedido : mesDe(hoy);

  const puerta = await puedeVerAmbas();
  if (!puerta.puede) {
    return (
      <Aviso titulo="Sin acceso a «Ambas marcas»">
        {puerta.motivo === "sin-sesion-lac" ? (
          <p>Esta vista se habilita desde el CRM de Les Arts Culinaires, y no hay sesión abierta ahí. Entra con tu cuenta de LAC.</p>
        ) : (
          <p>
            Es la vista de Dirección. La habilita Dirección en el CRM de Les Arts: Usuarios y Roles → Tablero Comercial →
            «Ver el sitio de Dirección (LAC + HC)».
          </p>
        )}
      </Aviso>
    );
  }

  // LAC con su sesión. HC con su sesión si la hay; si no, con la llave del sitio.
  const conSesionEnHc = await hayUsuarioEn("hc");
  const [datosLac, datosHc] = await Promise.all([
    cargarTablero(mes, "lac"),
    conSesionEnHc ? cargarTablero(mes, "hc") : cargarConLlave(lecturaHcConLlave(), mes),
  ]);

  return (
    <VistaAmbas
      mes={mes}
      hoy={hoy}
      lac={{ nombre: MARCAS.lac.nombre, corto: "LAC", datos: datosLac as DatosTablero, como: "sesion" }}
      hc={{ nombre: MARCAS.hc.nombre, corto: "HC", datos: datosHc as DatosTablero, como: conSesionEnHc ? "sesion" : "llave" }}
      leidoEn={new Date().toISOString()}
    />
  );
}
