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
  /**
   * Para poder corregirlos sin ir a buscarlos aparte. El teléfono además es a
   * donde n8n le avisa de un lead nuevo.
   */
  correo: string | null;
  telefono: string | null;
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
  /**
   * El horario vigente del programa, como se le dice al alumno.
   *
   * Es un borrador, no la verdad: lo que vale para una inscripción es el
   * horario que quedó guardado en su lead. Éste cambia cada año; aquél no
   * cambia nunca, para que un recibo emitido en marzo no empiece a decir otra
   * cosa cuando dirección actualice el calendario.
   */
  horario: string | null;
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
  /** Por qué se pierden los leads. Vacío si falta su migración. */
  motivosPerdida: CatalogItem[];
  tiposEvento: TipoEvento[];
}

/**
 * Una etiqueta de la bandeja.
 *
 * Es para lo que el pipeline no dice —«pidió beca», «no contesta»—, no para
 * repetir la etapa ni el estado de la venta: ésos se muestran de la
 * oportunidad misma, así que no pueden decir cosas distintas.
 */
export interface Etiqueta {
  id: number;
  nombre: string;
  /** Hexadecimal, para distinguirlas de un vistazo. */
  color: string;
  activa: boolean;
}

/**
 * Una plantilla de WhatsApp, copiada de Meta.
 *
 * `estado` es el dato que decide todo: sólo las APPROVED se pueden mandar. Una
 * en PENDING existe y figura en la lista, pero mandarla falla.
 */
export interface Plantilla {
  id: string;
  nombre: string;
  /** es, en_US… Cada idioma es una plantilla distinta para Meta. */
  idioma: string;
  estado: string;
  categoria: string | null;
  /** El texto con sus {{1}} sin reemplazar. */
  cuerpo: string | null;
  /** Cuántos huecos hay que llenar antes de mandarla. */
  variables: number;
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
  /** País, cuando el territorio es «Extranjero». Nulo en los de acá. */
  pais: string | null;
  /** Cumpleaños, en ISO. Se muestra como día/mes/año. */
  fechaNacimiento: string | null;
  responsableNombre: string | null;
  responsableTelefono: string | null;
  responsableCorreo: string | null;

  vendedorId: number | null;
  vendedor: string;
  productoId: number | null;
  /**
   * Todos los programas por los que preguntó, `productoId` incluido.
   *
   * Una persona compara antes de decidir: pregunta por Pastelería y por
   * Barismo en la misma conversación. Hasta ahora eso obligaba a abrirle un
   * lead por programa, y en la pantalla de Clientes se leía como la misma
   * persona repetida. Acá van todos juntos, en un solo lead.
   *
   * `productoId` sigue siendo el que se está vendiendo —el que cuenta en el
   * Dashboard y en los montos— y está siempre también en esta lista.
   */
  programasInteres: number[];
  /**
   * Las etiquetas puestas en este lead.
   *
   * Son las mismas del catálogo que usa la bandeja —«pidió beca», «viene de
   * feria»— pero pegadas al lead y no a la conversación: hay leads que
   * entraron por una base y nunca escribieron, y la escuela los quiere poder
   * agrupar igual para escribirles.
   *
   * Ids y no nombres: el catálogo entero ya viaja aparte.
   */
  etiquetaIds: number[];
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
  /**
   * Por qué se perdió. Sólo tiene valor mientras el estado sea «Perdido».
   *
   * Lo hace cumplir la base con un trigger, no la pantalla: sin eso, una ficha
   * que se marca perdida y a la semana vuelve a «Activo» seguiría contando en
   * la métrica de pérdidas para siempre.
   */
  motivoPerdidaId: number | null;
  motivoPerdida: string | null;
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
  /**
   * Cuándo se registró el anticipo. La pone sola la base.
   *
   * De acá salen los quince días para completar el pago. Nula en las reservas
   * viejas, cargadas antes de que existiera la columna: ahí hay anticipo pero
   * no se sabe de cuándo, y el recordatorio lo dice en vez de inventarlo.
   */
  reservaEn: string | null;
  descuento: string | null;

  /**
   * El horario con el que se cerró con esta persona.
   *
   * Sale impreso tal cual en el link de registro, así que es lo que va a leer
   * académica para inscribirla. Se congela: una vez escrito, que dirección
   * cambie el calendario del programa el año que viene no lo mueve.
   */
  horario: string | null;
  /** El horario vigente del programa. Sólo para ofrecerlo con un clic. */
  horarioPrograma: string | null;

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
  motivo_perdida_id?: number | null;
  /** ISO date; the column is `not null`, so never send null. */
  fecha_registro?: string;
  fecha_cierre?: string | null;
  valor_oportunidad?: number | null;
  venta_cerrada?: number | null;
  reserva?: number | null;
  descuento_promocion?: string | null;
  horario?: string | null;
}

/**
 * What the UI can edit on the client record.
 *
 * `clientes` is shared: one client can own several opportunities, so a change
 * here shows up in every one of them.
 */
