/**
 * Unificar, ¿completa la ficha o sólo evita el duplicado?
 *
 *     npx esbuild src/lib/fusion.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/fus.mjs
 *     node supabase/pruebas/fusion.test.mjs /tmp/fus.mjs
 *
 * ------------------------------------------------------------------------
 * EL EJEMPLO QUE DIO LA ESCUELA
 * ------------------------------------------------------------------------
 *
 *   «si un cliente tiene número de teléfono y nombre, y en otra base de datos
 *    agregan ese mismo cliente y aparece otra información, como el correo, se
 *    agrega, y así se va actualizando la ficha del cliente a modo que esté
 *    bien completa.»
 *
 * ------------------------------------------------------------------------
 * DÓNDE SE ROMPE ESTO, Y CÓMO SE ROMPIÓ
 * ------------------------------------------------------------------------
 *
 * No en la lógica —completar un hueco es fácil— sino en la LISTA de campos.
 * `planificarFusion` recorre una lista escrita a mano, y la tabla `clientes`
 * creció desde que se escribió: edad y responsable primero, país y cumpleaños
 * después. Un campo que existe en la tabla y no está en la lista se pierde en
 * silencio: el lead entra, se une al que estaba, y el dato nuevo no se
 * escribe en ningún lado ni aparece como choque.
 *
 * Por eso la prueba más importante de este archivo no es ninguno de los casos
 * de abajo, sino la última: que la lista tenga TODAS las columnas.
 */
