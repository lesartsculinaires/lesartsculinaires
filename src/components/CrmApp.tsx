"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Autorizaciones } from "@/components/modules/Autorizaciones";
import { Bases } from "@/components/modules/Bases";
import { Calendario } from "@/components/modules/Calendario";
import { ClienteDrawer } from "@/components/modules/ClienteDrawer";
import { Clientes } from "@/components/modules/Clientes";
import { Dashboard } from "@/components/modules/Dashboard";
import { Equipos } from "@/components/modules/Equipos";
import { Formularios } from "@/components/modules/Formularios";
import { Envios } from "@/components/modules/Envios";
import { Inbox } from "@/components/modules/Inbox";
import { Pipeline } from "@/components/modules/Pipeline";
import { Programas } from "@/components/modules/Programas";
import { UsuariosRoles } from "@/components/modules/UsuariosRoles";
import { AvisoReservas } from "@/components/AvisoReservas";
import { Llamada } from "@/components/Llamada";
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
import { useLlamadaEnVivo } from "@/hooks/useLlamadaEnVivo";
import { avisosDeLaBarra } from "@/lib/avisos";
import { queSuena } from "@/lib/aviso";
import type { Formulario as FormularioDeFeria } from "@/lib/formularios";
import { paraInterrumpir, recordatoriosDe } from "@/lib/recordatorios";
import {
  hoyEnSalvador,
  pendientesDe,
  seguimientosParaInterrumpir,
  type Seguimiento,
} from "@/lib/seguimientos";
import { CatalogoProvider } from "@/lib/catalog";
import { MOD_USUARIOS, MODULOS, modulosPermitidos } from "@/lib/modulos";
import { MOD_BASES, MOD_FORMULARIOS, permisosDeModulo } from "@/lib/permisos";
import { ACCENT, T } from "@/lib/theme";
import { recordarModulo } from "@/lib/ultimoModulo";
import type { EstadoPlantillas } from "@/app/plantillas-actions";
import type { Envio } from "@/lib/supabase/envios";
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
  /** False cuando el servidor no tiene las llamadas de WhatsApp configuradas. */
  puedeLlamarPorWhatsapp: boolean;
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
  /** Los seguimientos que salieron de las notas, todavía pendientes. */
  seguimientos: Seguimiento[];
  /** La tabla de seguimientos todavía no existe. */
  faltaMigracionSeguimientos: boolean;
  /** Pedidos de autorización sin resolver, para el globito de la barra. */
  autorizacionesPendientes: number;
  /** Movimientos del equipo sin mirar, para el globito de Notificaciones. */
  actividadSinVer: number;
  /** Los formularios de feria, con sus preguntas. */
  formularios: FormularioDeFeria[];
  /** Las tablas de formularios todavía no existen. */
  faltaMigracionFormularios: boolean;
  /** Los envíos masivos, con sus resultados ya contados. */
  envios: Envio[];
  /** Las tablas de envíos todavía no existen. */
  faltaMigracionEnvios: boolean;
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
  puedeLlamarPorWhatsapp,
  userEmail,
  accesos,
  etiquetas,
  plantillas,
  faltaMigracionAccesos,
  puedeCrearCuentas,
  pospuestos,
  faltaMigracionRecordatorios,
  seguimientos,
  faltaMigracionSeguimientos,
  autorizacionesPendientes,
  actividadSinVer,
  formularios,
  faltaMigracionFormularios,
  envios,
  faltaMigracionEnvios,
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

  /*
   * Las llamadas van por su propio canal y no por el de arriba.
   *
   * El de arriba termina en `router.refresh()` con cada aviso, y un refresco
   * en el medio de una frase la corta: es justo lo que la escuela pidió que no
   * pasara. Éste no refresca nada —lee la fila del aviso y la deja en un
   * estado local—, así que lo que se está escribiendo no se entera.
   */
  const llamadas = useLlamadaEnVivo();
  /*
   * El pedido de llamar, con un número que SÓLO SUBE.
   *
   * El número no es decorado: es lo que distingue «llamar otra vez al mismo
   * hilo» de «el mismo pedido dibujándose de nuevo». Si se reiniciara al
   * atenderlo, el segundo intento después de un error de permiso volvería a
   * valer 1, el componente lo reconocería como el que ya hizo, y el botón
   * parecería roto justo cuando la persona está reintentando.
   */
  const [pedidoDeLlamada, setPedidoDeLlamada] = useState<{
    conversacionId: number;
    n: number;
  } | null>(null);
  const cuantasVecesPidio = useRef(0);

  /*
   * El hilo que hay que abrir en la bandeja, pedido desde otra pantalla.
   *
   * Hoy lo pide «Ver el chat» de la tarjeta de llamada. Antes ese botón sólo
   * cambiaba de módulo y dejaba la bandeja sin conversación elegida: quien
   * atendía una llamada llegaba a una lista de cien hilos y tenía que buscar
   * el del cliente que tenía en la oreja.
   *
   * El número sube en cada pedido para que abrir el mismo hilo dos veces
   * seguidas vuelva a abrirlo, aunque en el medio la persona lo haya cerrado.
   */
  const [hiloAAbrir, setHiloAAbrir] = useState<{ conversacionId: number; n: number } | null>(null);
  const cuantosHilosPidio = useRef(0);
  const abrirElHilo = useCallback((conversacionId: number) => {
    cuantosHilosPidio.current += 1;
    setHiloAAbrir({ conversacionId, n: cuantosHilosPidio.current });
    actions.setMod("Inbox");
  }, [actions]);

  /*
   * El repique. Suena sólo cuando la llamada está sonando de verdad y esta
   * pantalla la está mostrando: si sonara con la tarjeta de la esquina de
   * alguien que ya la vio atender, el equipo escucharía teléfonos fantasma.
   */
  const suena = llamadas.llamada?.estado === "sonando";
  const repicar = campanita.repicar;
  useEffect(() => {
    repicar(Boolean(suena));
    return () => repicar(false);
  }, [suena, repicar]);

  /** El hilo de la llamada, para saber de quién es y cómo se llama quien llama. */
  const hiloDeLaLlamada =
    llamadas.llamada?.conversacionId == null
      ? null
      : (conversaciones.find((c) => c.id === llamadas.llamada!.conversacionId) ?? null);

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
   * Las oportunidades que se muestran en los tableros.
   *
   * Casi siempre son todas las que llegaron, porque la base ya devolvió las
   * que esta persona puede ver. La excepción es el rol que ve todos los
   * clientes pero trabaja su propio tablero: ahí se filtra acá, y sólo acá,
   * para que Clientes las siga listando enteras.
   *
   * Vale para el Dashboard Y para el Pipeline, y eso no es un detalle: antes
   * el Pipeline lo usaba y el Dashboard no, así que un rol que sólo trabaja lo
   * suyo veía su embudo en el Pipeline y los números de TODO EL EQUIPO en el
   * tablero. Dos pantallas del mismo CRM contestando distinto a la misma
   * pregunta —«¿cómo voy?»— y ninguna de las dos diciendo cuál era cuál.
   *
   * Si la persona no tiene ficha de vendedor no se filtra nada. Filtrar contra
   * un vendedor que no existe dejaría el tablero vacío sin explicación, y un
   * tablero vacío se lee como «se perdieron los leads».
   */
  const delTablero = useMemo(() => {
    const soloMios = rolActual?.pipelineSoloPropios === true;
    const yo = accesos.yo?.vendedorId ?? null;
    if (!soloMios || yo == null) return oportunidades;
    return oportunidades.filter((o) => o.vendedorId === yo);
  }, [oportunidades, rolActual, accesos.yo]);

  /**
   * Los módulos que esta persona tiene en la barra.
   *
   * Sale de lo que dirección marcó en Usuarios y Roles. Ojo con lo que esto
   * es y lo que no: ordena la pantalla, no protege los datos. Quién puede ver
   * qué información lo siguen decidiendo las políticas de la base, que no se
   * enteran de esta lista. Sirve para que una asesora no tenga a la vista seis
   * pantallas que no usa.
   */
  const permitidos = useMemo(
    () =>
      modulosPermitidos(
        [...MODULOS, ...(accesos.esAdmin || faltaMigracionAccesos ? [MOD_USUARIOS] : [])],
        accesos.modulos,
        accesos.permisos,
        accesos.yo?.rolId ?? null,
        accesos.esAdmin,
      ),
    [accesos, faltaMigracionAccesos],
  );

  /*
   * Qué se puede hacer en Bases: subir una, y abrir una para ver qué trajo.
   *
   * Sale de las casillas «crear» y «editar» del rol, las mismas que dibuja
   * Usuarios y Roles. Va acá arriba y no dentro del módulo porque el botón de
   * subir está en dos pantallas —Bases y Clientes— y las dos tienen que
   * respetar la misma decisión; calcularlo dos veces sería tenerlo mal en una.
   *
   * Como todo lo de esta pantalla, ordena la vista y no protege nada: quien
   * manda es `public.puede()` en la base, que decide aunque nadie mire.
   */
  const casillas = useMemo(() => {
    const rolId = accesos.yo?.rolId ?? null;
    const de = (modulo: string) =>
      permisosDeModulo(accesos.permisos, rolId, accesos.esAdmin, modulo);
    return { bases: de(MOD_BASES), formularios: de(MOD_FORMULARIOS) };
  }, [accesos]);

  /*
   * Si la pantalla abierta ya no está permitida, se cae a la primera que sí.
   *
   * Pasa de verdad: dirección destilda un módulo mientras alguien lo tiene
   * abierto, y en el siguiente refresco esa persona se queda mirando una
   * pantalla que su barra ya no ofrece, sin forma de volver salvo recargando.
   */
  useEffect(() => {
    if (permitidos.length === 0) return;
    if (!permitidos.includes(mod)) actions.setMod(permitidos[0]);
  }, [permitidos, mod, actions]);

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

  /**
   * Los seguimientos que salieron de las notas.
   *
   * Estos sí vienen de una consulta aparte —son filas propias, no una lectura
   * de las oportunidades—, pero el reparto funciona igual: la vista respeta la
   * política de la ficha, así que a cada quien le llegan nada más los suyos.
   *
   * El día se toma en la hora de El Salvador y no en la del servidor: Netlify
   * trabaja en UTC, y a las siete de la tarde allá ya es mañana. Sin esto,
   * media tarde de cada día los recordatorios de hoy se leerían como vencidos.
   */
  /**
   * Los números rojos de la barra lateral.
   *
   * Se cuentan los mensajes sin leer, no los hilos: dos hilos con cinco
   * mensajes cada uno son diez cosas por leer, y un «2» ahí haría creer que
   * son dos. Es el mismo criterio que ya usa cada fila de la bandeja.
   *
   * Las archivadas no cuentan. Archivar es decir «esto ya no me ocupa», y un
   * número que sigue contando lo archivado obliga a archivar y además entrar a
   * marcar leído para que baje.
   */
  /*
   * Las silenciadas no cuentan.
   *
   * Silenciar es «esto sigue vivo pero no me apura»: el proveedor que manda
   * cinco mensajes por semana, el grupo de una vez. Archivarlo lo escondería,
   * y no es que sobre. Si igual sumara al número rojo, silenciar no serviría
   * para nada, que es lo único que se le pide.
   */
  const sinLeer = conversaciones
    .filter((c) => !c.archivada && !c.silenciada)
    .reduce((s, c) => s + (c.sinLeer ?? 0), 0);

  const pendientes = pendientesDe(seguimientos, hoyEnSalvador(hoy));

  /*
   * Los números rojos de la barra, todos juntos.
   *
   * Qué se cuenta y por qué está en `@/lib/avisos`, aparte de esta pantalla:
   * es una regla —«lo que está sin atender y vence hoy o ya venció»— y las
   * reglas se prueban mejor solas que a través de un navegador.
   */
  const avisos = avisosDeLaBarra({
    mensajesSinLeer: sinLeer,
    reservasUrgentes: urgentes,
    seguimientos: pendientes,
    autorizacionesPendientes,
    // Se apaga solo al abrir el módulo: `Notificaciones` marca lo visto, y el
    // próximo refresco de la pantalla trae el número ya en cero.
    actividadSinVer: mod === "Notificaciones" ? 0 : actividadSinVer,
  });
  const llamadasDeHoy = seguimientosParaInterrumpir(pendientes);

  // La ventana emergente: sólo por lo de hoy y lo vencido, y una vez por día.
  const aviso = useAvisoDiario(
    "lac.reservas.visto",
    urgentes.length > 0 || llamadasDeHoy.length > 0,
  );

  return (
    <CatalogoProvider value={catalogo}>
      <SinCopiar />

      {/*
        La llamada, encima de todo y fuera de cualquier pantalla.

        Va acá y no dentro de la bandeja a propósito: una llamada entra
        mientras alguien está en el Pipeline, en una ficha o en el Dashboard, y
        metida en la bandeja sólo la vería quien ya estaba mirando la bandeja
        —que es justamente quien menos falta le hace—.
      */}
      <Llamada
        llamada={llamadas.llamada}
        yo={{ usuarioId: accesos.yo?.id ?? null, vendedorId: accesos.yo?.vendedorId ?? null }}
        nombreDeQuienLlama={
          hiloDeLaLlamada?.nombrePerfil ??
          (hiloDeLaLlamada?.telefono ? `+${hiloDeLaLlamada.telefono}` : null)
        }
        nombreDelDueno={
          // El catálogo de asesoras sí lo ve todo el equipo, así que el dueño
          // de la llamada se puede nombrar aunque el hilo no se pueda ver.
          catalogo.vendedores.find((v) => v.id === llamadas.llamada?.vendedorId)?.nombre ?? null
        }
        haciendo={{ tecleoHaceMs: llamadas.tecleoHaceMs, arrastrando: llamadas.arrastrando }}
        pedido={pedidoDeLlamada}
        accent={accent}
        onSoltar={llamadas.soltar}
        onPoner={llamadas.poner}
        onVerHilo={abrirElHilo}
      />
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
          modulos={permitidos}
          avisos={avisos}
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
                ajustes={campanita.ajustes}
                onAlternar={campanita.alternar}
                onAjustar={campanita.cambiarAjuste}
              />
              <RelojRecordatorios
                lista={recordatorios}
                seguimientos={pendientes}
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
            <Dashboard oportunidades={delTablero} accent={accent} />
          )}

          {mod === "Clientes" && (
            <Clientes
              oportunidades={oportunidades}
              importaciones={importaciones}
              esAdmin={accesos.esAdmin}
              puedeSubirBases={casillas.bases.crear}
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
              plantillas={plantillas.plantillas}
            />
          )}

          {mod === "Envíos" && (
            <Envios
              envios={envios}
              faltaMigracion={faltaMigracionEnvios}
              accent={accent}
              onRefrescar={() => router.refresh()}
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
              abrirHilo={hiloAAbrir}
              onLlamar={
                puedeLlamarPorWhatsapp
                  ? (conversacionId) => {
                      cuantasVecesPidio.current += 1;
                      setPedidoDeLlamada({ conversacionId, n: cuantasVecesPidio.current });
                    }
                  : null
              }
              accent={accent}
              onRefrescar={() => router.refresh()}
              onVerCliente={(clienteId) => {
                /*
                 * La ficha se abre encima de la bandeja, sin irse a Clientes.
                 *
                 * Antes esto saltaba de pantalla. Quien está atendiendo un
                 * chat abre la ficha para mirar un dato —qué programa quería,
                 * cuánto le cotizaron— y tiene que volver a contestar: el
                 * salto le costaba perder el hilo abierto y buscarlo otra vez
                 * entre todos.
                 *
                 * La ficha se dibuja fuera de todos los módulos, así que
                 * alcanza con marcar cuál está abierta. Es lo mismo que ya se
                 * hizo en el Pipeline.
                 *
                 * Las pantallas listan oportunidades, no clientes, así que se
                 * abre la primera de esa persona. Si no tiene ninguna no hay
                 * ficha que mostrar, y ahí sí se va a Clientes, que es donde
                 * se le puede crear una.
                 */
                const suya = oportunidades.find((o) => o.clienteId === clienteId);
                if (suya) actions.select(suya.id);
                else actions.setMod("Clientes");
              }}
            />
          )}

          {mod === "Bases" && (
            <Bases
              oportunidades={oportunidades}
              importaciones={importaciones}
              faltaMigracion={faltaMigracionBases}
              puedeAbrir={casillas.bases.editar}
              puedeSubir={casillas.bases.crear}
              esAdmin={accesos.esAdmin}
              accent={accent}
              onAbrir={(id) => actions.verEnClientes({}, id)}
              onRefrescar={() => router.refresh()}
            />
          )}

          {mod === "Pipeline" && (
            <Pipeline
              oportunidades={delTablero}
              accent={accent}
              drag={state.drag}
              over={state.over}
              onSetDrag={actions.setDrag}
              onSetOver={actions.setOver}
              onEditar={actions.editar}
              /*
               * La ficha se abre encima del tablero, sin irse a Clientes.
               *
               * Antes esto llamaba a `verEnClientes`, que cambia de pantalla.
               * Quien está trabajando el embudo abre una ficha para mirar un
               * dato y seguir moviendo tarjetas, y el salto le costaba dos
               * pasos cada vez: volver a Pipeline y reencontrar dónde estaba
               * —con la columna desplazada y el asesor elegido perdido—.
               *
               * `select` solo marca cuál está abierta. La ficha se dibuja
               * fuera de todos los módulos, así que aparece igual y el tablero
               * queda atrás, intacto.
               */
              onOpen={actions.select}
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
              puedeCrear={casillas.formularios.crear}
              puedeEditar={casillas.formularios.editar}
              accent={accent}
              onVerFicha={abrirFicha}
              onRefrescar={() => router.refresh()}
            />
          )}

          {mod === "Recordatorios" && (
            <Recordatorios
              lista={recordatorios}
              seguimientos={pendientes}
              faltaMigracion={faltaMigracionRecordatorios}
              faltaMigracionSeguimientos={faltaMigracionSeguimientos}
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

          {mod === "Autorizaciones" && (
            <Autorizaciones
              accent={accent}
              esAdmin={accesos.esAdmin}
              onAbrirFicha={abrirFicha}
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
              // Saltar de un lead al otro de la misma persona sin cerrar la
              // ficha: es lo que se hace apenas se ve que hay otro.
              onIrALead={(id) => actions.select(id)}
            />
          )}

          {aviso.mostrar && (
            <AvisoReservas
              lista={urgentes}
              seguimientos={llamadasDeHoy}
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
