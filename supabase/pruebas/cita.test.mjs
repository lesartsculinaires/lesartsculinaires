import { compilar } from "./compilar.mjs";
/**
 * Las citas que se agendan desde Messenger.
 *
 *     node supabase/pruebas/cita.test.mjs
 *
 * ============================================================================
 * LA CARGA DE ACÁ ABAJO ES REAL
 * ============================================================================
 *
 * Salió de producción, del mensaje 3105: alguien pidió cita el 1 de octubre de
 * 2026 a las 3:30 de la tarde y en el CRM no se vio nada. La cita había llegado
 * entera por el webhook y estaba guardada en `payload` desde el primer momento;
 * lo que fallaba era que el lector de adjuntos se iba con `null` si el adjunto
 * no traía `url`, y una cita no trae.
 *
 * Se deja tal cual vino —sin limpiar, sin acortar— porque una prueba escrita
 * con un ejemplo inventado habría pasado igual con el código roto.
 *
 * ============================================================================
 * LO QUE SE VIGILA
 * ============================================================================
 *
 *   LAS HORAS SON SEGUNDOS   Meta manda Unix en segundos. Tratarlos como
 *                            milisegundos manda la cita al año 58.700, y eso no
 *                            se nota hasta que alguien abre la agenda.
 *
 *   LA ZONA ES LA DE LA CITA El servidor corre en UTC. Formatear con la zona de
 *                            la máquina convierte las 3:30 de la tarde en las
 *                            9:30 de la noche, y la asesora llama tarde.
 *
 *   QUE NO SE TRAGUE NADA    Sin hora de inicio no hay cita. Media cita en la
 *                            agenda es peor que ninguna.
 */
