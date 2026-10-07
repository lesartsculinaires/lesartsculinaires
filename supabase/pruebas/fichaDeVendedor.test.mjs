import { compilar } from "./compilar.mjs";
/**
 * Quién necesita ficha de vendedor.
 *
 *     node supabase/pruebas/fichaDeVendedor.test.mjs
 *
 * ============================================================================
 * LA REGLA QUE HABÍA ESTABA AL REVÉS JUSTO DONDE IMPORTABA
 * ============================================================================
 *
 * Entrar al CRM y poder atender leads son dos cosas separadas: la cuenta vive
 * en `usuarios` y la ficha en `vendedores`. Quien tiene cuenta y no ficha entra
 * igual, ve las pantallas, y no se le puede asignar ni un lead. Nada falla.
 *
 * La pantalla ya avisaba de eso, pero eximía a quien tiene `ve_todo` —con el
 * razonamiento de que dirección y coordinación entran sin atender a nadie—. Y
 * los roles «Ventas» y «Jefe de ventas» tienen las DOS cosas: ven todo Y
 * reciben leads. O sea que el aviso estaba APAGADO justo para quienes el
 * reparto automático iba a saltear.
 *
 * Medido el 7 de octubre de 2026: de doce cuentas, ocho sin ficha, y el reparto
 * terminaba siempre en la misma persona —la única con rol que recibe leads y
 * ficha—. Mil cuarenta leads contra tres, uno y dieciséis.
 *
 * Por eso los roles de acá abajo son los REALES de la escuela, con sus banderas
 * tal como están en la base. Una prueba con roles inventados habría pasado con
 * la regla vieja.
 */
const { motivoDeFicha, faltaLaFicha, comoSeExplica, convieneFichaAlCrear } = await compilar(
  "src/lib/crm/fichaDeVendedor.ts",
);

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Los siete roles de la escuela, con sus banderas de verdad. */
const ROLES = {
  Administrador: { esAdmin: true, veTodo: false, recibeLeads: false },
  Ventas: { esAdmin: false, veTodo: true, recibeLeads: true },
  "Gerente de ventas": { esAdmin: false, veTodo: true, recibeLeads: false },
  "Jefe de ventas": { esAdmin: false, veTodo: true, recibeLeads: true },
  "Asesor Secundario": { esAdmin: false, veTodo: false, recibeLeads: false },
  Asesores: { esAdmin: false, veTodo: true, recibeLeads: false },
  Revisor: { esAdmin: false, veTodo: false, recibeLeads: false },
};

console.log("── EL CASO QUE SE ESCAPÓ: recibe leads y ve todo ──");
{
  /*
   * Estefany, el 7 de octubre: rol «Ventas», cuenta activa, sin ficha. Con la
   * regla vieja esto daba `false` y la pantalla no mostraba nada.
   */
  es("a quien recibe leads le falta la ficha", faltaLaFicha(ROLES.Ventas, false, true), true);
  es("y el motivo es el reparto", motivoDeFicha(ROLES.Ventas, false, true), "recibe-leads");
  es(
    "Jefe de ventas, lo mismo",
    motivoDeFicha(ROLES["Jefe de ventas"], false, true),
    "recibe-leads",
  );

  /*
   * Y el aviso tiene que decir lo que DE VERDAD pasa. A esta persona no es que
   * no vea nada —ve todo, tiene `ve_todo`—: lo que no le llega es ningún lead.
   * El aviso viejo decía «sin esto no va a ver ninguna oportunidad», que para
   * ella es falso, y mandaría a buscar el problema al lugar equivocado.
   */
  const dicho = comoSeExplica("recibe-leads");
  es("el aviso habla del reparto", /reparto/i.test(dicho), true);
  es("Y NO DICE QUE NO VA A VER NADA", /no va a ver/i.test(dicho), false);
}

console.log("\n── quien sólo ve lo suyo también la necesita ──");
{
  for (const quien of ["Asesor Secundario", "Revisor"]) {
    es(`${quien}`, motivoDeFicha(ROLES[quien], false, true), "solo-ve-lo-suyo");
  }
  const dicho = comoSeExplica("solo-ve-lo-suyo");
  es("y ahí sí se habla de asignar y del tablero", /asignar/i.test(dicho), true);
}

console.log("\n── dirección y coordinación NO la necesitan ──");
{
  /*
   * Es la otra mitad: crearle ficha a todo el mundo ensuciaría los desplegables
   * de «asignar a» con gente que no atiende a nadie. Acá está la línea.
   */
  es("Administrador", motivoDeFicha(ROLES.Administrador, false, true), "no-la-necesita");
  es(
    "Gerente de ventas —ve todo y no recibe—",
    motivoDeFicha(ROLES["Gerente de ventas"], false, true),
    "no-la-necesita",
  );
  es("ninguno de los dos se avisa", [
    faltaLaFicha(ROLES.Administrador, false, true),
    faltaLaFicha(ROLES["Gerente de ventas"], false, true),
  ], [false, false]);
}

console.log("\n── los Asesores, que ya tenían ficha ──");
{
  /*
   * «Asesores» ve todo y no recibe reparto, pero las tres personas con ese rol
   * tienen ficha y leads asignados a mano. Con esta regla NO se les avisa, que
   * es correcto: ya la tienen. Lo que vigila esta comprobación es que la regla
   * no empiece a gritarle a quien está bien.
   */
  es("con ficha, no se avisa", motivoDeFicha(ROLES.Asesores, true, true), "ya-la-tiene");
  es("sin ficha tampoco, porque ve todo y no recibe reparto",
     motivoDeFicha(ROLES.Asesores, false, true), "no-la-necesita");
}

console.log("\n── los casos que no son de nadie ──");
{
  es("quien ya la tiene", motivoDeFicha(ROLES.Ventas, true, true), "ya-la-tiene");
  /*
   * A una cuenta dada de baja no se le avisa: quedarían avisos encendidos para
   * siempre por gente que ya no está, y el aviso dejaría de significar algo.
   */
  es("una cuenta inactiva", motivoDeFicha(ROLES.Ventas, false, false), "esta-inactiva");
  es("y sin rol, se la trata como quien sólo ve lo suyo",
     motivoDeFicha(null, false, true), "solo-ve-lo-suyo");
  es("el aviso de los casos tranquilos es nulo", [
    comoSeExplica("ya-la-tiene"),
    comoSeExplica("esta-inactiva"),
    comoSeExplica("no-la-necesita"),
  ], [null, null, null]);
}

console.log("\n── la casilla del alta viene marcada para quien la necesita ──");
{
  es("Ventas, marcada", convieneFichaAlCrear(ROLES.Ventas), true);
  es("Jefe de ventas, marcada", convieneFichaAlCrear(ROLES["Jefe de ventas"]), true);
  es("Revisor, marcada", convieneFichaAlCrear(ROLES.Revisor), true);
  es("Administrador, DESMARCADA", convieneFichaAlCrear(ROLES.Administrador), false);
  es("Gerente de ventas, DESMARCADA", convieneFichaAlCrear(ROLES["Gerente de ventas"]), false);
  // Sin rol elegido todavía: se marca, porque el caso común es dar de alta a
  // alguien que va a atender.
  es("sin rol elegido, marcada", convieneFichaAlCrear(null), true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
