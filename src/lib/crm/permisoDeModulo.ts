import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ¿Este usuario puede hacer esto en este módulo?
 *
 * ============================================================================
 * POR QUÉ ESTO NO EXISTÍA, Y POR QUÉ AHORA SÍ
 * ============================================================================
 *
 * Las casillas de «Usuarios y Roles» —ver, crear, editar, eliminar por módulo—
 * se guardaban en `rol_permisos` y el servidor no las leía nunca. Cada acción
 * preguntaba `es_admin()` y nada más.
 *
 * Eso funcionaba mientras «puede» y «es administrador» fueran lo mismo. Dejó
 * de serlo cuando la escuela creó el rol «Jefe de Ventas»: tiene las casillas
 * marcadas, la pantalla se las mostraba, y no podía hacer nada. La primera
 * respuesta fue dejar de mostrar la casilla; ésta es la de verdad.
 *
 * ============================================================================
 * EL ADMINISTRADOR NO NECESITA CASILLAS
 * ============================================================================
 *
 * Un rol con `es_admin` puede todo por definición, y sus filas de
 * `rol_permisos` podrían estar incompletas si alguien agregó un módulo
 * después. Se contesta que sí antes de mirar nada: si hiciera falta la fila,
 * agregar un módulo nuevo dejaría a dirección sin poder usarlo.
 */

export type Accion = "ver" | "crear" | "editar" | "eliminar";

type Cliente = SupabaseClient;

/**
 * Nunca lanza y nunca abre de más: cualquier duda contesta que NO.
 *
 * Es la orientación correcta para un permiso. Un «no» de más se reporta
 * enseguida —alguien dice que no le aparece el botón— y un «sí» de más no lo
 * reporta nadie, porque desde afuera se ve igual que funcionar bien.
 */
export async function puedeEnModulo(
  supabase: Cliente,
  modulo: string,
  accion: Accion,
): Promise<boolean> {
  try {
    const { data: esAdmin } = await supabase.rpc("es_admin");
    if (esAdmin) return true;

    /*
     * El rol del usuario, y su fila para este módulo.
     *
     * Se leen con la sesión de quien pregunta, no con la llave de servicio: las
     * políticas de `usuarios` y `rol_permisos` ya dejan leer el catálogo a
     * cualquiera con sesión —la pantalla lo necesita para dibujar el menú— así
     * que no hace falta más permiso que el suyo.
     */
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("rol_id, activo")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();

    if (!usuario || usuario.activo === false || usuario.rol_id == null) return false;

    const { data: permiso } = await supabase
      .from("rol_permisos")
      .select(accion)
      .eq("rol_id", Number(usuario.rol_id))
      .eq("modulo", modulo)
      .maybeSingle();

    return Boolean((permiso as Record<string, unknown> | null)?.[accion]);
  } catch {
    return false;
  }
}
