/**
 * El contenido del «Manual CRM» (12/11/2026).
 *
 * Un capítulo por módulo, más «Primeros pasos», y al final las preguntas
 * frecuentes y el glosario. Cada persona ve sólo los capítulos de los módulos
 * que su rol le deja ver (ver `ManualCrm`).
 *
 * Las fotos son capturas reales del CRM. Las toma
 * `supabase/pruebas/banco/fotos-del-manual.mjs` desde el banco de pruebas: lee
 * de acá qué pantalla abrir (`modulo` y `pasos`) y dónde está cada parte
 * numerada (`selector`), y deja la imagen en `public/manual/` y la posición de
 * cada número en `src/lib/manual/puntos.json`. Si se cambia una pantalla, se
 * vuelve a correr ese script y las fotos y los números se acomodan solos.
 *
 * Escrito para alguien que entra por primera vez: en «tú», sin palabras
 * técnicas, y diciendo para qué sirve cada cosa antes de cómo se usa.
 */

/** Lo que el script hace en la pantalla antes de sacar la foto. */
export type PasoDeFoto =
  | { clic: string }
  | { esperar: number }
  | { tecla: string }
  /** Baja hasta que eso se vea arriba (para fotos de la parte de abajo). */
  | { verHasta: string };

export interface Parte {
  n: number;
  /** Dónde está en la pantalla (selector de Playwright). Sin esto no hay número sobre la foto. */
  selector?: string;
  titulo: string;
  texto: string;
}

export interface Foto {
  /** Nombre del archivo en public/manual/, sin extensión. */
  archivo: string;
  /** El módulo que hay que abrir para sacarla. */
  modulo: string;
  pasos?: PasoDeFoto[];
  /** Una línea debajo de la foto. */
  pie: string;
  partes: Parte[];
}

export interface Guia {
  pregunta: string;
  pasos: string[];
  /** Un aviso o un truco, al final. */
  nota?: string;
}

export interface PreguntaRapida {
  pregunta: string;
  opciones: string[];
  correcta: number;
  porque: string;
}

export interface Capitulo {
  id: string;
  /** El módulo del CRM. Null = lo ve todo el mundo. */
  modulo: string | null;
  titulo: string;
  emoji: string;
  /** Una frase: para qué sirve. */
  resumen: string;
  /** Quién lo usa más. */
  paraQuien: string;
  fotos: Foto[];
  guias: Guia[];
  consejos: string[];
  rapida?: PreguntaRapida;
}

