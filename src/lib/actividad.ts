/**
 * Convertir lo que guarda la base en una frase que se entienda.
 *
 * El trigger anota ids y valores crudos —`etapa_id: {antes: 1, despues: 3}`—
 * porque armar la frase dentro de la base costaría un join en cada escritura y
 * dejaría el texto viejo congelado el día que alguien renombre una etapa. La
 * frase se arma acá, donde los catálogos ya están cargados.
 *
 * Todo es puro: entra un evento, sale un texto.
 */

import type { Catalogo } from "@/lib/types";

export type EntidadActividad = "oportunidad" | "cliente" | "nota" | "adjunto";
export type AccionActividad = "creo" | "edito" | "borro";

/** Un cambio de una columna, tal como lo dejó el trigger. */
export interface Cambio {
  antes: unknown;
  despues: unknown;
}

export interface Evento {
  id: number;
  entidad: string;
  accion: string;
  entidadId: number | null;
  oportunidadId: number | null;
  campos: Record<string, Cambio> | null;
  /** Quién lo hizo. Null cuando escribió una integración y no una persona. */
  actor: string | null;
  creadoEn: string;
  /** Contexto que se resuelve al leer: el código y el nombre de la ficha. */
  codigo: string | null;
  cliente: string | null;
}

/** Cómo se llama cada columna cuando hay que nombrarla en una frase. */
const ETIQUETAS: Record<string, string> = {
  etapa_id: "la etapa",
  estado_id: "el estado",
  vendedor_id: "el asesor",
  producto_id: "el programa",
  territorio_id: "el territorio",
  canal_id: "el canal",
  valor_oportunidad: "el valor",
  venta_cerrada: "la venta cerrada",
  fecha_cierre: "la fecha de cierre",
  descuento_promocion: "el descuento",
  nombre: "el nombre",
  precio: "el precio",
  activo: "si está activo",
  telefono: "el teléfono",
  correo: "el correo",
  edad: "la edad",
  responsable_nombre: "el nombre del responsable",
  responsable_telefono: "el celular del responsable",
  responsable_correo: "el correo del responsable",
};

/** Qué catálogo resuelve cada columna que guarda un id. */
const CATALOGOS: Record<string, keyof Catalogo> = {
  etapa_id: "etapas",
  estado_id: "estados",
  vendedor_id: "vendedores",
  producto_id: "productos",
  territorio_id: "territorios",
  canal_id: "canales",
};

/** El valor de un campo, ya legible: «Negociación» y no «3». */
export function valorLegible(
  columna: string,
  valor: unknown,
  catalogo: Catalogo,
): string {
  if (valor == null || valor === "") return "vacío";

  const cual = CATALOGOS[columna];
  if (cual) {
    const items = catalogo[cual] as readonly { id: number; nombre: string }[];
    return items.find((i) => i.id === Number(valor))?.nombre ?? `#${valor}`;
  }

  if (columna === "valor_oportunidad" || columna === "venta_cerrada") {
    const n = Number(valor);
    return Number.isFinite(n) ? `$${n.toLocaleString("en-US")}` : String(valor);
  }

  if (columna === "edad") return `${valor} años`;

  const texto = String(valor);
  // Un descuento largo haría ilegible la línea del panel.
  return texto.length > 40 ? `${texto.slice(0, 39)}…` : texto;
}

/** Quién hizo algo. Sin persona, fue una integración escribiendo sola. */
export const quien = (actor: string | null): string => actor ?? "Una integración";

/**
 * La frase del aviso.
 *
 * Se escribe en tercera persona y empezando por el verbo —«Movió la etapa de
 * CRM-0597»— porque el nombre de quien lo hizo va aparte, en su propia línea.
 * Repetirlo dentro de la frase haría cada aviso más largo sin agregar nada.
 */
