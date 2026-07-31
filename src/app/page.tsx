import { redirect } from "next/navigation";

import CrmApp, { MOD_USUARIOS } from "@/components/CrmApp";
import { hayServiceRole } from "@/lib/supabase/admin";
import { fetchAccesos } from "@/lib/supabase/accesos";
import {
  fetchCatalogo,
  fetchEventos,
  fetchOportunidades,
} from "@/lib/supabase/queries";
import { getUser } from "@/lib/supabase/server";

/** Operational view — always read fresh, never cached. */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string }>;
}) {
  const { mod } = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login");

  const [ops, catalogo, eventos, accesos] = await Promise.all([
    fetchOportunidades(),
    fetchCatalogo(),
    fetchEventos(),
    fetchAccesos(user.id),
  ]);

  const loadError = ops.error ?? catalogo.error ?? eventos.error;

  return (
    <CrmApp
      oportunidades={ops.data}
      catalogo={catalogo.data}
      eventos={eventos.data}
      userEmail={user.email ?? ""}
      accesos={accesos.data}
      faltaMigracionAccesos={accesos.faltaMigracion}
      puedeCrearCuentas={hayServiceRole()}
      // Sólo abre la pantalla de administración si la cuenta realmente lo es;
      // el parámetro de la URL no puede conceder lo que el rol no concede.
      modInicial={
        mod === "admin" && (accesos.data.esAdmin || accesos.faltaMigracion)
          ? MOD_USUARIOS
          : undefined
      }
      loadError={loadError}
    />
  );
}
