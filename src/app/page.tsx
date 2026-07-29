import CrmApp from "@/components/CrmApp";
import { fetchClientes } from "@/lib/supabase/queries";

/** Always read fresh leads; the CRM is an operational view, not a cached page. */
export const dynamic = "force-dynamic";

export default async function Page() {
  const { clientes, live, error } = await fetchClientes();

  return <CrmApp initialClientes={clientes} live={live} loadError={error} />;
}
