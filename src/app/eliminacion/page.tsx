import type { Metadata } from "next";

import { getAdminClient } from "@/lib/supabase/admin";

/** El estado cambia: nunca de caché. */
export const dynamic = "force-dynamic";

/**
 * Que ningún buscador la indexe.
 *
 * Es la misma razón que en el recibo: el código ya hace imposible adivinar el
 * pedido de alguien, pero basta con que una dirección se pegue en un lugar
 * público para que un rastreador la siga y la deje archivada.
 */
export const metadata: Metadata = {
  title: "Estado de tu solicitud de eliminación",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Dónde mira una persona cómo va su pedido de eliminación de datos.
 *
 * ============================================================================
 * NO ES UNA PANTALLA DEL CRM
 * ============================================================================
 *
 * La abre alguien de afuera, con un código que le dio Facebook, y es lo que
 * Meta entra a mirar durante la revisión. Por eso no pide sesión, no tiene menú
 * y no se parece al resto: lo único que hace es contestar una pregunta.
 *
 * ============================================================================
 * LO QUE NO SE MUESTRA
 * ============================================================================
 *
 * Las notas internas. Dicen cosas como «queda la ficha 482 por decidir», que le
 * sirven al equipo y no a quien consulta: es un número de nuestro sistema, no
 * un dato suyo, y publicarlo sería contar de más a cambio de nada. Lo que se
 * muestra es el estado dicho en palabras.
 */

const COMO_SE_DICE: Record<string, { titulo: string; dice: string }> = {
  pendiente: {
    titulo: "Recibimos tu solicitud",
    dice:
      "La estamos procesando. Si volvés a entrar en unos minutos con este mismo código, vas a " +
      "ver el resultado.",
  },
  completada: {
    titulo: "Listo: tus datos fueron eliminados",
    dice:
      "Borramos la conversación que tuviste con nosotros por Instagram, sus mensajes y los " +
      "archivos que se enviaron en ella.",
  },
  parcial: {
    titulo: "Eliminamos tus datos de Instagram",
    dice:
      "Borramos la conversación que tuviste con nosotros por Instagram, sus mensajes y los " +
      "archivos que se enviaron en ella. Puede quedar algún dato que no llegó por Instagram " +
      "—por ejemplo, si además nos escribiste por otro medio—. Nuestro equipo lo está " +
      "revisando; si querés que también se elimine, escribinos.",
  },
  sin_datos: {
    titulo: "No teníamos datos tuyos",
    dice: "Buscamos con tu identificador de Instagram y no encontramos ninguna conversación.",
  },
};

/** El código, tal como puede venir escrito a mano: con espacios o en minúscula. */
const limpio = (v: string | undefined): string =>
  (v ?? "").trim().replace(/\s+/g, "").toUpperCase();

export default async function PaginaEliminacion({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;
  const buscado = limpio(codigo);

  let estado: string | null = null;
  let cuando: string | null = null;
  let sePudoConsultar = true;

  if (buscado !== "") {
    const admin = getAdminClient();
    if (!admin) sePudoConsultar = false;
    else {
      try {
        const { data, error } = await admin
          .from("solicitudes_eliminacion")
          .select("estado, solicitado_en")
          .eq("codigo_confirmacion", buscado)
          .maybeSingle();

        if (error) sePudoConsultar = false;
        else if (data) {
          estado = String((data as Record<string, unknown>).estado ?? "pendiente");
          const fecha = (data as Record<string, unknown>).solicitado_en;
          cuando = fecha == null ? null : String(fecha).slice(0, 10);
        }
      } catch {
        sePudoConsultar = false;
      }
    }
  }

  const dicho = estado ? COMO_SE_DICE[estado] ?? COMO_SE_DICE.pendiente : null;

  return (
    <main
      style={{
        maxWidth: 620,
        margin: "0 auto",
        padding: "48px 20px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#1F1D1A",
        lineHeight: 1.6,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, letterSpacing: 1.5, color: "#8A8378" }}>
        LES ARTS CULINAIRES
      </p>
      <h1 style={{ margin: "6px 0 24px", fontSize: 24, fontWeight: 700 }}>
        Eliminación de datos
      </h1>

      {buscado === "" && (
        <p style={{ fontSize: 15 }}>
          Para ver cómo va tu solicitud, abrí el enlace con el código de confirmación que te dio
          Facebook. Si lo perdiste, escribinos y lo buscamos.
        </p>
      )}

      {buscado !== "" && !sePudoConsultar && (
        <p style={{ fontSize: 15 }}>
          En este momento no podemos consultar el estado. Volvé a intentar en unos minutos.
        </p>
      )}

      {buscado !== "" && sePudoConsultar && !dicho && (
        <>
          <p style={{ fontSize: 15 }}>
            No encontramos ninguna solicitud con el código <strong>{buscado}</strong>.
          </p>
          <p style={{ fontSize: 14, color: "#5C564D" }}>
            Revisá que esté copiado completo. Si lo está y seguís viendo esto, escribinos y lo
            resolvemos.
          </p>
        </>
      )}

      {dicho && (
        <>
          <h2 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 700 }}>{dicho.titulo}</h2>
          <p style={{ fontSize: 15, margin: "0 0 18px" }}>{dicho.dice}</p>
          <p style={{ fontSize: 13, color: "#5C564D", margin: 0 }}>
            Código de confirmación: <strong>{buscado}</strong>
            {cuando ? ` · solicitud recibida el ${cuando}` : ""}
          </p>
        </>
      )}

      <p style={{ marginTop: 32, fontSize: 13, color: "#8A8378" }}>
        ¿Dudas? Escribinos a{" "}
        <a href="mailto:sistemas@lesarts.com" style={{ color: "#5C564D" }}>
          sistemas@lesarts.com
        </a>
        .
      </p>
    </main>
  );
}
