"use client";

import { useMemo, useState } from "react";

import {
  actualizarRol,
  actualizarUsuario,
  cambiarPassword,
  crearRol,
  crearUsuario,
  eliminarRol,
  eliminarUsuario,
  guardarPermisos,
} from "@/app/actions";
import { T, soft, softer } from "@/lib/theme";
import { ACCIONES, type Accesos, type Accion, type Permiso } from "@/lib/types";

interface Props {
  accesos: Accesos;
  accent: string;
  /** False when SUPABASE_SERVICE_ROLE_KEY is missing on the server. */
  puedeCrearCuentas: boolean;
  onRefresh: () => void;
}

type Pestana = "usuarios" | "roles";

/** Permission grid held while the user flips toggles, before saving. */
type Borrador = Record<string, Record<Accion, boolean>>;

const vacio = (): Record<Accion, boolean> => ({
  ver: false,
  crear: false,
  editar: false,
  eliminar: false,
});

function aBorrador(permisos: readonly Permiso[], rolId: number, claves: string[]): Borrador {
  const out: Borrador = {};
  for (const clave of claves) {
    const p = permisos.find((x) => x.rolId === rolId && x.modulo === clave);
    out[clave] = p
      ? { ver: p.ver, crear: p.crear, editar: p.editar, eliminar: p.eliminar }
      : vacio();
  }
  return out;
}

