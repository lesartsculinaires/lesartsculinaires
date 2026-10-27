/**
 * Quién de la base que se está subiendo ya está en el CRM, y con quién.
 *
 * ============================================================================
 * PARA QUÉ
 * ============================================================================
 *
 * Pedido el 27/10/2026: «al momento de subir la base, que se vea si ese lead
 * ya tiene vendedor asignado, y si es así cuál fue su último mensaje y por qué
 * canal entró». Una base de egresados o de una feria trae gente que ya está
 * siendo atendida; antes de mandarle un masivo conviene saber que esa persona
 * ya tiene asesora y en qué quedó la última conversación.
 *
 * ============================================================================
 * LO QUE SE MUESTRA, Y LO QUE NO
 * ============================================================================
 *
 * Los leads y los chats se leen como quien sube la base: con sus permisos. Si
 * su rol ve a todo el equipo, ve todo. Si no, de la gente que atiende otra
 * asesora sabe que ya está en el CRM —la ficha del contacto la ve todo el
 * mundo— pero no de quién es ni qué se habló, igual que en el resto del CRM.
 * Eso se dice con esas palabras en vez de mostrarlo como «sin vendedor».
 */

/** Un lead de la persona, con los ids del catálogo: los nombres los pone la pantalla. */
export interface LeadYaEnElCrm {
  codigo: string;
  productoId: number | null;
  vendedorId: number | null;
  canalId: number | null;
  etapaId: number | null;
  estadoId: number | null;
}

export interface UltimoMensaje {
  texto: string | null;
  en: string;
  /** whatsapp, instagram o messenger: por dónde fue la conversación. */
  canal: string;
}

export interface YaEnElCrm {
  /** La fila del archivo. */
  linea: number;
  clienteId: number;
  /** El nombre como está guardado en el CRM. */
  nombre: string;
  /** Sus leads que quien sube la base puede ver, el más nuevo primero. */
  leads: LeadYaEnElCrm[];
  /**
   * Está en el CRM pero no se le ve ningún lead, y quien mira no ve a todo el
   * equipo: lo atiende otra asesora.
   */
  deOtraAsesora: boolean;
  /** La conversación más reciente que quien sube la base puede ver. */
  ultimo: UltimoMensaje | null;
}

export interface LeadCrudo {
  cliente_id: number;
  codigo: string | null;
  producto_id: number | null;
  vendedor_id: number | null;
  canal_id: number | null;
  etapa_id: number | null;
  estado_id: number | null;
  fecha_registro: string | null;
}

export interface ChatCrudo {
  cliente_id: number;
  canal: string | null;
  ultimo_mensaje_en: string | null;
  ultimo_texto: string | null;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** Junta lo leído en una entrada por fila del archivo, en el orden del archivo. */
export function armarYaEnElCrm({
  lineas,
  nombres,
  leads,
  chats,
  veTodo,
}: {
  /** Fila del archivo → contacto del CRM. */
  lineas: ReadonlyMap<number, number>;
  nombres: ReadonlyMap<number, string>;
  leads: readonly LeadCrudo[];
  chats: readonly ChatCrudo[];
  /** Si quien mira ve a todo el equipo. Null si no se pudo saber. */
  veTodo: boolean | null;
}): YaEnElCrm[] {
  const leadsDe = new Map<number, LeadCrudo[]>();
  for (const l of leads) {
    const id = Number(l.cliente_id);
    leadsDe.set(id, [...(leadsDe.get(id) ?? []), l]);
  }

  const chatDe = new Map<number, UltimoMensaje>();
  for (const c of chats) {
    if (!c.ultimo_mensaje_en) continue;
    const id = Number(c.cliente_id);
    const previo = chatDe.get(id);
    if (previo && previo.en >= c.ultimo_mensaje_en) continue;
    chatDe.set(id, { texto: c.ultimo_texto, en: c.ultimo_mensaje_en, canal: c.canal || "whatsapp" });
  }

  return [...lineas.entries()]
    .sort(([a], [b]) => a - b)
    .map(([linea, clienteId]) => {
      const suyos = [...(leadsDe.get(clienteId) ?? [])].sort((a, b) =>
        (b.fecha_registro ?? "").localeCompare(a.fecha_registro ?? ""),
      );
      return {
        linea,
        clienteId,
        nombre: nombres.get(clienteId) ?? "",
        leads: suyos.map((l) => ({
          codigo: String(l.codigo ?? ""),
          productoId: num(l.producto_id),
          vendedorId: num(l.vendedor_id),
          canalId: num(l.canal_id),
          etapaId: num(l.etapa_id),
          estadoId: num(l.estado_id),
        })),
        deOtraAsesora: suyos.length === 0 && veTodo !== true,
        ultimo: chatDe.get(clienteId) ?? null,
      };
    });
}

/** Los números de arriba de la lista. */
export function resumirYaEnElCrm(lista: readonly YaEnElCrm[]): {
  total: number;
  conVendedor: number;
  sinVendedor: number;
  deOtraAsesora: number;
} {
  let conVendedor = 0;
  let sinVendedor = 0;
  let deOtraAsesora = 0;
  for (const y of lista) {
    if (y.deOtraAsesora) deOtraAsesora += 1;
    else if (y.leads.some((l) => l.vendedorId != null)) conVendedor += 1;
    else sinVendedor += 1;
  }
  return { total: lista.length, conVendedor, sinVendedor, deOtraAsesora };
}

/** «WhatsApp», «Instagram», «Messenger»: como lo dice el equipo. */
export function nombreDelCanalDelChat(canal: string | null | undefined): string {
  switch ((canal ?? "").toLowerCase()) {
    case "":
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "messenger":
      return "Messenger";
    default:
      return canal!.charAt(0).toUpperCase() + canal!.slice(1);
  }
}
