"use server";

import { revalidatePath } from "next/cache";

import { normalizarTexto, programasParecidos } from "@/lib/duplicados";
import { CATEGORIAS } from "@/lib/programas";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Alta de programas del catálogo.
 *
 * `productos` no es una tabla más: de ella cuelgan la ficha del cliente, el
 * alta, el historial de cursos, el emparejado por nombre de la importación,
 * los catálogos que consume n8n y los cortes por programa del Dashboard. Un
 * nombre casi igual a uno que ya existe no da error —son distintos para la
 * base— pero parte los reportes en dos y hace que la importación deje de
 * emparejar. Por eso el trabajo de acá es sobre todo no dejar entrar
 * duplicados disfrazados.
 */

export interface NuevoPrograma {
  nombre: string;
  categoria: string;
  /** Precio de lista. Puede quedar sin llenar. */
  precio: number | null;
  /** Crear aunque se parezca a uno que ya existe. */
  forzar?: boolean;
}

export interface ResultadoPrograma {
  ok: boolean;
  error: string | null;
  /** Programas ya cargados que se parecen al que se quiere crear. */
  parecidos?: string[];
}

export async function crearPrograma(p: NuevoPrograma): Promise<ResultadoPrograma> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  // Sólo dirección, comprobado acá además de en la base.
  //
  // No es redundante por dos motivos. Mientras la migración del catálogo no se
  // corra, la política vieja deja escribir a cualquiera con sesión y lo único
  // que separa es el botón escondido, que no separa nada: una acción de
  // servidor se puede invocar sin pasar por la pantalla. Y una vez corrida,
  // esto sigue dando un mensaje que se entiende en vez del error crudo de una
  // política.
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Sólo dirección puede crear programas." };
  }

  const nombre = p.nombre.trim();
  if (!nombre) return { ok: false, error: "Poné un nombre para el programa." };
  if (nombre.length > 120) return { ok: false, error: "El nombre es demasiado largo." };

  const categoria = (CATEGORIAS as readonly string[]).includes(p.categoria)
    ? p.categoria
    : "Otro";

  if (p.precio != null && (!Number.isFinite(p.precio) || p.precio < 0)) {
    return { ok: false, error: "El precio no es válido." };
  }

  const { data: existentes, error: errLeer } = await supabase
    .from("productos")
    .select("nombre")
    .limit(500);

  if (errLeer) return { ok: false, error: errLeer.message };

  const buscado = normalizarTexto(nombre);
  const nombres = (existentes ?? []).map((x) => String(x.nombre ?? ""));

  // Igual salvo acentos o mayúsculas: eso no se crea nunca, aunque se fuerce.
  // La base lo rechazaría sólo si coincide carácter por carácter, y
  // «Diplomado de Cocina» contra «diplomado de cocina» pasaría.
  const mismo = nombres.find((n) => normalizarTexto(n) === buscado);
  if (mismo) {
    return { ok: false, error: `Ya existe «${mismo}». Es el mismo nombre.` };
  }

  if (!p.forzar) {
    // Parecidos por palabras, no por texto: así se atrapa «Diplomado Cocina»
    // contra «Diplomado de Cocina», que es como se cuelan los duplicados de
    // verdad. Comparar las cadenas enteras no los ve, porque estorba el «de».
    const parecidos = nombres.filter((n) => programasParecidos(n, nombre));

    if (parecidos.length > 0) return { ok: false, error: null, parecidos };
  }

  const { error } = await supabase
    .from("productos")
    .insert({ nombre, categoria, precio: p.precio });

  if (error) {
    // 23505: el nombre ya existe tal cual. Puede pasar si alguien lo creó
    // entre la lectura de arriba y esta línea.
    if (error.code === "23505" || error.message.includes("duplicate key")) {
      return { ok: false, error: `Ya existe un programa llamado «${nombre}».` };
    }
    // 42501: la política dejó afuera a quien no es administrador.
    if (error.code === "42501") {
      return { ok: false, error: "Sólo dirección puede crear programas." };
    }
    return { ok: false, error: error.message };
  }

  // Para que el catálogo nuevo llegue a todas las pantallas que lo usan: la
  // ficha, el alta, el historial de cursos y los cortes del Dashboard leen el
  // mismo catálogo que se carga del lado del servidor.
  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Cambiar un programa que ya existe.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ES DE DIRECCIÓN, Y NO UNA CASILLA DE PERMISOS
 * ------------------------------------------------------------------------
 *
 * Porque la política de la base —`productos_administrar`, de
 * `20260827120000_catalogo_programas.sql`— exige `es_admin()` y no mira
 * `rol_permisos`. Mientras eso sea así, marcarle «editar programas» a Ventas
 * no habilita nada: el botón aparecería y la base lo rechazaría igual.
 *
 * Es una decisión, no un descuido. El catálogo lo comparten todas las
 * pantallas: renombrar un programa le cambia el nombre a los leads de todo el
 * equipo, a los cortes del Dashboard y a las opciones del formulario de feria.
 *
 * ------------------------------------------------------------------------
 * LO QUE CAMBIA Y LO QUE NO
 * ------------------------------------------------------------------------
 *
 * Renombrar NO mueve ningún lead: los leads cuelgan del `id`, no del nombre.
 * Lo que sí cambia es cómo se lee ese mismo lead de acá en adelante, en todas
 * las pantallas a la vez.
 *
 * Lo que este cambio NO toca son las opciones ya escritas en un formulario de
 * feria: ahí el texto está copiado, no enlazado, a propósito —hay opciones con
 * nombre comercial propio, y pisarlas sería peor—. Por eso el aviso de la
 * pantalla lo dice.
 *
 * Dar de baja tampoco borra nada. Un programa dado de baja sale de los
 * desplegables donde se elige y sigue nombrándose donde ya se usó.
 */
