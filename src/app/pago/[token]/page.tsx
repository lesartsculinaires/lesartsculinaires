import { permanentRedirect } from "next/navigation";

/**
 * La dirección vieja del recibo.
 *
 * Se llamaba «pago» y confundía: la página no cobra nada, es el detalle para
 * inscribir. Se renombró a `/registro`, pero los enlaces que ya se mandaron
 * llevan la dirección vieja y tienen que seguir abriendo: del otro lado hay
 * gente que ya lo guardó en un chat, y un enlace que deja de funcionar es un
 * llamado al asesor preguntando qué pasó.
 *
 * Redirección permanente para que el navegador se quede con la nueva.
 */
export default async function PagoViejo({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  permanentRedirect(`/registro/${token}`);
}
