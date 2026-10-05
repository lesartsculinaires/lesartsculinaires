import { compilar } from "./compilar.mjs";
/**
 * La consulta pública del estado de una eliminación.
 *
 *     node --test supabase/pruebas/estadoDeEliminacion.test.mjs
 *
 * ============================================================================
 * ESTO LO CONSULTA CUALQUIERA
 * ============================================================================
 *
 * La página de estado no pide sesión: la abre quien pidió el borrado con el
 * código que le dio Facebook, y es lo que Meta mira durante la revisión. Así que
 * lo que se vigila acá no es que funcione —eso se ve— sino lo que NO tiene que
 * pasar:
 *
 *   QUE SE PUEDA TANTEAR      Un código mal formado no llega a la base. Y «no
 *                             existe», «está mal escrito» y «falló la consulta»
 *                             contestan lo mismo: null. Responder distinto es lo
 *                             que convierte una página de consulta en una
 *                             herramienta para probar códigos.
 *
 *   QUE SE CUENTE DE MÁS      `sin_datos` se dice `completed`. Distinguirlo
 *                             confirmaría si esa persona habló alguna vez con la
 *                             escuela, que es un dato suyo y no hace falta para
 *                             contestar lo que vino a preguntar.
 */
const { BYTES_DEL_CODIGO, buscarSolicitud, esCodigoValido } = await compilar(
  "src/lib/meta/estadoDeEliminacion.ts",
);

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Un Supabase de mentira que anota si lo consultaron y con qué. */
const falso = (fila) => {
  const visto = { consultas: 0, tabla: null, columnas: null, filtro: null };
  const cliente = {
    from(tabla) {
      visto.consultas += 1;
      visto.tabla = tabla;
      return {
        select(columnas) {
          visto.columnas = columnas;
          return {
            eq(campo, valor) {
              visto.filtro = `${campo}=${valor}`;
              return { maybeSingle: async () => ({ data: fila, error: null }) };
            },
          };
        },
      };
    },
  };
  return { cliente, visto };
};

const BUENO = "A1B2C3D4E5F60718";

console.log("── el formato: dieciséis hexadecimales en mayúscula ──");
{
  es("uno bueno pasa", esCodigoValido(BUENO), true);
  es("en minúscula no", esCodigoValido(BUENO.toLowerCase()), false);
  es("más corto no", esCodigoValido("A1B2C3D4E5F6"), false);
  es("más largo no", esCodigoValido(BUENO + "AA"), false);
  es("con una letra que no es hexadecimal, no", esCodigoValido("Z1B2C3D4E5F60718"), false);
  es("vacío no", esCodigoValido(""), false);
  /*
   * Lo que de verdad importa de este filtro: que no se pueda meter sintaxis de
   * consulta por una puerta pública.
   */
  es("con comillas y comas, no", esCodigoValido("A1B2','*--,X0718"), false);
}

console.log("\n── y la longitud la fija el mismo sitio que la genera ──");
{
  /*
   * Si el generador y el validador no dijeran lo mismo, el callback entregaría
   * códigos que su propia página rechaza. Es el error que esta prueba existe
   * para que no vuelva.
   */
  es("ocho bytes son dieciséis caracteres", BYTES_DEL_CODIGO * 2, 16);
}

console.log("\n── un código mal formado NI SIQUIERA toca la base ──");
{
  const { cliente, visto } = falso({ estado: "completada" });
  const r = await buscarSolicitud(cliente, "no-es-un-codigo");
  es("devuelve null", r, null);
  es("Y NO SE CONSULTÓ NADA", visto.consultas, 0);
}

console.log("\n── uno bueno consulta lo justo ──");
{
  const { cliente, visto } = falso({
    estado: "parcial",
    solicitado_en: "2026-10-05T12:00:00+00:00",
    completada_en: "2026-10-05T12:00:03+00:00",
    notas: "queda la ficha 482",
  });
  const r = await buscarSolicitud(cliente, BUENO);

  es("busca por código exacto", visto.filtro, `codigo_confirmacion=${BUENO}`);
  /*
   * `identificador` guarda el IGSID. No alcanza con no mostrarlo: si viaja hasta
   * el servidor de la página, basta un descuido para publicarlo.
   */
  es("Y NO PIDE EL IDENTIFICADOR DE LA PERSONA", /identificador/.test(visto.columnas), false);
  es(
    "devuelve la forma que la página espera",
    r,
    {
      status: "partial",
      requested_at: "2026-10-05T12:00:00+00:00",
      completed_at: "2026-10-05T12:00:03+00:00",
      notes: "queda la ficha 482",
    },
  );
}

console.log("\n── los cuatro estados, traducidos ──");
{
  const estadoDe = async (estado) => {
    const { cliente } = falso({ estado, solicitado_en: null, completada_en: null, notas: null });
    return (await buscarSolicitud(cliente, BUENO))?.status;
  };

  es("pendiente", await estadoDe("pendiente"), "pending");
  es("completada", await estadoDe("completada"), "completed");
  es("parcial", await estadoDe("parcial"), "partial");
  es("SIN_DATOS SE DICE «completed», para no confirmar si existió", await estadoDe("sin_datos"), "completed");
  es("y algo que no conocemos cae en «pending», nunca en «completed»", await estadoDe("vaya_a_saber"), "pending");
}

console.log("\n── no hay fila: null, igual que un código mal escrito ──");
{
  const { cliente } = falso(null);
  es("devuelve null", await buscarSolicitud(cliente, BUENO), null);
}

console.log("\n── y si la base falla, también null: no se cuenta nada de más ──");
{
  const roto = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            throw new Error("se cayó");
          },
        }),
      }),
    }),
  };
  es("devuelve null sin lanzar", await buscarSolicitud(roto, BUENO), null);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