export interface ClientePatch {
  nombre?: string;
  pais?: string | null;
  fecha_nacimiento?: string | null;
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
  /**
   * Ve todas las oportunidades, no sólo las suyas.
   *
   * Aparte de `esAdmin` a propósito: sirve para coordinación —alguien que
   * supervisa al equipo— sin darle además la administración del sistema.
   */
  veTodo: boolean;
  /**
   * Ve todos los clientes, pero en el Pipeline sólo sus propios leads.
   *
   * Estrecha nada más el tablero. Existe porque `veTodo` es una sola llave
   * para dos pantallas —Clientes y Pipeline salen de las mismas filas— y hay
   * quien necesita poder buscar a cualquier cliente y a la vez tener un
   * tablero que sea el suyo.
   *
   * A quien no tiene `veTodo` no le cambia nada: la base ya le devuelve sólo
   * lo suyo y el tablero sale filtrado solo.
   */
  pipelineSoloPropios: boolean;
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
  /**
   * Qué ficha de vendedor es esta persona. Null si no está enlazada.
   *
   * Sin esto la base no puede saber qué oportunidades son suyas, así que
   * alguien de ventas sin enlazar no ve ninguna. Es el dato que hace funcionar
   * todo el filtrado por asesor.
   */
  vendedorId: number | null;
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
  /**
   * Marcada a mano para dejarla pendiente.
   *
   * Distinta de `sinLeer`, que cuenta mensajes que nadie abrió. Ésta la pone
   * una persona que sí leyó y decidió que todavía le debe algo al hilo.
   */
  noLeida: boolean;
  /** Arriba de todo en la lista, sin importar cuándo escribió. */
  fijada: boolean;
  /** Sigue en la lista pero deja de contar para el número rojo de la barra. */
  silenciada: boolean;
  /** open / pending / resolved: abierto, esperando algo, o terminado. */
  estado: string;
  /**
   * Por dónde entró: whatsapp, instagram, messenger, tiktok.
   *
   * La columna existe desde la primera migración de la bandeja, con WhatsApp
   * por omisión. Se empieza a leer ahora porque la pantalla ya distingue: qué
   * se puede hacer en cada hilo depende del canal —Instagram no tiene
   * plantillas, su ventana dura siete días— y suponerlo llevaría a ofrecer
   * botones que fallan.
   */
  canal: string;
  /** Nulo = sin asignar, que es lo que el asesor resuelve. */
  vendedorId: number | null;
  /**
   * Hasta cuándo se le puede llamar por WhatsApp.
   *
   * WhatsApp no deja llamarle a nadie que no lo haya aceptado antes, y el
   * permiso se vence. Sin esto, la bandeja mostraría un botón «Llamar» que
   * para casi todos falla. Nulo = nunca aceptó, o ya se venció.
   */
  permisoLlamadaHasta: string | null;
  /** Cuándo se le mandó la última solicitud, para no pedírselo tres veces. */
  permisoLlamadaPedidoEn: string | null;
  /** Qué contestó. Distingue «nunca contestó» de «dijo que no». */
  permisoLlamadaRespuesta: "acepto" | "rechazo" | null;
  /** Etiquetas puestas a mano. No incluye la etapa ni el estado de la venta. */
  etiquetaIds: number[];
}

/** Una reacción sobre un mensaje: quién la puso y cuál es. */
export interface ReaccionMensaje {
  emoji: string;
  /**
   * De quién es: 'entrante' la puso el cliente, 'saliente' la pusimos
   * nosotros. Es lo que decide de qué lado se dibuja y cuál se puede sacar.
   */
  direccion: "entrante" | "saliente";
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
  /**
   * Las reacciones puestas sobre este mensaje.
   *
   * Como mucho dos: WhatsApp deja una por persona, y en un chat de dos las
   * personas son el cliente y la escuela.
   */
  reacciones: ReaccionMensaje[];
  /**
   * Si se le puede reaccionar: existe en WhatsApp y tiene id de Meta.
   *
   * Viene calculado del servidor en vez de mandar el `wa_id` al navegador. La
   * pantalla no necesita el id para nada —quien reacciona es la acción del
   * servidor, que lo busca ella— y lo único que haría acá sería viajar de más.
   *
   * Es false en una nota interna, que no existe en WhatsApp, y en un mensaje
   * cuyo envío falló, que nunca llegó a tener id.
   */
  reaccionable: boolean;
  /**
   * El archivo que trajo el mensaje, ya guardado en el bucket «whatsapp».
   * Nulo cuando el mensaje no traía o cuando no se pudo bajar —en ese caso
   * `mediaError` dice por qué, que es lo que hace falta saber si después
   * falta un comprobante.
   */
  mediaRuta: string | null;
  mediaMime: string | null;
  /** Nombre original; sólo lo traen los documentos. */
  mediaNombre: string | null;
  mediaError: string | null;
}
