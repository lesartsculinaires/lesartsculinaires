"use server";

import { revalidatePath } from "next/cache";

import { APP_ID, CONFIG_ID } from "@/lib/meta/conectar";
import {
  credencialesConectadas,
  desconectar,
  type CanalConectable,
  type CredencialVisible,
} from "@/lib/meta/credenciales";
import { hayInstagram } from "@/lib/instagram/enviar";
import { hayMessenger } from "@/lib/messenger/enviar";
import { hayWhatsapp } from "@/lib/whatsapp/enviar";
import { puedeEnModulo } from "@/lib/crm/permisoDeModulo";
import { getServerClient, getUser } from "@/lib/supabase/server";

/**
 * Qué canales están conectados y con qué cuenta.
 *
 * ============================================================================
 * ACÁ NO VIAJA NINGÚN TOKEN
 * ============================================================================
 *
 * Esta pantalla existe para administrar credenciales, así que es justo donde
 * más fácil sería filtrarlas: basta con devolver la fila entera «para mostrar
 * el estado». Un token que llega al navegador queda en la memoria de esa
 * pestaña, en las herramientas de desarrollo y en cualquier extensión
 * instalada.
 *
 * Por eso lo que se devuelve es `CredencialVisible`, que no tiene el campo, y
 * la consulta de abajo nombra las columnas una por una. Agregar mañana una
 * columna secreta a la tabla no la publica sola.
 */

export interface EstadoDeCanal {
  canal: "whatsapp" | CanalConectable;
  /** Está configurado con las variables del servidor, como siempre. */
  porVariables: boolean;
  /** Las cuentas conectadas desde esta pantalla. */
  conectadas: CredencialVisible[];
}

export interface EstadoCanales {
  ok: boolean;
  error: string | null;
  canales: EstadoDeCanal[];
  /** Si se puede ofrecer el botón de conectar, o falta configurar la app. */
  sePuedeConectar: boolean;
  /** Qué falta, cuando falta. */
  queFalta: string | null;
}

const VACIO: EstadoCanales = {
  ok: false,
  error: null,
  canales: [],
  sePuedeConectar: false,
  queFalta: null,
};

/**
 * Quién puede, y por qué no es «es dirección».
 *
 * `puedeEnModulo` contesta que sí a dirección y, al resto, sólo con la casilla
 * marcada: sin fila, NO. Esa orientación es la que corresponde acá —son las
 * llaves con las que se le escribe a los clientes— y es la que permite que
 * exista un rol «Revisor» que entra sólo a conectar su cuenta de Instagram para
 * que Meta pueda aprobar la aplicación.
 *
 * `ver` para mirar el estado, `eliminar` para desconectar. Son distintas a
 * propósito: desconectar la cuenta de la escuela corta la mensajería, y eso no
 * tiene por qué venir de regalo con mirar.
 */
async function puede(accion: "ver" | "crear" | "eliminar"): Promise<boolean> {
  const supabase = await getServerClient();
  if (!supabase) return false;
  return puedeEnModulo(supabase, "canales", accion);
}

export async function estadoDeCanales(): Promise<EstadoCanales> {
  const usuario = await getUser();
  if (!usuario) return { ...VACIO, error: "Sesión no válida." };
  if (!(await puede("ver"))) {
    return { ...VACIO, error: "No tenés permiso para ver las conexiones de los canales." };
  }

  const conectadas = await credencialesConectadas();
  const suyas = (c: CanalConectable) => conectadas.filter((x) => x.canal === c);

  const falta: string[] = [];
  if (!APP_ID) falta.push("NEXT_PUBLIC_FACEBOOK_APP_ID");
  if (!CONFIG_ID) falta.push("NEXT_PUBLIC_FACEBOOK_CONFIG_ID");

  return {
    ok: true,
    error: null,
    canales: [
      { canal: "whatsapp", porVariables: hayWhatsapp(), conectadas: [] },
      { canal: "instagram", porVariables: hayInstagram(), conectadas: suyas("instagram") },
      { canal: "messenger", porVariables: hayMessenger(), conectadas: suyas("messenger") },
    ],
    sePuedeConectar: falta.length === 0,
    queFalta: falta.length === 0 ? null : falta.join(" y "),
  };
}

/** Apaga una cuenta conectada. No la borra: el registro de qué hubo queda. */
export async function desconectarCuenta(
  id: number,
): Promise<{ ok: boolean; error: string | null }> {
  const usuario = await getUser();
  if (!usuario) return { ok: false, error: "Sesión no válida." };
  if (!(await puede("eliminar"))) {
    return { ok: false, error: "No tenés permiso para desconectar un canal." };
  }

  const r = await desconectar(id);
  if (r.ok) revalidatePath("/");
  return r;
}
