/**
 * Los emojis del cuadro de mensaje, con sus nombres en castellano.
 *
 * ============================================================================
 * POR QUÉ HAY UNA LISTA ESCRITA A MANO
 * ============================================================================
 *
 * Porque las tres alternativas son peores para esta escuela:
 *
 *   UNA LIBRERÍA        `emoji-mart` y las de su estilo pesan entre 500 KB y
 *                       1,5 MB de datos, y vienen en inglés: buscar «pastel»
 *                       no encuentra 🎂 porque el dato dice «cake». Habría que
 *                       cargar además el paquete de traducción, que es otro
 *                       tanto, y quedaría igual de raro —«tarta de cumpleaños»
 *                       es de España, acá es «pastel»—.
 *
 *   TODO UNICODE        son más de 3.700 emojis. Una asesora buscando el de la
 *                       carita que guiña no quiere pasar por 40 banderas ni por
 *                       las combinaciones de familias. Una lista larga no es
 *                       más útil: es más difícil de recorrer.
 *
 *   EL DEL SISTEMA      el teclado de emojis del sistema operativo existe, pero
 *                       hay que saber el atajo, en Windows no siempre está y en
 *                       una laptop compartida nadie lo tiene configurado. Que
 *                       el CRM tenga el suyo es lo que hace que se use.
 *
 * Así que va una lista corta, elegida, en el castellano que se habla en El
 * Salvador, y con la comida bien cubierta —que es de lo que trabaja esta
 * escuela y es lo que más se manda—.
 *
 * ============================================================================
 * SOBRE LOS NOMBRES
 * ============================================================================
 *
 * Cada emoji lleva varias palabras, no una. Se busca por lo que la persona
 * tiene en la cabeza, que casi nunca es el nombre oficial: 🙏 es «gracias»
 * y «por favor» mucho antes que «manos juntas», y 🔥 es «genial» tanto como
 * «fuego». Las palabras de más son las que hacen que el buscador sirva.
 */

/** Un emoji con lo que hay que escribir para encontrarlo. */
export interface Emoji {
  /** El carácter, tal cual se inserta en el mensaje. */
  e: string;
  /** Lo que se escribe para hallarlo. Varias palabras, separadas por espacio. */
  nombre: string;
}

export interface Grupo {
  titulo: string;
  /** El emoji que representa al grupo en la fila de pestañas. */
  icono: string;
  emojis: Emoji[];
}

const g = (titulo: string, icono: string, filas: readonly (readonly [string, string])[]): Grupo => ({
  titulo,
  icono,
  emojis: filas.map(([e, nombre]) => ({ e, nombre })),
});

