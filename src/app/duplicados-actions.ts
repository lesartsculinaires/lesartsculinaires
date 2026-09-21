"use server";

import { revalidatePath } from "next/cache";

import { getServerClient } from "@/lib/supabase/server";

/**
 * La cola de duplicados sugeridos: leerla, descartar y unificar.
 *
 * ============================================================================
 * POR QUÉ ESTO ES UNA COLA Y NO UNA REGLA AUTOMÁTICA
 * ============================================================================
 *
 * Reconocer a alguien que vuelve por el MISMO canal ya es automático y no pasa
 * por acá: los webhooks preguntan por `contactos_canal` antes de abrir nada.
 *
 * Lo que necesita a una persona es el caso cruzado —la misma señora por
 * Instagram y por WhatsApp—, y necesita a una persona por un motivo concreto:
 * Instagram y Messenger no entregan teléfono ni correo. La única señal
 * disponible es el nombre, y unificar dos «María González» sin que nadie mire se
 * descubre meses después, cuando una recibe la respuesta de lo que preguntó la
 * otra.
 *
 * Por eso el CRM propone y una persona decide. Lo que sí se hace es ordenar la
 * cola para que lo concluyente —mismo correo, mismo teléfono— quede arriba y se
 * resuelva de un vistazo.
 */

/** Un par de fichas que podrían ser la misma persona. */
export interface ParSugerido {
  menor: number;
  mayor: number;
  /** «correo», «telefono», «nombre». Pueden venir varios. */
  motivos: string[];
  /** Correo 3, teléfono 2, nombre 1, sumados. Para ordenar. */
  peso: number;
  izquierda: LadoDelPar;
  derecha: LadoDelPar;
}

export interface LadoDelPar {
  id: number;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  /** Por qué canales llegó. Dos distintos es la firma del caso cruzado. */
  canales: string | null;
  /** Su último mensaje, de cualquier canal. */
  ultimoMensaje: string | null;
}

export interface ResultadoDuplicados {
  ok: boolean;
  pares: ParSugerido[];
  error: string | null;
  /** La migración no está corrida: la pantalla lo dice en vez de quedar vacía. */
  faltaMigracion: boolean;
}

/**
 * Los pares candidatos, los más concluyentes primero.
 *
 * El tope existe porque esta pantalla es para trabajar, no para contemplar: con
 * cuatrocientos pares nadie revisa ninguno. Se resuelven los de arriba, se
 * recarga, y bajan los siguientes.
 */
export async function duplicadosSugeridos(tope = 60): Promise<ResultadoDuplicados> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ok: false, pares: [], error: "Sesión vencida.", faltaMigracion: false };
  }

  const { data, error } = await supabase
    .from("vw_duplicados_sugeridos")
    .select(
      "menor, mayor, motivos, peso, ultimo_menor, ultimo_mayor, canales_menor, canales_mayor",
    )
    .order("peso", { ascending: false })
    .limit(tope);

  if (error) {
    /*
     * Sin la vista, la pantalla lo dice en vez de mostrarse vacía.
     *
     * Una cola de duplicados vacía y una cola que no se pudo leer se ven igual,
     * y significan lo contrario: la primera es «no hay nada que revisar» y la
     * segunda «no sabemos». Entre desplegar y correr el SQL hay un rato en que
     * esto pasa.
     */
    const falta =
      error.code === "PGRST205" ||
      error.code === "42P01" ||
      /vw_duplicados_sugeridos|does not exist|Could not find the table/i.test(error.message);

    return {
      ok: false,
      pares: [],
      error: falta
        ? "Falta correr la migración 20261028120000_duplicados_sugeridos.sql en Supabase."
        : error.message,
      faltaMigracion: falta,
    };
  }

  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = [...new Set(filas.flatMap((f) => [Number(f.menor), Number(f.mayor)]))];

  if (ids.length === 0) return { ok: true, pares: [], error: null, faltaMigracion: false };

  // Los datos de las fichas, en una sola consulta: la vista devuelve los ids y
  // las señales, no la ficha entera, para no repetir los mismos datos en cada
  // par cuando una ficha aparece en varios.
  const { data: gente, error: errGente } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, correo")
    .in("id", ids);

  if (errGente) {
    return { ok: false, pares: [], error: errGente.message, faltaMigracion: false };
  }

  const porId = new Map(
    ((gente ?? []) as Record<string, unknown>[]).map((c) => [
      Number(c.id),
      {
        id: Number(c.id),
        nombre: String(c.nombre ?? ""),
        telefono: c.telefono ? String(c.telefono) : null,
        correo: c.correo ? String(c.correo) : null,
      },
    ]),
  );

  const lado = (id: number, canales: unknown, ultimo: unknown): LadoDelPar => ({
    ...(porId.get(id) ?? { id, nombre: "(ficha borrada)", telefono: null, correo: null }),
    canales: canales ? String(canales) : null,
    ultimoMensaje: ultimo ? String(ultimo) : null,
  });

  const pares: ParSugerido[] = filas.map((f) => ({
    menor: Number(f.menor),
    mayor: Number(f.mayor),
    motivos: Array.isArray(f.motivos) ? f.motivos.map(String) : [],
    peso: Number(f.peso ?? 0),
    izquierda: lado(Number(f.menor), f.canales_menor, f.ultimo_menor),
    derecha: lado(Number(f.mayor), f.canales_mayor, f.ultimo_mayor),
  }));

  return { ok: true, pares, error: null, faltaMigracion: false };
}