export const CAPITULOS: Capitulo[] = [
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "primeros-pasos",
    modulo: null,
    titulo: "Primeros pasos",
    emoji: "👋",
    resumen: "Cómo está armado el CRM, dónde está cada cosa y qué significan los avisos de arriba.",
    paraQuien: "Todas las personas, el primer día.",
    fotos: [
      {
        archivo: "primeros-pasos",
        modulo: "Dashboard",
        pie: "Así se ve el CRM al entrar. A la izquierda, los módulos; arriba, los avisos.",
        partes: [
          { n: 1, selector: "text=SESIÓN ACTIVA", titulo: "Tu sesión", texto: "Tu nombre, tu correo y tu rol. El rol decide qué módulos ves: si te falta alguno, pídeselo a una administradora." },
          { n: 2, selector: 'aside button[data-mod="Inbox"]', titulo: "Los módulos", texto: "Cada botón abre una pantalla. El número rojo al lado avisa cuántas cosas te esperan (mensajes sin leer, recordatorios, leads fríos)." },
          { n: 3, selector: "text=En vivo", titulo: "En vivo", texto: "Mientras diga «En vivo», lo que hacen tus compañeras aparece solo, sin recargar. Si dice otra cosa, toca «Actualizar»." },
          { n: 4, selector: '[aria-label$="sonido de los avisos"]', titulo: "El sonido", texto: "Prende o apaga el timbre de los mensajes nuevos. Con la flechita de al lado eliges qué sonido y qué volumen." },
          { n: 5, selector: '[aria-label^="Recordatorios"]:not([data-mod])', titulo: "Pendientes para hoy", texto: "El relojito: lo que tienes que hacer hoy (llamadas prometidas, reservas que vencen). El número dice cuántas cosas te esperan." },
          { n: 6, selector: 'button[aria-label="Notificaciones"]:not([data-mod])', titulo: "Actividad del equipo", texto: "La campanita: lo último que pasó en el CRM, por ejemplo un lead que te asignaron." },
          { n: 7, selector: '[aria-label="Idioma / Language"]', titulo: "Idioma", texto: "ES / EN: cambia el CRM a inglés o español. Solo cambia los textos, no los datos." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo entro al CRM?",
        pasos: [
          "Abre el enlace del CRM en Chrome (o el navegador que uses siempre).",
          "Escribe el usuario y la contraseña que te dio la administradora.",
          "Si no recuerdas la contraseña, pídele a una administradora que te la cambie desde «Usuarios y Roles».",
        ],
      },
      {
        pregunta: "¿Por qué no veo algunos módulos que sí ven mis compañeras?",
        pasos: [
          "Cada persona tiene un rol (Ventas, Jefe de ventas, Administrador…).",
          "El rol tiene casillas que dicen qué módulos se ven y qué se puede hacer en cada uno.",
          "Si necesitas uno que no ves, pídeselo a una administradora: lo activa en «Usuarios y Roles → Roles y Permisos».",
        ],
      },
      {
        pregunta: "Dice «Se cortó la conexión con el CRM», ¿qué hago?",
        pasos: [
          "Nada: el CRM se vuelve a cargar solo en unos segundos.",
          "Si tarda, toca «Reintentar ahora».",
          "Si sigue igual, revisa tu internet y toca «Recargar la página».",
        ],
        nota: "Lo que estabas escribiendo en un chat se guarda como borrador y vuelve a aparecer.",
      },
    ],
    consejos: [
      "Deja una pestaña del CRM abierta toda la jornada: así te llegan los mensajes, el sonido y las alertas de la agenda.",
      "Permite las notificaciones del navegador cuando el CRM te lo pregunte: te avisa aunque estés en otra pestaña.",
      "Todo lo que cambias queda registrado con tu nombre en «Notificaciones», así que no hay que tener miedo de equivocarse: siempre se puede ver qué pasó y corregirlo.",
    ],
    rapida: {
      pregunta: "Tus compañeras movieron un lead y tú no lo ves cambiar. ¿Qué miras primero?",
      opciones: ["Cierro sesión y vuelvo a entrar", "Que arriba diga «En vivo»; si no, toco «Actualizar»", "Le pido a la administradora que me dé permiso"],
      correcta: 1,
      porque: "«En vivo» quiere decir que los cambios llegan solos. Si se cortó, «Actualizar» trae lo último sin perder nada.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "dashboard",
    modulo: "Dashboard",
    titulo: "Dashboard",
    emoji: "📊",
    resumen: "La foto de cómo vamos: leads, ventas, valor en juego y tasa de cierre del mes, comparados con el mes anterior.",
    paraQuien: "Jefaturas y dirección; también sirve a cada asesora para ver su mes.",
    fotos: [
      {
        archivo: "dashboard",
        modulo: "Dashboard",
        pie: "Los números de arriba se comparan siempre contra el periodo anterior.",
        partes: [
          { n: 1, selector: 'main button:has-text("Noviembre"), main button:has-text("Mes")', titulo: "El periodo", texto: "Elige qué mes ver, el año o todo el histórico. Todo lo de abajo cambia con esto." },
          { n: 2, selector: 'text=Reporte del día', titulo: "Reportes", texto: "«Reporte del día» y «Reporte del mes» arman un resumen listo para compartir, del día que elijas al lado." },
          { n: 3, selector: 'text="Oportunidades"', titulo: "Las tarjetas", texto: "Oportunidades nuevas, cuántas siguen en el pipeline, cuánto valen y qué porcentaje se cerró. La flechita roja o verde compara con el periodo anterior." },
          { n: 4, selector: "text=Cursos y diplomados vendidos", titulo: "Lo vendido", texto: "Las inscripciones ganadas, separadas por tipo de programa: hoy, este mes, este año." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo veo cómo nos fue el mes pasado?",
        pasos: ["Arriba, toca el botón del mes anterior.", "Todas las tarjetas y gráficos cambian a ese mes, comparado contra el mes de antes."],
      },
      {
        pregunta: "¿Por qué un lead de octubre que se ganó en noviembre cuenta en noviembre?",
        pasos: [
          "Los leads se cuentan por el mes en que entraron (fecha de registro).",
          "Las ventas se cuentan por el mes en que se cerraron (fecha de cierre).",
          "Así un mes muestra lo que entró y lo que se vendió de verdad en ese mes.",
        ],
      },
    ],
    consejos: [
      "Si un número no te cuadra, abre «Clientes» con el mismo mes en el filtro: ahí ves los leads uno por uno.",
      "Para que el Dashboard diga la verdad, cada venta tiene que tener su «Fecha de cierre» y su «Venta cerrada» en la ficha.",
    ],
    rapida: {
      pregunta: "Cerraste una venta hoy pero el lead entró el mes pasado. ¿En qué mes cuenta la venta?",
      opciones: ["En el mes pasado", "En este mes", "En los dos"],
      correcta: 1,
      porque: "Las ventas cuentan por fecha de cierre; el lead cuenta por fecha de registro.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "tablero",
    modulo: "Tablero Comercial",
    titulo: "Tablero Comercial",
    emoji: "📋",
    resumen: "La plantilla semanal de Marketing y Ventas para Dirección, con lo que el CRM ya sabe puesto solo.",
    paraQuien: "Jefaturas de ventas y marketing; dirección lo consulta.",
    fotos: [
      {
        archivo: "tablero",
        modulo: "Tablero Comercial",
        pie: "Lo que viene del CRM se ve en gris: solo escribes lo que falta.",
        partes: [
          { n: 1, selector: "main select >> nth=0", titulo: "Mes a revisar", texto: "Elige el mes. Las semanas del tablero son las de ese mes." },
          { n: 2, selector: "text=Lo que viene del CRM", titulo: "Gris = automático", texto: "Las celdas en gris las llena el CRM (leads, ventas, citas). Solo se corrigen si hace falta." },
          { n: 3, selector: "text=Guía", titulo: "Guía", texto: "Explica de dónde sale cada fila y quién la llena." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Qué tengo que llenar yo?",
        pasos: [
          "Abre el mes que toca.",
          "Busca las celdas en blanco de tu parte (Marketing, Ventas o Actividad, según tu rol).",
          "Escribe el número y sal de la celda: se guarda solo.",
        ],
        nota: "Si no ves el lápiz en una parte, tu rol no la llena: pídeselo a una administradora si debería.",
      },
    ],
    consejos: ["Llénalo una vez por semana, siempre el mismo día: así Dirección lo ve completo en su reunión."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "inbox",
    modulo: "Inbox",
    titulo: "Inbox",
    emoji: "💬",
    resumen: "Todos los chats de WhatsApp, Instagram y Messenger en una sola bandeja, con el lead de cada persona al lado.",
    paraQuien: "Asesoras y jefaturas de ventas, todo el día.",
    fotos: [
      {
        archivo: "inbox",
        modulo: "Inbox",
        pie: "A la izquierda la lista de chats; a la derecha, el chat abierto.",
        partes: [
          { n: 1, selector: 'main button:has-text("Activas")', titulo: "Las pestañas", texto: "Activas (las de todos los días), Pendientes (sin leer o marcadas), Sin asignar (nadie las atiende), Archivadas y Todas." },
          { n: 2, selector: "[data-reglas-del-equipo]", titulo: "Reglas del equipo", texto: "Las reglas para trabajar la misma bandeja sin pisarse. Solo lo ve el equipo de ventas." },
          { n: 3, selector: 'main button:has-text("+ Nuevo chat")', titulo: "Nuevo chat", texto: "Escríbele a alguien que ya está en el CRM aunque nunca te haya escrito." },
          { n: 4, selector: 'main input[placeholder*="Buscar"]', titulo: "Buscar", texto: "Busca por nombre, teléfono o lo que dice un mensaje." },
          { n: 5, selector: "button.row >> nth=0", titulo: "Un chat", texto: "Nombre, último mensaje y a quién está asignado. En negrita y con número: sin leer. El ⋮ abre más opciones." },
        ],
      },
      {
        archivo: "inbox-chat",
        modulo: "Inbox",
        pasos: [{ clic: "button.row >> nth=0" }, { esperar: 1500 }],
        pie: "Un chat abierto: arriba las acciones, en medio los mensajes, abajo para escribir.",
        partes: [
          { n: 1, selector: ".acciones-del-hilo select", titulo: "Asesora asignada", texto: "A quién le toca dar seguimiento. Si dice «Sin asignar», asígnalo antes de contestar." },
          { n: 2, selector: 'main button:has-text("Abrir lead"), main button:has-text("Ver ficha")', titulo: "El lead", texto: "Abre (o crea) la ficha del cliente sin salir del chat." },
          { n: 3, selector: 'main button:has-text("Archivar")', titulo: "Archivar", texto: "Saca el chat de la vista cuando la conversación terminó. Si el cliente escribe, vuelve solo." },
          { n: 4, selector: "text=Nota interna", titulo: "Nota interna", texto: "Marca esta casilla para escribir algo que solo ve el equipo. El cliente no lo recibe." },
          { n: 5, selector: 'main select:has(option:has-text("Mandar una plantilla")), main button:has-text("Usar una plantilla")', titulo: "Plantillas", texto: "Pasadas 24 horas desde el último mensaje del cliente, WhatsApp solo deja escribir con una plantilla aprobada. El aviso amarillo te lo dice." },
          { n: 6, selector: '[aria-label="Grabar una nota de voz"]', titulo: "Nota de voz", texto: "Mantén la conversación con audio: graba, escucha y envía." },
          { n: 7, selector: 'main button:has-text("Enviar")', titulo: "Enviar", texto: "Envía con el botón o con Enter. Shift+Enter hace un salto de línea." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo contesto un mensaje?",
        pasos: [
          "Toca el chat en la lista de la izquierda.",
          "Revisa que tenga asesora asignada (arriba a la derecha).",
          "Escribe abajo y toca «Enviar» (o Enter).",
          "Las dos palomitas grises son «entregado»; azules, «leído».",
        ],
      },
      {
        pregunta: "El cliente no escribe hace más de 24 horas, ¿cómo le escribo?",
        pasos: [
          "Abre el chat: verás el aviso de que solo se puede con plantilla.",
          "Elige una en «Mandar una plantilla…» (o toca «Usar una plantilla»).",
          "Completa los espacios si la plantilla los tiene y toca «Mandar».",
          "Cuando el cliente conteste, ya puedes escribir libre otra vez.",
        ],
        nota: "Las plantillas se aprueban en Meta; si falta una, pídesela a la administradora.",
      },
      {
        pregunta: "¿Cómo le paso un chat a otra asesora?",
        pasos: [
          "Abre el chat.",
          "En el selector de arriba elige a la otra asesora.",
          "Marca «Nota interna» y escribe qué falta, para que no empiece de cero.",
        ],
      },
      {
        pregunta: "¿Cómo dejo un chat para después?",
        pasos: [
          "Toca los ⋮ del chat en la lista.",
          "Elige «Dejar pendiente» (queda como no leído) o «Fijar» (queda arriba de todo).",
          "Silenciar sirve para que un chat no suene.",
        ],
      },
      {
        pregunta: "Alguien escribió pero no es un posible cliente, ¿qué hago?",
        pasos: ["Abre el chat.", "Toca «No era lead»: el CRM lo saca del pipeline para que no cuente en los números."],
      },
      {
        pregunta: "¿Cómo mando una foto, un PDF o un audio?",
        pasos: [
          "Toca el clip 📎 para adjuntar una foto o un archivo.",
          "Para un audio, toca el micrófono 🎤, habla y vuelve a tocar para terminar.",
          "Revisa y envía.",
        ],
      },
    ],
    consejos: [
      "Si abres un chat que es de otra asesora y solo lo estabas revisando, déjalo en «No leído» para que su dueña lo vea.",
      "El borrador de cada chat se guarda solo: puedes cambiar de chat y volver sin perder lo escrito.",
      "Usa las etiquetas («Interesada en beca», «Pide portafolio»…) para encontrar después a quién le falta algo.",
    ],
    rapida: {
      pregunta: "Un cliente escribió hace 3 días y no contestaste. ¿Cómo le escribes hoy?",
      opciones: ["Escribo normal, como siempre", "Con una plantilla aprobada", "No se puede, hay que esperar a que escriba"],
      correcta: 1,
      porque: "Pasadas 24 horas, WhatsApp solo deja retomar la conversación con una plantilla aprobada.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "clientes",
    modulo: "Clientes",
    titulo: "Clientes y la ficha del lead",
    emoji: "🗂️",
    resumen: "La lista de todas las oportunidades, con filtros, y la ficha donde se guarda todo de cada lead.",
    paraQuien: "Asesoras, jefaturas y marketing.",
    fotos: [
      {
        archivo: "clientes",
        modulo: "Clientes",
        pie: "La lista de leads. Cada fila es una oportunidad; tócala para abrir su ficha.",
        partes: [
          { n: 1, selector: 'main input[placeholder*="Buscar"]', titulo: "Buscar", texto: "Por nombre, código, teléfono o correo." },
          { n: 2, selector: 'main button:has-text("Etapa")', titulo: "Filtros", texto: "Mes, vendedor, etapa, estado, programa, canal, etiqueta… Se combinan entre sí." },
          { n: 3, selector: 'main button:has-text("Duplicados sugeridos")', titulo: "Duplicados", texto: "El CRM encuentra personas repetidas (mismo teléfono o correo) para unirlas." },
          { n: 4, selector: 'main button:has-text("+ Nuevo cliente")', titulo: "Nuevo cliente", texto: "Crea un lead a mano: nombre, teléfono, programa y asesora." },
          { n: 5, selector: 'main button:has-text("Subir base")', titulo: "Subir una base", texto: "Carga un Excel con muchos leads de una vez (por ejemplo, de una feria)." },
          { n: 6, selector: "main thead input[type=checkbox]", titulo: "Seleccionar", texto: "Marca varias filas para escribirles a todas por WhatsApp (se arma un Envío)." },
        ],
      },
      {
        archivo: "ficha",
        modulo: "Clientes",
        pasos: [{ clic: "main tbody tr >> nth=0 >> td >> nth=2" }, { esperar: 1800 }],
        pie: "La ficha del lead: se abre a la derecha sin perder la lista.",
        partes: [
          { n: 1, selector: 'button:has-text("Link de registro")', titulo: "Link de registro", texto: "Copia el enlace para que el cliente llene su inscripción y reciba su recibo." },
          { n: 2, selector: "text=ETAPA DEL PROCESO", titulo: "Etapa del proceso", texto: "En qué paso va la venta: de Prospecto a Ganado. Es lo mismo que la columna del Pipeline." },
          { n: 3, selector: 'text="Reserva"', titulo: "Los montos", texto: "Valor de la oportunidad, reserva (anticipo), venta cerrada y descuento." },
        ],
      },
      {
        archivo: "ficha-medio",
        modulo: "Clientes",
        pasos: [{ clic: "main tbody tr >> nth=0 >> td >> nth=2" }, { esperar: 1800 }, { verHasta: "text=CLASIFICACIÓN" }, { esperar: 500 }],
        pie: "La mitad de la ficha: cómo se clasifica el lead y cuándo volver a llamarlo.",
        partes: [
          { n: 1, selector: "text=CLASIFICACIÓN", titulo: "Clasificación", texto: "Etapa, estado, programa, vendedor, canal, territorio y programas por los que preguntó." },
          { n: 2, selector: "text=Etiquetas >> nth=0", titulo: "Etiquetas", texto: "Marcas libres («Interesada en beca», «Pide portafolio») para encontrarlo después." },
          { n: 3, selector: 'button:has-text("Agendar recordatorio")', titulo: "Recordatorio", texto: "Pon una fecha para volver a contactarlo: aparece en «Recordatorios» ese día y en el relojito de arriba." },
          { n: 4, selector: "text=Fecha de registro", titulo: "Registro", texto: "Código, fechas de registro y de cierre, montos y horario del diplomado." },
        ],
      },
      {
        archivo: "ficha-abajo",
        modulo: "Clientes",
        pasos: [{ clic: "main tbody tr >> nth=0 >> td >> nth=2" }, { esperar: 1800 }, { verHasta: "text=REGISTRAR SEGUIMIENTO" }, { esperar: 500 }],
        pie: "Más abajo en la ficha: el seguimiento, los documentos y las autorizaciones.",
        partes: [
          { n: 1, selector: 'a:has-text("Llamar"):visible, button:has-text("Llamar"):visible', titulo: "Llamar / WhatsApp", texto: "Contacta al cliente desde la ficha. «WhatsApp» abre su chat sin salir de aquí." },
          { n: 2, selector: "text=REGISTRAR SEGUIMIENTO", titulo: "Registrar seguimiento", texto: "Anota qué pasó en cada contacto. Si escribes «seguimiento de pago el jueves», el CRM arma el recordatorio solo." },
          { n: 3, selector: "text=DOCUMENTOS ADJUNTOS", titulo: "Documentos", texto: "Fotos, PDF, Word o Excel de hasta 15 MB. También puedes pegar una captura con Ctrl+V." },
          { n: 4, selector: 'button:has-text("Solicitar autorización")', titulo: "Autorizaciones", texto: "Pide a dirección un descuento o un plan de pago especial." },
          { n: 5, selector: 'button:has-text("Guardar cambios")', titulo: "Guardar cambios", texto: "Guarda lo que cambiaste en los campos de arriba. Las notas y documentos se guardan solos." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo creo un lead nuevo?",
        pasos: [
          "En Clientes, toca «+ Nuevo cliente».",
          "Escribe nombre y teléfono (con código de país, por ejemplo 503…).",
          "Elige el programa y la asesora, y guarda.",
        ],
        nota: "Si esa persona ya existe, el CRM te avisa para no duplicarla.",
      },
      {
        pregunta: "¿Cómo anoto una llamada que hice?",
        pasos: [
          "Abre la ficha del lead.",
          "Baja hasta «Registrar seguimiento».",
          "Escribe qué pasó (objeciones, acuerdos, próximos pasos) y toca «Guardar nota».",
        ],
        nota: "Las notas se guardan al momento, no hace falta «Guardar cambios».",
      },
      {
        pregunta: "Ya pagó, ¿cómo registro la venta?",
        pasos: [
          "Abre la ficha.",
          "Escribe el monto en «Venta cerrada» y pon la «Fecha de cierre».",
          "Cambia la etapa a «Ganado».",
          "Toca «Guardar cambios».",
        ],
      },
      {
        pregunta: "Dejó un anticipo, ¿qué pongo?",
        pasos: [
          "En la ficha, escribe el monto en «Reserva».",
          "Guarda los cambios.",
          "El CRM cuenta 15 días para completar el pago y te lo recuerda en «Recordatorios».",
        ],
      },
      {
        pregunta: "¿Cómo le escribo a muchos leads a la vez?",
        pasos: [
          "En Clientes, filtra a quién quieres escribirle (por programa, etapa, vendedor…).",
          "Marca las filas con la casilla (o la de arriba para todas).",
          "Toca «Escribirles por WhatsApp», elige la plantilla y envía.",
          "El resultado lo ves en «Envíos».",
        ],
      },
      {
        pregunta: "¿Cómo pido un descuento para un cliente?",
        pasos: [
          "Abre la ficha y baja hasta «Autorizaciones».",
          "Toca «Solicitar autorización», elige qué pides y explica por qué.",
          "Dirección lo aprueba o lo rechaza desde «Autorizaciones», y lo ves en la ficha.",
        ],
      },
    ],
    consejos: [
      "Los datos del cliente (nombre, teléfono, correo) son de la persona: si los cambias, cambian en todas sus oportunidades.",
      "Si el alumno es menor de edad, la ficha pide un adulto responsable: llénalo antes de mandar el link de registro.",
      "Una nota corta después de cada contacto ahorra muchas preguntas después: quien tome el lead sabrá exactamente en qué va.",
    ],
    rapida: {
      pregunta: "Cambiaste la etapa y el programa de un lead. ¿Qué falta para que quede guardado?",
      opciones: ["Nada, se guarda solo", "Tocar «Guardar cambios»", "Escribir una nota"],
      correcta: 1,
      porque: "Los campos de arriba se guardan con «Guardar cambios». Solo las notas y los documentos se guardan solos.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "pipeline",
    modulo: "Pipeline",
    titulo: "Pipeline",
    emoji: "🧭",
    resumen: "Los leads como tarjetas en columnas, una por etapa de la venta. Se mueven arrastrando.",
    paraQuien: "Asesoras y jefaturas de ventas.",
    fotos: [
      {
        archivo: "pipeline",
        modulo: "Pipeline",
        pie: "Cada columna es una etapa; cada tarjeta, un lead.",
        partes: [
          { n: 1, selector: "text=Tablero de", titulo: "De quién", texto: "Todo el equipo o una asesora. Tú ves los tuyos y los que te deja tu rol." },
          { n: 2, selector: 'main button:has-text("Programa")', titulo: "Filtros", texto: "Mes, estado, motivo, programa, canal y territorio." },
          { n: 3, selector: "text=Prospectos >> nth=0", titulo: "Una etapa", texto: "El nombre de la columna, cuántos leads tiene y cuánto suman." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo avanzo un lead de etapa?",
        pasos: [
          "Toma la tarjeta y arrástrala a la columna siguiente.",
          "Si la pasas a «Perdido», abre la ficha y anota el motivo: sirve para entender por qué se pierden ventas.",
          "También puedes cambiar la etapa desde la ficha.",
        ],
      },
      {
        pregunta: "¿Qué diferencia hay entre etapa y estado?",
        pasos: [
          "La etapa es el paso de la venta (Prospecto, Primer contacto, Propuesta, Pago…).",
          "El estado dice si sigue vivo (Activo) o si ya terminó (Ganado o Perdido).",
          "Se mantienen de acuerdo solos: si mueves la tarjeta a «Ganado», el estado también cambia.",
        ],
      },
    ],
    consejos: ["Revisa tu pipeline al empezar el día: lo que lleva mucho tiempo en la misma columna necesita un empujón."],
    rapida: {
      pregunta: "Mueves una tarjeta a «Ganado». ¿Qué pasa con su estado?",
      opciones: ["Hay que cambiarlo a mano", "Cambia solo a «Ganado»", "Se borra el lead"],
      correcta: 1,
      porque: "Etapa y estado se mantienen de acuerdo solos: mover la tarjeta alcanza.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "calendario",
    modulo: "Calendario",
    titulo: "Calendario",
    emoji: "📅",
    resumen: "La agenda de llamadas, visitas, clases muestra y seguimientos, con la forma de Google Calendar.",
    paraQuien: "Asesoras y jefaturas.",
    fotos: [
      {
        archivo: "calendario",
        modulo: "Calendario",
        pie: "Vista Semana: cada evento en su día y su hora.",
        partes: [
          { n: 1, selector: "[data-cal-crear]", titulo: "Crear", texto: "Agenda un evento nuevo. También puedes tocar un hueco del calendario a la hora que quieras." },
          { n: 2, selector: "text=Asesoras", titulo: "Filtros", texto: "Marca o desmarca asesoras y tipos de evento para ver solo lo que te interesa." },
          { n: 3, selector: 'main button:has-text("Hoy")', titulo: "Hoy y flechas", texto: "Vuelve a hoy o avanza y retrocede. Atajos: T (hoy), J y K." },
          { n: 4, selector: '[role=tab]:has-text("Semana")', titulo: "Las vistas", texto: "Día, Semana, Mes o Agenda (lista). Atajos: D, W, M, A." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo agendo una llamada con un lead?",
        pasos: [
          "Toca «Crear» (o el hueco del día y la hora en el calendario).",
          "Busca el lead por nombre, código o teléfono y elígelo.",
          "Elige el tipo (llamada, visita, clase muestra…), la fecha, la hora y la asesora.",
          "Toca «Guardar»: te aparece la confirmación con a quién le llegará la alerta.",
        ],
      },
      {
        pregunta: "¿Cuándo me avisa?",
        pasos: [
          "10 minutos antes salta una ventana en el centro de la pantalla, con sonido.",
          "Le llega a la asesora del evento y a quien lo agendó.",
          "Tiene que estar el CRM abierto (si permites las notificaciones del navegador, te llega aunque estés en otra pestaña).",
        ],
      },
      {
        pregunta: "Ya hice la llamada, ¿qué hago con el evento?",
        pasos: ["Toca el evento.", "Elige «Marcar realizado» o «No se presentó».", "Si hay que moverlo, toca «Cambiar hora»."],
      },
    ],
    consejos: [
      "Los colores son por tipo de evento: así ves de un vistazo si tu día es de llamadas o de visitas.",
      "Lo que ya se hizo se ve más claro; lo que no se presentó, tachado.",
    ],
    rapida: {
      pregunta: "¿Cuánto antes te avisa el CRM de una llamada agendada?",
      opciones: ["1 hora", "10 minutos", "Al día siguiente"],
      correcta: 1,
      porque: "La alerta emergente salta 10 minutos antes, a la asesora y a quien agendó.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "envios",
    modulo: "Envíos",
    titulo: "Envíos",
    emoji: "📣",
    resumen: "Las campañas de WhatsApp a muchas personas, y cómo le fue a cada una.",
    paraQuien: "Marketing y jefaturas.",
    fotos: [
      {
        archivo: "envios",
        modulo: "Envíos",
        pie: "Aquí se revisan las campañas; se arman desde Clientes.",
        partes: [],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo armo una campaña?",
        pasos: [
          "Ve a «Clientes» y filtra a quién quieres escribirle.",
          "Marca las filas y toca «Escribirles por WhatsApp».",
          "Elige la plantilla, revisa y envía.",
          "Vuelve a «Envíos» para ver cuántos se entregaron, leyeron y contestaron.",
        ],
        nota: "Las respuestas llegan al Inbox de cada asesora, como cualquier chat.",
      },
    ],
    consejos: ["Antes de mandar a cientos, prueba la plantilla mandándotela a ti o a una compañera."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "bases",
    modulo: "Bases",
    titulo: "Bases",
    emoji: "📥",
    resumen: "Las listas de leads que se subieron en Excel, y qué pasó con cada una.",
    paraQuien: "Marketing y jefaturas.",
    fotos: [
      {
        archivo: "bases",
        modulo: "Bases",
        pie: "Cada base subida, con cuántos clientes trajo y cuántos se ganaron.",
        partes: [
          { n: 1, selector: 'main button:has-text("Subir base")', titulo: "Subir base", texto: "Carga un Excel nuevo. El CRM revisa los repetidos antes de crear las fichas." },
          { n: 2, selector: "text=Bases subidas", titulo: "Las bases", texto: "Toca una para ver sus registros y abrirlos." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo subo un Excel de leads?",
        pasos: [
          "Toca «Subir base» y elige el archivo.",
          "Revisa lo que el CRM reconoció (nombre, teléfono, programa…) y los que ya existían.",
          "Confirma: se crean las fichas nuevas, y la base queda en esta lista.",
        ],
      },
    ],
    consejos: ["Los teléfonos con código de país (503…) evitan duplicados y hacen que WhatsApp funcione a la primera."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "recordatorios",
    modulo: "Recordatorios",
    titulo: "Recordatorios",
    emoji: "⏰",
    resumen: "Lo que hay que hacer hoy: reservas por cobrar antes de que venzan y llamadas prometidas en las notas.",
    paraQuien: "Asesoras, cada mañana.",
    fotos: [
      {
        archivo: "recordatorios",
        modulo: "Recordatorios",
        pie: "Lo más urgente primero.",
        partes: [
          { n: 1, selector: "text=vencido >> nth=0", titulo: "El semáforo", texto: "Vencido, vence hoy, por vencer, en plazo, sin fecha." },
          { n: 2, selector: "text=Reservas por cobrar", titulo: "Reservas por cobrar", texto: "Quien deja un anticipo tiene 15 días para completar el pago. El aviso se apaga solo al registrar la venta." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo hago que algo aparezca aquí?",
        pasos: [
          "En la ficha, usa «Agendar recordatorio» con la fecha que quieras.",
          "O escribe en una nota «seguimiento de pago el jueves»: el CRM lo agenda solo.",
          "Al registrar una reserva, se crea solo el recordatorio de los 15 días.",
        ],
      },
    ],
    consejos: ["Empieza el día aquí: si lo vencido está en cero, vas bien."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "frios",
    modulo: "Fríos",
    titulo: "Fríos",
    emoji: "❄️",
    resumen: "Los leads abiertos que nadie tocó en 15 días o más, para que no se pierdan.",
    paraQuien: "Asesoras y jefaturas.",
    fotos: [
      {
        archivo: "frios",
        modulo: "Fríos",
        pie: "Los que más tiempo llevan sin tocar, primero.",
        partes: [{ n: 1, selector: "text=leads fríos", titulo: "Cuántos y cuánto", texto: "Cuántos leads se están enfriando y cuánto dinero hay en juego." }],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo saco un lead de esta lista?",
        pasos: ["Ábrelo y haz algo: una nota, un mensaje, un cambio de etapa.", "Sale solo de la lista en cuanto alguien lo toca."],
      },
    ],
    consejos: ["Si de verdad ya no tiene futuro, márcalo como «Perdido» con su motivo: así deja de ensuciar los números."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "equipos",
    modulo: "Equipos",
    titulo: "Equipos",
    emoji: "👥",
    resumen: "Las asesoras, a quién le tocan los leads nuevos y la revisión de que nadie quede afuera.",
    paraQuien: "Jefaturas y administración.",
    fotos: [
      {
        archivo: "equipos",
        modulo: "Equipos",
        pie: "Arriba, la revisión del equipo con lo que hay que arreglar.",
        partes: [
          { n: 1, selector: "text=Revisión del equipo", titulo: "Revisión del equipo", texto: "Avisa si alguien de baja tiene leads o chats, o si una asesora no puede recibir leads." },
          { n: 2, selector: 'main button:has-text("Traspasar")', titulo: "Traspasar cartera", texto: "Pasa todos los leads y chats de una persona a otra de una vez." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "Una asesora se fue, ¿qué hago con sus leads?",
        pasos: [
          "En Equipos, busca su nombre en «Revisión del equipo».",
          "Toca «Traspasar su cartera» y elige a quién pasarlos.",
          "Sus chats se van con sus leads.",
        ],
      },
    ],
    consejos: ["Una asesora nueva necesita dos cosas para recibir leads: su ficha de vendedora aquí y su cuenta en «Usuarios y Roles»."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "programas",
    modulo: "Programas",
    titulo: "Programas",
    emoji: "🎓",
    resumen: "El catálogo de cursos, diplomados y certificaciones, con su precio, horario y demanda.",
    paraQuien: "Jefaturas y académica.",
    fotos: [
      {
        archivo: "programas",
        modulo: "Programas",
        pie: "Cada programa con su horario vigente, lo que hay en pipeline y lo cerrado.",
        partes: [
          { n: 1, selector: 'main button:has-text("Crear nuevo programa")', titulo: "Crear programa", texto: "Agrega un curso o diplomado nuevo al catálogo." },
          { n: 2, selector: 'main button:has-text("Editar") >> nth=0', titulo: "Editar", texto: "Cambia nombre, precio de lista u horario vigente." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "Cambió el horario de un diplomado, ¿dónde lo actualizo?",
        pasos: ["Busca el programa.", "Toca «Editar» y cambia el horario vigente.", "Guarda: los recibos nuevos salen con el horario nuevo."],
      },
    ],
    consejos: ["Mantén el horario vigente al día: es el que sale en el recibo del link de registro."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "formularios",
    modulo: "Formularios",
    titulo: "Formularios",
    emoji: "📝",
    resumen: "Un formulario por feria o evento: lo que la gente contesta entra solo como lead.",
    paraQuien: "Marketing y asesoras en ferias.",
    fotos: [
      {
        archivo: "formularios",
        modulo: "Formularios",
        pie: "Cada formulario dice cuántos leads trajo y con qué canal entran.",
        partes: [
          { n: 1, selector: 'main button:has-text("Nuevo formulario")', titulo: "Nuevo formulario", texto: "Arma las preguntas para una feria o evento." },
          { n: 2, selector: 'main button:has-text("Llenar") >> nth=0', titulo: "Llenar", texto: "Abre el formulario para llenarlo en la tablet o el celular en la feria." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo lo uso en una feria?",
        pasos: [
          "Abre el formulario y toca «Llenar» en la tablet.",
          "Cada persona que lo llena se vuelve un lead asignado a quien lo llenó.",
          "Al terminar la feria, toca «Cerrar» para que no entren más.",
        ],
      },
    ],
    consejos: ["Todo lo que contestan queda en la bitácora del lead: no hace falta pasarlo a mano."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "plantillas",
    modulo: "Plantillas",
    titulo: "Plantillas",
    emoji: "🧾",
    resumen: "Los mensajes aprobados por Meta para escribir después de 24 horas o en campañas.",
    paraQuien: "Marketing y administración.",
    fotos: [
      {
        archivo: "plantillas",
        modulo: "Plantillas",
        pie: "Las plantillas tal como están aprobadas en Meta.",
        partes: [
          { n: 1, selector: 'main button:has-text("Sincronizar")', titulo: "Sincronizar", texto: "Trae las plantillas nuevas o cambiadas desde Meta." },
          { n: 2, selector: 'main a:has-text("Crear plantilla"), main button:has-text("Crear plantilla")', titulo: "Crear en Meta", texto: "Las plantillas se crean y se aprueban en Meta; este botón te lleva ahí." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "Hice una plantilla en Meta y no aparece en el CRM",
        pasos: ["Revisa que Meta ya la haya aprobado.", "Aquí, toca «Sincronizar»."],
      },
    ],
    consejos: ["Meta tarda desde minutos hasta un día en aprobar: crea las plantillas de campaña con tiempo."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "notificaciones",
    modulo: "Notificaciones",
    titulo: "Notificaciones",
    emoji: "🔔",
    resumen: "El registro de todo lo que pasó en el CRM: quién cambió qué y cuándo.",
    paraQuien: "Jefaturas y administración; cualquiera para revisar qué pasó con un lead.",
    fotos: [
      {
        archivo: "notificaciones",
        modulo: "Notificaciones",
        pie: "Filtra por persona, por tipo de cosa, por acción y por fechas.",
        partes: [{ n: 1, selector: "text=QUIÉN", titulo: "Los filtros", texto: "Quién, qué (leads, notas, chats…), qué acción (crear, cambiar, borrar) y desde/hasta." }],
      },
    ],
    guias: [
      {
        pregunta: "Alguien cambió un lead y no sé quién fue",
        pasos: ["Abre Notificaciones.", "En «Qué», elige Oportunidades.", "Busca el lead: cada cambio dice quién y cuándo, con «Ver ficha»."],
      },
    ],
    consejos: ["Nada se borra sin dejar rastro aquí: si algo desapareció, aquí ves quién y cuándo."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "autorizaciones",
    modulo: "Autorizaciones",
    titulo: "Autorizaciones",
    emoji: "✅",
    resumen: "Los descuentos y planes de pago especiales que pide el equipo y aprueba dirección.",
    paraQuien: "Dirección aprueba; el equipo pide desde la ficha.",
    fotos: [
      {
        archivo: "autorizaciones",
        modulo: "Autorizaciones",
        pie: "Arriba lo que espera respuesta; abajo, qué se puede pedir.",
        partes: [{ n: 1, selector: "text=Qué se puede autorizar", titulo: "Qué se puede pedir", texto: "Las generales sirven para cualquier lead; las específicas, para un caso puntual." }],
      },
    ],
    guias: [
      {
        pregunta: "¿Cómo pido una autorización?",
        pasos: ["Abre la ficha del lead.", "En «Autorizaciones», toca «Solicitar autorización».", "Elige qué pides y explica por qué.", "La respuesta de dirección aparece en la misma ficha."],
      },
    ],
    consejos: ["Explica el caso en una frase clara (cuánto, por qué, para cuándo): se aprueba más rápido."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "usuarios",
    modulo: "Usuarios y Roles",
    titulo: "Usuarios y Roles",
    emoji: "🔐",
    resumen: "Las cuentas de acceso y qué puede ver y hacer cada rol.",
    paraQuien: "Solo administración.",
    fotos: [
      {
        archivo: "usuarios",
        modulo: "Usuarios y Roles",
        pie: "Usuarios por un lado; roles y permisos por el otro.",
        partes: [
          { n: 1, selector: 'main button:has-text("Nuevo usuario")', titulo: "Nuevo usuario", texto: "Crea la cuenta con usuario y contraseña, y elige su rol." },
          { n: 2, selector: 'main button:has-text("Roles y Permisos")', titulo: "Roles y permisos", texto: "Las casillas de cada rol: qué módulos ve y si puede crear, editar o eliminar." },
        ],
      },
    ],
    guias: [
      {
        pregunta: "Entra una asesora nueva, ¿qué hago?",
        pasos: [
          "Crea su usuario con «+ Nuevo usuario» y elige el rol «Ventas».",
          "Enlázala con su ficha de vendedora (si no existe, créala en «Equipos»).",
          "Pídele que entre y lea este manual 😉.",
        ],
      },
    ],
    consejos: ["Mejor un rol por función que permisos sueltos por persona: es más fácil de mantener."],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "canales",
    modulo: "Canales",
    titulo: "Canales",
    emoji: "🔌",
    resumen: "Con qué cuentas de WhatsApp, Instagram y Messenger habla el CRM.",
    paraQuien: "Solo administración.",
    fotos: [{ archivo: "canales", modulo: "Canales", pie: "Cada red, si está conectada y con qué cuenta.", partes: [] }],
    guias: [
      {
        pregunta: "No llegan los mensajes de Instagram",
        pasos: ["Revisa aquí que Instagram diga «conectado».", "Si no, vuelve a conectar la cuenta (hay que ser administradora de la página en Facebook)."],
      },
    ],
    consejos: [],
  },
];

export interface Frecuente {
  pregunta: string;
  respuesta: string;
  /** El capítulo donde está explicado, para ir directo. */
  capitulo?: string;
}

export const FRECUENTES: Frecuente[] = [
  { pregunta: "No encuentro un chat en el Inbox", respuesta: "Revisa la pestaña «Todas» o «Archivadas» y borra cualquier filtro puesto. También puedes buscarlo por teléfono.", capitulo: "inbox" },
  { pregunta: "¿Por qué no puedo escribirle libre a un cliente?", respuesta: "Pasaron más de 24 horas desde su último mensaje. Usa una plantilla; cuando conteste, vuelves a escribir libre.", capitulo: "inbox" },
  { pregunta: "Cambié datos de un lead y no se guardaron", respuesta: "Los campos de la ficha se guardan con «Guardar cambios», abajo de todo. Las notas y los documentos sí se guardan solos.", capitulo: "clientes" },
  { pregunta: "¿Cómo paso un lead a otra asesora?", respuesta: "En la ficha, cambia el «Vendedor» y guarda. Su chat la sigue sola. Si es toda la cartera, usa «Traspasar cartera» en Equipos.", capitulo: "clientes" },
  { pregunta: "Me equivoqué de etapa", respuesta: "Vuelve a moverla (en el Pipeline o en la ficha). Queda todo registrado en Notificaciones.", capitulo: "pipeline" },
  { pregunta: "No me saltó la alerta de una llamada", respuesta: "La alerta llega 10 minutos antes a la asesora del evento y a quien lo agendó, con el CRM abierto. Revisa que el evento tenga asesora y que tu cuenta tenga ficha de vendedora.", capitulo: "calendario" },
  { pregunta: "No suena cuando llega un mensaje", respuesta: "Arriba, toca el parlante para prenderlo. Algunos navegadores piden que hagas un clic en la página antes de dejar sonar.", capitulo: "primeros-pasos" },
  { pregunta: "¿Quién borró o cambió algo?", respuesta: "En Notificaciones está todo: quién, qué y cuándo.", capitulo: "notificaciones" },
  { pregunta: "Un lead aparece dos veces", respuesta: "En Clientes, toca «Duplicados sugeridos» y únelos.", capitulo: "clientes" },
  { pregunta: "No veo un módulo que necesito", respuesta: "Depende de tu rol. Pídeselo a una administradora.", capitulo: "primeros-pasos" },
  { pregunta: "¿Puedo usar el CRM en el celular?", respuesta: "Sí, desde el navegador del celular. Para trabajar todo el día es más cómodo en computadora." },
];

export const GLOSARIO: { termino: string; significado: string }[] = [
  { termino: "Lead u oportunidad", significado: "Una persona interesada en un programa. Una misma persona puede tener varias oportunidades (una por programa)." },
  { termino: "Etapa", significado: "El paso de la venta en que va: Prospecto, Primer contacto, Propuesta, Pago, Ganado, Perdido…" },
  { termino: "Estado", significado: "Si la oportunidad sigue viva (Activo) o ya terminó (Ganado o Perdido)." },
  { termino: "Pipeline", significado: "Todos los leads abiertos, ordenados por etapa." },
  { termino: "Reserva", significado: "El anticipo que deja el cliente. Desde ahí hay 15 días para completar el pago." },
  { termino: "Venta cerrada", significado: "Lo que pagó el cliente al inscribirse. Con su fecha de cierre, cuenta en el Dashboard." },
  { termino: "Valor de oportunidad", significado: "Cuánto vale la venta si se cierra (el precio del programa)." },
  { termino: "Nota interna", significado: "Un mensaje en el chat que solo ve el equipo, nunca el cliente." },
  { termino: "Plantilla", significado: "Un mensaje aprobado por Meta, el único que se puede mandar pasadas 24 horas." },
  { termino: "Ventana de 24 horas", significado: "El tiempo, desde el último mensaje del cliente, en que se le puede escribir libre por WhatsApp." },
  { termino: "Lead frío", significado: "Uno abierto que nadie tocó en 15 días o más." },
  { termino: "Rol", significado: "El tipo de cuenta (Ventas, Jefe de ventas, Administrador…). Decide qué módulos ves." },
];
