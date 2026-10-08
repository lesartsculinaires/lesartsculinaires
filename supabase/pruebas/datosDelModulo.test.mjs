import { compilar } from "./compilar.mjs";
/**
 * Qué datos necesita cada pantalla.
 *
 *     node supabase/pruebas/datosDelModulo.test.mjs
 *
 * ============================================================================
 * LAS VEINTICINCO CONSULTAS QUE SE PAGABAN SIEMPRE
 * ============================================================================
 *
 * La portada cargaba todo antes de pintar nada: el embudo entero, la bandeja
 * con sus mensajes, los envíos con sus destinatarios, los formularios con sus
 * preguntas y sus respuestas, las plantillas, las bases, las etiquetas. Las
 * mirara o no la pantalla que se iba a ver.
 *
 * Y no una vez al entrar: en cada vuelta del refresco, con cada aviso del
 * websocket y al final de CADA acción del servidor, porque todas terminan en
 * `revalidatePath("/")` y vuelven a armar la portada entera. Medido el 8 de
 * octubre de 2026: 14.000 peticiones en una hora con cuatro personas; a las
 * 14:00 el p95 era de 489 ms y a las 18:00, con las mismas 14.000, de 4.365.
 *
 * ============================================================================
 * LO QUE ESTA PRUEBA CUIDA, QUE NO ES LA LISTA
 * ============================================================================
 *
 * La lista la lee cualquiera. Lo que se puede romper sin que se note son las
 * tres de abajo:
 *
 *   LA FICHA SE ABRE ENCIMA DE TODO  y dibuja las etiquetas del lead. Si no se
 *                                    suman al abrirla desde el Pipeline, el
 *                                    lead aparece sin ninguna etiqueta —que se
 *                                    lee como que no tiene—.
 *
 *   EL ORDEN TIENE QUE SER ESTABLE   porque el navegador compara la lista como
 *                                    texto para saber si tiene que pedir algo.
 *                                    Dos listas con lo mismo en distinto orden
 *                                    se leen como distintas, y entonces se
 *                                    pide de nuevo en cada dibujado, siempre.
 *
 *   UNA PANTALLA QUE NO ESTÁ         no pide nada. Es lo que hace que agregar
 *                                    una pantalla no cargue la bandeja de
 *                                    regalo.
 */
const { queSeNecesita, queFalta, esConjunto, CONJUNTOS } = await compilar(
  "src/lib/datosDelModulo.ts",
);

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

console.log("── cada pantalla pide lo suyo ──");
{
  es("la bandeja pide sus tres", queSeNecesita("Inbox"), [
    "bandeja",
    "etiquetas",
    "plantillas",
  ]);
  es("Envíos pide sólo los envíos", queSeNecesita("Envíos"), ["envios"]);
  es("Formularios, sólo los formularios", queSeNecesita("Formularios"), ["formularios"]);
  es("Bases, sólo las bases", queSeNecesita("Bases"), ["bases"]);
  es("el embudo filtra por tanda", queSeNecesita("Pipeline"), ["bases"]);
}

console.log("\n── Y LAS QUE NO PIDEN NADA, QUE SON LA MITAD ──");
{
  /*
   * Acá está el ahorro. El Dashboard no necesita la bandeja; el Calendario no
   * necesita los envíos. Antes los cargaban igual.
   */
  for (const m of [
    "Dashboard",
    "Calendario",
    "Equipos",
    "Programas",
    "Fríos",
    "Recordatorios",
    "Notificaciones",
    "Autorizaciones",
    "Canales",
    "Usuarios y Roles",
  ]) {
    es(`${m} no pide nada aparte`, queSeNecesita(m), []);
  }

  // Una pantalla que no conocemos tampoco pide nada. Es lo que hace que
  // agregar una no arrastre la bandeja sin que nadie lo decida.
  es("una pantalla nueva tampoco", queSeNecesita("Algo Que No Existe"), []);
}

console.log("\n── LA FICHA DEL CLIENTE SUMA SUS ETIQUETAS, SE ABRA DONDE SE ABRA ──");
{
  es("desde el Pipeline", queSeNecesita("Pipeline", true), ["bases", "etiquetas"]);
  es("desde Fríos", queSeNecesita("Fríos", true), ["etiquetas"]);
  es("desde el Dashboard", queSeNecesita("Dashboard", true), ["etiquetas"]);

  // Donde ya estaban, no se repiten.
  es("en la bandeja no se duplican", queSeNecesita("Inbox", true), [
    "bandeja",
    "etiquetas",
    "plantillas",
  ]);
  es("ni en Clientes", queSeNecesita("Clientes", true), [
    "bases",
    "etiquetas",
    "plantillas",
  ]);
}