/**
 * «No es la misma persona»: que la cola no lo vuelva a proponer.
 *
 * Sin esto, un par de homónimos reaparecería en cada recarga y la encargada
 * dejaría de mirar la pantalla en dos semanas. Un botón que no recuerda lo que
 * le dijeron es peor que no tenerlo.
 *
 * El par se guarda con el id menor primero. La restricción de la tabla lo exige
 * y es lo que impide que (A,B) y (B,A) convivan como dos descartes distintos.
 */
export async function descartarDuplicado(
  a: number,
  b: number,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión vencida." };

  const { data: quien } = await supabase.auth.getUser();

  const { error } = await supabase.from("duplicados_descartados").insert({
    menor: Math.min(a, b),
    mayor: Math.max(a, b),
    quien: quien?.user?.id ?? null,
  });

  // 23505: ya estaba descartado. Dos personas tocando el mismo botón a la vez
  // no es un error, es la misma decisión dos veces.
  if (error && error.code !== "23505") return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Unificar dos fichas en una.
 *
 * ----------------------------------------------------------------------------
 * CUÁL SE CONSERVA, Y POR QUÉ LO ELIGE QUIEN MIRA
 * ----------------------------------------------------------------------------
 *
 * No se elige sola. La ficha que se conserva es la que se queda con el código de
 * lead que la escuela viene usando, y cuál de las dos es depende de cosas que la
 * base no sabe: cuál tiene la conversación buena, cuál tiene el nombre bien
 * escrito, cuál ya le pasó el asesor al cliente. Por eso la pantalla muestra las
 * dos y quien revisa señala.
 *
 * `fusionar_contactos` hace el trabajo y ya existía: arrastra identificadores de
 * canal, oportunidades y notas, y se queda con la fecha más vieja de cada canal.
 * Lo que se agrega acá es el rastro.
 */
export async function unificarDuplicado(
  conservar: number,
  absorber: number,
  motivos: readonly string[],
): Promise<{ ok: boolean; error: string | null; detalle: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión vencida.", detalle: null };

  if (conservar === absorber) {
    return { ok: false, error: "Son la misma ficha.", detalle: null };
  }

  /*
   * El nombre se lee ANTES de fusionar.
   *
   * Después la ficha absorbida ya no existe, y el rastro diría «se absorbió al
   * cliente 4471», que dentro de seis meses no le sirve a nadie.
   */
  const { data: absorbida } = await supabase
    .from("clientes")
    .select("nombre")
    .eq("id", absorber)
    .maybeSingle();

  const { data: detalle, error } = await supabase.rpc("fusionar_contactos", {
    p_conservar: conservar,
    p_absorber: [absorber],
  });

  if (error) {
    /*
     * El error de permiso se traduce.
     *
     * `fusionar_contactos` exige dirección —es destructiva— y devuelve una
     * excepción de la base que en crudo no se entiende. Quien la lea tiene que
     * saber que no hizo nada mal: le falta el permiso.
     */
    const esPermiso = /direcci[oó]n|permission|not authorized|no autorizad/i.test(error.message);
    return {
      ok: false,
      detalle: null,
      error: esPermiso
        ? "Unificar contactos lo puede hacer dirección. Pedile a quien corresponda que lo revise."
        : error.message,
    };
  }

  const { data: quien } = await supabase.auth.getUser();

  /*
   * El rastro no frena la fusión si falla.
   *
   * Las fichas ya se unieron cuando esto corre. Devolver un error acá haría creer
   * que no se hizo nada, y alguien volvería a intentarlo sobre una ficha que ya
   * no existe. Que falte una línea de auditoría es un problema menor que ése.
   */
  await supabase.from("fusiones").insert({
    conservado: conservar,
    absorbidos: [absorber],
    nombres: [absorbida?.nombre ? String(absorbida.nombre) : `cliente ${absorber}`],
    motivos: motivos.join(", ") || null,
    quien: quien?.user?.id ?? null,
  });

  revalidatePath("/");
  return { ok: true, error: null, detalle: detalle == null ? null : String(detalle) };
}
