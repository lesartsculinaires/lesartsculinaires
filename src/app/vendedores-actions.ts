"use server";

import { revalidatePath } from "next/cache";

import { normalizarTexto, programasParecidos } from "@/lib/duplicados";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Alta de vendedores.
 *
 * De esta lista cuelgan las oportunidades, los eventos del calendario, la
 * asignación de la bandeja, el reparto de leads que hace n8n y todos los
 * cortes por vendedor. Un nombre repetido acá parte las métricas de una persona
 * en dos, igual que pasa con los programas.
 *
 * Lo que NO hace: crear una cuenta para entrar al CRM. Eso es `usuarios`, con
 * su rol y sus permisos, y se administra desde «Usuarios y Roles». Son tablas
 * separadas sin ninguna columna que las una, así que las dos altas son
 * independientes y hay que acordarse de las dos.
 */

export interface NuevoVendedor {
  nombre: string;
  correo: string | null;
  /** WhatsApp en formato internacional, sólo dígitos: 50371000001. */
  telefono: string | null;
  /** Crear aunque se parezca a uno que ya existe. */
  forzar?: boolean;
}

export interface ResultadoVendedor {
  ok: boolean;
  error: string | null;
  /** Vendedores ya cargados que se parecen al que se quiere crear. */
  parecidos?: string[];
  /**
   * Qué pasa con la cuenta del CRM de esta persona, para poder decirlo al
   * terminar en vez de que se descubra cuando no puede entrar.
   */
  tieneCuenta?: boolean;
}

export async function crearVendedor(v: NuevoVendedor): Promise<ResultadoVendedor> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  // Sólo dirección, comprobado acá además de en la base: mientras la migración
  // del catálogo no esté corrida, la política vieja deja escribir a cualquiera
  // con sesión y el botón escondido no separa nada.
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Sólo dirección puede agregar vendedores." };
  }

  const nombre = v.nombre.trim();
  if (!nombre) return { ok: false, error: "Poné el nombre del vendedor." };
  if (nombre.length > 120) return { ok: false, error: "El nombre es demasiado largo." };

  const correo = (v.correo ?? "").trim().toLowerCase() || null;
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { ok: false, error: "El correo no tiene una forma válida." };
  }

  // El teléfono se guarda sólo con dígitos: es lo que espera la API de Meta y
  // lo que exige la restricción de la base. Un «7100-0001» escrito con guiones
  // llegaría hasta el nodo de WhatsApp y fallaría allá, lejos de acá.
  const telefono = (v.telefono ?? "").replace(/\D/g, "") || null;
  if (telefono && !/^[0-9]{8,15}$/.test(telefono)) {
    return { ok: false, error: "El teléfono tiene que tener entre 8 y 15 dígitos." };
  }

  const { data: existentes, error: errLeer } = await supabase
    .from("vendedores")
    .select("nombre, correo")
    .limit(500);

  if (errLeer) return { ok: false, error: errLeer.message };

  const nombres = (existentes ?? []).map((x) => String(x.nombre ?? ""));
  const buscado = normalizarTexto(nombre);

  const mismo = nombres.find((n) => normalizarTexto(n) === buscado);
  if (mismo) return { ok: false, error: `Ya está «${mismo}» en la lista.` };

  if (correo) {
    const conEseCorreo = (existentes ?? []).find(
      (x) => String(x.correo ?? "").toLowerCase() === correo,
    );
    if (conEseCorreo) {
      return {
        ok: false,
        error: `Ese correo ya es de «${String(conEseCorreo.nombre)}».`,
      };
    }
  }

  if (!v.forzar) {
    // Mismo criterio que con los programas: se comparan palabras, así se
    // atrapa «Katya» contra «Katya Villatoro», que es como entra la misma
    // persona dos veces y parte sus números al medio.
    const parecidos = nombres.filter((n) => programasParecidos(n, nombre));
    if (parecidos.length > 0) return { ok: false, error: null, parecidos };
  }

  const { error } = await supabase
    .from("vendedores")
    .insert({ nombre, correo, telefono });

  if (error) {
    if (error.code === "23505" || error.message.includes("duplicate key")) {
      return { ok: false, error: `Ya existe un vendedor con ese nombre o correo.` };
    }
    if (error.code === "42501") {
      return { ok: false, error: "Sólo dirección puede agregar vendedores." };
    }
    // 42703: falta la columna del teléfono, de la migración de vendedores.
    if (error.code === "42703") {
      return {
        ok: false,
        error: "Falta correr la migración 20260817120000_vendedores_telefono.sql en Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  // Para que la lista nueva llegue a los desplegables, al calendario, a la
  // bandeja y a la API: todo eso lee el mismo catálogo del lado del servidor.
  revalidatePath("/");

  return { ok: true, error: null, tieneCuenta: await tieneCuentaCrm(supabase, correo) };
}

/**
 * ¿Esta persona ya puede entrar al CRM?
 *
 * Se pregunta por el correo porque es lo único que comparten las dos tablas.
 * Sin cuenta, el vendedor recibe leads pero no puede entrar a verlos, y eso se
 * descubre normalmente cuando lo intenta; mejor decirlo al crearlo.
 */
async function tieneCuentaCrm(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClient>>>,
  correo: string | null,
): Promise<boolean> {
  if (!correo) return false;

  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .ilike("correo", correo)
    .maybeSingle();

  return data != null;
}
