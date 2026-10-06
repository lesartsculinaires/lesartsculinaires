import { compilar } from "./compilar.mjs";
/**
 * El reintento de Meta repara el archivo que la primera vez no se pudo guardar.
 *
 *     node supabase/pruebas/repararArchivo.test.mjs
 *
 * ============================================================================
 * ESTO SÓLO CORRE CUANDO YA SALIÓ ALGO MAL
 * ============================================================================
 *
 * Y por eso necesita prueba más que casi nada: nadie lo va a ver funcionar.
 * Pasaron seis semanas con el agujero abierto y se notó una sola vez, porque
 * alguien fue a escuchar una nota de voz y no estaba.
 *
 * Lo que pasó el 6 de octubre de 2026: llegó la nota de voz, se bajó bien de
 * Meta, y al subirla a Storage la base contestó que se había agotado la
 * conexión. Meta reintentó a los veintinueve segundos, la subida funcionó, el
 * `.ogg` quedó en el bucket —entero— y el mensaje chocó con la unicidad de
 * `wa_id`. El código se volvía con un `return` y la pantalla siguió diciendo
 * «no se pudo traer el archivo» con el archivo ahí al lado.
 *
 * ============================================================================
 * LAS DOS MITADES
 * ============================================================================
 *
 *   QUE REPARE    Si este intento trajo el archivo y la fila no lo tiene, se lo
 *                 pone. Si no, esto no existe.
 *
 *   QUE NO PISE   Y si la fila YA tenía su archivo, no se toca. Un reintento
 *                 normal —de los que Meta manda a montones, donde la primera
 *                 vez salió todo bien— no puede convertirse en una escritura
 *                 sobre una fila sana.
 */
const { repararArchivo } = await compilar("src/lib/meta/repararArchivo.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/**
 * Un cliente de mentira que anota qué se le pidió.
 *
 * Devuelve la cadena entera —`from().update().eq().is()`— porque lo que se
 * quiere comprobar no es sólo que escriba: es CON QUÉ CONDICIONES escribe. El
 * `is("media_ruta", null)` es la mitad del arreglo, y un fake que sólo mirara
 * el `update` lo daría por bueno sin él.
 */
const falso = (respuesta = { error: null }) => {
  const visto = { tablas: [], cambios: [], filtros: [] };
  const cadena = {
    update(valores) {
      visto.cambios.push(valores);
      return cadena;
    },
    eq(col, val) {
      visto.filtros.push(["eq", col, val]);
      return cadena;
    },
    is(col, val) {
      visto.filtros.push(["is", col, val]);
      return Promise.resolve(respuesta);
    },
  };
  return {
    visto,
    cliente: {
      from(tabla) {
        visto.tablas.push(tabla);
        return cadena;
      },
    },
  };
};

console.log("── si este intento trajo el archivo, se repara ──");
{
  const { cliente, visto } = falso();
  await repararArchivo(cliente, "wamid.ABC", { ruta: "wa/799/116.ogg", mime: "audio/ogg" }, "whatsapp");

  es("se tocó la tabla de mensajes", visto.tablas, ["mensajes"]);
  es("se escribió una vez", visto.cambios.length, 1);
  es("con la ruta", visto.cambios[0].media_ruta, "wa/799/116.ogg");
  es("con el tipo", visto.cambios[0].media_mime, "audio/ogg");
  /*
   * Y se borra el aviso. Si quedara, la pantalla seguiría mostrando «no se pudo
   * traer el archivo» encima de un archivo que ahora sí está: es la rama que
   * dibuja el error, antes que la que dibuja el reproductor.
   */
  es("Y SE BORRA EL AVISO DE ERROR", visto.cambios[0].media_error, null);
}

console.log("\n── y NO se pisa una fila que ya tenía su archivo ──");
{
  const { cliente, visto } = falso();
  await repararArchivo(cliente, "wamid.ABC", { ruta: "wa/799/116.ogg", mime: "audio/ogg" }, "whatsapp");

  es("se filtra por el mensaje", visto.filtros[0], ["eq", "wa_id", "wamid.ABC"]);
  es("Y SÓLO SI NO TIENE ARCHIVO", visto.filtros[1], ["is", "media_ruta", null]);
  es("son esos dos filtros y ninguno más", visto.filtros.length, 2);
}

console.log("\n── sin archivo que poner, no se toca la base ──");
{
  for (const [como, archivo] of [
    ["cuando no hubo archivo", null],
    ["cuando el intento tampoco lo trajo", { ruta: null, mime: null }],
    ["cuando sólo se supo el tipo", { ruta: null, mime: "audio/ogg" }],
  ]) {
    const { cliente, visto } = falso();
    await repararArchivo(cliente, "wamid.ABC", archivo, "whatsapp");
    es(`NI UNA CONSULTA ${como}`, visto.tablas.length, 0);
  }
}

console.log("\n── si la reparación falla, el webhook sigue en pie ──");
{
  /*
   * Quien llama es el webhook, que tiene que contestarle 200 a Meta pase lo que
   * pase. Una excepción acá haría que Meta reintentara el mensaje entero, y lo
   * que estaba roto era solamente el adjunto.
   */
  const { cliente } = falso({ error: { message: "la base otra vez" } });
  let tiró = null;
  try {
    await repararArchivo(cliente, "wamid.ABC", { ruta: "x.ogg", mime: "audio/ogg" }, "whatsapp");
  } catch (e) {
    tiró = e instanceof Error ? e.message : String(e);
  }
  es("NO LANZA", tiró, null);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