export function redactar(e: Evento, catalogo: Catalogo): string {
  // El código puede faltar: la oportunidad se borró después, o el aviso es de
  // un contacto que todavía no tiene ninguna. Las frases se arman para que en
  // ese caso sigan sonando bien, y no «la oportunidad una ficha».
  const ficha = e.codigo ? `${e.codigo}${e.cliente ? ` · ${e.cliente}` : ""}` : null;
  const en = ficha ? ` en ${ficha}` : "";
  const de = ficha ? ` de ${ficha}` : "";
  const a = ficha ? ` a ${ficha}` : "";

  if (e.entidad === "nota") {
    return e.accion === "creo" ? `Escribió una nota${en}` : `Borró una nota${de}`;
  }

  if (e.entidad === "adjunto") {
    return e.accion === "creo" ? `Adjuntó un documento${a}` : `Quitó un documento${de}`;
  }

  if (e.entidad === "vendedor") {
    // La lista de vendedores no cuelga de una ficha, pero sí se puede nombrar
    // a la persona: el catálogo llega entero, dados de baja incluidos, así que
    // el renglón sigue diciendo de quién se trata después de darlo de baja.
    const quien = catalogo.vendedores.find((v) => v.id === e.entidadId)?.nombre;
    const nombrado = quien ? ` a ${quien}` : " a un vendedor";

    if (e.accion === "creo") return `Agregó${nombrado}`;
    if (e.accion === "borro") return "Eliminó un vendedor del catálogo";

    // La baja y la reactivación son las dos acciones que importa distinguir de
    // un vistazo; decir «cambió si está activo» obligaría a abrir el detalle.
    const activo = e.campos?.activo;
    if (activo) {
      return activo.despues === false ? `Dio de baja${nombrado}` : `Reactivó${nombrado}`;
    }

    return `Cambió ${listarCambios(e, catalogo)}${quien ? ` de ${quien}` : " de un vendedor"}`;
  }

  if (e.entidad === "programa") {
    // El catálogo no cuelga de una ficha: nombrar una acá sería inventarla.
    if (e.accion === "creo") return "Creó un programa en el catálogo";
    if (e.accion === "borro") return "Borró un programa del catálogo";
    return `Cambió ${listarCambios(e, catalogo)} de un programa`;
  }

  if (e.entidad === "curso") {
    // Cuelga del cliente, no de la oportunidad, así que no lleva código de
    // ficha: decir «en CRM-0597» sugeriría que el curso es de ese trato.
    return e.accion === "creo"
      ? "Agregó un curso al historial de un cliente"
      : "Quitó un curso del historial de un cliente";
  }

  if (e.entidad === "enlace") {
    // «Generó» y no «envió»: el CRM copia el enlace y quien lo manda es la
    // persona. Decir que lo envió sería afirmar algo que el sistema no vio.
    if (e.accion === "creo") return `Generó el link de registro${de}`;
    const anulado = e.campos?.revocado?.despues === true;
    return anulado ? `Anuló el link de registro${de}` : `Cambió el link de registro${de}`;
  }

  if (e.entidad === "cliente") {
    if (e.accion === "creo") return `Cargó un contacto nuevo`;
    if (e.accion === "borro") return `Borró un contacto`;
    return `Cambió ${listarCambios(e, catalogo)} del contacto${
      e.cliente ? ` ${e.cliente}` : ""
    }`;
  }

  // oportunidad
  if (e.accion === "creo") {
    return ficha ? `Creó la oportunidad ${ficha}` : "Creó una oportunidad";
  }
  if (e.accion === "borro") {
    return ficha ? `Borró la oportunidad ${ficha}` : "Borró una oportunidad";
  }
  return `Cambió ${listarCambios(e, catalogo)}${en}`;
}

/**
 * «la etapa a Negociación» o «la etapa y el valor».
 *
 * Con un solo campo se dice a qué quedó, que es el dato que se busca. Con
 * varios sólo se nombran: poner todos los valores haría una frase que hay que
 * leer dos veces, y para eso está abrir la ficha.
 */
