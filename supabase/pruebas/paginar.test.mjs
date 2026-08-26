/**
 * ¿Se traen todas las filas, o sólo las primeras mil?
 *
 *     npx esbuild src/lib/supabase/paginar.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src \
 *       --alias:server-only=./supabase/pruebas/server-only-vacio.mjs \
 *       --outfile=/tmp/pag.mjs
 *     node supabase/pruebas/paginar.test.mjs /tmp/pag.mjs
 *
 * ------------------------------------------------------------------------
 * POR QUÉ SE PRUEBA CON UNA BASE DE MENTIRA
 * ------------------------------------------------------------------------
 *
 * Lo que hay que probar es el comportamiento del techo de PostgREST: que
 * devuelve las primeras N sin error y sin decir que faltan. Un Postgres de
 * verdad no lo reproduce —el techo lo pone PostgREST, no la base— y montar
 * PostgREST con `db-max-rows` bajo sería armar medio banco para comprobar un
 * bucle de diez líneas.
 *
 * Así que acá el `range` está imitado, con el mismo techo y la misma mudez.
 */
// Dinámico y no estático: la ruta del archivo armado llega por argumento, y un
// `import` de los de arriba sólo acepta una ruta escrita a mano.
const { traerTodo, POR_TANDA } = await import(process.argv[2] ?? "/tmp/pag.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/**
 * Una tabla imitada con el techo de Supabase.
 *
 * `techo` es lo máximo que devuelve por respuesta, pase lo que pase. Es lo que
 * hace PostgREST: recorta y no avisa.
 */
const tabla = (cuantas, techo = 1000) => {
  const filas = Array.from({ length: cuantas }, (_, i) => ({ id: i + 1 }));
  let llamadas = 0;
  return {
    get llamadas() {
      return llamadas;
    },
    consulta: () => ({
      range: async (desde, hasta) => {
        llamadas++;
        const pedidas = hasta - desde + 1;
        return { data: filas.slice(desde, desde + Math.min(pedidas, techo)), error: null };
      },
    }),
  };
};

console.log("── el caso que rompió el pipeline ──");
{
  // 1053 leads: exactamente lo que tenía la escuela cuando el Gerente y el
  // Jefe de ventas empezaron a no ver algunas fichas.
  const t = tabla(1053);
  const { data, error } = await traerTodo(t.consulta);
  es("vuelven las 1053, no 1000", data.length, 1053);
  es("sin error", error, null);
  es("y sin repetir ninguna", new Set(data.map((r) => r.id)).size, 1053);
  es("en orden", [data[0].id, data[1052].id], [1, 1053]);
}

console.log("\n── los bordes del tamaño de tanda ──");
for (const n of [0, 1, POR_TANDA - 1, POR_TANDA, POR_TANDA + 1, POR_TANDA * 3]) {
  const t = tabla(n);
  const { data } = await traerTodo(t.consulta);
  es(`${n} filas vuelven ${n}`, data.length, n);
}

console.log("\n── no pide de más ──");
{
  // Una tanda incompleta es la última: no hay por qué preguntar otra vez.
  const t = tabla(10);
  await traerTodo(t.consulta);
  es("con diez filas alcanza una sola llamada", t.llamadas, 1);

  const exacto = tabla(POR_TANDA);
  await traerTodo(exacto.consulta);
  // Con una tanda justa hay que preguntar una vez más: desde adentro no se
  // puede saber si eran justas o si había más.
  es("con una tanda justa pregunta una vez más", exacto.llamadas, 2);
}

console.log("\n── un error corta y se dice ──");
{
  const rota = {
    range: async () => ({ data: null, error: { message: "se cayó la conexión" } }),
  };
  const { data, error } = await traerTodo(() => rota);
  es("no devuelve media tabla", data.length, 0);
  es("y explica por qué", error, "se cayó la conexión");
}

console.log("\n── y si hubiera muchísimas, lo avisa en vez de callarse ──");
{
  // El tope de tandas existe para que un error de paginación no se convierta
  // en una consulta infinita. Si se alcanza, se devuelve lo que hay pero
  // diciéndolo: en silencio sería el mismo problema que esto vino a arreglar.
  const t = tabla(POR_TANDA * 80);
  const { data, error } = await traerTodo(t.consulta);
  es("trae lo que puede", data.length > 0, true);
  es("Y AVISA QUE PUEDE HABER MÁS", /puede haber más/.test(error ?? ""), true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
