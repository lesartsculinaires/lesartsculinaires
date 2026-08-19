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

/**
 * Un vendedor del catálogo.
 *
 * A diferencia del resto de los catálogos, éste se carga entero —dados de baja
 * incluidos— porque hace falta para dos cosas distintas y opuestas:
 *
 *  - **elegir**: ahí sólo van los activos, y para eso está `activos()`;
 *  - **nombrar lo que ya pasó**: un evento del calendario de hace tres meses
 *    tiene que seguir diciendo quién lo atendió aunque esa persona ya no esté.
 *
 * Si se filtrara al traerlo, lo segundo quedaría en blanco y parecería que el
 * dato se perdió. Los totales del tablero no dependen de esto: salen del
 * nombre que ya trae `vw_pipeline`, no del catálogo.
 */
export interface Vendedor extends CatalogItem {
  activo: boolean;
}

/** Los que todavía atienden: es lo que va en cualquier desplegable. */
export const activos = (lista: readonly Vendedor[]): Vendedor[] =>
  lista.filter((v) => v.activo);

/**
 * Igual que `activos`, pero sin esconder al que ya está elegido.
 *
 * Si a una oportunidad vieja la atendió alguien que después se dio de baja, su
 * nombre tiene que seguir en la lista: sacarlo haría que el desplegable se
 * viera vacío justo donde hay un dato.
 */
export const activosCon = (
  lista: readonly Vendedor[],
  actual: number | null | undefined,
): Vendedor[] => lista.filter((v) => v.activo || v.id === actual);

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
  vendedores: Vendedor[];
  productos: Producto[];
  territorios: CatalogItem[];
  canales: CatalogItem[];
  etapas: Etapa[];
  estados: Estado[];
  tiposEvento: TipoEvento[];
}

/** Placeholder shown wherever an opportunity has no salesperson assigned. */
export const SIN_ASIGNAR = "Sin asignar";

/**
 * Valor de filtro para «los que no tienen a nadie».
 *
 * Los filtros de Clientes guardan un id, y `null` ya quiere decir «sin filtrar»,
 * así que hace falta un tercer valor para pedir justo lo contrario: las fichas
 * cuyo campo está vacío. Es negativo a propósito —las claves de la base son
 * identidades que arrancan en 1— para que nunca choque con una de verdad.
 */
export const SIN_DUENO = -1;
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
  /** Edad declarada. Null si nadie la preguntó todavía. */
  edad: number | null;
  /** El adulto que responde por un menor. Se pide de 17 para abajo. */
  responsableNombre: string | null;
  responsableTelefono: string | null;
  responsableCorreo: string | null;

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
  /**
   * Anticipo con el que el cliente apartó el cupo.
   *
   * Es una parte de `valor`, no dinero aparte, y por eso no entra en ninguna
   * métrica: ver `selectors.ts`.
   */
  reserva: number | null;
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
  reserva?: number | null;
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
  edad?: number | null;
  responsable_nombre?: string | null;
  responsable_telefono?: string | null;
  responsable_correo?: string | null;
}

/**
 * Desde qué edad se inscribe alguien sin un adulto que responda: 18.
 *
 * O sea que de 17 para abajo la ficha pide nombre y contacto del responsable.
 * Se escribe como la edad en que se deja de necesitarlo, y no como «hasta 17»,
 * porque así el número coincide con la mayoría de edad y se explica solo; con
 * «hasta 17» hay que acordarse de si el 17 entra o no.
 *
 * Vive acá y no en cada pantalla porque lo usan el formulario de alta, la
 * ficha y el aviso de datos incompletos: si se cambia, tiene que cambiar en
 * los tres a la vez.
 */
export const MAYORIA_DE_EDAD = 18;

/** ¿Esta edad necesita un adulto responsable? De 17 para abajo, sí. */
export const esMenor = (edad: number | null | undefined): boolean =>
  edad != null && edad < MAYORIA_DE_EDAD;

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
  /** open / pending / resolved: abierto, esperando algo, o terminado. */
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
