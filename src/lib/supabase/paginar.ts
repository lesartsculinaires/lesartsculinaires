import "server-only";

/**
 * Traer una tabla entera, y no las primeras mil.
 *
 * ------------------------------------------------------------------------
 * EL TECHO QUE NO SE VE
 * ------------------------------------------------------------------------
 *
 * PostgREST —lo que Supabase pone delante de la base— tiene un tope de filas
 * por respuesta. En Supabase viene en MIL y no se declara en ningún lado del
 * código: no hay un `.limit(1000)` que buscar.
 *
 * Lo que hace no es fallar. Devuelve las primeras mil, sin error, sin aviso y
 * sin ninguna marca de que faltan las demás. La aplicación las recibe como si
 * fueran todas.
 *
 * Y pedir más no alcanza: `.limit(20000)` no lo levanta, porque el tope se
 * aplica igual sobre lo que se devuelve. La única forma de pasarlo es pedir de
 * a tandas con `range`, que es lo que hace esto.
 *
 * ------------------------------------------------------------------------
 * CÓMO SE NOTÓ
 * ------------------------------------------------------------------------
 *
 * Con 1053 leads en la base, la escuela reportó que a veces el Gerente y el
 * Jefe de ventas no veían el pipeline de Ventas.
 *
 * El motivo es que el tope pega distinto según quién mira, y por eso parecía
 * intermitente. A una asesora la base le devuelve sólo los suyos —537— y
 * entran holgados en las mil. A quien ve todo el equipo le devuelve los 1053,
 * así que se cortan 53, y como vienen ordenados por fecha los que se caen son
 * siempre los más viejos. Nadie ve un error: ve un tablero al que le faltan
 * fichas.
 *
 * Es un problema que empeora solo. Con mil leads se pierden algunos; con dos
 * mil, la mitad.
 *
 * ------------------------------------------------------------------------
 * EL ORDEN IMPORTA, Y TIENE QUE SER TOTAL
 * ------------------------------------------------------------------------
 *
 * Cada tanda es una consulta nueva. Si dos filas empatan en el criterio de
 * orden, Postgres puede devolverlas en distinto orden en cada una: una fila
 * aparecería dos veces y otra ninguna. Por eso quien llame a esto tiene que
 * ordenar por algo que no empate nunca —el `id` al final alcanza—, igual que
 * hace `fetchOportunidades`.
 */

/** El tope de Supabase. Las tandas van más chicas, para no rozarlo. */
export const POR_TANDA = 900;

/**
 * Cuántas tandas como mucho.
 *
 * Un tope existe para que un error de paginación no se convierta en una
 * consulta infinita contra Supabase. Novecientas por cincuenta son 45 000
 * filas, muy por encima de lo que este CRM va a tener en años; si algún día se
 * llega, lo que corresponde no es subir este número sino dejar de traer la
 * tabla entera al navegador.
 */
const TANDAS_MAXIMAS = 50;

/** Una consulta a la que todavía se le puede pedir un tramo. */
interface Consultable<T> {
  range(
    desde: number,
    hasta: number,
  ): PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>;
}

type Tanda<T> = { data: T[] | null; error: unknown; count?: number | null };

/**
 * Pide de a tandas hasta que la base deja de devolver filas.
 *
 * `armar` se llama una vez por tanda porque una consulta de supabase-js no se
 * puede reusar: se consume al esperarla.
 *
 * Un error corta y se devuelve, en vez de quedarse con lo que alcanzó a
 * traer. Media tabla sin decirlo es exactamente el problema que esto vino a
 * arreglar.
 *
 * ------------------------------------------------------------------------
 * LAS TANDAS VAN A LA VEZ, NO UNA DETRÁS DE OTRA
 * ------------------------------------------------------------------------
 *
 * Antes cada tanda esperaba a la anterior para saber si hacía falta. Con 2592
 * leads son tres tandas del embudo y tres del último toque, y la portada
 * encadenaba nueve viajes a la base antes de poder terminar. Con la base
 * cargada —el 10 de octubre de 2026 a las 10:35 cada consulta tardaba entre
 * tres y siete segundos— eso son más de sesenta, que es donde Netlify corta la
 * respuesta. Y una respuesta cortada a la mitad es la pantalla blanca de
 * «Application error» en todas las computadoras que estaban refrescando.
 *
 * Ahora `armar(true)` pide la primera tanda CON EL TOTAL de filas, y con eso
 * se sabe de una cuántas tandas faltan: van todas juntas. Dos viajes, tenga la
 * tabla las filas que tenga.
 *
 * Quien no pide el total —`armar` ignora el argumento— sigue andando como
 * antes, de a una. Y si entre el conteo y las tandas entraron filas nuevas, la
 * última llega llena y se sigue pidiendo de a una desde ahí: el total es una
 * forma de ir más rápido, no un límite.
 */
export async function traerTodo<T>(
  armar: (conTotal: boolean) => Consultable<T>,
): Promise<{ data: T[]; error: string | null }> {
  const todo: T[] = [];
  const tramo = (tanda: number, conTotal = false) =>
    armar(conTotal).range(tanda * POR_TANDA, tanda * POR_TANDA + POR_TANDA - 1);

  const primera = await tramo(0, true);
  if (primera.error) return { data: [], error: mensajeDe(primera.error) };
  todo.push(...(primera.data ?? []));
  if ((primera.data ?? []).length < POR_TANDA) return { data: todo, error: null };

  let siguiente = 1;

  const total = primera.count;
  if (typeof total === "number" && total > POR_TANDA) {
    const cuantas = Math.min(Math.ceil(total / POR_TANDA), TANDAS_MAXIMAS);
    const resto: Promise<Tanda<T>>[] = [];
    for (let tanda = 1; tanda < cuantas; tanda += 1) resto.push(Promise.resolve(tramo(tanda)));

    const llegaron = await Promise.all(resto);
    for (const t of llegaron) {
      if (t.error) return { data: [], error: mensajeDe(t.error) };
      todo.push(...(t.data ?? []));
    }
    siguiente = cuantas;

    const ultima = llegaron[llegaron.length - 1];
    if (!ultima || (ultima.data ?? []).length < POR_TANDA) return { data: todo, error: null };
  }

  for (let tanda = siguiente; tanda < TANDAS_MAXIMAS; tanda += 1) {
    const { data, error } = await tramo(tanda);
    if (error) return { data: [], error: mensajeDe(error) };

    const filas = data ?? [];
    todo.push(...filas);

    // Una tanda incompleta es la última: no hay más para pedir.
    if (filas.length < POR_TANDA) return { data: todo, error: null };
  }

  // Se llegó al tope de tandas. Se devuelve lo que hay, pero diciéndolo: en
  // silencio sería el mismo problema de arriba con otro número.
  return {
    data: todo,
    error: `Se trajeron ${todo.length} filas y puede haber más. Avisá que hay que paginar distinto.`,
  };
}

function mensajeDe(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message)
    : "No se pudieron traer los datos.";
}
