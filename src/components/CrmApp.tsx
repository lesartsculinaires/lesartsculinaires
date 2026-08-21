"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Bases } from "@/components/modules/Bases";
import { Calendario } from "@/components/modules/Calendario";
import { ClienteDrawer } from "@/components/modules/ClienteDrawer";
import { Clientes } from "@/components/modules/Clientes";
import { Dashboard } from "@/components/modules/Dashboard";
import { Equipos } from "@/components/modules/Equipos";
import { Formularios } from "@/components/modules/Formularios";
import { Inbox } from "@/components/modules/Inbox";
import { Pipeline } from "@/components/modules/Pipeline";
import { Programas } from "@/components/modules/Programas";
import { UsuariosRoles } from "@/components/modules/UsuariosRoles";
import { AvisoReservas } from "@/components/AvisoReservas";
import { Notificaciones } from "@/components/Notificaciones";
import { Recordatorios as RelojRecordatorios } from "@/components/Recordatorios";
import { Recordatorios } from "@/components/modules/Recordatorios";
import { SinCopiar } from "@/components/SinCopiar";
import { Sonido } from "@/components/Sonido";
import { Plantillas } from "@/components/modules/Plantillas";
import { RegistroActividad } from "@/components/modules/RegistroActividad";
import { Sidebar } from "@/components/Sidebar";
import { SyncBanner } from "@/components/SyncBanner";
import { Actualizado } from "@/components/ui/Actualizado";
import { useAutoRefresco } from "@/hooks/useAutoRefresco";
import { useAvisoDiario } from "@/hooks/useAvisoDiario";
import { useCampanita } from "@/hooks/useCampanita";
import { useCrm } from "@/hooks/useCrm";
import { useEnVivo } from "@/hooks/useEnVivo";
import { queSuena } from "@/lib/aviso";
import type { Formulario as FormularioDeFeria } from "@/lib/formularios";
import { paraInterrumpir, recordatoriosDe } from "@/lib/recordatorios";
import { CatalogoProvider } from "@/lib/catalog";
import { MOD_USUARIOS } from "@/lib/modulos";
import { ACCENT, T } from "@/lib/theme";
import { recordarModulo } from "@/lib/ultimoModulo";
import type { EstadoPlantillas } from "@/app/plantillas-actions";
import { SIN_DUENO, activos } from "@/lib/types";
import type {
  Accesos,
  Catalogo,
  Conversacion,
  Etiqueta,
  Evento,
  Importacion,
  Mensaje,
  Oportunidad,
} from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  catalogo: Catalogo;
  eventos: Evento[];
  importaciones: Importacion[];
  /** La tabla de importaciones todavía no existe. */
  faltaMigracionBases: boolean;
  conversaciones: Conversacion[];
  mensajes: Mensaje[];
  /** Las tablas de la bandeja todavía no existen. */
  faltaMigracionInbox: boolean;
  /** False cuando el servidor no tiene token de WhatsApp. */
  puedeResponderWhatsapp: boolean;
  userEmail: string;
  accesos: Accesos;
  /** Catálogo de etiquetas de la bandeja. Vacío si falta su migración. */
  etiquetas: Etiqueta[];
  /** Plantillas de WhatsApp y cuándo se sincronizaron. */
  plantillas: EstadoPlantillas;
  /** True when the roles tables do not exist yet. */
  faltaMigracionAccesos: boolean;
  /** False when the server has no service-role key to create logins with. */
  puedeCrearCuentas: boolean;
  /** Recordatorios que esta persona pidió no ver: id → hasta cuándo. */
  pospuestos: Record<number, string>;
  /** La tabla de pospuestos todavía no existe. */
  faltaMigracionRecordatorios: boolean;
  /** Los formularios de feria, con sus preguntas. */
  formularios: FormularioDeFeria[];
  /** Las tablas de formularios todavía no existen. */
  faltaMigracionFormularios: boolean;
  /**
   * Módulo con el que abrir. Lo decide el servidor: la última pantalla donde
   * estuvo esta persona, o el modo elegido en el login la primera vez.
   */
  modInicial?: string;
  loadError: string | null;
}



