import { LoginForm } from "@/components/LoginForm";
import { LoginUnificado } from "@/components/marca/LoginUnificado";
import { marcaDelPedido } from "@/lib/marca/servidor";
import { MODO_UNIFICADO } from "@/lib/marcas";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; fin?: string; motivo?: string }>;
}) {
  const { redirect, fin, motivo } = await searchParams;
  const user = fin ? null : await getUser();

  // crm-peñagroup: una sola entrada para las dos marcas.
  if (MODO_UNIFICADO) {
    return (
      <LoginUnificado
        inicial={marcaDelPedido()}
        configurada={{ lac: isSupabaseConfigured("lac"), hc: isSupabaseConfigured("hc") }}
        sesionDe={user?.email ?? null}
        motivo={motivo ?? null}
      />
    );
  }

  return (
    <LoginForm
      redirectTo={redirect ?? "/"}
      configured={isSupabaseConfigured(marcaDelPedido())}
      sesionDe={user?.email ?? null}
      recienCerrada={Boolean(fin)}
    />
  );
}
