import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import CrmApp from "@/components/CrmApp";
import { MODULOS, MOD_USUARIOS } from "@/lib/modulos";
import { COOKIE_MODULO, moduloInicial } from "@/lib/ultimoModulo";
import { hayServiceRole } from "@/lib/supabase/admin";
import { fetchAccesos } from "@/lib/supabase/accesos";
import { fetchInbox } from "@/lib/supabase/inbox";
import { salidaDisponible } from "@/app/inbox-actions";
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
import { getUser } from "@/lib/supabase/server";

/** Operational view — always read fresh, never cached. */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string }>;
}) {
  const { mod } = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login");

  const [ops, catalogo, eventos, accesos, bases, inbox, etiquetas, plantillas, pospuestos, formularios, seguimientos] =
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
    ]);

  // Para el globito de la barra. Va suelto y no dentro del `Promise.all`
  // de arriba porque ese arreglo se desestructura por posición, y meter
  // uno en el medio corre todos los demás.
  const autorizacionesPendientes = await contarAutorizacionesPendientes();
  const actividadSinVer = await contarActividadSinVer();

  const puedeResponder = await salidaDisponible();

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
  const permitidos = puedeAdministrar ? [...MODULOS, MOD_USUARIOS] : MODULOS;
  const modulo = moduloInicial({
    guardado: (await cookies()).get(COOKIE_MODULO)?.value,
    pidePanelAdmin: mod === "admin",
    permitidos,
    panelAdmin: MOD_USUARIOS,
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
      puedeCrearCuentas={hayServiceRole()}
      modInicial={modulo}
      loadError={loadError}
    />
  );
}
