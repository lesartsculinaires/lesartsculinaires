"use client";

import { useState, type FormEvent } from "react";
import { CampoClave } from "@/components/ui/CampoClave";

import { signOut } from "@/app/actions";
import { registrarDispositivo } from "@/app/sesiones-actions";
import { agenteCorto, tipoDeDispositivo } from "@/lib/dispositivo";
import { CLAVES_DE_MARCA, GALLETA_MARCA, MARCAS, type ClaveMarca } from "@/lib/marcas";
import { getBrowserClient } from "@/lib/supabase/browser";
import { olvidarModulo } from "@/lib/ultimoModulo";

const MOTIVOS: Record<string, string> = {
  otro_dispositivo:
    "Se cerró tu sesión aquí porque entraste desde otro dispositivo del mismo tipo. Tu rol permite una cantidad fija de sesiones por computadora, celular y tablet.",
  administrador: "Administración cerró tu sesión en este dispositivo.",
};

/**
 * Entrar a crm-peñagroup (12/11/2026): una sola vez para las dos marcas.
 *
 * Con el correo y la contraseña se entra a cada marca donde la persona tiene
 * cuenta —cada una en su propia base, con su propia sesión— y se elige con
 * cuál empezar. Después se cambia desde el menú sin volver a escribir nada.
 * Si sólo tiene cuenta en una, entra directo a esa.
 */
