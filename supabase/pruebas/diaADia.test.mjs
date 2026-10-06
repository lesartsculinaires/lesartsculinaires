import { compilar } from "./compilar.mjs";
/**
 * El mes día por día, abierto por canal y por programa.
 *
 *     node --test supabase/pruebas/diaADia.test.mjs
 *
 * ============================================================================
 * LO QUE SE VIGILA ACÁ NO ES QUE SUME BIEN
 * ============================================================================
 *
 * Que sume bien se ve mirando la pantalla. Lo que no se ve mirando —y es lo que
 * rompe un gráfico por día— es otra cosa:
 *
 *   QUE EL COLOR SE MUEVA    El orden de las series fija el color de cada canal.
 *                            Si saliera del mes elegido, WhatsApp sería el
 *                            primero en octubre y el segundo en noviembre, y al
 *                            cambiar de mes se correrían TODOS los colores: la
 *                            pantalla se leería como si hubiera cambiado la
 *                            composición cuando sólo cambió el ranking.
 *
 *   QUE SE SALTEN LOS DÍAS   Un día sin leads tiene que ocupar su lugar igual.
 *                            Saltárselo corre el calendario y el día 20 queda
 *                            dibujado donde va el 17.
 *
 *   QUE SE PIERDA GENTE      Lo que cae fuera del tope de series se junta en
 *                            «Otros», pero sigue contando. Un lead que no está
 *                            en ninguna barra es un lead que la escuela no ve.
 */
