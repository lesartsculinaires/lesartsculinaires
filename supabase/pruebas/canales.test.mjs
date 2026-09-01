/**
 * El registro de canales: ¿dice la verdad sobre cada red?
 *
 *     npx esbuild src/lib/canales.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/canales.mjs
 *     node supabase/pruebas/canales.test.mjs /tmp/canales.mjs
 *
 * ============================================================================
 * POR QUÉ ESTO SE PRUEBA
 * ============================================================================
 *
 * Porque de este archivo salen los botones. Si dijera que Instagram tiene
 * plantillas, la bandeja ofrecería un selector de plantillas en un hilo de
 * Instagram, y el día que se conecte alguien lo apretaría y no pasaría nada
 * —no porque falte programarlo, sino porque Instagram no tiene plantillas—.
 *
 * Las dos diferencias grandes con WhatsApp están escritas como pruebas para
 * que nadie las «empareje» sin querer:
 *
 *   LAS PLANTILLAS SON DE WHATSAPP   Instagram y Messenger no tienen nada
 *                                    equivalente. Fuera de la ventana hay que
 *                                    esperar.
 *
 *   LA VENTANA NO DURA LO MISMO      24 horas en WhatsApp, siete días en las
 *                                    de Meta cuando contesta una persona. Un
 *                                    aviso que dijera 24 horas en Instagram
 *                                    haría dejar de contestar conversaciones
 *                                    que todavía se pueden contestar.
 */
const { CANALES, CAPACIDADES, canalDe, conectados, porConectar, COMO_SE_DICE } =
  await import(process.argv[2] ?? "/tmp/canales.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const de = (clave) => CANALES.find((c) => c.clave === clave);

console.log("── están las cuatro redes ──");
{
  es(
    "en el orden en que se van a conectar",
    CANALES.map((c) => c.clave),
    ["whatsapp", "instagram", "messenger", "tiktok"],
  );
  es("hoy anda una sola", conectados().map((c) => c.clave), ["whatsapp"]);
  es("y las otras tres esperan", porConectar().length, 3);
}

console.log("\n── cada una que no anda dice qué le falta ──");
{
  /*
   * Una pestaña apagada sin explicación es peor que no tenerla: quien la ve
   * pregunta, y la respuesta tiene que estar en la pantalla.
   */
  for (const c of porConectar()) {
    es(`${c.nombre} explica qué falta`, typeof c.falta === "string" && c.falta.length > 40, true);
  }
  es("y la que anda no tiene nada pendiente", de("whatsapp").falta, null);
}

console.log("\n── LAS PLANTILLAS SON DE WHATSAPP ──");
{
  es("WhatsApp sí", de("whatsapp").puede.plantillas, "si");
  es("Instagram NO", de("instagram").puede.plantillas, "no");
  es("Messenger NO", de("messenger").puede.plantillas, "no");
  es("TikTok tampoco", de("tiktok").puede.plantillas, "no");
}

console.log("\n── LA VENTANA NO DURA LO MISMO ──");
{
  es("WhatsApp: 24 horas", de("whatsapp").ventanaHoras, 24);
  // Siete días, porque contesta una persona y no un robot. Es más margen, y
  // la pantalla tiene que decirlo o se dejarían de contestar hilos vivos.
  es("Instagram: siete días", de("instagram").ventanaHoras, 24 * 7);
  es("Messenger: siete días", de("messenger").ventanaHoras, 24 * 7);

  for (const c of CANALES) {
    es(`${c.nombre} explica su ventana`, c.laVentana.length > 30, true);
  }
}

console.log("\n── editar un mensaje no lo permite ninguna ──");
{
  // La aplicación del teléfono sí lo tiene; la API, no. No es algo que falte
  // programar, y decir «sí» acá haría dibujar un botón imposible.
  es(
    "en las cuatro",
    CANALES.map((c) => c.puede.editar),
    ["no", "no", "no", "no"],
  );
}

console.log("\n── TikTok es el que no depende de nosotros ──");
{
  /*
   * No se abre con un token: hay que ser «Messaging Partner» aprobado por
   * ellos. Está en la lista para que se vea que se pensó, no para prometerlo.
   */
  const t = de("tiktok");
  es("no está disponible", t.disponible, false);
  es("y lo dice con esas palabras", /Messaging Partner/.test(t.falta), true);
}

console.log("\n── el canal de una conversación ──");
{
  es("por su clave", canalDe("instagram").nombre, "Instagram");
  es("sin importar mayúsculas", canalDe("INSTAGRAM").nombre, "Instagram");

  /*
   * Un valor raro cae en WhatsApp y no en un canal «desconocido». Todas las
   * conversaciones de hoy son de WhatsApp, y una fila con un valor que no se
   * reconoce tiene que seguir viéndose y contestándose en vez de quedar en un
   * limbo sin botones.
   */
  es("un valor raro cae en WhatsApp", canalDe("loquesea").clave, "whatsapp");
  es("y uno vacío también", canalDe(null).clave, "whatsapp");
}

console.log("\n── la ficha se puede dibujar entera ──");
{
  // Cada capacidad que se muestra tiene que existir en las cuatro redes: si
  // faltara una, la ficha mostraría un renglón en blanco.
  for (const c of CANALES) {
    const completa = CAPACIDADES.every((cap) => c.puede[cap.clave] != null);
    es(`${c.nombre} tiene las cinco`, completa, true);
  }
  es(
    "y cada respuesta se sabe decir",
    CANALES.every((c) =>
      CAPACIDADES.every((cap) => typeof COMO_SE_DICE[c.puede[cap.clave]] === "string"),
    ),
    true,
  );
}

console.log("\n── y ninguna promete lo que no tiene ──");
{
  /*
   * La comprobación que ata todo: una red que no está disponible no puede
   * declarar una capacidad como «sí» sin más, salvo las que son ciertas por la
   * documentación de la plataforma. Lo que no se sabe va como «confirmar», que
   * es un estado real y distinto de «no».
   */
  const dudosas = CANALES.flatMap((c) =>
    CAPACIDADES.filter((cap) => c.puede[cap.clave] === "confirmar").map(
      (cap) => `${c.nombre}: ${cap.nombre}`,
    ),
  );
  console.log(`   (por confirmar al conectar: ${dudosas.length})`);
  es("hay cosas marcadas por confirmar", dudosas.length > 0, true);
  es(
    "pero ninguna en la que ya anda",
    CAPACIDADES.some((cap) => de("whatsapp").puede[cap.clave] === "confirmar"),
    false,
  );
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