const {
  leerCita,
  comoSeLee,
  cuandoSeLee,
  duracionEnMinutos,
  estadoEnCastellano,
  sigueEnPie,
  partirLoDicho,
  ZONA_POR_DEFECTO,
} = await compilar("src/lib/meta/cita.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Tal cual llegó de Meta el 1 de octubre de 2026. */
const DE_VERDAD = [
  {
    type: "appointment_booking",
    payload: {
      status: "requested",
      end_time: 1790892000,
      timezone: "America/El_Salvador",
      booking_id: "1484383103529238",
      start_time: 1790890200,
    },
  },
];

console.log("── la cita real, leída ──");
{
  const c = leerCita(DE_VERDAD);
  es("se encontró", c !== null, true);
  es("con su id de reserva", c.bookingId, "1484383103529238");
  es("y su estado", c.estado, "requested");
  es("y la zona que mandó Meta", c.zona, "America/El_Salvador");

  /*
   * El momento exacto, comprobado contra UTC y no contra la zona de la máquina
   * que corra esto: 1790890200 segundos son las 21:30 UTC, que en San Salvador
   * —UTC-6— son las 3:30 de la tarde. Es la hora que decía la captura.
   */
  es("ES LA HORA DE VERDAD, EN SEGUNDOS", c.inicia.toISOString(), "2026-10-01T21:30:00.000Z");
  es("y la de fin", c.termina.toISOString(), "2026-10-01T22:00:00.000Z");
  es("o sea media hora", duracionEnMinutos(c), 30);
}

console.log("\n── y escrita para que la lea una persona ──");
{
  const c = leerCita(DE_VERDAD);
  const dicho = cuandoSeLee(c);

  /*
   * Lo que importa no es el formato exacto —`Intl` puede cambiar entre
   * versiones de Node— sino que diga LAS 3:30 DE LA TARDE y no las 9:30 de la
   * noche. Ése es el error que haría llamar tarde a un lead.
   */
  es("dice la hora en la zona de la cita", /3:30/.test(dicho), true);
  es("Y ES DE LA TARDE, NO DE LA NOCHE", /p\.?\s?m\.?/i.test(dicho), true);
  es("con el día", /1/.test(dicho) && /octubre/i.test(dicho), true);

  es("y la línea entera dice qué es", comoSeLee(c), `Cita solicitada: ${dicho}`);
}

console.log("\n── los estados ──");
{
  es("solicitada", estadoEnCastellano("requested"), "Cita solicitada");
  es("confirmada", estadoEnCastellano("confirmed"), "Cita confirmada");
  es("cancelada, con una ele", estadoEnCastellano("canceled"), "Cita cancelada");
  es("y con dos", estadoEnCastellano("cancelled"), "Cita cancelada");
  /*
   * Meta agrega estados cada tanto. Uno desconocido se MUESTRA en vez de
   * esconderse detrás de «Cita»: así quien atiende lo ve y se puede pedir que
   * se agregue, en vez de quedarse con una palabra que no dice nada.
   */
  es("Y UNO QUE NO CONOCEMOS SE VE TAL CUAL", estadoEnCastellano("no_show"), "Cita (no_show)");

  const cancelada = leerCita([
    { type: "appointment_booking", payload: { ...DE_VERDAD[0].payload, status: "canceled" } },
  ]);
  es("una cancelada ya no está en pie", sigueEnPie(cancelada), false);
  es("una solicitada sí", sigueEnPie(leerCita(DE_VERDAD)), true);
}

console.log("\n── lo que no es una cita, no lo es ──");
{
  es("sin adjuntos", leerCita(undefined), null);
  es("con una lista vacía", leerCita([]), null);
  es("con una foto", leerCita([{ type: "image", payload: { url: "https://x/y.jpg" } }]), null);
  es(
    "con una cita SIN hora de inicio",
    leerCita([{ type: "appointment_booking", payload: { status: "requested" } }]),
    null,
  );
  es(
    "con una hora que no es hora",
    leerCita([{ type: "appointment_booking", payload: { start_time: "mañana" } }]),
    null,
  );
}

console.log("\n── los bordes que Meta sí produce ──");
{
  /*
   * Una foto Y una cita en el mismo mensaje. Mirando sólo el primer adjunto
   * —que es lo que hace el lector de archivos— la cita se perdería según en qué
   * orden los mande Meta.
   */
  const mezclado = leerCita([
    { type: "image", payload: { url: "https://x/y.jpg" } },
    DE_VERDAD[0],
  ]);
  es("UNA CITA DETRÁS DE UNA FOTO SE ENCUENTRA IGUAL", mezclado?.bookingId, "1484383103529238");

  // Las horas han llegado como texto más de una vez por este webhook.
  const comoTexto = leerCita([
    { type: "appointment_booking", payload: { start_time: "1790890200", status: "confirmed" } },
  ]);
  es("una hora en texto también se lee", comoTexto?.inicia.toISOString(), "2026-10-01T21:30:00.000Z");

  // Sin zona, la de la escuela: una cita sin zona formateada en UTC llega tarde.
  const sinZona = leerCita([
    { type: "appointment_booking", payload: { start_time: 1790890200 } },
  ]);
  es("sin zona se usa la de la escuela", sinZona?.zona, ZONA_POR_DEFECTO);

  // Sin hora de fin, media hora: una duración de cero se dibuja como una raya.
  es("sin hora de fin, media hora", duracionEnMinutos(sinZona), 30);
}

console.log("\n── la línea se parte igual que como se armó ──");
{
  /*
   * La tarjeta del hilo dibuja el estado arriba y la fecha abajo. Las dos
   * mitades salen de acá y no de la pantalla, para que `comoSeLee` no pueda
   * cambiar la línea y dejar la tarjeta partiéndola mal en silencio.
   */
  const c = leerCita(DE_VERDAD);
  const partido = partirLoDicho(comoSeLee(c));
  es("el qué", partido.que, "Cita solicitada");
  es("y el cuándo", partido.cuando, cuandoSeLee(c));

  // Una línea sin separador no se rompe: se muestra entera arriba.
  es("sin separador, todo es el qué", partirLoDicho("Cita"), { que: "Cita", cuando: null });

  /*
   * Y la fecha lleva comas adentro —«jueves, 1 de octubre, 3:30 p. m.»—, así
   * que partir por la primera coma, que es lo obvio, la cortaría al medio.
   */
  es("se parte por el separador y no por la primera coma", partido.cuando.includes("octubre"), true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