const { diaADia, TOPE_DE_SERIES, SIN_CANAL, SIN_PROGRAMA, OTROS } =
  await compilar("src/lib/diaADia.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Un lead de mentira, con lo poco que mira este módulo. */
let n = 0;
const lead = (fechaRegistro, canal, producto) => ({
  id: (n += 1),
  fechaRegistro,
  canal,
  producto,
});

/** Cuánto tiene ese día en esa serie. */
const deDia = (mes, dia, campo, etiqueta) =>
  mes.dias.find((d) => d.dia === dia)?.[campo].find((s) => s.etiqueta === etiqueta)?.leads;

console.log("── el reparto de un día ──");
{
  const mes = diaADia(
    [
      lead("2026-10-04", "WhatsApp", "Pastelería"),
      lead("2026-10-04", "WhatsApp", "Pastelería"),
      lead("2026-10-04", "Instagram", "Cocina Internacional"),
      lead("2026-10-02", "WhatsApp", "Cocina Internacional"),
    ],
    "2026-10",
  );

  es("el día 4 tiene tres", mes.dias.find((d) => d.dia === 4)?.leads, 3);
  es("dos por WhatsApp", deDia(mes, 4, "canales", "WhatsApp"), 2);
  es("uno por Instagram", deDia(mes, 4, "canales", "Instagram"), 1);
  es("dos en Pastelería", deDia(mes, 4, "programas", "Pastelería"), 2);
  es("y el mes entero son cuatro", mes.totalLeads, 4);
}

console.log("\n── octubre tiene 31 casillas, y los días vacíos ocupan la suya ──");
{
  const mes = diaADia([lead("2026-10-20", "WhatsApp", "Pastelería")], "2026-10");
  es("treinta y un días", mes.dias.length, 31);
  es("el primero es el 1", mes.dias[0].dia, 1);
  es("el último es el 31", mes.dias[30].dia, 31);
  /*
   * Si los días vacíos se saltaran, el 20 quedaría dibujado en la primera
   * casilla y el gráfico mentiría sobre cuándo entró ese lead.
   */
  es("EL ÚNICO LEAD CAE EN LA CASILLA 20", mes.dias[19].leads, 1);
  es("y el 19 queda en cero, ocupando su lugar", mes.dias[18].leads, 0);
  es("con su fecha, para poder rotularlo", mes.dias[19].fecha, "2026-10-20");
}

console.log("\n── febrero de un año bisiesto tiene 29 ──");
{
  es("29 en 2028", diaADia([], "2028-02").dias.length, 29);
  es("28 en 2026", diaADia([], "2026-02").dias.length, 28);
}

console.log("\n── EL COLOR NO SE MUEVE AL CAMBIAR DE MES ──");
{
  /*
   * En octubre manda WhatsApp; en noviembre, Instagram. Si el orden saliera del
   * mes, las dos series se intercambiarían el color de un mes al otro.
   */
  const todas = [
    lead("2026-10-01", "WhatsApp", "Pastelería"),
    lead("2026-10-02", "WhatsApp", "Pastelería"),
    lead("2026-10-03", "WhatsApp", "Pastelería"),
    lead("2026-11-01", "Instagram", "Barismo"),
    lead("2026-11-02", "Instagram", "Barismo"),
  ];

  const octubre = diaADia(todas, "2026-10");
  const noviembre = diaADia(todas, "2026-11");

  es("el orden es el mismo en los dos meses", octubre.seriesCanales, noviembre.seriesCanales);
  es("y manda el del histórico, no el del mes", octubre.seriesCanales[0], "WhatsApp");
  es("también en programas", octubre.seriesProgramas, noviembre.seriesProgramas);
}

console.log("\n── lo que no tiene nombre se cuenta, no se esconde ──");
{
  /*
   * El tercero llega con «—», que es el guion con el que la aplicación entera
   * dibuja un campo vacío. Sin tratarlo como vacío, la leyenda mostraba una
   * serie llamada «—» que parecía un programa del catálogo —se vio en pantalla—.
   */
  const mes = diaADia(
    [
      lead("2026-10-05", "", null),
      lead("2026-10-05", "   ", "Pastelería"),
      lead("2026-10-05", "—", "—"),
    ],
    "2026-10",
  );
  es("los tres sin canal", deDia(mes, 5, "canales", SIN_CANAL), 3);
  es("dos sin programa", deDia(mes, 5, "programas", SIN_PROGRAMA), 2);
  es("Y «—» NO ES UNA SERIE", mes.seriesProgramas.includes("—"), false);
  es("y el día los cuenta a los tres", mes.dias[4].leads, 3);
  /*
   * Los cajones de sastre van al final: arriba del todo parecerían una
   * categoría más de la escuela.
   */
  es("«Sin canal» va al final de la lista", mes.seriesCanales.at(-1), SIN_CANAL);
}

console.log("\n── pasado el tope, el resto se junta en «Otros» y NO se pierde ──");
{
  const muchos = [];
  // Siete canales distintos, con pesos decrecientes: 7, 6, 5, 4, 3, 2, 1.
  const nombres = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"];
  nombres.forEach((c, i) => {
    for (let k = 0; k < nombres.length - i; k += 1) {
      muchos.push(lead("2026-10-10", c, "Pastelería"));
    }
  });

  const mes = diaADia(muchos, "2026-10");
  es("se dibujan seis y «Otros»", mes.seriesCanales.length, TOPE_DE_SERIES + 1);
  es("el séptimo no tiene barra propia", mes.seriesCanales.includes("C7"), false);
  es("cayó en «Otros»", deDia(mes, 10, "canales", OTROS), 1);
  /*
   * La comprobación que de verdad importa: la suma de las barras tiene que dar
   * el total del día. Si «Otros» se perdiera, acá se vería.
   */
  const suma = mes.dias[9].canales.reduce((a, s) => a + s.leads, 0);
  es("Y LA SUMA DE LAS BARRAS ES EL TOTAL DEL DÍA", suma, mes.dias[9].leads);
  es("que son los 28 leads", suma, 28);
}

console.log("\n── los de otro mes no entran ──");
{
  const mes = diaADia(
    [
      lead("2026-09-30", "WhatsApp", "Pastelería"),
      lead("2026-10-01", "WhatsApp", "Pastelería"),
      lead("2026-11-01", "WhatsApp", "Pastelería"),
    ],
    "2026-10",
  );
  es("sólo el de octubre", mes.totalLeads, 1);
  es("en su día", mes.dias[0].leads, 1);
}

console.log("\n── un mes sin nada no rompe la escala ──");
{
  const mes = diaADia([lead("2026-09-01", "WhatsApp", "Pastelería")], "2026-10");
  es("treinta y un días igual", mes.dias.length, 31);
  es("total en cero", mes.totalLeads, 0);
  /*
   * Con tope 0 las alturas serían divisiones por cero: las barras saldrían NaN
   * y desaparecerían en vez de quedar apoyadas en el piso.
   */
  es("Y EL TOPE NUNCA ES CERO", mes.tope, 1);
}

console.log("\n── una clave de mes inservible devuelve vacío, sin lanzar ──");
{
  es("texto cualquiera", diaADia([], "cualquier-cosa").dias.length, 0);
  es("mes 13", diaADia([], "2026-13").dias.length, 0);
  es("mes 0", diaADia([], "2026-00").dias.length, 0);
}

console.log("\n── el total del mes es la otra mitad de lo que se pidió ──");
{
  const mes = diaADia(
    [
      lead("2026-10-01", "WhatsApp", "Pastelería"),
      lead("2026-10-15", "WhatsApp", "Barismo"),
      lead("2026-10-31", "Instagram", "Pastelería"),
    ],
    "2026-10",
  );
  es("tres en el mes", mes.totalLeads, 3);
  es("dos por WhatsApp", mes.totalCanales.find((s) => s.etiqueta === "WhatsApp")?.leads, 2);
  es("dos en Pastelería", mes.totalProgramas.find((s) => s.etiqueta === "Pastelería")?.leads, 2);
  const sumaMes = mes.totalCanales.reduce((a, s) => a + s.leads, 0);
  es("y el total por canal cuadra con el total del mes", sumaMes, mes.totalLeads);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
