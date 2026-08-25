/**
 * ¿Qué módulos ve cada rol?
 *
 *     node --experimental-strip-types supabase/pruebas/modulos.test.mjs
 *
 * La regla decide qué aparece en la barra lateral de cada persona, así que un
 * error acá se ve como «me desapareció una pantalla» o, peor, como «sigo
 * viendo lo que me sacaron». Los casos que importan son los bordes, y son
 * cuatro:
 *
 *   · dirección, que tiene que ver todo pase lo que pase —si pudiera
 *     esconderse «Usuarios y Roles» a sí misma, se quedaría sin forma de
 *     volver a entrar a arreglarlo—;
 *   · un rol sin nada configurado, que tiene que ver todo, porque no haber
 *     decidido no es lo mismo que haber dicho que no;
 *   · un módulo nuevo que la base todavía no conoce, por lo mismo;
 *   · y el caso que da sentido a todo: un «ver» destildado esconde, y sólo eso.
 */
import { modulosPermitidos } from "../../src/lib/modulos.ts";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const TODOS = ["Dashboard", "Inbox", "Clientes", "Bases", "Usuarios y Roles"];
const CATALOGO = [
  { clave: "dashboard", nombre: "Dashboard" },
  { clave: "inbox", nombre: "Inbox" },
  { clave: "clientes", nombre: "Clientes" },
  { clave: "bases", nombre: "Bases" },
  { clave: "usuarios", nombre: "Usuarios y Roles" },
];

const VENTAS = 2;

console.log("── dirección ──");
{
  // Aunque tenga todo destildado en la base.
  const permisos = CATALOGO.map((m) => ({ rolId: 1, modulo: m.clave, ver: false }));
  es("VE TODO IGUAL", modulosPermitidos(TODOS, CATALOGO, permisos, 1, true), TODOS);
}

console.log("\n── un rol sin nada configurado ──");
es("ve todo", modulosPermitidos(TODOS, CATALOGO, [], VENTAS, false), TODOS);

console.log("\n── sin rol conocido ──");
es("también ve todo, en vez de quedarse en blanco",
   modulosPermitidos(TODOS, CATALOGO, [], null, false), TODOS);

console.log("\n── con «ver» destildado ──");
{
  const permisos = [
    { rolId: VENTAS, modulo: "dashboard", ver: true },
    { rolId: VENTAS, modulo: "bases", ver: false },
    { rolId: VENTAS, modulo: "usuarios", ver: false },
  ];
  es(
    "ESCONDE SÓLO LO DESTILDADO",
    modulosPermitidos(TODOS, CATALOGO, permisos, VENTAS, false),
    ["Dashboard", "Inbox", "Clientes"],
  );
  es(
    "y el módulo sin fila sigue estando",
    modulosPermitidos(TODOS, CATALOGO, permisos, VENTAS, false).includes("Inbox"),
    true,
  );
}

console.log("\n── lo de otro rol no lo afecta ──");
{
  const permisos = [
    { rolId: 99, modulo: "bases", ver: false },
    { rolId: 99, modulo: "clientes", ver: false },
  ];
  es("no se le aplica", modulosPermitidos(TODOS, CATALOGO, permisos, VENTAS, false), TODOS);
}

console.log("\n── un módulo que la base no conoce ──");
{
  const conNuevo = [...TODOS, "Pantalla Nueva"];
  const permisos = [{ rolId: VENTAS, modulo: "bases", ver: false }];
  es(
    "SE VE, PORQUE NADIE PUDO DECIDIR SOBRE ÉL",
    modulosPermitidos(conNuevo, CATALOGO, permisos, VENTAS, false).includes("Pantalla Nueva"),
    true,
  );
}

console.log("\n── se puede dejar a alguien con un solo módulo ──");
{
  const permisos = CATALOGO.filter((m) => m.clave !== "clientes").map((m) => ({
    rolId: VENTAS,
    modulo: m.clave,
    ver: false,
  }));
  es(
    "queda sólo Clientes",
    modulosPermitidos(TODOS, CATALOGO, permisos, VENTAS, false),
    ["Clientes"],
  );
}

console.log("\n── y con todo destildado, ninguno ──");
{
  // Se permite: es una decisión de dirección, no un error a corregir acá. Que
  // la pantalla avise antes de dejar a alguien sin nada es otra capa.
  const permisos = CATALOGO.map((m) => ({ rolId: VENTAS, modulo: m.clave, ver: false }));
  es("ninguno", modulosPermitidos(TODOS, CATALOGO, permisos, VENTAS, false), []);
}

console.log("\n── no se toca la lista que le pasan ──");
{
  const original = [...TODOS];
  modulosPermitidos(TODOS, CATALOGO, [], VENTAS, false);
  es("TODOS quedó igual", TODOS, original);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
