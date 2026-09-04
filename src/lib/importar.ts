/**
 * Lectura y normalización de archivos de clientes (.xlsx, .csv, .txt).
 *
 * Todo acá es puro: recibe texto o una matriz y devuelve filas listas para
 * insertar, más las advertencias de cada una. La pantalla decide qué hacer
 * con eso; este módulo no toca la base ni el DOM.
 */

import { buscarDuplicados, type ContactoConocido } from "@/lib/duplicados";
import { acomodarNombre } from "@/lib/texto";
import { ROTULO_VALOR_OPORTUNIDAD, ROTULO_VENTA_CERRADA } from "@/lib/montosDelLead";
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
  // «interes» a secas no está, y es a propósito: agarraba «Horario de
  // interés», que no es el programa, y mandaba «Sábados por la mañana» a
  // buscarse en el catálogo de diplomados. Es el mismo error que «Nombre del
  // curso» yendo al nombre del cliente, explicado más abajo en `detectarMapeo`.
  { clave: "producto", etiqueta: "Programa", obligatorio: false,
    alias: ["producto", "programa", "curso", "diplomado", "programa de interes"] },
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
  /*
   * Los dos montos: el rótulo es el del CRM, los alias son los de la planilla.
   *
   * No se tocan juntos, y ahí está la trampa que conviene no pisar. El
   * `etiqueta` es cómo llama el CRM a ese campo —y esos dos nombres se
   * intercambiaron, así que salen de `montosDelLead`—, mientras que los
   * `alias` son los encabezados que la escuela viene escribiendo en sus
   * planillas desde siempre. Cambiar los alias para que «se vean parejos»
   * haría que un archivo de los que ya existen dejara de reconocerse, o peor,
   * que su columna entrara en el campo equivocado sin avisar.
   *
   * Tampoco se cruzan: «valor de la oportunidad» sigue siendo alias de
   * `valor` y de ninguno más. Dos campos peleándose el mismo encabezado los
   * resolvería el orden de esta lista, en silencio.
   */
  { clave: "valor", etiqueta: ROTULO_VALOR_OPORTUNIDAD, obligatorio: false,
    alias: ["valor", "monto", "precio", "valor de la oportunidad", "cotizado", "inversion"] },
  { clave: "cerrada", etiqueta: ROTULO_VENTA_CERRADA, obligatorio: false,
    alias: ["venta cerrada", "cerrada", "monto cerrado", "pagado", "matricula"] },
  { clave: "descuento", etiqueta: "Descuento o promoción", obligatorio: false,
    alias: ["descuento", "promocion", "descuento o promocion", "beca", "oferta"] },
  // Estos tres son de la persona, no del trato: viajan a la ficha del cliente
  // y no a la oportunidad. Están acá porque las bases que manda la escuela los
  // traen —la de cumpleaños es una columna de fechas y nada más— y sin ellos
  // había que copiarlos a mano ficha por ficha.
  { clave: "fecha_nacimiento", etiqueta: "Cumpleaños", obligatorio: false,
    alias: ["cumpleanos", "cumple", "fecha de nacimiento", "fecha nacimiento", "nacimiento", "birthday", "fecha de cumpleanos"] },
  { clave: "pais", etiqueta: "País", obligatorio: false,
    alias: ["pais", "country", "nacionalidad"] },
  { clave: "edad", etiqueta: "Edad", obligatorio: false,
    alias: ["edad", "anos", "anios", "edad del alumno"] },
] as const;

export type ClaveCampo = (typeof CAMPOS)[number]["clave"];

/**
 * Columna que no llena un campo sino que se copia a la bitácora del lead.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ NO ES UN CAMPO MÁS
 * ------------------------------------------------------------------------
 *
 * Porque no es uno: son todas las que sobran. Las planillas de la escuela
 * traen columnas que no tienen dónde caer —«horario que le queda», «de qué
 * feria vino», «qué preguntó»— y hasta ahora la única opción era «no
 * importar», es decir, tirarlas. Ese dato es justamente el que el asesor
 * necesita en la primera llamada.
 *
 * Por eso admite varias columnas a la vez, a diferencia de los campos, que son
 * uno a uno: la nota que queda en la ficha las junta todas, cada una con su
 * encabezado adelante para que se sepa de dónde salió cada cosa.
 */
export const A_NOTA = "nota";

/** Encabezados que se mandan solos a la bitácora. */
const ALIAS_NOTA = [
  "nota", "notas", "observacion", "observaciones", "comentario", "comentarios",
  "detalle", "detalles", "bitacora", "descripcion",
];

