import { redirect } from "next/navigation";

import CrmApp from "@/components/CrmApp";
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

export default async function Page() {
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
      loadError={loadError}
    />
  );
}