export interface CambioDePrograma {
  id: number;
  nombre: string;
  categoria: string;
  precio: number | null;
  horario: string | null;
  activo: boolean;
  /** Guardar aunque el nombre nuevo se parezca a otro que ya existe. */
  forzar?: boolean;
}

export async function editarPrograma(p: CambioDePrograma): Promise<ResultadoPrograma> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  // Igual que en el alta: acá además de en la base, para que el que no
  // corresponde lea un motivo y no el error crudo de una política.
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Sólo dirección puede cambiar un programa." };
  }

  if (!Number.isInteger(p.id) || p.id <= 0) {
    return { ok: false, error: "No se sabe qué programa cambiar." };
  }

  const nombre = p.nombre.trim();
  if (!nombre) return { ok: false, error: "Poné un nombre para el programa." };
  if (nombre.length > 120) return { ok: false, error: "El nombre es demasiado largo." };

  const categoria = (CATEGORIAS as readonly string[]).includes(p.categoria)
    ? p.categoria
    : "Otro";

  if (p.precio != null && (!Number.isFinite(p.precio) || p.precio < 0)) {
    return { ok: false, error: "El precio no es válido." };
  }

  const horario = (p.horario ?? "").trim();
  if (horario.length > 400) {
    return {
      ok: false,
      error: "El horario es demasiado largo. Con los días, la hora y las fechas alcanza.",
    };
  }

  const { data: existentes, error: errLeer } = await supabase
    .from("productos")
    .select("id, nombre")
    .limit(500);

  if (errLeer) return { ok: false, error: errLeer.message };

  // El programa que se está editando queda afuera de la comparación: si no,
  // cambiarle sólo el precio se rechazaría por parecerse a sí mismo.
  const otros = (existentes ?? [])
    .filter((x) => Number(x.id) !== p.id)
    .map((x) => String(x.nombre ?? ""));

  const buscado = normalizarTexto(nombre);
  const mismo = otros.find((n) => normalizarTexto(n) === buscado);
  if (mismo) {
    return { ok: false, error: `Ya existe «${mismo}». Es el mismo nombre.` };
  }

  if (!p.forzar) {
    const parecidos = otros.filter((n) => programasParecidos(n, nombre));
    if (parecidos.length > 0) return { ok: false, error: null, parecidos };
  }

  const campos = { nombre, categoria, precio: p.precio, activo: p.activo };

  const guardar = (con: Record<string, unknown>) =>
    supabase.from("productos").update(con).eq("id", p.id);

  // Todo en un solo `update`, que es lo que hace que no pueda quedar el nombre
  // cambiado y el horario no. Salvo que `horario` no exista: esa columna llega
  // en `20261008120000_horario_del_diplomado.sql`, y si el código se desplegó
  // antes que el SQL, lo que queremos es que el resto se guarde igual y que el
  // aviso nombre lo que falta.
  let { error } = await guardar({ ...campos, horario: horario || null });

  let faltaLaColumna = false;
  if (error && (error.code === "42703" || /column .*horario/i.test(error.message ?? ""))) {
    faltaLaColumna = true;
    ({ error } = await guardar(campos));
  }

  if (error) {
    // 23505: alguien más se quedó con ese nombre entre la lectura de arriba y
    // esta línea.
    if (error.code === "23505" || error.message.includes("duplicate key")) {
      return { ok: false, error: `Ya existe un programa llamado «${nombre}».` };
    }
    if (error.code === "42501") {
      return { ok: false, error: "Sólo dirección puede cambiar un programa." };
    }
    return { ok: false, error: error.message };
  }

  // Igual que en el alta: el catálogo nuevo tiene que llegar a la ficha, al
  // alta, al historial de cursos y a los cortes del Dashboard.
  revalidatePath("/");

  if (faltaLaColumna) {
    return {
      ok: false,
      error:
        "Se guardó todo menos el horario: falta correr la migración " +
        "20261008120000_horario_del_diplomado.sql en Supabase.",
    };
  }

  return { ok: true, error: null };
}

