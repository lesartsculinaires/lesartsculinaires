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
  "Clientes",
  "Bases",
  "Pipeline",
  "Calendario",
  "Equipos",
  "Programas",
  "Plantillas",
  "Notificaciones",
] as const;

/** La pantalla de administración, que no está en la lista de todos. */
export const MOD_USUARIOS = "Usuarios y Roles";
