import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Lo que ve el área académica al abrir un enlace de registro.
 *
 * Se consulta con la llave de servicio y no con la del navegador porque del
 * otro lado no hay sesión: académica no usa el CRM. Eso obliga a ser estricto
 * con lo que sale de acá, porque las políticas de la base ya no filtran nada.
 * Por eso se busca por token —el único dato que tiene quien abre— y se
 * devuelve una sola inscripción, con los campos nombrados uno por uno.
 *
 * Lo que NO sale, a propósito: las notas de seguimiento, los adjuntos, y las
 * otras oportunidades de la misma persona. Nada de eso hace falta para cobrar
 * una inscripción.
 */

export interface Recibo {
  codigo: string;
  fecha: string;
  cliente: string;
  telefono: string | null;
  correo: string | null;
  edad: number | null;
  responsableNombre: string | null;
  responsableTelefono: string | null;
  responsableCorreo: string | null;
  programa: string | null;
  /**
   * El horario con el que se cerró, tal como lo escribió ventas.
   *
   * Sale del lead y no del programa a propósito: el horario del programa
   * cambia cada año, y un recibo tiene que seguir diciendo lo que se le
   * prometió a esta persona el día que se inscribió.
   */
  horario: string | null;
  territorio: string | null;
  asesor: string | null;
  valor: number | null;
  reserva: number | null;
  descuento: string | null;
  emitidoEn: string;
}

export type EstadoRecibo = "ok" | "no-existe" | "vencido" | "anulado" | "sin-configurar";

/**
 * La tabla conserva el nombre `enlaces_pago` de cuando esto se llamaba «link
 * de pago». Renombrarla obligaría a correr una migración en producción sin
 * ganar nada: el nombre no lo ve nadie fuera de este archivo.
 */

export interface ResultadoRecibo {
  estado: EstadoRecibo;
  recibo: Recibo | null;
}

export async function leerRecibo(token: string): Promise<ResultadoRecibo> {
  // El token viaja en la URL, así que puede venir con cualquier cosa. Un largo
  // razonable evita ir a la base por cada barrido de direcciones.
  if (!token || token.length < 32 || token.length > 128) {
    return { estado: "no-existe", recibo: null };
  }

  const supabase = getAdminClient();
  if (!supabase) {
    console.error("[registro] falta SUPABASE_SERVICE_ROLE_KEY; no se puede abrir el recibo");
    return { estado: "sin-configurar", recibo: null };
  }

  const { data: enlace, error } = await supabase
    .from("enlaces_pago")
    .select("id, oportunidad_id, vence_en, revocado, vistas")
    .eq("token", token)
    .maybeSingle();

  if (error || !enlace) return { estado: "no-existe", recibo: null };
  if (enlace.revocado) return { estado: "anulado", recibo: null };
  if (new Date(String(enlace.vence_en)).getTime() < Date.now()) {
    return { estado: "vencido", recibo: null };
  }

  const { data: fila } = await supabase
    .from("vw_pipeline")
    .select("*")
    .eq("id", enlace.oportunidad_id)
    .maybeSingle();

  if (!fila) return { estado: "no-existe", recibo: null };

  // Queda registrado que lo abrieron, para que el asesor no tenga que
  // preguntar «¿te llegó?». Si falla no importa: es un dato de comodidad y no
  // vale perder el recibo por él.
  await supabase
    .from("enlaces_pago")
    .update({
      vistas: Number(enlace.vistas ?? 0) + 1,
      visto_en: new Date().toISOString(),
    })
    .eq("id", enlace.id);

  const texto = (v: unknown): string | null => {
    const s = v == null ? "" : String(v).trim();
    return s ? s : null;
  };

  return {
    estado: "ok",
    recibo: {
      codigo: String(fila.codigo ?? ""),
      fecha: String(fila.fecha_registro ?? ""),
      cliente: String(fila.cliente ?? ""),
      telefono: texto(fila.telefono),
      correo: texto(fila.correo),
      edad: fila.edad == null ? null : Number(fila.edad),
      responsableNombre: texto(fila.responsable_nombre),
      responsableTelefono: texto(fila.responsable_telefono),
      responsableCorreo: texto(fila.responsable_correo),
      programa: texto(fila.producto),
      horario: texto(fila.horario),
      territorio: texto(fila.territorio),
      asesor: texto(fila.vendedor),
      valor: fila.valor_oportunidad == null ? null : Number(fila.valor_oportunidad),
      reserva: fila.reserva == null ? null : Number(fila.reserva),
      descuento: texto(fila.descuento_promocion),
      emitidoEn: new Date().toISOString(),
    },
  };
}
