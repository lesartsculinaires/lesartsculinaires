import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buscarDuplicados, type Coincidencia } from "@/lib/duplicados";

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
 * Con la base actual son unos pocos cientos de filas. Si algún día fueran
 * decenas de miles, esto se convierte en una función en Postgres.
 */
export async function contactosConocidos(
  supabase: SupabaseClient,
): Promise<
  { clienteId: number; nombre: string; telefono: string | null; correo: string | null }[]
> {
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, correo")
    .limit(20000);

  return (data ?? []).map((c) => ({
    clienteId: c.id as number,
    nombre: (c.nombre as string) ?? "",
    telefono: (c.telefono as string | null) ?? null,
    correo: (c.correo as string | null) ?? null,
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
    })
    .select("id")
    .single();

  if (errCliente) return { ok: false, error: errCliente.message };
  const clienteId = (cliente as { id: number }).id;

  // El código se calcula leyendo el último y sumando uno. Dos altas
  // simultáneas pueden pedir el mismo número; la columna es `unique`, así que
  // la segunda choca y se reintenta con el siguiente en vez de fallar.
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
      .select("id")
      .single();

    if (!errOp) {
      return {
        ok: true,
        error: null,
        codigo,
        clienteId,
        oportunidadId: (op as { id: number }).id,
      };
    }

    ultimoError = errOp.message;
    // 23505 es violación de unicidad: el código lo ganó otra alta.
    if (!errOp.message.includes("duplicate key") && errOp.code !== "23505") break;
  }

  // Sin oportunidad el cliente no se vería en ninguna pantalla, así que se
  // deshace el alta en vez de dejar una fila huérfana.
  await supabase.from("clientes").delete().eq("id", clienteId);
  return { ok: false, error: ultimoError };
}
