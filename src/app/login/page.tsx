import { LoginForm } from "@/components/LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; fin?: string }>;
}) {
  const { redirect, fin } = await searchParams;
  const user = fin ? null : await getUser();

  return (
    <LoginForm
      redirectTo={redirect ?? "/"}
      configured={isSupabaseConfigured()}
      sesionDe={user?.email ?? null}
      recienCerrada={Boolean(fin)}
    />
  );
}