const { planificarFusion, CAMPOS_DE_CLIENTE, COLUMNAS_DE_FUSION, ETIQUETA_CAMPO, listarCampos } =
  await import(process.argv[2] ?? "/tmp/fus.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

console.log("── el ejemplo de la escuela, tal cual ──");
{
  // Ya en el CRM: nombre y teléfono. La otra base trae el correo.
  const plan = planificarFusion(
    { nombre: "Alex Spencer", telefono: "7797-2598", correo: null },
    { nombre: "Alex Spencer", telefono: "7797-2598", correo: "alex@correo.com" },
  );
  es("el correo se agrega", plan.parche.correo, "alex@correo.com");
  es("y sólo el correo", Object.keys(plan.parche), ["correo"]);
  es("sin choques", plan.choques, []);
  es("y se puede contar qué se completó", listarCampos(plan.completados), "Correo");
}

console.log("\n── la base de cumpleaños sobre una ficha vieja ──");
{
  /*
   * El caso del otro pedido: una planilla que trae nada más el nombre y la
   * fecha, subida sobre fichas que ya existen. Si no se completara, esa base
   * no serviría para nada: sus filas se unificarían y se perderían enteras.
   */
  const plan = planificarFusion(
    { nombre: "Elena Portillo", telefono: "7100-0000", fecha_nacimiento: null },
    { nombre: "Elena Portillo", fecha_nacimiento: "1998-03-14" },
  );
  es("el cumpleaños entra", plan.parche.fecha_nacimiento, "1998-03-14");
}

console.log("\n── lo que se agregó a la tabla después y se perdía ──");
{
  const plan = planificarFusion(
    { nombre: "Gaby Ruiz", telefono: "7200-0000" },
    {
      nombre: "Gaby Ruiz",
      edad: 16,
      responsable_nombre: "Marta Ruiz",
      responsable_telefono: "7200-1111",
      responsable_correo: "marta@correo.com",
      pais: "Guatemala",
    },
  );
  es("la edad", plan.parche.edad, 16);
  es("el responsable", plan.parche.responsable_nombre, "Marta Ruiz");
  es("su teléfono", plan.parche.responsable_telefono, "7200-1111");
  es("su correo", plan.parche.responsable_correo, "marta@correo.com");
  es("y el país", plan.parche.pais, "Guatemala");
}

console.log("\n── completar nunca borra ──");
{
  const plan = planificarFusion(
    { nombre: "Hugo Salas", correo: "hugo@viejo.com", pais: "El Salvador" },
    { nombre: "Hugo Salas", correo: "hugo@nuevo.com", pais: "Guatemala" },
  );
  es("el correo guardado se conserva", plan.parche.correo, undefined);
  es("y el país también", plan.parche.pais, undefined);
  es(
    "los dos quedan como choques, para que los mire una persona",
    plan.choques.map((c) => c.campo).sort(),
    ["correo", "pais"],
  );
  es(
    "con el valor viejo y el nuevo a la vista",
    plan.choques.find((c) => c.campo === "correo"),
    { campo: "correo", actual: "hugo@viejo.com", entrante: "hugo@nuevo.com" },
  );
}

console.log("\n── el mismo dato escrito distinto no es un choque ──");
{
  const plan = planificarFusion(
    { nombre: "Ana Rivas", telefono: "+503 7797-2598", correo: "Ana@Correo.COM" },
    { nombre: "ana rivas", telefono: "77972598", correo: "ana@correo.com" },
  );
  es("no hay nada que escribir", Object.keys(plan.parche), []);
  es("ni nada que decidir", plan.choques, []);
}

console.log("\n── un segundo teléfono no es un conflicto ──");
{
  const plan = planificarFusion(
    { nombre: "Beto Cruz", telefono: "7300-0000", telefono_secundario: null },
    { nombre: "Beto Cruz", telefono: "7400-0000" },
  );
  es("el primero no se toca", plan.parche.telefono, undefined);
  es("el nuevo va al segundo", plan.parche.telefono_secundario, "7400-0000");
  es("y no queda como choque", plan.choques, []);
}
{
  // Con los dos ocupados sí es un choque: no hay dónde ponerlo sin pisar.
  const plan = planificarFusion(
    { nombre: "Beto Cruz", telefono: "7300-0000", telefono_secundario: "7400-0000" },
    { nombre: "Beto Cruz", telefono: "7500-0000" },
  );
  es("con los dos llenos, a decidirlo una persona", plan.choques.length, 1);
}

console.log("\n── nada que aportar, nada que escribir ──");
{
  const plan = planificarFusion(
    { nombre: "Carla Díaz", telefono: "7600-0000" },
    { nombre: "Carla Díaz", telefono: null, correo: null, edad: null },
  );
  es("parche vacío", Object.keys(plan.parche), []);
}

console.log("\n── LA LISTA CONTRA LA TABLA ──");
{
  /*
   * Esta es la que de verdad protege el pedido.
   *
   * Las columnas de `clientes` que describen a la persona tienen que estar
   * todas en la lista de fusión. Si mañana se agrega una y no se agrega acá,
   * esta prueba falla y se entera quien la agregó, en vez de enterarse la
   * escuela seis meses después con las fichas a medio llenar.
   *
   * Quedan afuera a propósito `id`, `activo`, `created_at` y `updated_at`: no
   * son datos de la persona, son de la fila.
   */
  const DE_LA_PERSONA = [
    "nombre",
    "telefono",
    "correo",
    "territorio_id",
    "pais",
    "fecha_nacimiento",
    "edad",
    "responsable_nombre",
    "responsable_telefono",
    "responsable_correo",
  ];

  for (const c of DE_LA_PERSONA) {
    es(`«${c}» está en la lista de fusión`, CAMPOS_DE_CLIENTE.includes(c), true);
    es(`   y tiene nombre en castellano`, Boolean(ETIQUETA_CAMPO[c]), true);
  }

  es(
    "y la consulta las pide todas",
    DE_LA_PERSONA.every((c) => COLUMNAS_DE_FUSION.includes(c)),
    true,
  );
  es(
    "más el segundo teléfono, que hace falta para saber si está libre",
    COLUMNAS_DE_FUSION.includes("telefono_secundario"),
    true,
  );
  es("y el id, para saber a quién actualizar", COLUMNAS_DE_FUSION.includes("id"), true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
