import "server-only";

import { perfilDe } from "@/lib/instagram/enviar";
import { ARCHIVO_IG, resumenIg } from "@/lib/instagram/mensajes";
import { perfilDeMsn } from "@/lib/messenger/enviar";
import { ARCHIVO_MSN, resumenMsn } from "@/lib/messenger/mensajes";
import type { CanalMeta } from "@/lib/meta/bandeja";

/**
 * Cuál de los dos canales de Meta es esta carga.
 *
 * ============================================================================
 * POR QUÉ LO DECIDE LA CARGA Y NO LA URL POR LA QUE ENTRÓ
 * ============================================================================
 *
 * Porque la URL MIENTE, y costó una semana de hilos mal guardados descubrirlo.
 *
 * El diseño original era limpio: el webhook de Instagram apunta a
 * `/api/instagram/webhook`, el de Messenger a `/api/messenger/webhook`, y cada
 * ruta sabe quién es sin preguntar. Lo que no se verificó es que Meta estuviera
 * configurado así. No lo estaba. Consultado el 22 de septiembre de 2026:
 *
 *     GET /{app-id}/subscriptions
 *     → object: "instagram"  callback_url: …/api/instagram/webhook
 *       object: "page"       callback_url: …/api/instagram/webhook
 *
 * Las DOS suscripciones apuntaban a la misma dirección. Y como
 * `leerWebhookIg` no mira el campo `object` —Meta manda la misma forma para los
 * dos—, todo lo que entró por Messenger se guardó como si fuera de Instagram:
 * con `canal: "instagram"`, con la ficha resuelta por `cliente_de_instagram`, y
 * con el nombre buscado en el Graph de Instagram usando un PSID de Facebook, que
 * no puede funcionar nunca. De ahí los hilos titulados con un número.
 *
 * Arreglar la suscripción en Meta arregla el síntoma y deja la trampa armada: el
 * día que alguien reconfigure el webhook desde el panel, vuelve a pasar sin que
 * nada avise. Así que se arregla del lado que no depende de la configuración: la
 * carga trae `object`, y `object` es la verdad.
 *
 *     object: "instagram"  → Instagram
 *     object: "page"       → Messenger
 *
 * Con esto, las dos rutas aceptan las dos cosas y da igual a cuál apunte Meta.
 * Se mantienen las dos URLs porque las dos están configuradas allá y porque en
 * el registro de Netlify sigue viéndose por dónde entró cada cosa, que es la
 * pregunta que costó días contestar con Instagram.
 */

/**
 * La ficha de Instagram.
 *
 * `carpeta: "ig"` no se puede cambiar: es donde están guardados los archivos de
 * todos los mensajes de Instagram que ya entraron.
 *
 * Se sigue llamando a `cliente_de_instagram` y no a la general: desde
 * `20261027120000_messenger.sql` la de Instagram es una línea que llama a
 * `cliente_de_canal`, así que hacen lo mismo, y se deja la vieja para que esto
 * siga funcionando en una base donde esa migración todavía no se corrió.
 */
export const INSTAGRAM: CanalMeta = {
  clave: "instagram",
  nombreCatalogo: "Instagram",
  carpeta: "ig",
  migracion: "20261024120000_instagram.sql",
  resumen: resumenIg,
  esArchivo: (clase) => ARCHIVO_IG.has(clase),
  perfilDe,
  rpcCliente: {
    nombre: "cliente_de_instagram",
    argumentos: (igsid, perfil) => ({
      p_igsid: igsid,
      p_usuario: perfil.usuario,
      p_nombre: perfil.nombre,
    }),
  },
};

/** La ficha de Messenger. */
export const MESSENGER: CanalMeta = {
  clave: "messenger",
  nombreCatalogo: "Messenger",
  carpeta: "msn",
  migracion: "20261027120000_messenger.sql",
  resumen: resumenMsn,
  esArchivo: (clase) => ARCHIVO_MSN.has(clase),
  perfilDe: perfilDeMsn,
  rpcCliente: {
    nombre: "cliente_de_canal",
    argumentos: (psid, perfil) => ({
      p_canal: "Messenger",
      p_identificador: psid,
      p_usuario: perfil.usuario,
      p_nombre: perfil.nombre,
    }),
  },
};

/**
 * El canal que dice la carga, o el de la ruta cuando no lo dice.
 *
 * `porDefecto` es la ruta por la que entró. Se usa sólo si `object` no es
 * ninguno de los dos conocidos: antes que descartar un mensaje por un campo que
 * no supimos leer, se guarda donde la ruta dice, que es lo que hacía hasta hoy.
 */
export function canalDeLaCarga(carga: unknown, porDefecto: CanalMeta): CanalMeta {
  const objeto = (carga as { object?: unknown } | null)?.object;

  if (objeto === "instagram") return INSTAGRAM;
  if (objeto === "page") return MESSENGER;

  return porDefecto;
}
