import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import CrmApp from "@/components/CrmApp";
import { MODULOS, MOD_CANALES, MOD_USUARIOS } from "@/lib/modulos";
import { puedeVerCanales } from "@/lib/permisos";
import { COOKIE_MODULO, moduloInicial } from "@/lib/ultimoModulo";
import { hayServiceRole } from "@/lib/supabase/admin";
import { fetchAccesos } from "@/lib/supabase/accesos";
import { fetchEnvios } from "@/lib/supabase/envios";
import { fetchInbox } from "@/lib/supabase/inbox";
import { canalesListos, salidaDisponible } from "@/app/inbox-actions";
import { llamadasDisponibles } from "@/app/llamadas-actions";
import { listarEtiquetas } from "@/app/etiquetas-actions";
import { estadoPlantillas } from "@/app/plantillas-actions";
import { contarActividadSinVer } from "@/app/actividad-actions";
import { contarAutorizacionesPendientes } from "@/app/autorizaciones-actions";
import { fetchImportaciones } from "@/lib/supabase/bases";
import { fetchPospuestos } from "@/lib/supabase/recordatorios";
import { fetchSeguimientos } from "@/lib/supabase/seguimientos";
import { fetchFormularios } from "@/lib/supabase/formularios";
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

  const [ops, catalogo, eventos, accesos, bases, inbox, etiquetas, plantillas, pospuestos, formularios, seguimientos, envios] =
    await Promise.all([
      fetchOportunidades(),
      fetchCatalogo(),
      fetchEventos(),
      fetchAccesos(user.id),
      fetchImportaciones(),
      fetchInbox(),
      listarEtiquetas(),
      estadoPlantillas(),
      fetchPospuestos(),
      fetchFormularios(),
      fetchSeguimientos(),
      fetchEnvios(),
    ]);

  // Para el globito de la barra. Va suelto y no dentro del `Promise.all`
  // de arriba porque ese arreglo se desestructura por posición, y meter
  // uno en el medio corre todos los demás.
  const autorizacionesPendientes = await contarAutorizacionesPendientes();
  const actividadSinVer = await contarActividadSinVer();

  const puedeResponder = await salidaDisponible();
  const conectados = await canalesListos();
  // Las llamadas usan el mismo token que los mensajes, pero se preguntan
  // aparte: puede haber token y no estar habilitadas las llamadas para el
  // número, y ahí el botón no tiene que aparecer.
  const puedeLlamar = await llamadasDisponibles();

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
    guardado: (await cookies()).get(COOKIE_MODULO)?.value,
    pidePanelAdmin: mod === "admin",
    permitidos,
    panelAdmin: MOD_USUARIOS,
    // `?mod=Canales` es por donde vuelve el diálogo de Meta. Ver `moduloInicial`.
    pedido: mod,
  });

  return (
    <CrmApp
      oportunidades={ops.data}
      catalogo={catalogo.data}
      eventos={eventos.data}
      autorizacionesPendientes={autorizacionesPendientes}
      actividadSinVer={actividadSinVer}
      importaciones={bases.data}
      faltaMigracionBases={bases.faltaMigracion}
      conversaciones={inbox.conversaciones}
      mensajes={inbox.mensajes}
      faltaMigracionInbox={inbox.faltaMigracion}
      puedeResponderWhatsapp={puedeResponder}
      canalesConectados={conectados}
      puedeLlamarPorWhatsapp={puedeLlamar}
      userEmail={user.email ?? ""}
      accesos={accesos.data}
      etiquetas={etiquetas.etiquetas}
      plantillas={plantillas}
      faltaMigracionAccesos={accesos.faltaMigracion}
      pospuestos={pospuestos.data}
      faltaMigracionRecordatorios={pospuestos.faltaMigracion}
      seguimientos={seguimientos.data}
      faltaMigracionSeguimientos={seguimientos.faltaMigracion}
      formularios={formularios.data}
      faltaMigracionFormularios={formularios.faltaMigracion}
      envios={envios.envios}
      faltaMigracionEnvios={envios.faltaMigracion}
      puedeCrearCuentas={hayServiceRole()}
      modInicial={modulo}
      loadError={loadError}
    />
  );
}