export function UsuariosRoles({
  accesos,
  accent,
  puedeCrearCuentas,
  onRefresh,
}: Props) {
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [nCorreo, setNCorreo] = useState("");
  const [nPass, setNPass] = useState("");
  const [nNombre, setNNombre] = useState("");
  const [nRol, setNRol] = useState<string>("");
  const [passDe, setPassDe] = useState<string | null>(null);
  const [passNueva, setPassNueva] = useState("");
  const [pestana, setPestana] = useState<Pestana>("usuarios");
  const [rolSel, setRolSel] = useState<number | null>(
    accesos.roles[0]?.id ?? null,
  );
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);

  const claves = useMemo(() => accesos.modulos.map((m) => m.clave), [accesos.modulos]);
  const rol = accesos.roles.find((r) => r.id === rolSel) ?? null;

  // The draft follows the selected role until the user touches a toggle.
  const grid = borrador ?? (rol ? aBorrador(accesos.permisos, rol.id, claves) : {});

  const elegirRol = (id: number) => {
    setRolSel(id);
    setBorrador(null);
    setAviso(null);
    setError(null);
  };

  const toggle = (modulo: string, accion: Accion) => {
    if (rol?.esAdmin) return; // el administrador siempre puede todo
    const base = borrador ?? (rol ? aBorrador(accesos.permisos, rol.id, claves) : {});
    setBorrador({
      ...base,
      [modulo]: { ...(base[modulo] ?? vacio()), [accion]: !base[modulo]?.[accion] },
    });
    setAviso(null);
  };

  const guardar = async () => {
    if (!rol || !borrador) return;
    setBusy(true);
    setError(null);
    const r = await guardarPermisos(
      rol.id,
      claves.map((clave) => ({ modulo: clave, ...(borrador[clave] ?? vacio()) })),
    );
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setBorrador(null);
    setAviso("Permisos guardados.");
    onRefresh();
  };

  const agregarRol = async () => {
    setBusy(true);
    setError(null);
    const r = await crearRol(nuevoNombre, "");
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setNuevoNombre("");
    setCreando(false);
    onRefresh();
  };

  const borrarRol = async (id: number) => {
    setBusy(true);
    setError(null);
    const r = await eliminarRol(id);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (rolSel === id) setRolSel(accesos.roles.find((x) => x.id !== id)?.id ?? null);
    onRefresh();
  };

  const alternarActivo = async (id: number, activo: boolean) => {
    setBusy(true);
    const r = await actualizarRol(id, { activo: !activo });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else onRefresh();
  };

  const cambiarRolUsuario = async (userId: string, rolId: number | null) => {
    setBusy(true);
    const r = await actualizarUsuario(userId, { rol_id: rolId });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else onRefresh();
  };

  const agregarUsuario = async () => {
    setBusy(true);
    setError(null);
    setAviso(null);
    const r = await crearUsuario(
      nCorreo,
      nPass,
      nRol ? Number(nRol) : null,
      nNombre,
    );
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setAviso(`Cuenta creada para ${nCorreo.trim().toLowerCase()}.`);
    setNCorreo("");
    setNPass("");
    setNNombre("");
    setNRol("");
    setAltaAbierta(false);
    onRefresh();
  };

  const guardarPassword = async (userId: string) => {
    setBusy(true);
    setError(null);
    setAviso(null);
    const r = await cambiarPassword(userId, passNueva);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPassDe(null);
    setPassNueva("");
    setAviso("Contraseña actualizada.");
  };

  const borrarUsuario = async (userId: string, correo: string) => {
    if (!confirm(`¿Eliminar la cuenta de ${correo}? No se puede deshacer.`)) return;
    setBusy(true);
    setError(null);
    const r = await eliminarUsuario(userId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onRefresh();
  };

  const campo = {
    height: 32,
    padding: "0 10px",
    fontSize: 13,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    background: T.paper,
  } as const;

  const tabStyle = (p: Pestana) => ({
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 4px",
    marginRight: 24,
    fontSize: 14,
    fontWeight: pestana === p ? 500 : 400,
    color: pestana === p ? accent : T.muted,
    borderBottom: `2px solid ${pestana === p ? accent : "transparent"}`,
  });

  return (
    <div>
      <div style={{ borderBottom: `1px solid ${T.border}`, marginBottom: 20, display: "flex" }}>
        <button type="button" onClick={() => setPestana("usuarios")} style={tabStyle("usuarios")}>
          👤 Usuarios
        </button>
        <button type="button" onClick={() => setPestana("roles")} style={tabStyle("roles")}>
          🔒 Roles y Permisos
        </button>
      </div>

      {error && (
        <p
          style={{
            margin: "0 0 14px",
            padding: "10px 14px",
            fontSize: 12.5,
            borderRadius: 9,
            background: "#F7EBE9",
            color: "#8C3B2F",
          }}
        >
          {error}
        </p>
      )}

      {pestana === "usuarios" && aviso && (
        <p
          style={{
            margin: "0 0 14px",
            padding: "10px 14px",
            fontSize: 12.5,
            borderRadius: 9,
            background: "#E6F0E9",
            color: "#2F6B4F",
          }}
        >
          {aviso}
        </p>
      )}

      {pestana === "usuarios" ? (
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              padding: "14px 18px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
                Usuarios
              </p>
              <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
                {accesos.usuarios.length}{" "}
                {accesos.usuarios.length === 1 ? "cuenta" : "cuentas"} con acceso a
                la plataforma. Creá la cuenta con correo y contraseña, y asignale el
                rol que define qué puede ver.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAltaAbierta((v) => !v);
                setError(null);
                setAviso(null);
              }}
              style={{
                flexShrink: 0,
                height: 32,
                padding: "0 14px",
                fontSize: 12.5,
                borderRadius: 6,
                background: altaAbierta ? T.paper : accent,
                color: altaAbierta ? T.muted : "#fff",
              }}
            >
              {altaAbierta ? "Cancelar" : "+ Nuevo usuario"}
            </button>
          </div>

          {altaAbierta && (
            <div
              style={{
                padding: "16px 18px",
                borderBottom: `1px solid ${T.border}`,
                background: softer(accent),
              }}
            >
              {!puedeCrearCuentas ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "#7A5A12", lineHeight: 1.55 }}>
                  Para crear cuentas desde acá falta cargar la variable{" "}
                  <code className="mono">SUPABASE_SERVICE_ROLE_KEY</code> en el
                  servidor (Netlify → Site configuration → Environment variables, y
                  en <code className="mono">.env.local</code> para desarrollo). La
                  llave está en Supabase → Project Settings → API. Mientras tanto las
                  cuentas se crean en Supabase → Authentication → Users y acá se les
                  asigna el rol.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                      gap: 10,
                    }}
                  >
                    <label style={{ display: "block" }}>
                      <span style={{ display: "block", marginBottom: 4, fontSize: 11.5, color: T.muted }}>
                        Correo
                      </span>
                      <input
                        type="email"
                        autoComplete="off"
                        value={nCorreo}
                        onChange={(e) => setNCorreo(e.target.value)}
                        placeholder="persona@lesarts.com"
                        style={{ ...campo, width: "100%", background: T.surface }}
                      />
                    </label>
                    <label style={{ display: "block" }}>
                      <span style={{ display: "block", marginBottom: 4, fontSize: 11.5, color: T.muted }}>
                        Contraseña
                      </span>
                      <input
                        type="text"
                        autoComplete="new-password"
                        value={nPass}
                        onChange={(e) => setNPass(e.target.value)}
                        placeholder="mínimo 8 caracteres"
                        style={{ ...campo, width: "100%", background: T.surface }}
                      />
                    </label>
                    <label style={{ display: "block" }}>
                      <span style={{ display: "block", marginBottom: 4, fontSize: 11.5, color: T.muted }}>
                        Nombre
                      </span>
                      <input
                        value={nNombre}
                        onChange={(e) => setNNombre(e.target.value)}
                        placeholder="opcional"
                        style={{ ...campo, width: "100%", background: T.surface }}
                      />
                    </label>
                    <label style={{ display: "block" }}>
                      <span style={{ display: "block", marginBottom: 4, fontSize: 11.5, color: T.muted }}>
                        Rol
                      </span>
                      <select
                        value={nRol}
                        onChange={(e) => setNRol(e.target.value)}
                        style={{ ...campo, width: "100%", background: T.surface }}
                      >
                        <option value="">Sin rol</option>
                        {accesos.roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={agregarUsuario}
                      disabled={busy || !nCorreo.trim() || nPass.length < 8}
                      style={{
                        height: 34,
                        padding: "0 16px",
                        fontSize: 13,
                        borderRadius: 6,
                        background: !busy && nCorreo.trim() && nPass.length >= 8 ? accent : T.border,
                        color: !busy && nCorreo.trim() && nPass.length >= 8 ? "#fff" : T.faint,
                      }}
                    >
                      {busy ? "Creando…" : "Crear usuario"}
                    </button>
                    <span style={{ fontSize: 11.5, color: T.muted }}>
                      La cuenta queda confirmada y puede entrar de inmediato. Pasale
                      la contraseña por un canal seguro.
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.paper }}>
                {["Correo", "Nombre", "Rol", "Estado", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "9px 18px",
                      fontWeight: 500,
                      fontSize: 11.5,
                      color: T.muted,
                      borderBottom: `1px solid ${T.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accesos.usuarios.map((u, i) => (
                <tr key={u.id} style={{ borderTop: i ? `1px solid ${T.border}` : "none" }}>
                  <td style={{ padding: "11px 18px" }}>
                    {u.correo}
                    {u.id === accesos.yo?.id && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: T.faint }}>(vos)</span>
                    )}
                  </td>
                  <td style={{ padding: "11px 18px", color: T.muted }}>{u.nombre ?? "—"}</td>
                  <td style={{ padding: "8px 18px" }}>
                    <select
                      value={u.rolId ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        cambiarRolUsuario(u.id, e.target.value ? Number(e.target.value) : null)
                      }
                      style={{
                        height: 30,
                        padding: "0 8px",
                        fontSize: 13,
                        border: `1px solid ${T.border}`,
                        borderRadius: 6,
                        background: T.surface,
                      }}
                    >
                      <option value="">Sin rol</option>
                      {accesos.roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "11px 18px" }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 9px",
                        borderRadius: 20,
                        background: u.activo ? "#E6F0E9" : "#EDEBE6",
                        color: u.activo ? "#2F6B4F" : T.muted,
                      }}
                    >
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 18px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      disabled={!puedeCrearCuentas}
                      title={
                        puedeCrearCuentas
                          ? "Cambiar contraseña"
                          : "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor"
                      }
                      onClick={() => {
                        setPassDe(passDe === u.id ? null : u.id);
                        setPassNueva("");
                        setError(null);
                        setAviso(null);
                      }}
                      style={{
                        height: 26,
                        padding: "0 10px",
                        fontSize: 11.5,
                        borderRadius: 5,
                        border: `1px solid ${T.border}`,
                        color: puedeCrearCuentas ? T.muted : T.faint,
                        cursor: puedeCrearCuentas ? "pointer" : "not-allowed",
                      }}
                    >
                      Contraseña
                    </button>
                    <button
                      type="button"
                      disabled={!puedeCrearCuentas || u.id === accesos.yo?.id}
                      title={
                        u.id === accesos.yo?.id
                          ? "No podés eliminar tu propia cuenta"
                          : "Eliminar cuenta"
                      }
                      onClick={() => borrarUsuario(u.id, u.correo)}
                      style={{
                        marginLeft: 6,
                        width: 26,
                        height: 26,
                        borderRadius: 5,
                        border: `1px solid ${
                          puedeCrearCuentas && u.id !== accesos.yo?.id ? "#E4B4AC" : T.border
                        }`,
                        color:
                          puedeCrearCuentas && u.id !== accesos.yo?.id ? "#B85042" : T.border,
                        fontSize: 12,
                        cursor:
                          puedeCrearCuentas && u.id !== accesos.yo?.id
                            ? "pointer"
                            : "not-allowed",
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}

              {passDe && (
                <tr style={{ borderTop: `1px solid ${T.border}`, background: softer(accent) }}>
                  <td colSpan={5} style={{ padding: "12px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12.5, color: T.muted }}>
                        Nueva contraseña para{" "}
                        {accesos.usuarios.find((x) => x.id === passDe)?.correo}
                      </span>
                      <input
                        type="text"
                        autoComplete="new-password"
                        value={passNueva}
                        onChange={(e) => setPassNueva(e.target.value)}
                        placeholder="mínimo 8 caracteres"
                        onKeyDown={(e) =>
                          e.key === "Enter" && passNueva.length >= 8 && guardarPassword(passDe)
                        }
                        style={{ ...campo, width: 220, background: T.surface }}
                      />
                      <button
                        type="button"
                        onClick={() => guardarPassword(passDe)}
                        disabled={busy || passNueva.length < 8}
                        style={{
                          height: 32,
                          padding: "0 14px",
                          fontSize: 12.5,
                          borderRadius: 6,
                          background: passNueva.length >= 8 && !busy ? accent : T.border,
                          color: passNueva.length >= 8 && !busy ? "#fff" : T.faint,
                        }}
                      >
                        {busy ? "Guardando…" : "Guardar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPassDe(null);
                          setPassNueva("");
                        }}
                        style={{ fontSize: 12.5, color: T.muted }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {accesos.usuarios.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "26px 18px", fontSize: 12.5, color: T.faint }}>
                    No hay usuarios registrados. Usá “+ Nuevo usuario” para crear el
                    primer acceso.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div
            style={{
              flex: "1 1 260px",
              maxWidth: 340,
              minWidth: 0,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                padding: "13px 16px",
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <span className="dsp" style={{ fontSize: 15, fontWeight: 500 }}>
                Roles
              </span>
              <button
                type="button"
                onClick={() => setCreando((v) => !v)}
                style={{
                  height: 30,
                  padding: "0 12px",
                  fontSize: 12.5,
                  borderRadius: 6,
                  background: creando ? T.paper : accent,
                  color: creando ? T.muted : "#fff",
                }}
              >
                {creando ? "Cancelar" : "+ Nuevo"}
              </button>
            </div>

            {creando && (
              <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
                <input
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Nombre del rol"
                  onKeyDown={(e) => e.key === "Enter" && agregarRol()}
                  style={{
                    flex: 1,
                    height: 32,
                    padding: "0 10px",
                    fontSize: 13,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    background: T.paper,
                  }}
                />
                <button
                  type="button"
                  onClick={agregarRol}
                  disabled={busy || !nuevoNombre.trim()}
                  style={{
                    height: 32,
                    padding: "0 12px",
                    fontSize: 12.5,
                    borderRadius: 6,
                    background: nuevoNombre.trim() ? accent : T.border,
                    color: nuevoNombre.trim() ? "#fff" : T.faint,
                  }}
                >
                  Crear
                </button>
              </div>
            )}

            {accesos.roles.map((r, i) => (
              <div
                key={r.id}
                onClick={() => elegirRol(r.id)}
                className="row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "13px 16px",
                  cursor: "pointer",
                  borderTop: i ? `1px solid ${T.border}` : "none",
                  borderLeft: `3px solid ${rolSel === r.id ? accent : "transparent"}`,
                  background: rolSel === r.id ? softer(accent) : "transparent",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 500 }}>
                    {r.nombre}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
                    {r.descripcion ?? "Sin descripción"}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: r.activo ? "#E6F0E9" : "#EDEBE6",
                      color: r.activo ? "#2F6B4F" : T.muted,
                    }}
                  >
                    {r.activo ? "Activo" : "Inactivo"}
                  </span>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button
                      type="button"
                      title={r.activo ? "Desactivar" : "Activar"}
                      onClick={(e) => {
                        e.stopPropagation();
                        alternarActivo(r.id, r.activo);
                      }}
                      style={{
                        width: 26,
                        height: 24,
                        borderRadius: 5,
                        border: `1px solid ${T.border}`,
                        color: T.muted,
                        fontSize: 12,
                      }}
                    >
                      –
                    </button>
                    <button
                      type="button"
                      title={r.esAdmin ? "El rol administrador no se puede eliminar" : "Eliminar"}
                      disabled={r.esAdmin}
                      onClick={(e) => {
                        e.stopPropagation();
                        borrarRol(r.id);
                      }}
                      style={{
                        width: 26,
                        height: 24,
                        borderRadius: 5,
                        border: `1px solid ${r.esAdmin ? T.border : "#E4B4AC"}`,
                        color: r.esAdmin ? T.border : "#B85042",
                        fontSize: 12,
                        cursor: r.esAdmin ? "not-allowed" : "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              flex: "999 1 460px",
              minWidth: 0,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "13px 18px",
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <span className="dsp" style={{ fontSize: 15, fontWeight: 500 }}>
                {rol?.nombre ?? "Elegí un rol"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {aviso && <span style={{ fontSize: 12, color: "#2F6B4F" }}>{aviso}</span>}
                <button
                  type="button"
                  onClick={guardar}
                  disabled={busy || !borrador || !rol || rol.esAdmin}
                  style={{
                    height: 32,
                    padding: "0 14px",
                    fontSize: 12.5,
                    borderRadius: 6,
                    background: borrador && !rol?.esAdmin ? accent : T.border,
                    color: borrador && !rol?.esAdmin ? "#fff" : T.faint,
                    cursor: borrador && !rol?.esAdmin ? "pointer" : "not-allowed",
                  }}
                >
                  {busy ? "Guardando…" : "Guardar permisos"}
                </button>
              </div>
            </div>

            {rol?.esAdmin && (
              <p
                style={{
                  margin: 0,
                  padding: "10px 18px",
                  fontSize: 12,
                  color: "#7A5A12",
                  background: "#F6EEDC",
                }}
              >
                El administrador tiene acceso completo por definición y no se puede
                restringir. Si no, nadie podría volver a abrir esta pantalla.
              </p>
            )}

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.paper }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "9px 18px",
                      fontWeight: 500,
                      fontSize: 11.5,
                      color: T.muted,
                      letterSpacing: "0.04em",
                      borderBottom: `1px solid ${T.border}`,
                    }}
                  >
                    MÓDULO
                  </th>
                  {ACCIONES.map((a) => (
                    <th
                      key={a}
                      style={{
                        width: 96,
                        textAlign: "center",
                        padding: "9px 8px",
                        fontWeight: 500,
                        fontSize: 11.5,
                        color: T.muted,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        borderBottom: `1px solid ${T.border}`,
                      }}
                    >
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accesos.modulos.map((m, i) => {
                  const padre = m.padre
                    ? accesos.modulos.find((x) => x.clave === m.padre)
                    : null;
                  const fila = grid[m.clave] ?? vacio();
                  return (
                    <tr key={m.clave} style={{ borderTop: i ? `1px solid ${T.border}` : "none" }}>
                      <td style={{ padding: "11px 18px" }}>
                        {padre ? (
                          <span style={{ color: T.ink }}>
                            {padre.nombre} — {m.nombre}{" "}
                            <span style={{ color: T.faint }}>(sub-permiso)</span>
                          </span>
                        ) : (
                          <span style={{ fontWeight: 500 }}>{m.nombre}</span>
                        )}
                      </td>
                      {ACCIONES.map((a) => {
                        const on = rol?.esAdmin ? true : fila[a];
                        return (
                          <td key={a} style={{ padding: "8px", textAlign: "center" }}>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={`${m.nombre} ${a}`}
                              disabled={!rol || rol.esAdmin}
                              onClick={() => toggle(m.clave, a)}
                              style={{
                                width: 38,
                                height: 21,
                                borderRadius: 11,
                                background: on ? accent : "#D8D4CC",
                                position: "relative",
                                cursor: rol?.esAdmin ? "not-allowed" : "pointer",
                                opacity: rol?.esAdmin ? 0.65 : 1,
                              }}
                            >
                              <span
                                style={{
                                  position: "absolute",
                                  top: 3,
                                  left: on ? 20 : 3,
                                  width: 15,
                                  height: 15,
                                  borderRadius: "50%",
                                  background: "#fff",
                                  transition: "left 120ms ease",
                                }}
                              />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {borrador && (
              <p
                style={{
                  margin: 0,
                  padding: "11px 18px",
                  fontSize: 12,
                  color: T.muted,
                  borderTop: `1px solid ${T.border}`,
                  background: soft(accent),
                }}
              >
                Hay cambios sin guardar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
