/**
 * Domain types for the Les Arts Culinaires CRM.
 *
 * The database is normalised: `oportunidades` holds foreign keys and the
 * catalogue tables hold the labels. `Oportunidad` below is the flattened row
 * the UI works with — it carries both the display label and the id for every
 * catalogued field, because the screens render names but writes need ids.
 */

/** A row of any catalogue table (vendedores, canales, territorios…). */
export interface CatalogItem {
  id: number;
  nombre: string;
}

export interface Etapa extends CatalogItem {
  orden: number;
}

export interface Estado extends CatalogItem {
  /** Closes the opportunity: Ganado or Perdido. */
  esFinal: boolean;
}

export type ProductoCategoria =
  | "Diplomado"
  | "Curso corto"
  | "Certificación"
  | "Otro";

export interface Producto extends CatalogItem {
  categoria: ProductoCategoria;
  /** List price; null until someone fills it in. */
  precio: number | null;
}

export interface TipoEvento extends CatalogItem {
  /** Two-letter badge code. */
  codigo: string;
  color: string;
  duracionMin: number;
}

/** Everything the screens need that does not change during a session. */
export interface Catalogo {
  vendedores: CatalogItem[];
  productos: Producto[];
  territorios: CatalogItem[];
  canales: CatalogItem[];
  etapas: Etapa[];
  estados: Estado[];
  tiposEvento: TipoEvento[];
}

/** Placeholder shown wherever an opportunity has no salesperson assigned. */
export const SIN_ASIGNAR = "Sin asignar";
/** Shown for any catalogued field left empty in the source data. */
export const SIN_DATO = "—";

/** One row of `vw_pipeline`, flattened for the UI. */
export interface Oportunidad {
  id: number;
  /** Legacy code from the spreadsheet, e.g. CRM-0042. */
  codigo: string;
  /** ISO date. */
  fechaRegistro: string;
  fechaCierre: string | null;
  /** First day of the registration month, ISO. */
  mes: string;

  clienteId: number;
  cliente: string;
  telefono: string | null;
  correo: string | null;

  vendedorId: number | null;
  vendedor: string;
  productoId: number | null;
  producto: string;
  categoria: ProductoCategoria | null;
  territorioId: number | null;
  territorio: string;
  canalId: number | null;
  canal: string;
  etapaId: number | null;
  etapa: string;
  etapaOrden: number | null;
  estadoId: number | null;
  estado: string;
  esFinal: boolean;

  valor: number | null;
  cerrada: number | null;
  descuento: string | null;

  /**
   * Cuándo entró la fila al sistema. Distinto de `fechaRegistro`, que es
   * cuando el lead llegó al negocio: una base histórica se sube hoy con
   * fechas de hace meses.
   */
  creadoEn: string | null;
  /** Base de la que vino, si vino de una importación. */
  importacionId: number | null;
}

/** Una base subida al sistema. */
export interface Importacion {
  id: number;
  archivo: string;
  filas: number;
  creadoEn: string;
  creadoPor: string | null;
}

/** What the UI can edit on an opportunity. Keys are column names. */
export interface OportunidadPatch {
  vendedor_id?: number | null;
  producto_id?: number | null;
  territorio_id?: number | null;
  canal_id?: number | null;
  etapa_id?: number | null;
  estado_id?: number | null;
  /** ISO date; the column is `not null`, so never send null. */
  fecha_registro?: string;
  fecha_cierre?: string | null;
  valor_oportunidad?: number | null;
  venta_cerrada?: number | null;
  descuento_promocion?: string | null;
}

/**
 * What the UI can edit on the client record.
 *
 * `clientes` is shared: one client can own several opportunities, so a change
 * here shows up in every one of them.
 */
export interface ClientePatch {
  nombre?: string;
  telefono?: string | null;
  correo?: string | null;
}

export type CanalEvento = "Presencial" | "Llamada" | "WhatsApp" | "Meet";

export type EstadoEvento =
  | "Pendiente"
  | "Realizado"
  | "No se presentó"
  | "Reagendado";

export interface Evento {
  id: number;
  oportunidadId: number;
  tipoId: number;
  vendedorId: number | null;
  /** ISO timestamp. */
  iniciaEn: string;
  duracionMin: number;
  canal: CanalEvento;
  estado: EstadoEvento;
  resultado: string | null;
  /** Set when the event was closed by booking the next step. */
  proximaAccion: string | null;
}

export interface EventoPatch {
  tipo_id?: number;
  vendedor_id?: number | null;
  inicia_en?: string;
  duracion_min?: number;
  canal?: CanalEvento;
  estado?: EstadoEvento;
  resultado?: string | null;
  proxima_accion?: string | null;
}

/** Foreground / background pair for a status pill. */
export type Tone = readonly [fg: string, bg: string];

// ---------------------------------------------------------------- accesos

/** The four columns of the permissions table. */
export type Accion = "ver" | "crear" | "editar" | "eliminar";

export const ACCIONES: readonly Accion[] = ["ver", "crear", "editar", "eliminar"];

export interface Modulo {
  clave: string;
  nombre: string;
  /** Null on a top-level module; the parent's key on a sub-permission. */
  padre: string | null;
  orden: number;
}

export interface Rol {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  /** Always allowed everything, and protected from deletion. */
  esAdmin: boolean;
}

/** One row of the permissions grid. */
export interface Permiso {
  rolId: number;
  modulo: string;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
}

export interface Usuario {
  id: string;
  nombre: string | null;
  correo: string;
  rolId: number | null;
  activo: boolean;
}

/** Everything the access screens and the sidebar gate need. */
export interface Accesos {
  modulos: Modulo[];
  roles: Rol[];
  permisos: Permiso[];
  usuarios: Usuario[];
  /** The signed-in user's own record, when it exists. */
  yo: Usuario | null;
  esAdmin: boolean;
}

/** Estado de una autorización pedida a dirección general. */
export type EstadoAutorizacion = "pendiente" | "autorizada" | "rechazada";

export interface Autorizacion {
  id: number;
  nombre: string;
  descripcion: string;
  estado: EstadoAutorizacion;
  solicitadoPor: string | null;
  solicitadoEn: string;
  resueltoPor: string | null;
  resueltoEn: string | null;
  comentario: string | null;
}

// ------------------------------------------------------------- bandeja
/** Un hilo de WhatsApp con una persona. */
export interface Conversacion {
  id: number;
  /** Sólo dígitos, con código de país, tal como lo manda Meta. */
  telefono: string;
  /** Cómo se llama en su propio WhatsApp; puede no venir. */
  nombrePerfil: string | null;
  /** Nulo mientras nadie la haya convertido en lead. */
  clienteId: number | null;
  ultimoMensajeEn: string;
  ultimoTexto: string | null;
  sinLeer: number;
  archivada: boolean;
  /** Id en Chatwoot. Nulo si la conversación no vino de ahí. */
  chatwootId: number | null;
  /** open / pending / resolved, igual que en Chatwoot. */
  estado: string;
  /** Nulo = sin asignar, que es lo que el asesor resuelve. */
  vendedorId: number | null;
}

export interface Mensaje {
  id: number;
  conversacionId: number;
  direccion: "entrante" | "saliente";
  tipo: string;
  /** Nulo en fotos, audios y demás: ahí manda `tipo`. */
  texto: string | null;
  /** Sólo salientes: enviado / entregado / leido / fallido. */
  estado: string | null;
  error: string | null;
  creadoEn: string;
  /** Nota interna: la ve el equipo, no el cliente. */
  privado: boolean;
}