export const GRUPOS: Grupo[] = [
  g("Caritas", "😀", [
    ["😀", "sonrisa feliz contento"],
    ["😃", "sonrisa alegre feliz"],
    ["😄", "risa feliz alegre"],
    ["😁", "sonrisa dientes contento"],
    ["😆", "risa carcajada"],
    ["😅", "risa nervioso sudor"],
    ["🤣", "carcajada risa piso"],
    ["😂", "risa llanto lagrimas gracioso"],
    ["🙂", "sonrisa leve amable"],
    ["🙃", "al reves ironia"],
    ["😉", "guino coqueto"],
    ["😊", "sonrisa timida contenta"],
    ["😇", "angel santo inocente"],
    ["🥰", "enamorada corazones carino"],
    ["😍", "enamorado ojos corazon"],
    ["🤩", "estrellas asombro increible"],
    ["😘", "beso volado"],
    ["😗", "beso"],
    ["😚", "beso carino"],
    ["😋", "rico delicioso sabroso lengua"],
    ["😛", "lengua burla"],
    ["😜", "lengua guino juguetona"],
    ["🤪", "loca chistosa"],
    ["🤗", "abrazo abrazando"],
    ["🤭", "ups pena tapando boca"],
    ["🤫", "silencio callado secreto"],
    ["🤔", "pensando duda pienso"],
    ["🤐", "boca cerrada callado"],
    ["😐", "seria neutral"],
    ["😑", "sin expresion cansada"],
    ["😶", "sin boca callada"],
    ["🙄", "ojos arriba fastidio"],
    ["😏", "picara sonrisa ladeada"],
    ["😒", "fastidio desconfianza"],
    ["😔", "triste desanimada"],
    ["😪", "sueno cansada"],
    ["🤤", "antojo baba delicioso"],
    ["😴", "durmiendo sueno"],
    ["😷", "mascarilla enferma"],
    ["🤒", "enfermo fiebre termometro"],
    ["🤕", "golpe herido"],
    ["🥳", "fiesta celebracion cumpleanos"],
    ["🥺", "suplica porfa ojitos"],
    ["😢", "triste llanto lagrima"],
    ["😭", "llorando llanto triste"],
    ["😤", "enojo vapor decidida"],
    ["😠", "enojada molesta"],
    ["😡", "furiosa enojada roja"],
    ["🤯", "cabeza explota asombro"],
    ["😳", "sorprendida sonrojada"],
    ["🥵", "calor sofocada"],
    ["🥶", "frio congelada"],
    ["😱", "susto grito miedo"],
    ["😨", "miedo asustada"],
    ["😰", "angustia nervios"],
    ["😥", "alivio triste"],
    ["😓", "sudor cansada"],
    ["🤝", "trato acuerdo manos"],
    ["😎", "lentes cool genial"],
    ["🤓", "nerd estudiosa lentes"],
    ["🧐", "monoculo revisando"],
    ["😬", "incomoda mueca"],
    ["🤨", "ceja duda sospecha"],
    ["😮", "sorpresa boca abierta"],
    ["😯", "sorpresa"],
    ["🤑", "dinero plata signo"],
    ["🤠", "vaquero sombrero"],
    ["👻", "fantasma"],
    ["💀", "calavera muerta"],
    ["🤖", "robot"],
  ]),

  g("Gestos", "👍", [
    ["👍", "bien pulgar arriba dale ok"],
    ["👎", "mal pulgar abajo no"],
    ["👌", "ok perfecto bien"],
    ["🙏", "gracias por favor porfa rezo manos"],
    ["👏", "aplausos felicidades bravo"],
    ["🙌", "manos arriba celebracion gloria"],
    ["✌️", "paz victoria dos"],
    ["🤞", "dedos cruzados suerte"],
    ["🤙", "llamame hang loose"],
    ["👋", "hola saludo adios chao"],
    ["✋", "alto mano"],
    ["🤚", "mano levantada"],
    ["👊", "punio choque"],
    ["✊", "punio fuerza"],
    ["💪", "fuerza musculo animo"],
    ["👉", "dedo derecha mira"],
    ["👈", "dedo izquierda"],
    ["👆", "dedo arriba"],
    ["👇", "dedo abajo aqui"],
    ["☝️", "dedo indice atencion"],
    ["✍️", "escribiendo anotando"],
    ["🤲", "manos abiertas"],
    ["💅", "unias arreglada"],
    ["👀", "ojos mirando atencion"],
    ["🧑‍🍳", "chef cocinero cocinera"],
    ["👨‍🍳", "chef cocinero"],
    ["👩‍🍳", "chef cocinera"],
    ["🙋", "levanta la mano pregunta"],
    ["🤷", "no se encogimiento hombros"],
    ["💁", "informacion aqui estoy"],
    ["🚶", "caminando"],
    ["🏃", "corriendo apurada"],
  ]),

  g("Corazones", "❤️", [
    ["❤️", "corazon rojo amor"],
    ["🧡", "corazon naranja"],
    ["💛", "corazon amarillo"],
    ["💚", "corazon verde"],
    ["💙", "corazon azul"],
    ["💜", "corazon morado"],
    ["🖤", "corazon negro"],
    ["🤍", "corazon blanco"],
    ["🤎", "corazon cafe"],
    ["💕", "dos corazones carino"],
    ["💖", "corazon brillante"],
    ["💗", "corazon creciendo"],
    ["💘", "corazon flecha"],
    ["💝", "corazon regalo"],
    ["💞", "corazones girando"],
    ["💓", "corazon latiendo"],
    ["💔", "corazon roto"],
    ["❣️", "corazon exclamacion"],
    ["💯", "cien perfecto"],
    ["✨", "brillos chispas lindo"],
    ["⭐", "estrella"],
    ["🌟", "estrella brillante"],
    ["🔥", "fuego genial candela"],
    ["💥", "explosion"],
    ["💫", "mareo estrellas"],
    ["🎉", "fiesta celebracion felicidades"],
    ["🎊", "confeti fiesta"],
    ["🎈", "globo fiesta"],
    ["🎁", "regalo"],
    ["🏆", "trofeo ganador premio"],
    ["🥇", "medalla oro primero"],
    ["👑", "corona reina"],
  ]),

  g("Comida", "🍰", [
    ["🍽️", "plato cubiertos comida"],
    ["🍴", "cubiertos tenedor cuchillo"],
    ["🥄", "cuchara"],
    ["🔪", "cuchillo chef"],
    ["🍳", "sarten huevo cocinar"],
    ["🥘", "paella cazuela guiso"],
    ["🍲", "sopa olla caldo"],
    ["🥣", "tazon cereal"],
    ["🥗", "ensalada verde"],
    ["🍕", "pizza"],
    ["🍔", "hamburguesa"],
    ["🌮", "taco"],
    ["🌯", "burrito"],
    ["🫓", "pupusa tortilla pan plano"],
    ["🥙", "pita relleno"],
    ["🥪", "sandwich"],
    ["🌭", "hot dog"],
    ["🍟", "papas fritas"],
    ["🍗", "pollo pierna"],
    ["🍖", "carne"],
    ["🥩", "carne corte steak"],
    ["🥓", "tocino"],
    ["🍤", "camaron marisco"],
    ["🐟", "pescado"],
    ["🍣", "sushi"],
    ["🍜", "ramen fideos sopa"],
    ["🍝", "pasta espagueti"],
    ["🍚", "arroz"],
    ["🥟", "empanada dumpling"],
    ["🫔", "tamal"],
    ["🥐", "croissant panaderia"],
    ["🥖", "baguette pan"],
    ["🍞", "pan molde"],
    ["🥯", "bagel"],
    ["🥨", "pretzel"],
    ["🧀", "queso"],
    ["🥚", "huevo"],
    ["🧈", "mantequilla"],
    ["🧂", "sal"],
    ["🍯", "miel"],
    ["🥞", "panqueques hot cakes"],
    ["🧇", "waffle"],
    ["🎂", "pastel cumpleanos torta"],
    ["🍰", "rebanada pastel torta"],
    ["🧁", "cupcake ponque"],
    ["🥧", "pay tarta"],
    ["🥮", "postre luna"],
    ["🍪", "galleta"],
    ["🍩", "dona"],
    ["🍫", "chocolate"],
    ["🍬", "dulce caramelo"],
    ["🍮", "flan quesillo postre"],
    ["🍦", "helado barquillo"],
    ["🍨", "helado copa"],
    ["☕", "cafe caliente"],
    ["🍵", "te infusion"],
    ["🧉", "mate"],
    ["🥤", "refresco bebida vaso"],
    ["🧃", "jugo caja"],
    ["🥛", "leche vaso"],
    ["🍷", "vino copa"],
    ["🍾", "champana brindis botella"],
    ["🥂", "brindis copas celebracion"],
    ["🍸", "coctel martini"],
    ["🍹", "coctel tropical"],
    ["🍺", "cerveza"],
    ["🍻", "cervezas brindis"],
    ["🥃", "whisky ron"],
    ["🍎", "manzana"],
    ["🍌", "banano guineo"],
    ["🍓", "fresa"],
    ["🍇", "uvas"],
    ["🍊", "naranja"],
    ["🍋", "limon"],
    ["🍉", "sandia"],
    ["🍍", "pina"],
    ["🥭", "mango"],
    ["🥑", "aguacate"],
    ["🍅", "tomate"],
    ["🥕", "zanahoria"],
    ["🌽", "maiz elote"],
    ["🥔", "papa"],
    ["🧄", "ajo"],
    ["🧅", "cebolla"],
    ["🌶️", "chile picante"],
    ["🥦", "brocoli"],
    ["🥬", "lechuga verdura"],
    ["🍄", "hongo champinion"],
    ["🌿", "hierba albahaca"],
    ["🥜", "mani cacahuate"],
  ]),

  g("Trabajo", "📅", [
    ["📅", "calendario fecha"],
    ["📆", "calendario dia"],
    ["⏰", "alarma hora reloj"],
    ["⏳", "tiempo reloj arena"],
    ["📞", "telefono llamada"],
    ["📲", "celular llamame"],
    ["💬", "mensaje chat"],
    ["📩", "correo mensaje"],
    ["📧", "correo email"],
    ["📎", "clip adjunto"],
    ["📄", "documento hoja"],
    ["📋", "portapapeles lista"],
    ["📌", "pin fijar"],
    ["✅", "listo hecho check"],
    ["☑️", "marcado"],
    ["❌", "no error equis"],
    ["⚠️", "atencion cuidado"],
    ["❗", "importante exclamacion"],
    ["❓", "pregunta duda"],
    ["💡", "idea"],
    ["🔗", "enlace link"],
    ["📍", "ubicacion lugar direccion"],
    ["🏫", "escuela academia"],
    ["🎓", "graduacion diploma titulo"],
    ["📚", "libros estudio"],
    ["📝", "nota apuntes"],
    ["💳", "tarjeta pago"],
    ["💵", "dinero efectivo pago"],
    ["🧾", "recibo factura comprobante"],
    ["🏦", "banco deposito"],
    ["🚗", "carro transporte"],
    ["✈️", "avion viaje"],
  ]),
];

/** Sin tildes y en minúsculas, para que «cafe» encuentre «café». */
const plano = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "n")
    .toLowerCase();

/** Todos, de un tirón, en el orden de los grupos. */
export const TODOS: Emoji[] = GRUPOS.flatMap((x) => x.emojis);

/**
 * Los que coinciden con lo escrito.
 *
 * Coincide por prefijo de palabra y no por trozo suelto en cualquier lado:
 * buscando «pan» se quiere 🍞 y 🥞, no todo lo que lleve esas tres letras
 * adentro. Los que empiezan igual van primero, que es donde la vista busca.
 */
export function buscar(texto: string): Emoji[] {
  const q = plano(texto.trim());
  if (!q) return [];

  const empiezan: Emoji[] = [];
  const contienen: Emoji[] = [];

  for (const em of TODOS) {
    const palabras = plano(em.nombre).split(" ");
    if (palabras[0].startsWith(q)) empiezan.push(em);
    else if (palabras.some((p) => p.startsWith(q))) contienen.push(em);
  }

  return [...empiezan, ...contienen];
}
