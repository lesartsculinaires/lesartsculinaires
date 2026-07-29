import { redirect } from "next/navigation";

import CrmApp from "@/components/CrmApp";
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

  const [ops, catalogo, eventos] = await Promise.all([
    fetchOportunidades(),
    fetchCatalogo(),
    fetchEventos(),
  ]);

  const loadError = ops.error ?? catalogo.error ?? eventos.error;

  return (
    <CrmApp
      oportunidades={ops.data}
      catalogo={catalogo.data}
      eventos={eventos.data}
      userEmail={user.email ?? ""}
      loadError={loadError}
    />
  );
}