export default function CrmApp({
  oportunidades: initial,
  catalogo,
  eventos,
  importaciones,
  faltaMigracionBases,
  conversaciones,
  mensajes,
  faltaMigracionInbox,
  puedeResponderWhatsapp,
  userEmail,
  accesos,
  etiquetas,
  plantillas,
  faltaMigracionAccesos,
  puedeCrearCuentas,
  pospuestos,
  faltaMigracionRecordatorios,
  formularios,
  faltaMigracionFormularios,
  modInicial,
  loadError,
}: Props) {
  const router = useRouter();
  const { state, oportunidades, actions, syncError } = useCrm(initial, modInicial);

  /**
   * A donde lleva un aviso o una notificación: la ficha de la que habla.
   *
   * Si la oportunidad ya no está —se borró después de que quedara anotada en el
   * registro— se abre Clientes igual, sin selección, en vez de dejar el clic
   * sin efecto y que parezca que la pantalla no responde.
   */
  const abrirFicha = (oportunidadId: number) => {
    const existe = oportunidades.some((o) => o.id === oportunidadId);
    actions.verEnClientes({}, existe ? oportunidadId : null);
  };
  const accent = ACCENT;

  // Los cambios de otras personas llegan por websocket y se ven al momento.
  // Algunos además suenan: un mensaje de un cliente, o que alguien mueva un
  // lead. Quién es «yo» se pasa para no sonarle a nadie por lo que acaba de
  // hacer él mismo.
  const campanita = useCampanita();
  const yo = accesos.yo?.id ?? null;
  const enVivo = useEnVivo((c) => campanita.avisar(queSuena(c, yo)));

  // Y por debajo sigue el refresco solo. No sobra: un websocket se cae en
  // silencio —wifi de hotel, laptop suspendida, proxy de oficina— y sin esto
  // la pantalla se quedaría quieta sin que nadie lo note.
  //
  // Un minuto es el peor caso que se acordó, no el ritmo esperado: con el
  // websocket andando los cambios llegan en menos de un segundo y esto no
  // llega a usarse nunca. Cada vuelta son veinte consultas a Supabase por
  // pestaña abierta, así que el número no es gratis: bajarlo a diez segundos
  // multiplicaría esa cuenta por seis sin adelantar nada mientras el
  // websocket funcione.
  useAutoRefresco(60_000);

  /**
   * Dejar anotado en qué pantalla está, para volver acá la próxima vez.
   *
   * Va en un efecto sobre `mod` y no dentro del botón de la barra lateral
   * porque al módulo se llega por varios caminos: la barra, el salto a
   * Clientes desde Programas o desde Equipos, y el clic en una notificación.
   * Anotándolo en cada uno habría que acordarse siempre; acá se anota solo,
   * venga de donde venga.
   */
  useEffect(() => recordarModulo(state.mod), [state.mod]);

  // `initial` sólo cambia de identidad cuando el servidor manda datos nuevos;
  // los re-render del navegador reusan el mismo arreglo. Sirve entonces como
  // marca honesta de cuándo llegó lo que se está viendo.
  const [refrescado, setRefrescado] = useState<number | null>(null);
  useEffect(() => setRefrescado(Date.now()), [initial]);

  const seleccionada =
    state.sel != null
      ? (oportunidades.find((o) => o.id === state.sel) ?? null)
      : null;

  const { mod } = state;

  /**
   * El rol de quien entró, para no decirle «Ventas» a un administrador.
   *
   * Sale del rol que tiene asignada su cuenta. Si las tablas de roles no
   * existen todavía no se puede saber, y entonces vale más no decir nada que
   * suponer: `esAdmin` es false en ese caso por precaución, no porque se haya
   * comprobado que la persona no lo es.
   */
  const rolActual = accesos.roles.find((r) => r.id === accesos.yo?.rolId);
  const rol =
    rolActual?.nombre ??
    (faltaMigracionAccesos ? null : accesos.esAdmin ? "Administrador" : "Ventas");

  /**
   * Si esta persona ve las oportunidades de todo el equipo.
   *
   * Es lo mismo que hace cumplir la base: administrador, o un rol con el
   * alcance puesto. Acá no decide quién ve qué —eso ya está resuelto antes de
   * que los datos lleguen— sino si tiene sentido ofrecerle mirar el tablero de
   * un asesor en particular. A quien sólo ve lo suyo, no.
   */
  const veTodoElEquipo = accesos.esAdmin || rolActual?.veTodo === true;

  /**
   * Las reservas con el plazo corriendo.
   *
   * Se calculan de las mismas oportunidades que ya están en pantalla: no hay
   * una consulta aparte de recordatorios. Eso, además de ahorrar un viaje,
   * hace que cada quien vea recordatorios sólo de sus fichas sin una línea
   * escrita para conseguirlo —la base ya le manda nada más las suyas—.
   *
   * `hoy` se fija una vez y no se recalcula en cada dibujado: el número de
   * días es información que se lee, y que cambie sola mientras alguien la mira
   * es peor que quede un rato vieja. El refresco automático la pone
   * al día.
   */
  const [hoy] = useState(() => new Date());
  const recordatorios = recordatoriosDe(oportunidades, hoy, pospuestos);
  const urgentes = paraInterrumpir(recordatorios);

  // La ventana emergente: sólo por lo de hoy y lo vencido, y una vez por día.
  const aviso = useAvisoDiario("lac.reservas.visto", urgentes.length > 0);

  return (
    <CatalogoProvider value={catalogo}>
      <SinCopiar />
      <div
        className="lac"
        style={{ minHeight: "100vh", background: T.fondo, display: "flex" }}
      >
        <Sidebar
          accent={accent}
          mod={mod}
          userEmail={userEmail}
          rol={rol}
          nombre={accesos.yo?.nombre ?? null}
          // Cuando faltan las tablas nadie es admin todavía, así que la entrada
          // se muestra igual: si no, no habría forma de leer el aviso que dice
          // cómo crearlas.
          extras={accesos.esAdmin || faltaMigracionAccesos ? [MOD_USUARIOS] : []}
          onSelect={actions.setMod}
        />

        <main style={{ flex: 1, minWidth: 0, padding: "24px 28px" }}>
          {process.env.NEXT_PUBLIC_ENTORNO === "pruebas" && (
            <p
              style={{
                margin: "0 0 16px",
                padding: "9px 14px",
                fontSize: 12.5,
                fontWeight: 600,
                borderRadius: 9,
                background: "#FFCE00",
                color: "#031B4F",
              }}
            >
              Entorno de pruebas. Lo que hagas acá no es la operación real.
            </p>
          )}

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
                {rol ?? "Sesión activa"}
              </p>
              <h1 className="dsp" style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>
                {mod}
              </h1>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <p className="mono" style={{ margin: 0, fontSize: 11.5, color: T.faint }}>
                {/* Los dados de baja no se cuentan: el pie dice con qué se está
                    trabajando ahora, no cuánta gente pasó por acá. */}
                {oportunidades.length} oportunidades ·{" "}
                {activos(catalogo.vendedores).length}{" "}
                vendedores · {catalogo.productos.length} programas
              </p>
              <Actualizado
                en={refrescado}
                accent={accent}
                enVivo={enVivo}
                onRefrescar={() => router.refresh()}
              />
              <Sonido
                encendido={campanita.encendido}
                bloqueado={campanita.bloqueado}
                accent={accent}
                onAlternar={campanita.alternar}
              />
              <RelojRecordatorios
                lista={recordatorios}
                accent={accent}
                onAbrirFicha={abrirFicha}
                onVerTodos={() => actions.setMod("Recordatorios")}
              />
              <Notificaciones accent={accent} catalogo={catalogo} onAbrirFicha={abrirFicha} />
            </div>
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
              importaciones={importaciones}
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
              onRefresh={() => router.refresh()}
            />
          )}

          {mod === "Inbox" && (
            <Inbox
              conversaciones={conversaciones}
              mensajes={mensajes}
              oportunidades={oportunidades}
              etiquetas={etiquetas}
              plantillas={plantillas.plantillas}
              faltaMigracion={faltaMigracionInbox}
              puedeResponder={puedeResponderWhatsapp}
              accent={accent}
              onRefrescar={() => router.refresh()}
              onVerCliente={(clienteId) => {
                // Las pantallas listan oportunidades, no clientes: se salta a
                // la primera de esa persona.
                const suya = oportunidades.find((o) => o.clienteId === clienteId);
                if (suya) actions.verEnClientes({}, suya.id);
                else actions.setMod("Clientes");
              }}
            />
          )}

          {mod === "Bases" && (
            <Bases
              oportunidades={oportunidades}
              importaciones={importaciones}
              faltaMigracion={faltaMigracionBases}
              esAdmin={accesos.esAdmin}
              accent={accent}
              onAbrir={(id) => actions.verEnClientes({}, id)}
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
              puedeElegirAsesor={veTodoElEquipo}
              vendedorId={state.pipeVend}
              onVendedor={actions.setPipeVend}
              importaciones={importaciones}
              filtros={state.pipeFiltros}
              onFiltro={actions.setPipeFiltro}
              onLimpiar={actions.limpiarPipeFiltros}
              menu={state.menu}
              onToggleMenu={actions.toggleMenu}
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
              esAdmin={accesos.esAdmin}
              onRefrescar={() => router.refresh()}
              onVerSinAsignar={() => actions.verEnClientes({ vendedor: SIN_DUENO })}
            />
          )}

          {mod === MOD_USUARIOS &&
            (accesos.esAdmin || faltaMigracionAccesos ? (
              <UsuariosRoles
                accesos={accesos}
                accent={accent}
                puedeCrearCuentas={puedeCrearCuentas}
                onRefresh={() => router.refresh()}
              />
            ) : (
              <p style={{ fontSize: 13, color: T.muted }}>
                Esta sección es solo para administradores.
              </p>
            ))}

          {mod === "Plantillas" && (
            <Plantillas
              estado={plantillas}
              accent={accent}
              onRefrescar={() => router.refresh()}
            />
          )}

          {mod === "Formularios" && (
            <Formularios
              formularios={formularios}
              faltaMigracion={faltaMigracionFormularios}
              esAdmin={accesos.esAdmin}
              accent={accent}
              onVerFicha={abrirFicha}
              onRefrescar={() => router.refresh()}
            />
          )}

          {mod === "Recordatorios" && (
            <Recordatorios
              lista={recordatorios}
              faltaMigracion={faltaMigracionRecordatorios}
              puedeElegirAsesor={veTodoElEquipo}
              accent={accent}
              onAbrirFicha={abrirFicha}
              onRefrescar={() => router.refresh()}
            />
          )}

          {mod === "Notificaciones" && (
            <RegistroActividad
              accent={accent}
              catalogo={catalogo}
              usuarios={accesos.usuarios}
              esAdmin={accesos.esAdmin}
              onAbrirFicha={abrirFicha}
            />
          )}

          {mod === "Programas" && (
            <Programas
              oportunidades={oportunidades}
              accent={accent}
              categoria={state.categoria}
              onCategoria={actions.setCategoria}
              onVerLeads={(productoId) => actions.verEnClientes({ producto: productoId })}
              esAdmin={accesos.esAdmin}
              onRefrescar={() => router.refresh()}
            />
          )}

          {seleccionada && (
            <ClienteDrawer
              oportunidad={seleccionada}
              todas={oportunidades}
              accent={accent}
              menu={state.menu}
              onToggleMenu={actions.toggleMenu}
              onEditar={actions.editar}
              onEditarCliente={actions.editarCliente}
              onClose={() => actions.select(null)}
            />
          )}

          {aviso.mostrar && (
            <AvisoReservas
              lista={urgentes}
              accent={accent}
              onAbrirFicha={(id) => {
                abrirFicha(id);
                aviso.cerrar();
              }}
              onCerrar={aviso.cerrar}
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
