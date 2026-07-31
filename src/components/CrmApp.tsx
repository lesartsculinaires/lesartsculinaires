"use client";

import { useRouter } from "next/navigation";

import { Calendario } from "@/components/modules/Calendario";
import { ClienteDrawer } from "@/components/modules/ClienteDrawer";
import { Clientes } from "@/components/modules/Clientes";
import { Dashboard } from "@/components/modules/Dashboard";
import { Equipos } from "@/components/modules/Equipos";
import { Pipeline } from "@/components/modules/Pipeline";
import { Programas } from "@/components/modules/Programas";
import { UsuariosRoles } from "@/components/modules/UsuariosRoles";
import { Sidebar } from "@/components/Sidebar";
import { SyncBanner } from "@/components/SyncBanner";
import { useCrm } from "@/hooks/useCrm";
import { CatalogoProvider } from "@/lib/catalog";
import { ACCENT, T } from "@/lib/theme";
import type { Accesos, Catalogo, Evento, Oportunidad } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  catalogo: Catalogo;
  eventos: Evento[];
  userEmail: string;
  accesos: Accesos;
  /** True when the roles tables do not exist yet. */
  faltaMigracionAccesos: boolean;
  loadError: string | null;
}

/** Sidebar entry for the admin-only screen. */
const MOD_USUARIOS = "Usuarios y Roles";

export default function CrmApp({
  oportunidades: initial,
  catalogo,
  eventos,
  userEmail,
  accesos,
  faltaMigracionAccesos,
  loadError,
}: Props) {
  const router = useRouter();
  const { state, oportunidades, actions, syncError } = useCrm(initial);
  const accent = ACCENT;

  const seleccionada =
    state.sel != null
      ? (oportunidades.find((o) => o.id === state.sel) ?? null)
      : null;

  const { mod } = state;

  return (
    <CatalogoProvider value={catalogo}>
      <div
        className="lac"
        style={{ minHeight: "100vh", background: T.paper, display: "flex" }}
      >
        <Sidebar
          accent={accent}
          mod={mod}
          userEmail={userEmail}
          // Cuando faltan las tablas nadie es admin todavía, así que la entrada
          // se muestra igual: si no, no habría forma de leer el aviso que dice
          // cómo crearlas.
          extras={accesos.esAdmin || faltaMigracionAccesos ? [MOD_USUARIOS] : []}
          onSelect={actions.setMod}
        />

        <main style={{ flex: 1, minWidth: 0, padding: "24px 28px" }}>
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: 22,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <p
                className="mono"
                style={{
                  margin: "0 0 4px",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  color: accent,
                  textTransform: "uppercase",
                }}
              >
                Ventas
              </p>
              <h1 className="dsp" style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>
                {mod}
              </h1>
            </div>
            <p className="mono" style={{ margin: 0, fontSize: 11.5, color: T.faint }}>
              {oportunidades.length} oportunidades · {catalogo.vendedores.length}{" "}
              vendedores · {catalogo.productos.length} programas
            </p>
          </header>

          {faltaMigracionAccesos && mod === MOD_USUARIOS && (
            <p
              style={{
                margin: "0 0 14px",
                padding: "11px 14px",
                fontSize: 12.5,
                lineHeight: 1.5,
                borderRadius: 9,
                background: "#F6EEDC",
                color: "#7A5A12",
              }}
            >
              Las tablas de usuarios y roles todavía no existen. Corré la migración{" "}
              <code>supabase/migrations/20260730120000_usuarios_roles_permisos.sql</code>{" "}
              en Supabase → SQL Editor y recargá.
            </p>
          )}

          <SyncBanner
            loadError={loadError}
            syncError={syncError}
            vacio={!loadError && oportunidades.length === 0}
            onDismiss={actions.dismissSyncError}
          />

          {mod === "Dashboard" && (
            <Dashboard oportunidades={oportunidades} accent={accent} />
          )}

          {mod === "Clientes" && (
            <Clientes
              oportunidades={oportunidades}
              accent={accent}
              query={state.q}
              filtros={state.filtros}
              selected={state.sel}
              menu={state.menu}
              onQuery={actions.setQuery}
              onFiltro={actions.setFiltro}
              onToggleMenu={actions.toggleMenu}
              onSelect={actions.select}
              onLimpiar={actions.limpiarFiltros}
            />
          )}

          {mod === "Pipeline" && (
            <Pipeline
              oportunidades={oportunidades}
              accent={accent}
              drag={state.drag}
              over={state.over}
              onSetDrag={actions.setDrag}
              onSetOver={actions.setOver}
              onEditar={actions.editar}
              onOpen={(id) => actions.verEnClientes({}, id)}
            />
          )}

          {mod === "Calendario" && (
            <Calendario
              eventos={eventos}
              oportunidades={oportunidades}
              accent={accent}
              onRefresh={() => router.refresh()}
            />
          )}

          {mod === "Equipos" && (
            <Equipos
              oportunidades={oportunidades}
              accent={accent}
              vend={state.vend}
              onSelectVend={actions.setVend}
              onOpen={(id) => actions.verEnClientes({}, id)}
              onVerTodos={(vendedorId) => actions.verEnClientes({ vendedor: vendedorId })}
            />
          )}

          {mod === MOD_USUARIOS &&
            (accesos.esAdmin || faltaMigracionAccesos ? (
              <UsuariosRoles
                accesos={accesos}
                accent={accent}
                onRefresh={() => router.refresh()}
              />
            ) : (
              <p style={{ fontSize: 13, color: T.muted }}>
                Esta sección es solo para administradores.
              </p>
            ))}

          {mod === "Programas" && (
            <Programas
              oportunidades={oportunidades}
              accent={accent}
              categoria={state.categoria}
              onCategoria={actions.setCategoria}
              onVerLeads={(productoId) => actions.verEnClientes({ producto: productoId })}
            />
          )}

          {seleccionada && (
            <ClienteDrawer
              oportunidad={seleccionada}
              accent={accent}
              menu={state.menu}
              onToggleMenu={actions.toggleMenu}
              onEditar={actions.editar}
              onEditarCliente={actions.editarCliente}
              onClose={() => actions.select(null)}
            />
          )}

          {/* Click-away layer: any open dropdown closes when the page is clicked. */}
          {state.menu && (
            <div
              onClick={actions.closeMenu}
              style={{ position: "fixed", inset: 0, zIndex: 60 }}
            />
          )}
        </main>
      </div>
    </CatalogoProvider>
  );
}
