"use client";

import { useMemo } from "react";

import { AREAS } from "@/data/area";
import { CatalogProvider, type CatalogValue } from "@/lib/catalog";
import { Calendario } from "@/components/modules/Calendario";
import { ClienteDrawer } from "@/components/modules/ClienteDrawer";
import { Clientes } from "@/components/modules/Clientes";
import { Dashboard } from "@/components/modules/Dashboard";
import { Equipos } from "@/components/modules/Equipos";
import { EventoDrawer } from "@/components/modules/EventoDrawer";
import { Pipeline } from "@/components/modules/Pipeline";
import { Programas } from "@/components/modules/Programas";
import { LoginGate } from "@/components/LoginGate";
import { Sidebar } from "@/components/Sidebar";
import { SyncBanner } from "@/components/SyncBanner";
import { useCrm } from "@/hooks/useCrm";
import { enrich } from "@/lib/calendar";
import { T } from "@/lib/theme";
import type { Cliente, EventoCalendario } from "@/lib/types";

interface Props {
  /** Leads resolved on the server: live Supabase rows, or the seed set. */
  initialClientes: Cliente[];
  initialEventos: EventoCalendario[];
  /** Sales team, programme catalogue and activity types. */
  catalog: CatalogValue;
  /** False when the seed data is being shown instead of the database. */
  live: boolean;
  /** Set when Supabase is configured but the initial read failed. */
  loadError: string | null;
}

export default function CrmApp({
  initialClientes,
  initialEventos,
  catalog,
  live,
  loadError,
}: Props) {
  const { state, clientes, eventos, actions, syncError } = useCrm(
    initialClientes,
    initialEventos,
  );

  const area = AREAS.find((a) => a.key === state.user) ?? null;
  const accent = area?.accent ?? AREAS[0].accent;

  const vistas = useMemo(
    () => eventos.map((e) => enrich(e, clientes, catalog.tipos)),
    [eventos, clientes, catalog.tipos],
  );

  if (!area) {
    return <LoginGate accent={accent} onEnter={actions.enter} />;
  }

  const { mod } = state;
  const selectedCliente =
    mod === area.people && state.sel
      ? (clientes.find((c) => c.id === state.sel) ?? null)
      : null;
  const selectedEvento = state.calSel
    ? (vistas.find((e) => e.id === state.calSel) ?? null)
    : null;

  const knownModules = [
    "Dashboard",
    area.people,
    area.pipeline,
    "Calendario",
    "Equipos",
    "Diplomados y cursos",
  ];

  const addBtnStyle = {
    height: 34,
    padding: "0 14px",
    fontSize: 13,
    borderRadius: 6,
    background: accent,
    color: "#fff",
  } as const;

  return (
    <CatalogProvider value={catalog}>
    <div className="lac" style={{ minHeight: "100vh", background: T.paper, display: "flex" }}>
      <Sidebar
        area={area}
        accent={accent}
        mod={mod}
        onSelect={actions.setMod}
        onLogout={actions.logout}
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
              {area.label}
            </p>
            <h1 className="dsp" style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>
              {mod}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              style={{
                height: 34,
                padding: "0 14px",
                fontSize: 13,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                background: T.surface,
                color: T.muted,
              }}
            >
              Este mes
            </button>
            <button
              type="button"
              style={{
                height: 34,
                padding: "0 14px",
                fontSize: 13,
                borderRadius: 6,
                background: T.ink,
                color: "#fff",
              }}
            >
              Exportar
            </button>
          </div>
        </header>

        <SyncBanner
          live={live}
          loadError={loadError}
          syncError={syncError}
          onDismiss={actions.dismissSyncError}
        />

        {mod === "Dashboard" && <Dashboard clientes={clientes} accent={accent} />}

        {mod === area.people && (
          <Clientes
            clientes={clientes}
            accent={accent}
            query={state.q}
            filters={state.filters}
            cols={state.cols}
            totalCount={clientes.length}
            selected={state.sel}
            menu={state.menu}
            onQuery={actions.setQuery}
            onFilter={actions.setFilter}
            onToggleCol={actions.toggleCol}
            onToggleMenu={actions.toggleMenu}
            onSelect={actions.select}
            onAdd={actions.addCliente}
            addBtnStyle={addBtnStyle}
          />
        )}

        {mod === area.pipeline && (
          <Pipeline
            clientes={clientes}
            accent={accent}
            drag={state.drag}
            over={state.over}
            onSetDrag={actions.setDrag}
            onSetOver={actions.setOver}
            onPatch={actions.patchCliente}
          />
        )}

        {mod === "Calendario" && (
          <Calendario
            eventos={vistas}
            accent={accent}
            view={state.calView}
            idx={state.calIdx}
            filters={state.calF}
            menu={state.menu}
            addBtnStyle={addBtnStyle}
            onView={actions.setCalView}
            onIdx={actions.setCalIdx}
            onFilter={actions.setCalFilter}
            onToggleMenu={actions.toggleMenu}
            onOpenEvent={actions.openEvent}
            onNewEvent={() =>
              actions.addEvento({
                id: `EV-N${state.calExtra.length + 1}`,
                idx: state.calIdx,
                h: 9,
                t: 0,
                lead: clientes[0]?.id ?? "",
                vend: catalog.vendedores[0]?.name ?? "",
                canal: "Llamada",
                estado: "Pendiente",
              })
            }
          />
        )}

        {mod === "Equipos" && (
          <Equipos
            clientes={clientes}
            accent={accent}
            vend={state.vend}
            onSelectVend={actions.setVend}
            onPatch={actions.patchCliente}
            onOpenCliente={(id) => actions.gotoClientes({}, id)}
            onSeeAll={(vendedor) => actions.gotoClientes({ vendedor })}
          />
        )}

        {mod === "Diplomados y cursos" && (
          <Programas
            clientes={clientes}
            accent={accent}
            tipo={state.tipo}
            onTipo={actions.setTipo}
            onOpenLeads={(producto) => actions.gotoClientes({ producto })}
          />
        )}

        {!knownModules.includes(mod) && (
          <div
            style={{
              background: T.surface,
              border: `1px dashed ${T.borderStrong}`,
              borderRadius: 10,
              padding: "56px 24px",
              textAlign: "center",
            }}
          >
            <h3 className="dsp" style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 500 }}>
              {mod}
            </h3>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: T.muted }}>
              Esta pantalla todavía no se ha diseñado.
            </p>
            <button
              type="button"
              style={{
                padding: "8px 16px",
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${accent}`,
                color: accent,
              }}
            >
              Definir contenido
            </button>
          </div>
        )}

        {selectedEvento && (
          <EventoDrawer
            evento={selectedEvento}
            accent={accent}
            menu={state.menu}
            closing={state.calClosing}
            nextTipo={state.nextTipo}
            nextWhen={state.nextWhen}
            onToggleMenu={actions.toggleMenu}
            onPatch={actions.patchEvento}
            onOpenLead={(leadId) => {
              actions.closeEvent();
              actions.gotoClientes({}, leadId);
            }}
            onStartClose={actions.startClose}
            onCancelClose={actions.cancelClose}
            onSetNextTipo={actions.setNextTipo}
            onSetNextWhen={actions.setNextWhen}
            onConfirmClose={actions.confirmClose}
            onClose={actions.closeEvent}
          />
        )}

        {selectedCliente && (
          <ClienteDrawer
            cliente={selectedCliente}
            accent={accent}
            menu={state.menu}
            onToggleMenu={actions.toggleMenu}
            onPatch={actions.patchCliente}
            onClose={actions.closeDetail}
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
    </CatalogProvider>
  );
}