console.log("\n── EL ORDEN ES ESTABLE, O SE PIDE DE NUEVO PARA SIEMPRE ──");
{
  /*
   * El navegador une la lista con comas y la compara con la anterior. Si el
   * mismo contenido pudiera salir en dos órdenes, cada dibujado parecería
   * pedir algo distinto y volvería a consultar, para siempre.
   */
  const a = queSeNecesita("Clientes").join(",");
  const b = queSeNecesita("Clientes").join(",");
  es("dos llamadas dan el mismo texto", a === b, true);

  /*
   * EL CASO QUE DE VERDAD LO PRUEBA.
   *
   * Comparar contra una copia ordenada no sirve cuando las listas escritas a
   * mano YA están en orden: pasa igual sin ordenar nada. Plantillas sí lo
   * distingue, porque la ficha agrega «etiquetas» AL FINAL y ahí queda
   * «plantillas, etiquetas», que no es el orden. Si esto deja de ordenar, el
   * navegador ve dos listas distintas con el mismo contenido y vuelve a pedir
   * en cada dibujado, para siempre.
   */
  es("lo agregado por la ficha se reacomoda", queSeNecesita("Plantillas", true), [
    "etiquetas",
    "plantillas",
  ]);

  // Y la red general, por si mañana alguien escribe una lista desordenada.
  const desordenadas = [];
  for (const p of ["Inbox", "Clientes", "Bases", "Pipeline", "Plantillas", "Formularios", "Envíos"]) {
    for (const ficha of [false, true]) {
      const r = queSeNecesita(p, ficha);
      if (r.join(",") !== [...r].sort().join(",")) desordenadas.push(`${p}${ficha ? "+ficha" : ""}`);
    }
  }
  es("ninguna pantalla devuelve desordenado", desordenadas, []);
}

console.log("\n── lo que falta de verdad ──");
{
  es("sin nada en la mano, falta todo", queFalta(["bandeja", "etiquetas"], []), [
    "bandeja",
    "etiquetas",
  ]);
  es("con una, falta la otra", queFalta(["bandeja", "etiquetas"], ["bandeja"]), [
    "etiquetas",
  ]);
  es("con las dos, no falta nada", queFalta(["bandeja", "etiquetas"], ["etiquetas", "bandeja"]), []);
  /*
   * Tener de más no es un problema: pasa cuando el servidor mandó los de la
   * pantalla anterior y todavía no se cambió. No se tira nada ni se pide nada.
   */
  es("tener de más no hace pedir", queFalta(["bandeja"], ["bandeja", "envios", "bases"]), []);
  es("sin necesitar nada, no falta nada", queFalta([], ["bandeja"]), []);
}

console.log("\n── al servidor le llega una lista del navegador, y no se la cree ──");
{
  for (const c of CONJUNTOS) es(`«${c}» se acepta`, esConjunto(c), true);

  es("un nombre inventado, no", esConjunto("oportunidades"), false);
  es("vacío, no", esConjunto(""), false);
  es("un número, no", esConjunto(7), false);
  es("null, no", esConjunto(null), false);
  es("un objeto, no", esConjunto({ bandeja: true }), false);
  // El clásico: una propiedad heredada no es un conjunto.
  es("«constructor», no", esConjunto("constructor"), false);
  es("«__proto__», no", esConjunto("__proto__"), false);
}

console.log("\n── y todo lo que se pide existe de verdad ──");
{
  /*
   * La red que ata las dos mitades: si alguien agrega una pantalla pidiendo
   * un conjunto mal escrito, el servidor lo descarta en silencio y la
   * pantalla se queda cargando para siempre. Acá se cae la prueba.
   */
  const pantallas = [
    "Dashboard", "Inbox", "Envíos", "Clientes", "Bases", "Pipeline", "Calendario",
    "Equipos", "Programas", "Formularios", "Plantillas", "Recordatorios", "Fríos",
    "Notificaciones", "Autorizaciones", "Usuarios y Roles", "Canales",
  ];
  const malos = [];
  for (const p of pantallas) {
    for (const c of queSeNecesita(p, true)) if (!esConjunto(c)) malos.push(`${p}→${c}`);
  }
  es("ninguna pantalla pide algo que no existe", malos, []);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
