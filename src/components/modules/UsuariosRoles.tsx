"use client";

import { useMemo, useState } from "react";

import {
  actualizarRol,
  enlazarVendedor,
  actualizarUsuario,
  cambiarPassword,
  crearRol,
  crearUsuario,
  diagnosticarServiceRole,
  eliminarRol,
  eliminarUsuario,
  guardarPermisos,
  type Diagnostico,
} from "@/app/actions";
import { useCatalogo } from "@/lib/catalog";
import { T, soft, softer } from "@/lib/theme";
import { ACCIONES, activos, type Accesos, type Accion, type Permiso } from "@/lib/types";

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
  const cat = useCatalogo();
  const [nRol, setNRol] = useState<string>("");
  const [passDe, setPassDe] = useState<string | null>(null);
  const [passNueva, setPassNueva] = useState("");
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [diagCargando, setDiagCargando] = useState(false);
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

  /**
   * ¿A esta persona le falta el enlace y lo necesita?
   *
   * Sólo a quien no ve todo: dirección y coordinación entran al CRM sin
   * atender a nadie, y para ellos no tener ficha de vendedor es lo normal.
   */
  const faltaFicha = (u: (typeof accesos.usuarios)[number]): boolean => {
    if (u.vendedorId != null || !u.activo) return false;
    const rol = accesos.roles.find((r) => r.id === u.rolId);
    return !(rol?.esAdmin || rol?.veTodo);
  };

  const cambiarVeTodo = async (id: number, veTodo: boolean) => {
    setBusy(true);
    const r = await actualizarRol(id, { ve_todo: veTodo });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setError(null);
      onRefresh();
    }
  };

  const cambiarVendedor = async (userId: string, vendedorId: number | null) => {
    setBusy(true);
    const r = await enlazarVendedor(userId, vendedorId);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setError(null);
      onRefresh();
    }
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

  const correrDiagnostico = async () => {
    setDiagCargando(true);
    setError(null);
    const r = await diagnosticarServiceRole();
    setDiagCargando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDiag(r.datos);
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
                la plataforma. Creá la cuenta con usuario y contraseña, y asignale el
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
                <PanelLlave
                  accent={accent}
                  diag={diag}
                  cargando={diagCargando}
                  onProbar={correrDiagnostico}
                />
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
                        Usuario
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

                  {/*
                    La llave puede estar cargada y aun así no servir: la de otro
                    proyecto, o la pública pegada por error. Sin esto el único
                    síntoma sería un error críptico al apretar "Crear usuario".
                  */}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                    <button
                      type="button"
                      onClick={correrDiagnostico}
                      disabled={diagCargando}
                      style={{ fontSize: 12, color: accent, textDecoration: "underline" }}
                    >
                      {diagCargando
                        ? "Probando…"
                        : "¿Falla al crear? Probar la conexión con Supabase"}
                    </button>
                    {diag && (
                      <div style={{ marginTop: 10 }}>
                        <ResultadoDiag diag={diag} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.paper }}>
                {["Usuario", "Nombre", "Rol", "Ficha de vendedor", "Estado", ""].map((h) => (
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
                  {/*
                    El enlace con la ficha de vendedor.

                    Es el dato del que depende que esta persona vea sus
                    oportunidades: sin él la base no puede saber cuáles son
                    suyas y no le aparece ninguna. Por eso cuando falta y el
                    rol no ve todo, se avisa acá mismo en vez de dejar que lo
                    descubra con un CRM vacío.
                  */}
                  <td style={{ padding: "8px 18px" }}>
                    <select
                      value={u.vendedorId ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        void cambiarVendedor(u.id, e.target.value ? Number(e.target.value) : null)
                      }
                      style={{
                        height: 30,
                        padding: "0 8px",
                        fontSize: 13,
                        border: `1px solid ${faltaFicha(u) ? T.warn : T.border}`,
                        borderRadius: 6,
                        background: T.surface,
                      }}
                    >
                      <option value="">Sin enlazar</option>
                      {activos(cat.vendedores).map((v) => (
                        <option key={v.id} value={v.id}>{v.nombre}</option>
                      ))}
                    </select>
                    {faltaFicha(u) && (
                      <span
                        style={{
                          display: "block",
                          marginTop: 3,
                          fontSize: 10.5,
                          color: T.warn,
                          lineHeight: 1.35,
                          maxWidth: 200,
                        }}
                      >
                        Sin esto no va a ver ninguna oportunidad.
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "11px 18px" }}>
                    <span className="pill"
                      style={{
                        fontSize: 11,
                        padding: "3px 9px",
                        borderRadius: 20,
                        background: u.activo ? "#E6F0E9" : "#E4E9F3",
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

                  {/*
                    Quién ve todo el pipeline.

                    Va acá y no en la grilla de permisos porque no es un
                    permiso de pantalla —«puede ver Clientes»— sino de alcance:
                    cuántas fichas trae esa pantalla. Un asesor con «ver
                    Clientes» ve la pantalla; lo que cambia esto es si adentro
                    aparecen las suyas o las de todos.

                    Los administradores lo tienen por ser administradores, así
                    que ahí se muestra puesto y no se puede quitar: quitarlo no
                    haría nada y sugeriría lo contrario.
                  */}
                  <label
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 7,
                      fontSize: 11.5,
                      color: r.esAdmin ? T.faint : T.ink,
                      cursor: r.esAdmin ? "default" : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={r.esAdmin || r.veTodo}
                      disabled={busy || r.esAdmin}
                      onChange={(e) => void cambiarVeTodo(r.id, e.target.checked)}
                    />
                    Ve las oportunidades de todo el equipo
                    {r.esAdmin && " (por ser administrador)"}
                  </label>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span className="pill"
                    style={{
                      fontSize: 10.5,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: r.activo ? "#E6F0E9" : "#E4E9F3",
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
                                background: on ? accent : "#C3CBDD",
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

// ------------------------------------------------- diagnóstico de la llave

/** One line of the checklist, with its own verdict. */
function Linea({ ok, texto }: { ok: boolean | null; texto: React.ReactNode }) {
  const color = ok == null ? T.faint : ok ? "#2F6B4F" : "#B85042";
  return (
    <li style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
      <span style={{ color, fontSize: 12, lineHeight: 1.5, flexShrink: 0 }}>
        {ok == null ? "·" : ok ? "✓" : "✕"}
      </span>
      <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{texto}</span>
    </li>
  );
}

/**
 * Why account creation is unavailable, and what to change.
 *
 * "Falta la llave" hides four different problems that need four different
 * fixes, so guessing between them wastes the administrator's time. The
 * button asks the server what it actually sees and names the one that applies.
 */
function PanelLlave({
  accent,
  diag,
  cargando,
  onProbar,
}: {
  accent: string;
  diag: Diagnostico | null;
  cargando: boolean;
  onProbar: () => void;
}) {
  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#7A5A12", lineHeight: 1.55 }}>
        Crear cuentas necesita la llave <code className="mono">service_role</code> de
        Supabase, cargada en el servidor como{" "}
        <code className="mono">SUPABASE_SERVICE_ROLE_KEY</code>. Ahora mismo el
        servidor no la está viendo. Probá la conexión para saber por qué.
      </p>

      <button
        type="button"
        onClick={onProbar}
        disabled={cargando}
        style={{
          height: 32,
          padding: "0 14px",
          fontSize: 12.5,
          borderRadius: 6,
          background: cargando ? T.border : accent,
          color: cargando ? T.faint : "#fff",
          marginBottom: diag ? 14 : 0,
        }}
      >
        {cargando ? "Probando…" : diag ? "Probar de nuevo" : "Probar conexión"}
      </button>

      {diag && <ResultadoDiag diag={diag} />}
    </div>
  );
}

/** La lista de comprobaciones, compartida por los dos estados del panel. */
function ResultadoDiag({ diag }: { diag: Diagnostico }) {
  const esAnon = diag.esLaAnon || diag.formato === "publicable-o-anon";
  return (
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 8,
          background: T.surface,
          border: `1px solid ${T.border}`,
        }}
      >
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          <Linea
            ok={diag.presente}
            texto={
              diag.presente ? (
                <>
                  La variable llega al servidor ({diag.longitud} caracteres).
                </>
              ) : (
                <>
                  <strong>La variable no llega al servidor.</strong> Existe en
                  Netlify pero la función no la recibe, o todavía no está creada.
                </>
              )
            }
          />

          {diag.presente && (
            <Linea
              ok={!esAnon && diag.formato !== "desconocido"}
              texto={
                esAnon ? (
                  <>
                    <strong>Es la llave pública, no la privada.</strong>{" "}
                    {diag.esLaAnon
                      ? "Es exactamente la misma que ya usa el navegador."
                      : "Empieza con sb_publishable_ o su rol es anon."}{" "}
                    La que sirve es <code className="mono">service_role</code>, que
                    está en la misma pantalla de Supabase pero oculta detrás de
                    «Reveal».
                  </>
                ) : diag.formato === "desconocido" ? (
                  <>
                    El valor no tiene forma de llave de Supabase. Puede haber
                    quedado cortado, o con comillas o espacios al pegarlo.
                  </>
                ) : (
                  <>Tiene forma de llave privada ({diag.formato}).</>
                )
              }
            />
          )}

          {diag.presente && (
            <Linea
              ok={diag.prueba === "ok"}
              texto={
                diag.prueba === "ok" ? (
                  <>
                    Supabase la acepta. Recargá la página y el formulario queda
                    habilitado.
                  </>
                ) : (
                  <>
                    Supabase la rechaza: <em>{diag.prueba}</em>. Si la llave es
                    correcta, revisá que sea del proyecto{" "}
                    <code className="mono">{diag.proyecto}</code> y no de otro.
                  </>
                )
              }
            />
          )}
        </ul>

        {!diag.presente && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <p style={{ margin: "0 0 7px", fontSize: 12, fontWeight: 500 }}>
              Qué revisar en Netlify, en este orden:
            </p>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: T.muted }}>
              <li>
                <strong>Scopes.</strong> Site configuration → Environment variables →
                la variable → Options → Edit. Si dice solo «Builds», las funciones
                del servidor no la leen. Tiene que incluir <strong>Functions</strong>{" "}
                (lo más simple es «All scopes»).
              </li>
              <li>
                <strong>Contexto.</strong> En la misma pantalla, el valor tiene que
                estar en <strong>Production</strong>, no solo en «Deploy previews»
                o en una rama.
              </li>
              <li>
                <strong>Nombre exacto.</strong>{" "}
                <code className="mono">SUPABASE_SERVICE_ROLE_KEY</code>, sin{" "}
                <code className="mono">NEXT_PUBLIC_</code> adelante y sin espacios.
              </li>
              <li>
                <strong>Redeploy.</strong> Deploys → Trigger deploy → Deploy site.
                Después volvé a probar acá.
              </li>
            </ol>
          </div>
        )}
      </div>
  );
}
