import type { SupabaseClient } from "@supabase/supabase-js";

import { cualEsDelCatalogo, type DelCatalogo } from "@/lib/crm/buscarEnCatalogo";
import {
  comoSeUbica,
  leerFormulario,
  telefonoUtil,
  type DelFormulario,
} from "@/lib/crm/formularioDeAnuncio";

/**
 * Llenar la ficha con lo que trajo el formulario de la pauta.
 *
 * ============================================================================
 * QUÉ CAMBIA
 * ============================================================================
 *
 * Un lead de pauta abre el chat con un mensaje que ya trae el nombre, el
 * correo y el curso por el que pregunta. Todo eso quedaba escrito en el hilo y
 * la ficha se abría vacía: quien atendía copiaba los datos a mano, de un
 * mensaje que los tenía. Por cada lead.
 *
 * Ahora se copian solos, apenas entra el mensaje.
 *
 * ============================================================================
 * SÓLO RELLENA HUECOS. NUNCA PISA NADA.
 * ============================================================================
 *
 * Es la regla que hace que esto se pueda dejar andando sin vigilarlo. Un
 * formulario mal llenado —el correo con un dedazo, el nombre en minúsculas— no
 * puede borrar lo que una persona corrigió a mano:
 *
 *   UN HUECO SE VE          Está el hilo al lado con el mensaje entero, y se
 *                           completa en diez segundos.
 *   UN DATO PISADO NO       Nadie revisa un campo que ya tiene algo escrito, y
 *                           menos si se llenó solo.
 *
 * El nombre es el único con matiz: se reemplaza también cuando lo que hay es
 * el TELÉFONO, porque eso no es un nombre —es lo que pone el CRM cuando no
 * tiene nada mejor— y dejarlo sería preferir un marcador a un dato real.
 *
 * ============================================================================
 * NUNCA FALLA HACIA AFUERA
 * ============================================================================
 *
 * Esto corre dentro del webhook, que tiene que contestarle 200 a Meta pase lo
 * que pase. Un error acá no puede perder el mensaje de un cliente: se anota en
 * el registro y se sigue. La ficha a medio llenar es un problema chico; el
 * mensaje perdido no se recupera.
 */

type Cliente = SupabaseClient;

/** Qué se completó, para poder contarlo en las pruebas y en el registro. */
export interface Completado {
  /** Era un formulario de pauta. */
  hubo: boolean;
  /** Los campos de la ficha que se llenaron. */
  campos: string[];
}

const NO_HUBO: Completado = { hubo: false, campos: [] };

/** ¿Está vacío, o es un marcador? */
const esHueco = (v: unknown): boolean =>
  v == null || (typeof v === "string" && v.trim() === "");

export async function completarConFormulario(
  supabase: Cliente,
  conversacionId: number,
  texto: string | null,
): Promise<Completado> {
  const form = leerFormulario(texto);
  if (!form) return NO_HUBO;

  try {
    const { data: conv } = await supabase
      .from("conversaciones")
      .select("cliente_id")
      .eq("id", conversacionId)
      .maybeSingle();

    const clienteId = conv?.cliente_id == null ? null : Number(conv.cliente_id);
    if (clienteId == null) return NO_HUBO;

    const campos = await completarCliente(supabase, clienteId, form);
    campos.push(...(await completarOportunidad(supabase, clienteId, form)));

    return { hubo: true, campos };
  } catch (e) {
    console.error(
      "[formulario] no se pudo completar la ficha:",
      e instanceof Error ? e.message : String(e),
    );
    return { hubo: true, campos: [] };
  }
}