function listarCambios(e: Evento, catalogo: Catalogo): string {
  const columnas = Object.keys(e.campos ?? {});
  if (columnas.length === 0) return "algo";

  if (columnas.length === 1) {
    const c = columnas[0];
    const etiqueta = ETIQUETAS[c] ?? c;
    const valor = valorLegible(c, e.campos?.[c]?.despues, catalogo);
    return `${etiqueta} a ${valor}`;
  }

  const nombres = columnas.map((c) => ETIQUETAS[c] ?? c);
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Junta las cargas masivas en una sola línea.
 *
 * Importar una base de 300 leads deja 300 avisos idénticos y empuja todo lo
 * demás fuera de la pantalla; el panel quedaría inservible justo el día que
 * más pasó. Se agrupan los avisos seguidos de la misma persona, la misma
 * entidad y la misma acción, siempre que hayan ocurrido dentro del mismo
 * minuto: una ráfaga es una importación, y dos cosas hechas a mano con horas
 * de diferencia no se parecen en nada aunque sean del mismo tipo.
 */
export interface Grupo {
  /** El primero del grupo: es el que se muestra. */
  evento: Evento;
  /** Cuántos avisos se juntaron acá. 1 cuando no se agrupó nada. */
  cuantos: number;
}

const MISMO_MINUTO_MS = 60_000;

export function agrupar(eventos: readonly Evento[]): Grupo[] {
  const salida: Grupo[] = [];

  for (const e of eventos) {
    const ultimo = salida[salida.length - 1];
    const previo = ultimo?.evento;

    const juntable =
      previo != null &&
      previo.actor === e.actor &&
      previo.entidad === e.entidad &&
      previo.accion === e.accion &&
      // Sólo las creaciones se agrupan. Dos ediciones seguidas suelen ser
      // cosas distintas sobre fichas distintas, y esconderlas detrás de un
      // «2 cambios» taparía justo lo que se quería mirar.
      e.accion === "creo" &&
      Math.abs(
        new Date(previo.creadoEn).getTime() - new Date(e.creadoEn).getTime(),
      ) <= MISMO_MINUTO_MS;

    if (juntable) ultimo.cuantos += 1;
    else salida.push({ evento: e, cuantos: 1 });
  }

  return salida;
}

/** «Cargó 300 contactos nuevos» en vez de repetir la línea 300 veces. */
export function redactarGrupo(g: Grupo, catalogo: Catalogo): string {
  if (g.cuantos === 1) return redactar(g.evento, catalogo);

  const plural: Record<string, string> = {
    vendedor: `Agregó ${g.cuantos} vendedores`,
    programa: `Creó ${g.cuantos} programas`,
    curso: `Agregó ${g.cuantos} cursos al historial`,
    enlace: `Generó ${g.cuantos} links de registro`,
    oportunidad: `Creó ${g.cuantos} oportunidades`,
    cliente: `Cargó ${g.cuantos} contactos nuevos`,
    nota: `Escribió ${g.cuantos} notas`,
    adjunto: `Adjuntó ${g.cuantos} documentos`,
  };

  return plural[g.evento.entidad] ?? `${g.cuantos} acciones`;
}

/**
 * Cada campo que cambió, con su antes y su después.
 *
 * La campana resume —«cambió la etapa y el valor»— porque ahí lo que importa
 * es enterarse. El módulo existe para lo contrario: poder decir exactamente de
 * qué a qué, que es lo que hace falta cuando alguien pregunta por qué un
 * negocio quedó en un monto que no era.
 */
export interface CambioLegible {
  campo: string;
  antes: string;
  despues: string;
}

export function detallar(e: Evento, catalogo: Catalogo): CambioLegible[] {
  return Object.entries(e.campos ?? {}).map(([columna, c]) => ({
    campo: ETIQUETAS[columna] ?? columna,
    antes: valorLegible(columna, c.antes, catalogo),
    despues: valorLegible(columna, c.despues, catalogo),
  }));
}

/**
 * De a cuántas acciones se traen en el módulo.
 *
 * Vive acá y no junto a la consulta porque un archivo `"use server"` sólo
 * puede exportar funciones asíncronas, y la pantalla necesita este número para
 * decir «ver 60 más».
 */
export const POR_TANDA = 60;

/** Los tipos de acción que se pueden filtrar, con su nombre en pantalla. */
export const ENTIDADES: { valor: string; nombre: string }[] = [
  { valor: "oportunidad", nombre: "Oportunidades" },
  { valor: "cliente", nombre: "Contactos" },
  { valor: "nota", nombre: "Notas" },
  { valor: "adjunto", nombre: "Documentos" },
  { valor: "enlace", nombre: "Links de registro" },
  { valor: "curso", nombre: "Cursos realizados" },
  { valor: "programa", nombre: "Catálogo de programas" },
  { valor: "vendedor", nombre: "Vendedores" },
];

export const ACCIONES: { valor: string; nombre: string }[] = [
  { valor: "creo", nombre: "Creaciones" },
  { valor: "edito", nombre: "Modificaciones" },
  { valor: "borro", nombre: "Eliminaciones" },
];
