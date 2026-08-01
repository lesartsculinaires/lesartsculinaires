"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { signOut } from "@/app/actions";
import { getBrowserClient } from "@/lib/supabase/browser";
import { ACCENT, T, soft } from "@/lib/theme";

interface Props {
  redirectTo: string;
  /** False when the Supabase environment variables are missing. */
  configured: boolean;
  /** Correo de la sesión ya abierta, si la hay. */
  sesionDe: string | null;
  /** Se llegó acá justo después de cerrar sesión. */
  recienCerrada: boolean;
}

/** Which door the person is knocking on. */
type Modo = "ventas" | "admin";

const COPIA: Record<Modo, { titulo: string; bajada: string; boton: string }> = {
  ventas: {
    titulo: "Entrá al CRM",
    bajada:
      "Ventas administra sus propios datos: leads, seguimiento y cierre de matrículas.",
    boton: "Iniciar sesión",
  },
  admin: {
    titulo: "Modo administrador",
    bajada:
      "Acceso a Usuarios y Roles, además de todo el CRM. Reservado a las cuentas con rol de administrador.",
    boton: "Entrar como administrador",
  },
};

export function LoginForm({
  redirectTo,
  configured,
  sesionDe,
  recienCerrada,
}: Props) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("ventas");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Signed in fine, but the account is not an administrator. */
  const [sinPermiso, setSinPermiso] = useState(false);

  const cerrarSesion = async () => {
    try {
      await getBrowserClient().auth.signOut({ scope: "local" });
    } catch {
      // La limpieza local no puede bloquear el cierre de sesión.
    }
    await signOut();
  };

  const entrar = (comoAdmin: boolean) => {
    const destino =
      comoAdmin && redirectTo === "/" ? "/?mod=admin" : redirectTo;
    // Full refresh so the middleware and Server Components pick up the cookie.
    router.replace(destino);
    router.refresh();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSinPermiso(false);

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

    if (modo === "admin") {
      // La pestaña es sólo una puerta: quien manda es el rol guardado en la
      // base. Si esto se decidiera en el navegador, cualquiera entraría de
      // administrador eligiendo la otra pestaña.
      const { data, error: rpcError } = await supabase.rpc("es_admin");

      if (rpcError) {
        // No poder verificar no es lo mismo que no tener permiso: se entra
        // igual, y la pantalla de administración se encarga de gatear.
        entrar(true);
        return;
      }

      if (data !== true) {
        setSinPermiso(true);
        setBusy(false);
        return;
      }

      entrar(true);
      return;
    }

    entrar(false);
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
          {COPIA[modo].titulo}
        </h1>
        <p style={{ margin: "0 0 18px", fontSize: 14, color: T.muted, maxWidth: "44ch" }}>
          {COPIA[modo].bajada}
        </p>

        <div
          role="tablist"
          aria-label="Tipo de acceso"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            padding: 4,
            marginBottom: 16,
            borderRadius: 10,
            background: "#EDEBE6",
          }}
        >
          {(["ventas", "admin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => {
                setModo(m);
                setError(null);
                setSinPermiso(false);
              }}
              style={{
                height: 34,
                fontSize: 13,
                borderRadius: 7,
                fontWeight: modo === m ? 500 : 400,
                background: modo === m ? T.surface : "transparent",
                color: modo === m ? ACCENT : T.muted,
                boxShadow: modo === m ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}
            >
              {m === "ventas" ? "Acceso de ventas" : "Modo administrador"}
            </button>
          ))}
        </div>

        {sesionDe && (
          <div
            style={{
              margin: "0 0 16px",
              padding: "11px 14px",
              fontSize: 12.5,
              lineHeight: 1.5,
              borderRadius: 9,
              background: soft(ACCENT),
              color: T.ink,
            }}
          >
            Ya tenés una sesión abierta como <strong>{sesionDe}</strong>.
            <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
              <a href="/" style={{ fontSize: 12.5, color: ACCENT, textDecoration: "underline" }}>
                Continuar al CRM ›
              </a>
              <button
                type="button"
                onClick={cerrarSesion}
                style={{ fontSize: 12.5, color: T.muted, textDecoration: "underline" }}
              >
                Cerrar sesión y entrar con otra cuenta
              </button>
            </div>
          </div>
        )}

        {recienCerrada && (
          <p
            style={{
              margin: "0 0 16px",
              padding: "10px 14px",
              fontSize: 12.5,
              borderRadius: 9,
              background: "#E6F0E9",
              color: "#2F6B4F",
            }}
          >
            Cerraste sesión. Ya podés entrar con otra cuenta.
          </p>
        )}

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

          {sinPermiso && (
            <div
              style={{
                padding: "11px 13px",
                fontSize: 12.5,
                lineHeight: 1.5,
                borderRadius: 7,
                background: "#F6EEDC",
                color: "#7A5A12",
              }}
            >
              La contraseña es correcta, pero esta cuenta no tiene rol de
              administrador. Un administrador puede asignártelo desde Usuarios y
              Roles.
              <button
                type="button"
                onClick={() => entrar(false)}
                style={{
                  display: "block",
                  marginTop: 9,
                  fontSize: 12.5,
                  color: ACCENT,
                  textDecoration: "underline",
                }}
              >
                Continuar al CRM con tu acceso normal ›
              </button>
            </div>
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
            {busy ? "Entrando…" : COPIA[modo].boton}
          </button>
        </form>

        <p style={{ margin: "18px 0 0", fontSize: 12, color: T.faint, lineHeight: 1.5 }}>
          {modo === "admin"
            ? "El rol lo define la cuenta, no esta pantalla: entrar por acá no da permisos de más."
            : "Las cuentas las crea un administrador desde Usuarios y Roles."}
          <br />
          ¿Problemas para entrar? Escribí a sistemas@lesarts.com
        </p>
      </div>
    </div>
  );
}
