/**
 * Las pantallas del CRM, por nombre.
 *
 * Están en un archivo suelto y no dentro de la barra lateral porque también
 * las necesita el servidor, para decidir con qué pantalla abrir. Y un valor
 * exportado desde un componente «use client» no le llega entero a un
 * componente de servidor: Next le entrega una referencia al cliente en vez del
 * arreglo, y recorrerla revienta con «no es iterable». Acá no hay directiva
 * ninguna, así que las dos mitades leen lo mismo.
 */
export const MODULOS = [
  "Dashboard",
  "Inbox",
  "Envíos",
  "Clientes",
  "Bases",
  "Pipeline",
  "Calendario",
  "Equipos",
  "Programas",
  "Formularios",
  "Plantillas",
  "Recordatorios",
  // La cartera que se está enfriando. Va pegada a Recordatorios porque
  // contestan la misma pregunta con distinto alcance: aquélla dice «a quién
  // llamo hoy», ésta «a quién dejamos de llamar».
  "Fríos",
  "Notificaciones",
  "Autorizaciones",
] as const;

/**
 * Con cuál se abre cuando no hay nada guardado ni pedido.
 *
 * Está acá y no dentro del estado del navegador porque el servidor también la
 * necesita: para mandar de una los datos de la pantalla inicial tiene que
 * saber cuál va a ser, y si cada lado tuviera su propia respuesta el primer
 * dibujado traería los datos de una pantalla distinta de la que se abre.
 */
export const MOD_POR_OMISION = MODULOS[0];

/** La pantalla de administración, que no está en la lista de todos. */
export const MOD_USUARIOS = "Usuarios y Roles";

/**
 * Las conexiones de WhatsApp, Instagram y Messenger.
 *
 * Va con `MOD_USUARIOS` y no en la lista de todos por lo mismo: son las llaves
 * con las que el CRM le escribe a los clientes. Quien entra acá puede conectar
 * y desconectar una cuenta, o sea cortar la mensajería de la escuela.
 */
export const MOD_CANALES = "Canales";

/** La forma mínima que hace falta de un permiso guardado. */
export interface PermisoDeModulo {
  rolId: number;
  /** La clave del catálogo: «dashboard», «inbox»… */
  modulo: string;
  ver: boolean;
}

/** La forma mínima que hace falta del catálogo de módulos. */
export interface ModuloDelCatalogo {
  clave: string;
  nombre: string;
}

/**
 * Qué módulos ve un rol.
 *
 * ------------------------------------------------------------------------
 * LAS TRES REGLAS, Y POR QUÉ NINGUNA ES CAPRICHOSA
 * ------------------------------------------------------------------------
 *
 * 1. DIRECCIÓN VE TODO, SIEMPRE. No es un privilegio: es lo que impide que
 *    alguien se destilde «Usuarios y Roles» a sí mismo y se quede sin forma de
 *    volver a entrar a arreglarlo. Un candado que se puede cerrar desde
 *    adentro con la llave puesta afuera no sirve.
 *
 * 2. SIN FILA, SE VE. Que no haya permiso guardado para un módulo quiere decir
 *    que nadie decidió nada sobre él —el módulo es nuevo, o el rol nunca se
 *    configuró—, y eso no es lo mismo que decidir que no. Con la regla al
 *    revés, el día que se agrega una pantalla desaparecería para todos hasta
 *    que alguien la habilite rol por rol, y nadie sabría por qué.
 *
 * 3. SÓLO UN «VER» DESTILDADO ESCONDE. Es la única forma de que la casilla
 *    signifique lo que dice.
 *
 * Y una cuarta, implícita: si el módulo no está en el catálogo, se ve. Un
 * módulo que la aplicación tiene y la base no conoce no se puede haber
 * decidido, así que cae en la regla 2.
 */
export function modulosPermitidos(
  todos: readonly string[],
  catalogo: readonly ModuloDelCatalogo[],
  permisos: readonly PermisoDeModulo[],
  rolId: number | null,
  esAdmin: boolean,
): string[] {
  if (esAdmin || rolId == null) return [...todos];

  const claveDe = new Map(catalogo.map((m) => [m.nombre, m.clave]));
  const delRol = new Map(
    permisos.filter((p) => p.rolId === rolId).map((p) => [p.modulo, p.ver]),
  );

  return todos.filter((nombre) => {
    const clave = claveDe.get(nombre);
    if (clave == null) return true;
    const ver = delRol.get(clave);
    return ver === undefined ? true : ver;
  });
}