async function completarCliente(
  supabase: Cliente,
  clienteId: number,
  form: DelFormulario,
): Promise<string[]> {
  const { data: cli } = await supabase
    .from("clientes")
    .select("nombre, telefono, correo, empresa, cargo")
    .eq("id", clienteId)
    .maybeSingle();

  if (!cli) return [];

  const cambios: Record<string, string> = {};

  /*
   * El nombre: sólo si lo que hay es un hueco o el teléfono.
   *
   * `cliente_de_whatsapp` abre la ficha con el nombre del perfil de WhatsApp y,
   * cuando no hay ninguno, con el número. El número no es un nombre: es lo que
   * quedó por no tener nada mejor, y el del formulario siempre es mejor.
   *
   * Un nombre de perfil SÍ se respeta aunque sea un apodo. Es el que esa
   * persona eligió mostrar, y pisarlo con el del formulario significaría que
   * el CRM decide cómo se llama alguien.
   */
  const telefonoActual = cli.telefono == null ? "" : String(cli.telefono);
  const nombreActual = cli.nombre == null ? "" : String(cli.nombre).trim();
  if (form.nombre && (nombreActual === "" || nombreActual === telefonoActual)) {
    cambios.nombre = form.nombre;
  }

  if (form.correo && esHueco(cli.correo)) cambios.correo = form.correo;
  if (form.empresa && esHueco(cli.empresa)) cambios.empresa = form.empresa;
  if (form.cargo && esHueco(cli.cargo)) cambios.cargo = form.cargo;

  /*
   * El teléfono casi nunca hace falta —en WhatsApp la ficha ya nace con el
   * número del hilo, que es el que Meta confirmó— pero cuando está vacío, el
   * del formulario es mejor que nada. El del hilo sigue mandando: esto no lo
   * reemplaza nunca.
   */
  if (esHueco(cli.telefono)) {
    const tel = telefonoUtil(form.telefono);
    if (tel) cambios.telefono = tel;
  }

  if (Object.keys(cambios).length === 0) return [];

  const { error } = await supabase.from("clientes").update(cambios).eq("id", clienteId);
  if (error) {
    console.error("[formulario] no se pudo completar el cliente:", error.message);
    return [];
  }

  return Object.keys(cambios);
}

async function completarOportunidad(
  supabase: Cliente,
  clienteId: number,
  form: DelFormulario,
): Promise<string[]> {
  if (!form.programa && !comoSeUbica(form)) return [];

  /*
   * La oportunidad MÁS NUEVA de esa persona.
   *
   * Alguien que ya cursó un diplomado y ahora pregunta por otro tiene dos, y
   * lo que acaba de llegar es de la de ahora. Completar la vieja movería un
   * trato cerrado meses atrás.
   */
  const { data: op } = await supabase
    .from("oportunidades")
    .select("id, producto_id, territorio_id")
    .eq("cliente_id", clienteId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!op) return [];

  const cambios: Record<string, number> = {};

  if (form.programa && op.producto_id == null) {
    const { data: productos } = await supabase.from("productos").select("id, nombre");
    const cual = cualEsDelCatalogo(form.programa, (productos ?? []) as DelCatalogo[]);
    if (cual != null) cambios.producto_id = cual;
  }

  if (op.territorio_id == null) {
    const { data: territorios } = await supabase.from("territorios").select("id, nombre");
    const lista = (territorios ?? []) as DelCatalogo[];

    /*
     * La ciudad primero y el departamento después.
     *
     * Los territorios de la escuela son departamentos, pero algunas pautas
     * mandan bien la ciudad y mal el departamento —en el formulario de la
     * escuela venía «Province: Colón» y «City: Chalatenango», y Chalatenango
     * es el departamento—. Se prueba con los dos y gana el que el catálogo
     * reconozca.
     */
    const cual =
      cualEsDelCatalogo(form.ciudad, lista) ?? cualEsDelCatalogo(form.departamento, lista);
    if (cual != null) cambios.territorio_id = cual;
  }

  if (Object.keys(cambios).length === 0) return [];

  const { error } = await supabase.from("oportunidades").update(cambios).eq("id", Number(op.id));
  if (error) {
    console.error("[formulario] no se pudo completar la oportunidad:", error.message);
    return [];
  }

  /*
   * Y el programa también entra en «por los que preguntó».
   *
   * Es la lista de intereses de la ficha, distinta del producto del trato: uno
   * es lo que se está vendiendo y la otra es por todo lo que preguntó. Que
   * falle esto no deshace lo de arriba, que es lo que de verdad importa.
   */
  if (cambios.producto_id != null) {
    const { error: errInteres } = await supabase.from("oportunidad_programas").upsert(
      [{ oportunidad_id: Number(op.id), producto_id: cambios.producto_id }],
      { onConflict: "oportunidad_id,producto_id", ignoreDuplicates: true },
    );
    if (errInteres) {
      console.error("[formulario] no se pudo anotar el interés:", errInteres.message);
    }
  }

  return Object.keys(cambios);
}