/**
 * El horario vigente de un programa.
 *
 * ------------------------------------------------------------------------
 * QUÉ CAMBIA Y QUÉ NO CAMBIA AL GUARDAR ESTO
 * ------------------------------------------------------------------------
 *
 * Cambia el borrador que se le va a ofrecer a ventas de acá en adelante. NO
 * cambia ninguna inscripción ya cerrada: cada lead guarda su propio horario,
 * congelado el día que se escribió.
 *
 * Es a propósito y es la razón de que sean dos columnas. La escuela cambia el
 * horario todos los años; si tocarlo acá reescribiera los recibos ya emitidos,
 * el primer cambio de calendario mandaría al área académica a inscribir en los
 * días equivocados a toda la gente del año anterior.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ES DE DIRECCIÓN
 * ------------------------------------------------------------------------
 *
 * Porque el catálogo lo comparten todas las pantallas: lo que se escriba acá
 * es lo que van a copiar todos los asesores. Un horario mal puesto se propaga
 * solo a las inscripciones de la semana. Ventas escribe el suyo en cada lead,
 * que es donde una errata afecta a una persona y no a todas.
 */
export async function guardarHorarioDePrograma(
  productoId: number,
  horario: string | null,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Sólo dirección puede cambiar el horario de un programa." };
  }

  const limpio = (horario ?? "").trim();
  if (limpio.length > 400) {
    return {
      ok: false,
      error: "El horario es demasiado largo. Con los días, la hora y las fechas alcanza.",
    };
  }

  const { error } = await supabase
    .from("productos")
    .update({ horario: limpio || null })
    .eq("id", productoId);

  if (error) {
    // 42703: la columna todavía no existe. Es lo que se ve si el código se
    // desplegó y el SQL no, y decirlo por su nombre ahorra el rato de creer
    // que se rompió el catálogo.
    if (error.code === "42703" || /column .*horario/i.test(error.message ?? "")) {
      return {
        ok: false,
        error:
          "Falta correr la migración 20261008120000_horario_del_diplomado.sql en Supabase.",
      };
    }
    if (error.code === "42501") {
      return { ok: false, error: "Sólo dirección puede cambiar el horario de un programa." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}
