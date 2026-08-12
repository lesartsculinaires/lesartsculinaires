/**
 * Lectura y normalización de archivos de clientes (.xlsx, .csv, .txt).
 *
 * Todo acá es puro: recibe texto o una matriz y devuelve filas listas para
 * insertar, más las advertencias de cada una. La pantalla decide qué hacer
 * con eso; este módulo no toca la base ni el DOM.
 */

import { buscarDuplicados, type ContactoConocido } from "@/lib/duplicados";
import type { Catalogo, CatalogItem } from "@/lib/types";

/** Minúsculas, sin acentos, sin espacios de más. Para comparar encabezados y catálogos. */
export const normalizar = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Campos que el importador sabe llenar, con los encabezados que reconoce. */
export const CAMPOS = [
  { clave: "nombre", etiqueta: "Nombre del cliente", obligatorio: true,
    alias: ["nombre", "cliente", "nombre del cliente", "nombre completo", "alumno", "prospecto", "contacto"] },
  { clave: "telefono", etiqueta: "Teléfono", obligatorio: false,
    alias: ["telefono", "tel", "celular", "movil", "whatsapp", "numero", "telefono 1"] },
  { clave: "correo", etiqueta: "Correo", obligatorio: false,
    alias: ["correo", "email", "e-mail", "mail", "correo electronico"] },
  { clave: "producto", etiqueta: "Programa", obligatorio: false,
    alias: ["producto", "programa", "curso", "diplomado", "programa de interes", "interes"] },
  { clave: "vendedor", etiqueta: "Vendedor", obligatorio: false,
    alias: ["vendedor", "asesor", "ejecutivo", "responsable", "asignado a", "agente"] },
  { clave: "etapa", etiqueta: "Etapa", obligatorio: false,
    alias: ["etapa", "fase", "etapa del pipeline", "pipeline", "stage"] },
  { clave: "estado", etiqueta: "Estado", obligatorio: false,
    alias: ["estado", "situacion", "status", "estatus"] },
  { clave: "canal", etiqueta: "Canal", obligatorio: false,
    alias: ["canal", "origen", "fuente", "medio", "como nos conocio"] },
  { clave: "territorio", etiqueta: "Territorio", obligatorio: false,
    alias: ["territorio", "departamento", "zona", "region", "ciudad", "municipio"] },
  { clave: "fecha_registro", etiqueta: "Fecha de registro", obligatorio: false,
    alias: ["fecha", "fecha de registro", "fecha registro", "fecha de ingreso", "creado", "alta"] },
  { clave: "fecha_cierre", etiqueta: "Fecha de cierre", obligatorio: false,
    alias: ["fecha de cierre", "fecha cierre", "cierre", "fecha de matricula"] },
  { clave: "valor", etiqueta: "Valor", obligatorio: false,
    alias: ["valor", "monto", "precio", "valor de la oportunidad", "cotizado", "inversion"] },
  { clave: "cerrada", etiqueta: "Venta cerrada", obligatorio: false,
    alias: ["venta cerrada", "cerrada", "monto cerrado", "pagado", "matricula"] },
  { clave: "descuento", etiqueta: "Descuento o promoción", obligatorio: false,
    alias: ["descuento", "promocion", "descuento o promocion", "beca", "oferta"] },
] as const;

export type ClaveCampo = (typeof CAMPOS)[number]["clave"];

/** Encabezado del archivo → campo del CRM. La clave es el índice de columna. */
export type Mapeo = Record<number, ClaveCampo | "">;

// ------------------------------------------------------------------ delimitados

/**
 * Detecta el separador contando cuál produce más columnas de forma estable.
 *
 * Contar apariciones a secas se equivoca con nombres que llevan coma
 * ("Pérez, Ana"); mirar cuántas columnas genera en varias líneas no.
 */
export function detectarSeparador(texto: string): string {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (lineas.length === 0) return ",";

  let mejor = ",";
  let mejorPuntaje = -1;

  for (const sep of [",", ";", "\t", "|"]) {
    const cuentas = lineas.map((l) => partirLinea(l, sep).length);
    const max = Math.max(...cuentas);
    if (max < 2) continue;
    // Premia muchas columnas, castiga que varíen de línea a línea.
    const estables = cuentas.filter((c) => c === cuentas[0]).length / cuentas.length;
    const puntaje = max * estables;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = sep;
    }
  }
  return mejor;
}

/** Parte una línea respetando comillas dobles, con "" como comilla escapada. */
function partirLinea(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = "";
  let enComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (enComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i += 1;
        } else enComillas = false;
      } else actual += c;
    } else if (c === '"') enComillas = true;
    else if (c === sep) {
      out.push(actual);
      actual = "";
    } else actual += c;
  }
  out.push(actual);
  return out.map((s) => s.trim());
}