/** Encabezado del archivo → campo del CRM, o a la bitácora. La clave es el índice de columna. */
export type Mapeo = Record<number, ClaveCampo | typeof A_NOTA | "">;

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

  // La bitácora primero, y sólo por nombre exacto: son varias columnas y no
  // compiten entre sí, así que reservarlas acá no le quita ninguna a un campo.
  normalizados.forEach((n, i) => {
    mapeo[i] = n && (ALIAS_NOTA as readonly string[]).includes(n) ? A_NOTA : "";
  });

  normalizados.forEach((n, i) => {
    if (!n || mapeo[i]) return;
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
    //
    // «Comentario del asesor» es el caso: nombra al vendedor y nombra una
    // nota. Adivinarlo como vendedor mandaba el comentario entero a buscarse
    // en la lista de asesores, no lo encontraba, y la columna se perdía. Con
    // la duda declarada, la pasada de abajo la deja donde el texto se conserva.
    const ambiguo =
      CAMPOS.some(
        (c) =>
          c.clave !== candidato.clave &&
          (c.alias as readonly string[]).some((a) => contienePalabra(n, a)),
      ) || ALIAS_NOTA.some((a) => contienePalabra(n, a));
    if (ambiguo) return;

    mapeo[i] = candidato.clave;
    usados.add(candidato.clave);
  });

  // Y al final, «Observaciones del asesor» o «Comentario de la feria»: lo que
  // ningún campo reclamó y se llama como se llama una nota. Va último a
  // propósito, para que un campo de verdad siempre gane.
  normalizados.forEach((n, i) => {
    if (!n || mapeo[i]) return;
    if (ALIAS_NOTA.some((a) => contienePalabra(n, a))) mapeo[i] = A_NOTA;
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
  /** Cumpleaños, si la planilla lo trae. Va a la ficha, no a la oportunidad. */
  fecha_nacimiento: string | null;
  pais: string | null;
  edad: number | null;
  /**
   * Lo que traían las columnas marcadas «Nota», ya junto y con su encabezado.
   * Nulo cuando no había ninguna o venían todas vacías.
   */
  nota: string | null;
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
  /**
   * Enderezar los nombres que vienen en MAYÚSCULAS o con espacios de más.
   *
   * Acá es donde vale la pena y no en la ficha de a una: una planilla
   * exportada trae las trescientas así, y arreglarlas después es abrir
   * trescientas fichas. Son las mismas letras en otro caso; no se inventa
   * ninguna, y las tildes NO se tocan —eso se propone de a una, con alguien
   * mirando, porque cambia letras—.
   */
  acomodarNombres?: boolean;
}

/** Convierte la matriz cruda en filas listas para revisar e importar. */
export function construirFilas({
  matriz,
  mapeo,
  catalogo,
  existentes,
  fechaPorDefecto,
  acomodarNombres = false,
}: OpcionesFilas): FilaImportada[] {
  const columnaDe = (clave: ClaveCampo): number =>
    Number(Object.keys(mapeo).find((i) => mapeo[Number(i)] === clave) ?? -1);

  const col: Record<string, number> = {};
  for (const c of CAMPOS) col[c.clave] = columnaDe(c.clave);

  const valor = (fila: string[], clave: ClaveCampo): string | null =>
    col[clave] >= 0 ? oNull(fila[col[clave]]) : null;

  // Las columnas que van a la bitácora son varias, así que se guardan todas
  // con su encabezado: en la ficha se lee «Horario de interés: sábados» y no
  // un «sábados» suelto que no dice nada seis meses después.
  const columnasNota = Object.keys(mapeo)
    .map(Number)
    .filter((i) => mapeo[i] === A_NOTA)
    .sort((a, b) => a - b);

  const encabezado = (i: number): string => String(matriz[0]?.[i] ?? "").trim();

  const notaDe = (fila: string[]): string | null => {
    const partes = columnasNota
      .map((i) => {
        const v = oNull(fila[i]);
        if (!v) return null;
        const h = encabezado(i);
        return h ? `${h}: ${v}` : v;
      })
      .filter((p): p is string => p != null);

    return partes.length > 0 ? partes.join("\n") : null;
  };

  // Los repetidos se buscan contra la base y contra las filas ya leídas del
  // propio archivo: subir una planilla que se repite a sí misma duplicaría
  // igual, aunque la base estuviera limpia.
  const acumulado: ContactoConocido[] = [...existentes];

  return matriz.slice(1).map((fila, i) => {
    const errores: string[] = [];
    const avisos: string[] = [];

    const crudoNombre = valor(fila, "nombre") ?? "";
    const nombre = acomodarNombres ? acomodarNombre(crudoNombre) : crudoNombre;
    if (!nombre) errores.push("Sin nombre de cliente");
    if (nombre !== crudoNombre) avisos.push(`Nombre acomodado desde «${crudoNombre}»`);

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

    const crudoNacimiento = valor(fila, "fecha_nacimiento");
    const fechaNacimiento = parseFecha(crudoNacimiento);
    if (crudoNacimiento && !fechaNacimiento) {
      avisos.push(`Cumpleaños «${crudoNacimiento}» no se entiende; se deja vacío`);
    }

    // Una edad imposible es casi siempre un año de nacimiento en la casilla
    // equivocada. La base lo rechazaría a mitad del archivo; acá se avisa y se
    // deja vacío, que es lo que hace el resto del importador con lo que no
    // entiende: la fila entra igual y el dato se completa a mano.
    const crudaEdad = valor(fila, "edad");
    const edadNum = crudaEdad == null ? null : Number(crudaEdad.replace(/[^\d]/g, ""));
    const edad =
      edadNum != null && Number.isFinite(edadNum) && edadNum > 0 && edadNum <= 120
        ? edadNum
        : null;
    if (crudaEdad && edad == null) avisos.push(`Edad «${crudaEdad}» no es válida; se deja vacía`);

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
      // A propósito contra la lista entera, dados de baja incluidos: lo que se
      // importa suele ser historia, y una planilla vieja nombra a quien
      // atendía entonces. Mandarla a «sin asignar» perdería ese dato.
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
      fecha_nacimiento: fechaNacimiento,
      pais: valor(fila, "pais"),
      edad,
      nota: notaDe(fila),
      errores,
      avisos,
      duplicado,
      coincideCon,
    };
  });
}