export function LoginUnificado({
  inicial,
  configurada,
  sesionDe,
  motivo,
}: {
  inicial: ClaveMarca;
  configurada: Record<ClaveMarca, boolean>;
  sesionDe: string | null;
  motivo: string | null;
}) {
  const [marca, setMarca] = useState<ClaveMarca>(inicial);
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError(null);

    const disponibles = CLAVES_DE_MARCA.filter((k) => configurada[k]);
    const resultados = await Promise.all(
      disponibles.map(async (k) => {
        try {
          const { error: err } = await getBrowserClient(k).auth.signInWithPassword({
            email: correo.trim(),
            password: clave,
          });
          return { k, ok: !err, mensaje: err?.message ?? null };
        } catch (x) {
          return { k, ok: false, mensaje: x instanceof Error ? x.message : String(x) };
        }
      }),
    );

    const conCuenta = resultados.filter((r) => r.ok).map((r) => r.k);
    if (conCuenta.length === 0) {
      const mensaje = resultados.find((r) => r.mensaje && r.mensaje !== "Invalid login credentials")?.mensaje;
      setError(mensaje ?? "Correo o contraseña incorrectos.");
      setOcupado(false);
      return;
    }

    // La elegida, si tiene cuenta ahí; si no, la que tenga.
    const destino = conCuenta.includes(marca) ? marca : conCuenta[0];
    document.cookie = `${GALLETA_MARCA}=${destino}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; Secure`;

    // La sesión de este dispositivo, en la marca con la que empieza. La otra
    // se anota sola la primera vez que se cambie a ella.
    const tactiles = navigator.maxTouchPoints ?? 0;
    await registrarDispositivo(
      tipoDeDispositivo(navigator.userAgent, tactiles),
      agenteCorto(navigator.userAgent, tactiles),
    ).catch(() => undefined);

    olvidarModulo();
    window.location.assign("/");
  };

  const salir = async () => {
    for (const k of CLAVES_DE_MARCA) {
      try {
        await getBrowserClient(k).auth.signOut({ scope: "local" });
      } catch {
        // Nada: la acción de abajo borra las galletas igual.
      }
    }
    await signOut();
  };

  const campo = {
    width: "100%",
    height: 42,
    padding: "0 12px",
    fontSize: 15,
    border: "1px solid #CBD2DF",
    borderRadius: 8,
    background: "#fff",
    color: "#141826",
    boxSizing: "border-box" as const,
  };

  return (
    <div
      className="lac login-unificado"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexWrap: "wrap",
        background: "#F6F7FA",
        fontFamily: "var(--fuente-cuerpo-lac), system-ui, sans-serif",
        color: "#141826",
      }}
    >
      <div
        style={{
          flex: "1 1 360px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 18,
          padding: "40px 32px",
          background: "#ffffff",
          borderRight: "1px solid #E3E7EF",
        }}
      >
        {CLAVES_DE_MARCA.map((k) => (
          <div key={k} style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", padding: 20, borderRadius: 14, border: "1px solid #E3E7EF" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MARCAS[k].logo}
              alt={`${MARCAS[k].nombre}, ${MARCAS[k].instituto}`}
              style={{ width: "100%", height: 54, objectFit: "contain", objectPosition: "left center" }}
            />
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#5B6478" }}>
              Su propia base de datos: clientes, chats y ventas de {MARCAS[k].prefijo}.
            </p>
          </div>
        ))}
      </div>

      <form
        onSubmit={entrar}
        style={{
          flex: "1 1 380px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 16,
          padding: "40px 32px",
          maxWidth: 520,
          boxSizing: "border-box",
        }}
      >
        <div>
          <p className="mono" style={{ margin: 0, fontSize: 11, letterSpacing: "0.1em", color: "#5B6478" }}>
            CRM PEÑAGROUP
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: 30, fontFamily: "var(--fuente-titulos-lac), Georgia, serif" }}>
            Entra una sola vez
          </h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#39425A" }}>
            Con tu correo y contraseña entras a las marcas donde tienes cuenta. Después cambias de una a otra desde el
            menú, sin volver a escribir nada.
          </p>
        </div>

        {motivo && MOTIVOS[motivo] && (
          <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 8, background: "#FFF4E0", color: "#7A4B00", fontSize: 13, lineHeight: 1.5 }}>
            {MOTIVOS[motivo]}
          </p>
        )}

        {sesionDe && (
          <p style={{ margin: 0, padding: "10px 12px", borderRadius: 8, background: "#EEF1F7", fontSize: 13, lineHeight: 1.5 }}>
            Ya entraste como <strong>{sesionDe}</strong>.{" "}
            <a href="/" style={{ color: "#031B4F", fontWeight: 600 }}>
              Continuar
            </a>{" "}
            ·{" "}
            <button type="button" onClick={() => void salir()} style={{ color: "#031B4F", textDecoration: "underline", fontSize: 13 }}>
              Cerrar sesión
            </button>
          </p>
        )}

        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
          Correo
          <input type="email" autoComplete="username" required value={correo} onChange={(e) => setCorreo(e.target.value)} style={campo} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
          Contraseña
          <CampoClave
            bloque
            autoComplete="current-password"
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            style={campo}
          />
        </label>

        <fieldset style={{ margin: 0, padding: 0, border: "none", display: "grid", gap: 8 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>¿Con cuál empiezas hoy?</legend>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {CLAVES_DE_MARCA.map((k) => (
              <label
                key={k}
                style={{
                  flex: "1 1 180px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1.5px solid ${marca === k ? "#141826" : "#CBD2DF"}`,
                  background: "#fff",
                  cursor: configurada[k] ? "pointer" : "not-allowed",
                  opacity: configurada[k] ? 1 : 0.5,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <input
                  type="radio"
                  name="marca"
                  value={k}
                  checked={marca === k}
                  disabled={!configurada[k]}
                  onChange={() => setMarca(k)}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={MARCAS[k].simbolo} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} />
                {MARCAS[k].nombre}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" style={{ margin: 0, color: "#B3261E", fontSize: 13 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={ocupado}
          style={{
            height: 44,
            borderRadius: 8,
            background: "#141826",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            opacity: ocupado ? 0.6 : 1,
          }}
        >
          {ocupado ? "Entrando…" : "Entrar"}
        </button>
        <p style={{ margin: 0, fontSize: 12.5, color: "#5B6478" }}>
          Si solo tienes cuenta en una marca, entras directo a esa.
        </p>
      </form>
    </div>
  );
}