/** Texto delimitado → matriz. Respeta saltos de línea dentro de comillas. */
export function parseDelimitado(texto: string, sep?: string): string[][] {
  const limpio = texto.replace(/^\uFEFF/, ""); // BOM de Excel
  const separador = sep ?? detectarSeparador(limpio);

  const filas: string[][] = [];
  let linea = "";
  let comillas = 0;

  for (const bruta of limpio.split(/\r?\n/)) {
    linea = linea ? `${linea}\n${bruta}` : bruta;
    comillas += (bruta.match(/"/g) ?? []).length;
    // Comillas impares significa que el registro sigue en la línea siguiente.
    if (comillas % 2 !== 0) continue;
    if (linea.trim()) filas.push(partirLinea(linea, separador));
    linea = "";
    comillas = 0;
  }
  if (linea.trim()) filas.push(partirLinea(linea, separador));

  return filas;
}

// ------------------------------------------------------------------ conversión

/**
 * Fechas en los formatos que aparecen en planillas reales.
 *
 * Ante "03/04/2026" se elige día/mes, que es lo que se usa en El Salvador y
 * lo que ya muestra el resto de la app. Un archivo exportado en formato
 * estadounidense se leería con el día y el mes cambiados; por eso la pantalla
 * muestra las fechas ya interpretadas antes de importar.
 */
export function parseFecha(v: unknown): string | null {
  if (v == null || v === "") return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return isoDe(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }

  // Excel guarda fechas como días desde el 30/12/1899.
  if (typeof v === "number" && v > 0 && v < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return isoDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  const s = String(v).trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return isoDe(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    const anio = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return isoDe(anio, +m[2], +m[1]);
  }

  return null;
}

function isoDe(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${anio}-${p(mes)}-${p(dia)}`;
}

/**
 * Montos con símbolos y separadores mezclados.
 *
 * "$1,234.50" y "1.234,50" son el mismo número escrito en dos convenciones.
 * Cuando aparecen los dos signos, el último es el decimal.
 */
export function parseMonto(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;

  const ultimaComa = s.lastIndexOf(",");
  const ultimoPunto = s.lastIndexOf(".");

  if (ultimaComa > -1 && ultimoPunto > -1) {
    s = ultimaComa > ultimoPunto
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (ultimaComa > -1) {
    // Una sola coma: decimal salvo que separe grupos de tres ("1,234").
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const oNull = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

// ------------------------------------------------------------------ mapeo

/** ¿Aparece `alias` como palabra completa dentro de `texto`? */
const contienePalabra = (texto: string, alias: string): boolean =>
  new RegExp(`(^| )${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(texto);

/**
 * Adivina qué columna del archivo corresponde a cada campo del CRM.
 *
 * Dos pasadas. Primero los encabezados que coinciden exactamente con un
 * alias, que no admiten discusión. Después los que sólo empiezan por uno,
 * y sólo si ningún otro campo aparece nombrado en el mismo encabezado.
 *
 * Esa segunda condición existe por un caso real: "Nombre del curso" empieza
 * por "nombre" y se asignaba al nombre del cliente, así que una base entera
 * entró con el programa donde iba la persona. Ante la duda es mejor dejar la
 * columna sin asignar —la pantalla la muestra en la vista previa y quien
 * importa la elige— que adivinar mal en silencio.
 */
export function detectarMapeo(encabezados: readonly string[]): Mapeo {
  const mapeo: Mapeo = {};
  const usados = new Set<ClaveCampo>();
  const normalizados = encabezados.map((h) => normalizar(h));

  normalizados.forEach((n, i) => {
    mapeo[i] = "";
    if (!n) return;
    const exacto = CAMPOS.find(
      (c) => !usados.has(c.clave) && (c.alias as readonly string[]).includes(n),
    );
    if (exacto) {
      mapeo[i] = exacto.clave;
      usados.add(exacto.clave);
    }
  });

  normalizados.forEach((n, i) => {
    if (!n || mapeo[i]) return;

    const candidato = CAMPOS.find(
      (c) =>
        !usados.has(c.clave) &&
        (c.alias as readonly string[]).some((a) => contienePalabra(n, a)),
    );
    if (!candidato) return;

    // Si el encabezado también nombra otro campo, la columna es ambigua.
    const ambiguo = CAMPOS.some(
      (c) =>
        c.clave !== candidato.clave &&
        (c.alias as readonly string[]).some((a) => contienePalabra(n, a)),
    );
    if (ambiguo) return;

    mapeo[i] = candidato.clave;
    usados.add(candidato.clave);
  });

  return mapeo;
}

// ------------------------------------------------------------------ filas

export interface FilaImportada {
  /** Número de fila en el archivo, contando el encabezado. */
  linea: number;
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
  venta_cerrada: number | null;
  descuento_promocion: string | null;
  /** Motivos por los que la fila no se puede importar. */
  errores: string[];
  /** Cosas que se importan igual, pero conviene mirar. */
  avisos: string[];
  /** Coincide con un contacto ya guardado o con otra fila del archivo. */
  duplicado: boolean;
  /** Contacto existente con el que coincide. Null si el choque es con otra fila. */
  coincideCon: number | null;
}

const buscarEnCatalogo = (
  items: readonly CatalogItem[],
  texto: string | null,
): CatalogItem | null => {
  if (!texto) return null;
  const n = normalizar(texto);
  return (
    items.find((i) => normalizar(i.nombre) === n) ??
    items.find((i) => normalizar(i.nombre).startsWith(n)) ??
    null
  );
};

export interface OpcionesFilas {
  matriz: string[][];
  mapeo: Mapeo;
  catalogo: Catalogo;
  /** Contactos ya guardados, para detectar repetidos. */
  existentes: readonly ContactoConocido[];
  /** Fecha a usar cuando la fila no trae ninguna. */
  fechaPorDefecto: string;
}

/** Convierte la matriz cruda en filas listas para revisar e importar. */
export function construirFilas({
  matriz,
  mapeo,
  catalogo,
  existentes,
  fechaPorDefecto,
}: OpcionesFilas): FilaImportada[] {
  const columnaDe = (clave: ClaveCampo): number =>
    Number(Object.keys(mapeo).find((i) => mapeo[Number(i)] === clave) ?? -1);

  const col: Record<string, number> = {};
  for (const c of CAMPOS) col[c.clave] = columnaDe(c.clave);

  const valor = (fila: string[], clave: ClaveCampo): string | null =>
    col[clave] >= 0 ? oNull(fila[col[clave]]) : null;

  // Los repetidos se buscan contra la base y contra las filas ya leídas del
  // propio archivo: subir una planilla que se repite a sí misma duplicaría
  // igual, aunque la base estuviera limpia.
  const acumulado: ContactoConocido[] = [...existentes];

  return matriz.slice(1).map((fila, i) => {
    const errores: string[] = [];
    const avisos: string[] = [];

    const nombre = valor(fila, "nombre") ?? "";
    if (!nombre) errores.push("Sin nombre de cliente");

    const cat = (clave: ClaveCampo, items: readonly CatalogItem[], etiqueta: string) => {
      const texto = valor(fila, clave);
      const hit = buscarEnCatalogo(items, texto);
      if (texto && !hit) avisos.push(`${etiqueta} «${texto}» no está en el catálogo`);
      return hit?.id ?? null;
    };

    const crudaRegistro = valor(fila, "fecha_registro");
    const fechaRegistro = parseFecha(crudaRegistro);
    if (crudaRegistro && !fechaRegistro) {
      avisos.push(`Fecha de registro «${crudaRegistro}» no se entiende; se usa la de hoy`);
    }

    const crudaCierre = valor(fila, "fecha_cierre");
    const fechaCierre = parseFecha(crudaCierre);
    if (crudaCierre && !fechaCierre) avisos.push(`Fecha de cierre «${crudaCierre}» no se entiende`);

    const telefono = valor(fila, "telefono");
    const correo = valor(fila, "correo");

    const choques = buscarDuplicados({ nombre, telefono, correo }, acumulado);
    const duplicado = choques.length > 0;
    // Los ids negativos son filas del propio archivo, no contactos guardados.
    const coincideCon = choques.find((c) => c.clienteId > 0)?.clienteId ?? null;
    if (duplicado) {
      const c = choques[0];
      avisos.push(
        `Ya existe «${c.nombre}»${c.codigo ? ` (${c.codigo})` : ""} con los mismos datos`,
      );
    }
    if (nombre || telefono || correo) {
      acumulado.push({ clienteId: -(i + 1), nombre, telefono, correo });
    }

    return {
      linea: i + 2,
      nombre,
      telefono,
      correo,
      producto_id: cat("producto", catalogo.productos, "Programa"),
      vendedor_id: cat("vendedor", catalogo.vendedores, "Vendedor"),
      etapa_id: cat("etapa", catalogo.etapas, "Etapa"),
      estado_id: cat("estado", catalogo.estados, "Estado"),
      canal_id: cat("canal", catalogo.canales, "Canal"),
      territorio_id: cat("territorio", catalogo.territorios, "Territorio"),
      fecha_registro: fechaRegistro ?? fechaPorDefecto,
      fecha_cierre: fechaCierre,
      valor_oportunidad: parseMonto(valor(fila, "valor")),
      venta_cerrada: parseMonto(valor(fila, "cerrada")),
      descuento_promocion: valor(fila, "descuento"),
      errores,
      avisos,
      duplicado,
      coincideCon,
    };
  });
}
