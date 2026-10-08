import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import CrmApp from "@/components/CrmApp";
import { MODULOS, MOD_CANALES, MOD_POR_OMISION, MOD_USUARIOS } from "@/lib/modulos";
import { puedeVerCanales } from "@/lib/permisos";
import { COOKIE_MODULO, moduloInicial, pantallaProbable } from "@/lib/ultimoModulo";
import { hayServiceRole } from "@/lib/supabase/admin";
import { fetchAccesos } from "@/lib/supabase/accesos";
import { contarSinLeer } from "@/lib/supabase/inbox";
import { canalesListos, salidaDisponible } from "@/app/inbox-actions";
import { llamadasDisponibles } from "@/app/llamadas-actions";
import { contarActividadSinVer } from "@/app/actividad-actions";
import { contarAutorizacionesPendientes } from "@/app/autorizaciones-actions";
import { queSeNecesita } from "@/lib/datosDelModulo";
import { traerConjuntos } from "@/lib/supabase/conjuntos";
import { fetchPospuestos } from "@/lib/supabase/recordatorios";
import { fetchSeguimientos } from "@/lib/supabase/seguimientos";
import {
  fetchCatalogo,
  fetchEventos,
  fetchOportunidades,
} from "@/lib/supabase/queries";
import { quienEs } from "@/lib/supabase/server";

/**
 * Cuando no se pudo confirmar la sesión —y no cuando no la hay—.
 *
 * Lo importante es lo que NO hace: no manda al login. Quien ve esto tiene su
 * sesión abierta y lo único que pasó es que la base no contestó a tiempo.
 * Recargar suele alcanzar, y si no, en un minuto la base ya despertó.
 */
function NoSePudoConfirmar() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#031B4F",
        background: "#F4F6FB",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center", lineHeight: 1.55 }}>
        <h1 style={{ fontSize: 20, marginBottom: 10 }}>No pudimos confirmar tu sesión</h1>
        <p style={{ fontSize: 14, color: "#4C5A7A", marginBottom: 18 }}>
          Tu sesión sigue abierta: lo que pasó es que la base tardó en responder.
          No hace falta que vuelvas a entrar.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "9px 18px",
            borderRadius: 6,
            background: "#031B4F",
            color: "#fff",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Reintentar
        </a>
      </div>
    </main>
  );
}

