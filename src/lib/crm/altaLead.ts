import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buscarDuplicados, type Coincidencia } from "@/lib/duplicados";
import { traerTodo } from "@/lib/supabase/paginar";

/**
 * Dar de alta un lead: la persona y su primera oportunidad.
 *
 * Vive acá, y no dentro de la acción del formulario, porque ahora hay dos
 * puertas de entrada —la pantalla de Clientes y la API que usa n8n— y las dos
 * tienen que hacer exactamente lo mismo. Un alta no es un `insert`: son
 * cuatro pasos encadenados, y si la automatización se saltara alguno la base
 * quedaría distinta según por dónde entró el lead.
 *
 * Recibe el cliente de Supabase en vez de crearlo: por la pantalla entra con
 * la sesión de quien está trabajando (y sus permisos), y por la API con la
 * llave de servicio. La lógica es la misma; quién la ejecuta, no.
 */

/** Lo que hace falta para dar de alta. Las claves son nombres de columna. */
export interface DatosLead {
  nombre: string;
  telefono: string | null;
  correo: string | null;
  /** Edad declarada. De 17 para abajo hacen falta los datos del adulto. */
  edad?: number | null;
  responsable_nombre?: string | null;
  responsable_telefono?: string | null;
  responsable_correo?: string | null;
  vendedor_id: number | null;
  producto_id: number | null;
  territorio_id: number | null;
  canal_id: number | null;
  etapa_id: number | null;
  estado_id: number | null;
  fecha_registro: string;
  fecha_cierre: string | null;
  valor_oportunidad: number | null;
  descuento_promocion: string | null;
}

export interface ResultadoAlta {
  ok: boolean;
  error: string | null;
  /** El código asignado, "CRM-0582". Sólo cuando salió bien. */
  codigo?: string;
  /** Fila de `clientes` creada, para poder enlazarla con una conversación. */
  clienteId?: number;
  /** Fila de `oportunidades` creada. */
  oportunidadId?: number;
  /** Contactos parecidos que frenaron el alta. Sólo cuando `ok` es falso. */
  coincidencias?: Coincidencia[];
}

/** "CRM-0581" → 581. Devuelve 0 si no tiene esa forma. */
export const numeroDeCodigo = (codigo: string | null): number => {
  const m = /^CRM-(\d+)$/.exec(codigo ?? "");
  return m ? Number(m[1]) : 0;
};

/**
 * Contactos ya guardados, para comparar contra ellos.
 *
 * Trae la tabla entera de clientes reducida a cuatro columnas en vez de
 * filtrar en la consulta. El teléfono se guarda con guiones y espacios
 * ("7100-0001", "+503 7100 0001"), así que un `where` sobre el texto crudo no
 * encontraría los repetidos; hay que normalizar, y eso pasa en JavaScript.
 *
 * Hoy son mil y pico de filas y entran bien. El día que sean decenas de miles,
 * traerlas todas para dar de alta un lead deja de tener sentido y esto se
 * convierte en una función en Postgres que compare los dígitos ahí adentro.
 */
export async function contactosConocidos(
  supabase: SupabaseClient,
): Promise<
  { clienteId: number; nombre: string; telefono: string | null; correo: string | null }[]
> {
  /*
   * De a tandas, y no con un `.limit()` grande.
   *
   * Acá decía `.limit(20000)`, que no sirve: Supabase corta en mil filas pase
   * lo que pase, y lo hace sin error y sin aviso. Con 1017 contactos en la
   * base, los últimos quedaban afuera de esta lista —y esta lista es contra la
   * que se comprueba si el contacto ya existe—. O sea que la detección de
   * repetidos dejaba de ver justo a una parte de la gente, y por ahí entraban
   * duplicados que el CRM tendría que haber frenado.
   */
  const { data } = await traerTodo<{
    id: number;
    nombre: string | null;
    telefono: string | null;
    correo: string | null;
  }>(() => supabase.from("clientes").select("id, nombre, telefono, correo").order("id"));

  return data.map((c) => ({
    clienteId: c.id,
    nombre: c.nombre ?? "",
    telefono: c.telefono,
    correo: c.correo,
  }));
}

export async function altaLead(
  supabase: SupabaseClient,
  datos: DatosLead,
  /** Crear aunque coincida con un contacto existente. */
  forzar = false,
): Promise<ResultadoAlta> {
  const nombre = datos.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre del cliente es obligatorio." };
  if (!datos.fecha_registro) {
    return { ok: false, error: "La fecha de registro es obligatoria." };
  }

  // Por la pantalla, el navegador ya avisó mientras se escribía, pero su lista
  // es una foto del momento en que se cargó. Entre eso y el guardado, otra
  // persona pudo dar de alta el mismo contacto. La comprobación que cuenta es
  // esta. Por la API es la única que hay: un formulario de Meta reenviado dos
  // veces llegaría dos veces idéntico.
  if (!forzar) {
    const coincidencias = buscarDuplicados(
      { nombre, telefono: datos.telefono, correo: datos.correo },
      await contactosConocidos(supabase),
    );
    if (coincidencias.length > 0) {
      return { ok: false, error: "Ya existe un contacto con estos datos.", coincidencias };
    }
  }

  const { data: cliente, error: errCliente } = await supabase
    .from("clientes")
    .insert({
      nombre,
      telefono: datos.telefono,
      correo: datos.correo,
      territorio_id: datos.territorio_id,
      edad: datos.edad ?? null,
      responsable_nombre: datos.responsable_nombre ?? null,
      responsable_telefono: datos.responsable_telefono ?? null,
      responsable_correo: datos.responsable_correo ?? null,
    })
    .select("id")
    .single();

  if (errCliente) return { ok: false, error: errCliente.message };
  const clienteId = (cliente as { id: number }).id;

  const abierta = await abrirOportunidad(supabase, clienteId, datos);

  if (abierta.ok) await anotarCanal(supabase, clienteId, datos.canal_id, datos.fecha_registro);

  if (abierta.ok) {
    return { ok: true, error: null, codigo: abierta.codigo, clienteId, oportunidadId: abierta.oportunidadId };
  }

  // Sin oportunidad el cliente no se vería en ninguna pantalla, así que se
  // deshace el alta en vez de dejar una fila huérfana.
  await supabase.from("clientes").delete().eq("id", clienteId);
  return { ok: false, error: abierta.error };
}

