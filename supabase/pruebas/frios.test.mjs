/**
 * Cuándo un lead está frío.
 *
 *     npx esbuild src/lib/frios.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/fr.mjs
 *     node supabase/pruebas/frios.test.mjs /tmp/fr.mjs
 *
 * ============================================================================
 * POR QUÉ ESTO SE PRUEBA APARTE DE LA PANTALLA
 * ============================================================================
 *
 * Porque la pantalla se ve bien esté la regla bien o mal. Una lista de leads
 * ordenada por días es exactamente igual de creíble si el corte está en quince
 * días que si está en catorce o en dieciséis, y si contara como «tocado» algo
 * que no lo es —un envío masivo, un mensaje del cliente— la lista se vería
 * más corta y más tranquilizadora, que es la peor manera de estar equivocado.
 *
 * Acá se comprueban los bordes con fechas fabricadas, que es lo único que no
 * se puede hacer mirando.
 */
const { friosDe, diasSinTocar, comoSeLeeLaEspera, DIAS_PARA_ENFRIARSE } =
  await import(process.argv[2] ?? "/tmp/fr.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const AHORA = Date.parse("2026-09-04T15:00:00Z");
const haceDias = (n) => new Date(AHORA - n * 86_400_000).toISOString();

/** Un lead vivo, tocado hace `dias` días. */
const lead = (dias, extra = {}) => ({
  id: 1,
  codigo: "CRM-0001",
  cliente: "Quien Sea",
  estado: "Activo",
  etapa: "Prospectos",
  vendedorId: 4,
  vendedor: "Katya",
  valor: 400,
  fechaRegistro: "2026-01-01",
  ultimoToque: dias == null ? null : haceDias(dias),
  ...extra,
});

console.log("── EL CORTE ESTÁ EN QUINCE DÍAS ──");
{
  es("son quince, no otro número", DIAS_PARA_ENFRIARSE, 15);

  // Los tres bordes, que es donde se equivoca un `>` que debía ser `>=`.
  es("catorce días NO está frío", friosDe([lead(14)], AHORA).length, 0);
  es("QUINCE SÍ", friosDe([lead(15)], AHORA).length, 1);
  es("dieciséis también", friosDe([lead(16)], AHORA).length, 1);
  es("tocado hoy, no", friosDe([lead(0)], AHORA).length, 0);
}

console.log("\n── LOS CERRADOS NO SE ENFRÍAN: TERMINARON ──");
{
  /*
   * Sin esto, la lista se llenaría de ventas ganadas hace meses y de perdidas
   * que ya se decidieron, y ahí adentro se perderían los que sí hay que
   * llamar. Es la mitad del valor de la pantalla.
   */
  es("un ganado no está frío", friosDe([lead(90, { estado: "Ganado" })], AHORA).length, 0);
  es("un perdido tampoco", friosDe([lead(90, { estado: "Perdido" })], AHORA).length, 0);
  es("pero uno en pausa sí", friosDe([lead(90, { estado: "En pausa/inactivo" })], AHORA).length, 1);
  es("y uno con reserva también", friosDe([lead(90, { estado: "Reserva" })], AHORA).length, 1);
}

console.log("\n── SIN FECHA NO SE AFIRMA NADA ──");
{
  /*
   * Un lead sin `ultimoToque` es un lead del que no se sabe, y no se sabe NO
   * es lo mismo que «hace mucho». Meterlo en la lista sería inventar que nadie
   * lo tocó, y la pantalla se usa justamente para creerle.
   *
   * Pasa sólo con la vista sin correr, y ahí la pantalla lo dice con todas las
   * letras en vez de mostrarse vacía.
   */
  es("no cuenta como frío", friosDe([lead(null)], AHORA).length, 0);
  es("y días sin tocar es nulo, no cero", diasSinTocar(null, AHORA), null);
  es("una fecha ilegible tampoco inventa", diasSinTocar("cuando sea", AHORA), null);
}

console.log("\n── LOS MÁS FRÍOS VAN ARRIBA ──");
{
  /*
   * La lista se lee de arriba hacia abajo y se abandona a la mitad, así que
   * el orden no es estético: es qué se ve y qué no.
   */
  const lista = friosDe(
    [
      lead(20, { id: 1, codigo: "CRM-0020" }),
      lead(90, { id: 2, codigo: "CRM-0090" }),
      lead(40, { id: 3, codigo: "CRM-0040" }),
    ],
    AHORA,
  );
  es("primero el de noventa", lista[0].oportunidad.codigo, "CRM-0090");
  es("después el de cuarenta", lista[1].oportunidad.codigo, "CRM-0040");
  es("y último el de veinte", lista[2].oportunidad.codigo, "CRM-0020");
}

console.log("\n── frío y helado se distinguen ──");
{
  // A los cuarenta y cinco días deja de ser un seguimiento y pasa a ser otra
  // conversación. La pantalla los pinta distinto para poder saltearlos.
  es("veinte días es frío", friosDe([lead(20)], AHORA)[0].temperatura, "frio");
  es("cuarenta y cuatro todavía", friosDe([lead(44)], AHORA)[0].temperatura, "frio");
  es("CUARENTA Y CINCO YA ES HELADO", friosDe([lead(45)], AHORA)[0].temperatura, "helado");
}

console.log("\n── los días se cuentan por calendario ──");
{
  /*
   * Igual que en los recordatorios de la reserva: para quien mira la lista,
   * «ayer» es ayer aunque hayan pasado treinta horas. Contando por bloques de
   * veinticuatro, un lead tocado a las once de la noche y otro a las siete de
   * la mañana del mismo día darían números distintos.
   */
  es("mismo día, cero", diasSinTocar("2026-09-04T02:00:00Z", AHORA), 0);
  es("el día anterior, uno", diasSinTocar("2026-09-03T23:00:00Z", AHORA), 1);

  // Una fecha futura —reloj torcido, dato cargado a mano— no puede dar
  // negativo: ordenaría la lista al revés y pondría lo que no urge arriba.
  es("una fecha futura no da negativo", diasSinTocar("2026-12-01T00:00:00Z", AHORA), 0);
}

console.log("\n── cómo se lee la espera ──");
{
  es("un día", comoSeLeeLaEspera(1), "1 día");
  es("varios", comoSeLeeLaEspera(17), "17 días");
  // Pasado mes y medio, «73 días» no dice nada que «2 meses» no diga mejor.
  es("MESES CUANDO YA SON MUCHOS", comoSeLeeLaEspera(73), "2 meses");
  es("y uno solo en singular", comoSeLeeLaEspera(48), "2 meses");
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
