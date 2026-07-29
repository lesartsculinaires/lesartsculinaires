import CrmApp from "@/components/CrmApp";
import { fetchCatalog } from "@/lib/supabase/catalog";
import { fetchClientes } from "@/lib/supabase/queries";

/** Always read fresh data; the CRM is an operational view, not a cached page. */
export const dynamic = "force-dynamic";

export default async function Page() {
  const [leads, catalog] = await Promise.all([fetchClientes(), fetchCatalog()]);

  return (
    <CrmApp
      initialClientes={leads.clientes}
      initialEventos={catalog.eventos}
      catalog={{
        vendedores: catalog.vendedores,
        programas: catalog.programas,
        tipos: catalog.tipos,
      }}
      live={leads.live}
      loadError={leads.error}
    />
  );
}