/**
 * Dejar anotado por qué canal llegó este contacto.
 *
 * Va aparte de la oportunidad porque son dos preguntas distintas.
 * `oportunidades.canal_id` dice por dónde entró ESE lead y es lo que miran los
 * cortes del Dashboard. `contactos_canal` dice por qué canales llegó LA
 * PERSONA y cuándo por cada uno, que es lo que hace falta cuando alguien
 * escribe primero por Instagram y después por WhatsApp.
 *
 * Sin fecha con hora se usa la de registro, que es lo que se sabe. Cuando el
 * canal es WhatsApp la hora exacta la pisa después el webhook, que sí la tiene.
 *
 * No lanza: el lead ya está creado y es lo que importa. Que falte el renglón
 * del historial se arregla solo la próxima vez que la persona escriba.
 */
export async function anotarCanal(
  supabase: SupabaseClient,
  clienteId: number,
  canalId: number | null,
  cuando: string | null,
): Promise<void> {
  if (canalId == null) return;
  try {
    await supabase.rpc("anotar_canal", {
      p_cliente: clienteId,
      p_canal: canalId,
      p_identificador: null,
      p_cuando: cuando ? new Date(`${cuando}T12:00:00`).toISOString() : new Date().toISOString(),
    });
  } catch {
    // El historial de canales no vale un alta.
  }
}

/** Los campos de la oportunidad, sin nada del cliente. */
export type DatosOportunidad = Pick<
  DatosLead,
  | "vendedor_id" | "producto_id" | "territorio_id" | "canal_id"
  | "etapa_id" | "estado_id" | "fecha_registro" | "fecha_cierre"
  | "valor_oportunidad" | "descuento_promocion"
>;

export interface ResultadoOportunidad {
  ok: boolean;
  error: string | null;
  codigo?: string;
  oportunidadId?: number;
}

/**
 * Abrirle una oportunidad a un cliente que ya existe.
 *
 * Sale de `altaLead` para que la comparta el webhook de WhatsApp, donde el
 * cliente ya está creado —lo crea el propio webhook al guardar el mensaje— y
 * lo único que falta es el lead. Sin esto habría dos maneras de asignar
 * códigos, y la de WhatsApp sería la que nadie prueba.
 */
export async function abrirOportunidad(
  supabase: SupabaseClient,
  clienteId: number,
  datos: DatosOportunidad,
): Promise<ResultadoOportunidad> {
  /*
   * El código lo pone la base, no esto.
   *
   * Acá se calcula uno igual —leer el último y sumarle uno— pero como
   * propuesta, no como decisión: el disparador `numerar_oportunidad` lo
   * respeta si está libre y lo reemplaza si ya lo tiene otro. Eso es lo que
   * hace que dos altas simultáneas no puedan chocar, que es exactamente lo
   * que pasaba cuando entraban varios mensajes de WhatsApp en el mismo
   * segundo: todos leían el mismo último código, todos pedían el mismo
   * número, y los que perdían se quedaban sin lead.
   *
   * El cálculo de acá se conserva por si la base todavía no tiene el
   * disparador —una copia vieja, alguien probando en local—: sin él esto
   * sigue funcionando como antes, con su reintento y todo. Y por eso mismo el
   * código que se devuelve es el que quedó guardado, no el propuesto: son el
   * mismo salvo cuando hubo choque, y ahí el que vale es el de la base.
   */
  let ultimoError = "No se pudo asignar un código.";

  for (let intento = 0; intento < 5; intento += 1) {
    const { data: previo } = await supabase
      .from("oportunidades")
      .select("codigo")
      .like("codigo", "CRM-%")
      .order("codigo", { ascending: false })
      .limit(1)
      .maybeSingle();

    const codigo = `CRM-${String(
      numeroDeCodigo((previo as { codigo: string } | null)?.codigo ?? null) + 1 + intento,
    ).padStart(4, "0")}`;

    const { data: op, error: errOp } = await supabase
      .from("oportunidades")
      .insert({
        codigo,
        cliente_id: clienteId,
        vendedor_id: datos.vendedor_id,
        producto_id: datos.producto_id,
        territorio_id: datos.territorio_id,
        canal_id: datos.canal_id,
        etapa_id: datos.etapa_id,
        estado_id: datos.estado_id,
        fecha_registro: datos.fecha_registro,
        fecha_cierre: datos.fecha_cierre,
        valor_oportunidad: datos.valor_oportunidad,
        descuento_promocion: datos.descuento_promocion,
      })
      .select("id, codigo")
      .single();

    if (!errOp) {
      const guardada = op as { id: number; codigo: string | null };
      return {
        ok: true,
        error: null,
        codigo: guardada.codigo ?? codigo,
        oportunidadId: guardada.id,
      };
    }

    ultimoError = errOp.message;
    // 23505 es violación de unicidad: el código lo ganó otra alta.
    if (!errOp.message.includes("duplicate key") && errOp.code !== "23505") break;
  }

  return { ok: false, error: ultimoError };
}
