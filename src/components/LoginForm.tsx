"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { getBrowserClient } from "@/lib/supabase/browser";
import { ACCENT, T } from "@/lib/theme";

interface Props {
  redirectTo: string;
  /** False when the Supabase environment variables are missing. */
  configured: boolean;
}

export function LoginForm({ redirectTo, configured }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = getBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : authError.message,
      );
      setBusy(false);
      return;
    }

    // Full refresh so the middleware and Server Components pick up the cookie.
    router.replace(redirectTo);
    router.refresh();
  };

  const field = {
    width: "100%",
    height: 38,
    padding: "0 12px",
    fontSize: 14,
    border: `1px solid ${T.border}`,
    borderRadius: 7,
    background: T.surface,
  } as const;

  return (
    <div
      className="lac"
      style={{
        minHeight: "100vh",
        background: T.paper,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <p
          className="mono"
          style={{
            margin: "0 0 8px",
            fontSize: 11,
            letterSpacing: "0.12em",
            color: T.faint,
            textTransform: "uppercase",
          }}
        >
          Les Arts Culinaires · CRM
        </p>
        <h1
          className="dsp"
          style={{ margin: "0 0 6px", fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}
        >
          Entrá al CRM
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: T.muted, maxWidth: "44ch" }}>
          Ventas administra sus propios datos: leads, seguimiento y cierre de
          matrículas.
        </p>

        {!configured && (
          <p
            style={{
              margin: "0 0 16px",
              padding: "11px 14px",
              fontSize: 12.5,
              lineHeight: 1.45,
              borderRadius: 9,
              background: "#F6EEDC",
              color: "#7A5A12",
            }}
          >
            Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en{" "}
            <code>.env.local</code>. Sin eso no se puede iniciar sesión.
          </p>
        )}

        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: 12, background: T.surface, padding: 20, borderRadius: 12, border: `1px solid ${T.border}` }}
        >
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12.5, color: T.muted }}>Correo</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={field}
            />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12.5, color: T.muted }}>Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={field}
            />
          </label>

          {error && (
            <p
              style={{
                margin: 0,
                padding: "9px 12px",
                fontSize: 12.5,
                borderRadius: 7,
                background: "#F7EBE9",
                color: "#8C3B2F",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !configured}
            style={{
              height: 40,
              marginTop: 4,
              fontSize: 14,
              borderRadius: 7,
              background: busy || !configured ? T.border : ACCENT,
              color: busy || !configured ? T.faint : "#fff",
              cursor: busy || !configured ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Entrando…" : "Iniciar sesión"}
          </button>
        </form>

        <p style={{ margin: "18px 0 0", fontSize: 12, color: T.faint, lineHeight: 1.5 }}>
          Las cuentas se crean desde Supabase → Authentication → Users.
          <br />
          ¿Problemas para entrar? Escribí a sistemas@lesarts.com
        </p>
      </div>
    </div>
  );
}