/** Operational view — always read fresh, never cached. */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string }>;
}) {
  const { mod } = await searchParams;

  /*
   * ==========================================================================
   * ECHAR A ALGUIEN AL LOGIN SÓLO CUANDO DE VERDAD NO HAY SESIÓN
   * ==========================================================================
   *
   * Acá decía `const user = await getUser(); if (!user) redirect("/login")`, y
   * eso tiraba al login a gente que estaba trabajando, con la sesión intacta.
   *
   * Porque `getUser()` contesta `null` por dos motivos distintos —no hay
   * sesión, o Supabase no contestó en tres segundos— y este `if` los trataba
   * igual. El 6 y el 7 de octubre de 2026 las dos asesoras que más usan el CRM
   * tuvieron que volver a entrar veinte y trece veces en un día; tres de esas
   * veces en dos minutos, con tokens recién emitidos. No era vencimiento: era
   * la pantalla echándolas porque la base venía lenta.
   *
   * Y la prueba de que la sesión seguía viva es que el login les decía «ya
   * tenés una sesión abierta como …».
   *
   * Ahora:
   *
   *   HAY RESPUESTA Y NO HAY SESIÓN  →  al login, como siempre.
   *   NO HUBO RESPUESTA              →  se reintenta una vez, y si tampoco,
   *                                     se muestra una pantalla que dice qué
   *                                     pasó y ofrece reintentar. NUNCA el
   *                                     login: pedir la contraseña para volver
   *                                     adonde ya estaba es el peor final.
   *
   * El reintento no es un parche por si acaso: la primera pregunta es la que
   * despierta la conexión, y la segunda sale sobre algo ya caliente. Cuesta
   * unos segundos en el caso malo y evita perder el trabajo. Vive dentro de
   * `quienEs()`, para que lo tengan también los treinta y dos lugares que
   * preguntan quién es desde una acción del servidor.
   */
  const { user, respondio } = await quienEs();

  if (!user && respondio) redirect("/login");
  if (!user) return <NoSePudoConfirmar />;

  /*
   * ==========================================================================
   * TODO LO QUE HACE FALTA, DE UNA SOLA VEZ Y SÓLO LO QUE HACE FALTA
   * ==========================================================================
   *
   * Acá había doce cargas y cinco `await` en fila, y entre todas pedían
   * VEINTINUEVE consultas antes de pintar nada —medidas en el banco—: la
   * bandeja con sus mensajes, los envíos con sus destinatarios, los
   * formularios con sus preguntas y sus respuestas, las plantillas, las
   * bases, las etiquetas… las mirara o no la pantalla que se iba a ver.
   *
   * Y no pasaba una vez al entrar: pasaba en cada vuelta del refresco
   * automático, con cada aviso del websocket y al final de CADA acción del
   * servidor, porque todas terminan en `revalidatePath("/")` y vuelven a
   * armar esto entero. Medido en producción el 8 de octubre de 2026: 14.000
   * peticiones en una hora con cuatro personas trabajando; a las 14:00 el p95
   * era de 489 ms y a las 18:00, con las mismas 14.000, de 4.365.
   *
   * Ahora son dieciocho en el Dashboard, y la pantalla que las necesita paga
   * las suyas.
   *
   * --------------------------------------------------------------------------
   * LO QUE SE CARGA SIEMPRE, Y POR QUÉ CADA UNO
   * --------------------------------------------------------------------------
   *
   *   oportunidades  el contador del encabezado, la ficha del cliente, los
   *                  avisos de reservas y de agenda, y nueve de las quince
   *                  pantallas.
   *   catálogo       lo reparte `CatalogoProvider` a todo el árbol.
   *   accesos        la barra lateral y los permisos de cada módulo.
   *   eventos        el aviso de agenda, que salta esté donde esté.
   *   seguimientos   el reloj de recordatorios del encabezado.
   *   pospuestos     lo mismo: qué recordatorios no mostrar.
   *   los globitos   los números rojos de la barra, que se ven en todas.
   *
   * --------------------------------------------------------------------------
   * Y TODO EN UNA SOLA TANDA, QUE NO ES UN DETALLE
   * --------------------------------------------------------------------------
   *
   * Nada de esto depende de nada de esto, así que esperar a que vuelva uno
   * para salir a buscar el siguiente no lo pedía nadie. Encadenado, cada etapa
   * suma su propia espera: medido en el banco con la base a cinco segundos por
   * consulta, la bandeja pasaba de contestar a no contestar NUNCA —se cortó la
   * medición al minuto—.
   *
   * Por eso los datos de la pantalla se piden ACÁ y no después de resolver con
   * qué pantalla se abre: resolverlo necesita los accesos, y eso volvería a
   * encadenar. `pantallaProbable` contesta lo mismo mirando nada más la
   * galleta y la dirección; si le erra, el navegador pide lo que falte.
   *
   * El orden del arreglo importa, porque se desestructura por posición: meter
   * uno en el medio corre todos los demás.
   */
  const galleta = (await cookies()).get(COOKIE_MODULO)?.value;
  const necesarios = queSeNecesita(pantallaProbable(mod, galleta, MOD_POR_OMISION));

  const [
    ops,
    catalogo,
    eventos,
    accesos,
    pospuestos,
    seguimientos,
    servidos,
    autorizacionesPendientes,
    actividadSinVer,
    mensajesSinLeer,
    puedeResponder,
    conectados,
    puedeLlamar,
  ] = await Promise.all([
    fetchOportunidades(),
    fetchCatalogo(),
    fetchEventos(),
    fetchAccesos(user.id),
    fetchPospuestos(),
    fetchSeguimientos(),
    traerConjuntos(necesarios),
    contarAutorizacionesPendientes(),
    contarActividadSinVer(),
    /*
     * El número rojo de la bandeja se cuenta acá y no se saca de la bandeja.
     *
     * Se ve en todas las pantallas, pero la bandeja entera sólo se carga en
     * una. `contarSinLeer()` pide nada más los hilos que tienen algo sin leer,
     * y de ellos una sola columna, en vez de los cuatro mil mensajes con su
     * texto que hacían falta para sumar lo mismo.
     */
    contarSinLeer(),
    salidaDisponible(),
    canalesListos(),
    /*
     * Las llamadas se preguntan aparte de los mensajes aunque usen el mismo
     * token: puede haber token y no estar habilitadas las llamadas para el
     * número, y ahí el botón no tiene que aparecer.
     */
    llamadasDisponibles(),
  ]);

  const loadError = ops.error ?? catalogo.error ?? eventos.error;

  /**
   * Con qué pantalla abrir: la última donde estuvo esta persona.
   *
   * Se resuelve acá, en el servidor, para que lo primero que se pinte ya sea
   * la pantalla buena y no haya un salto desde Dashboard en cada recarga.
   *
   * La pantalla de administración entra en la lista sólo si la cuenta
   * realmente lo es. Vale para las dos puertas: ni la cookie ni el parámetro
   * de la URL pueden conceder lo que el rol no concede.
   */
  const puedeAdministrar = accesos.data.esAdmin || accesos.faltaMigracion;
  /*
   * Canales no va con «es dirección» sino con su casilla, igual que en la
   * pantalla: es lo que deja existir un rol que SÓLO entra a conectar una
   * cuenta de Meta. Las dos mitades tienen que decir lo mismo, o `?mod=Canales`
   * llevaría a una pantalla que después no se dibuja.
   */
  const verCanales = puedeVerCanales(
    accesos.data.permisos,
    accesos.data.yo?.rolId ?? null,
    accesos.data.esAdmin,
  );
  const permitidos = [
    ...MODULOS,
    ...(puedeAdministrar ? [MOD_USUARIOS] : []),
    ...(verCanales ? [MOD_CANALES] : []),
  ];
  const modulo = moduloInicial({
    guardado: galleta,
    pidePanelAdmin: mod === "admin",
    permitidos,
    panelAdmin: MOD_USUARIOS,
    // `?mod=Canales` es por donde vuelve el diálogo de Meta. Ver `moduloInicial`.
    pedido: mod,
  });

  /*
   * Se manda la lista de lo servido, y no se deja que el navegador la deduzca
   * de los datos.
   *
   * Un conjunto que llegó VACÍO —la escuela todavía no tiene formularios— no
   * se distingue mirando los datos de uno que no se pidió. Sin esa
   * distinción, una bandeja sin hilos se leería como «falta cargarla» y se
   * pediría de nuevo en cada dibujado, para siempre.
   */
  return (
    <CrmApp
      oportunidades={ops.data}
      catalogo={catalogo.data}
      eventos={eventos.data}
      autorizacionesPendientes={autorizacionesPendientes}
      actividadSinVer={actividadSinVer}
      mensajesSinLeer={mensajesSinLeer}
      puedeResponderWhatsapp={puedeResponder}
      canalesConectados={conectados}
      puedeLlamarPorWhatsapp={puedeLlamar}
      userEmail={user.email ?? ""}
      accesos={accesos.data}
      faltaMigracionAccesos={accesos.faltaMigracion}
      pospuestos={pospuestos.data}
      faltaMigracionRecordatorios={pospuestos.faltaMigracion}
      seguimientos={seguimientos.data}
      faltaMigracionSeguimientos={seguimientos.faltaMigracion}
      perezosos={servidos}
      conjuntosServidos={necesarios}
      puedeCrearCuentas={hayServiceRole()}
      modInicial={modulo}
      loadError={loadError}
    />
  );
}
