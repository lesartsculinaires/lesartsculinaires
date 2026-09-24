/**
 * El formato de WhatsApp: ¿se pone donde va, y se lee como lo lee el teléfono?
 *
 *     node --test supabase/pruebas/formatoDeWhatsapp.test.mjs
 *
 * Las dos mitades se prueban juntas a propósito. Poner la marca y dibujarla
 * tienen que estar de acuerdo: si el botón escribe algo que el lector no
 * entiende, la asesora ve asteriscos en su propia burbuja justo después de
 * haber pulsado «negrita», y lo primero que piensa es que no funcionó.
 *
 * Lo que más se vigila acá son los espacios. `* hola *` no sale en negrita en
 * ningún teléfono, y es el error que se comete solo: se selecciona con el
 * ratón y se lleva el espacio de al lado sin querer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// El módulo es TypeScript; se compila a un archivo suelto para poder correrlo
// sin montar todo el empaquetador.
const RAIZ = "/home/user/lesartsculinaires";
const salida = fs.mkdtempSync(path.join(os.tmpdir(), "fmt-"));
execFileSync(
  "npx",
  [
    "tsc",
    path.join(RAIZ, "src/lib/formatoDeWhatsapp.ts"),
    "--outDir", salida,
    "--module", "esnext",
    "--target", "es2022",
    "--moduleResolution", "bundler",
  ],
  { cwd: RAIZ, stdio: "pipe" },
);
const js = path.join(salida, "formatoDeWhatsapp.js");
fs.renameSync(js, js.replace(/\.js$/, ".mjs"));
const { alternarMarca, aPedazos, textoPlano } = await import(js.replace(/\.js$/, ".mjs"));

/** Lo que dibuja el lector, en una línea legible. */
const leido = (t) =>
  aPedazos(t)
    .map((p) => {
      const m = [p.negrita && "n", p.cursiva && "c", p.tachado && "t", p.mono && "m"]
        .filter(Boolean)
        .join("");
      return m ? `[${m}]${p.texto}` : p.texto;
    })
    .join("");

test("── PONER LA MARCA ──", () => {
  // Lo normal.
  assert.deepEqual(alternarMarca("hola mundo", 0, 4, "negrita"), {
    valor: "*hola* mundo",
    inicio: 1,
    fin: 5,
  });

  // LA QUE IMPORTA: la selección se llevó el espacio. La marca tiene que
  // quedar pegada al texto igual, o no se dibuja en el teléfono.
  assert.equal(alternarMarca("hola mundo", 4, 10, "negrita").valor, "hola *mundo*");

  // Sin seleccionar nada: el par y el cursor en el medio.
  const vacio = alternarMarca("", 0, 0, "cursiva");
  assert.equal(vacio.valor, "__");
  assert.equal(vacio.inicio, 1);

  // El monoespaciado son tres tildes invertidas de cada lado.
  assert.equal(alternarMarca("codigo", 0, 6, "mono").valor, "```codigo```");
});

test("── Y QUITARLA CON EL MISMO BOTÓN ──", () => {
  // Seleccionando sólo el texto, con las marcas por fuera.
  assert.deepEqual(alternarMarca("*hola* mundo", 1, 5, "negrita"), {
    valor: "hola mundo",
    inicio: 0,
    fin: 4,
  });

  // Seleccionando también las marcas.
  assert.equal(alternarMarca("*hola* mundo", 0, 6, "negrita").valor, "hola mundo");

  // Dos veces seguidas deja el texto como estaba: es lo que hace que el botón
  // se pueda deshacer solo, en vez de acumular `**hola**`.
  const uno = alternarMarca("hola", 0, 4, "negrita");
  const dos = alternarMarca(uno.valor, uno.inicio, uno.fin, "negrita");
  assert.equal(dos.valor, "hola");
});

test("── LEER: lo mismo que ve el teléfono ──", () => {
  assert.equal(leido("*hola*"), "[n]hola");
  assert.equal(leido("_hola_"), "[c]hola");
  assert.equal(leido("~hola~"), "[t]hola");
  assert.equal(leido("```hola```"), "[m]hola");

  // Anidadas.
  assert.equal(leido("*_hola_*"), "[nc]hola");

  // Con texto alrededor.
  assert.equal(leido("Hola *Cory*, ¿cómo estás?"), "Hola [n]Cory, ¿cómo estás?");
});

test("── UN ASTERISCO SUELTO ES UN ASTERISCO ──", () => {
  // Es la regla que evita mutilar un mensaje porque alguien escribió una
  // multiplicación o una separación.
  assert.equal(leido("2*3 = 6"), "2*3 = 6");
  assert.equal(leido("hola * mundo"), "hola * mundo");
  assert.equal(leido("***"), "***");
  assert.equal(leido("precio_final"), "precio_final");

  // Abierta y nunca cerrada: queda como texto.
  assert.equal(leido("*hola"), "*hola");
});

test("── DENTRO DEL MONOESPACIADO NO SE DIBUJA NADA MÁS ──", () => {
  // Es como se comporta WhatsApp: ahí los asteriscos se ven.
  assert.equal(leido("```*hola*```"), "[m]*hola*");
});

test("── EL TEXTO SIN MARCAS, PARA LA FILA DE LA BANDEJA ──", () => {
  assert.equal(textoPlano("*Hola* _Cory_"), "Hola Cory");
  assert.equal(textoPlano("2*3"), "2*3");
  assert.equal(textoPlano(""), "");
});

test("── NUNCA SE PIERDE UN CARÁCTER QUE NO SEA UNA MARCA ──", () => {
  /*
   * La comprobación que cubre lo que no se me ocurrió.
   *
   * El modo en que esto se rompe es siempre el mismo: el lector abre una marca
   * que después no cierra, y se come el símbolo de apertura. En pantalla el
   * mensaje sale mutilado y nadie entiende por qué. Acá se recorre una bolsa
   * de textos torcidos y se exige que las letras sobrevivan todas.
   */
  const casos = [
    "***", "**", "*", "_", "~~~", "``", "```",
    "*hola", "hola*", "*_hola*_", "~*_`hola`_*~",
    "2*3*4", "a_b_c_d", "hola *mundo* y ~chau~",
    "```sin cerrar", "* ", " *", "",
    "Precio: $495 *oferta*", "50% _dto_ hasta el 3/*",
  ];

  for (const t of casos) {
    const letras = (s) => s.replace(/[*_~`]/g, "");
    assert.equal(
      letras(textoPlano(t)),
      letras(t),
      `«${t}» perdió texto: quedó «${textoPlano(t)}»`,
    );
  }
});

test("── PONER Y LEER ESTÁN DE ACUERDO ──", () => {
  // La comprobación que ata las dos mitades: lo que escribe el botón, el
  // lector lo tiene que dibujar.
  for (const marca of ["negrita", "cursiva", "tachado", "mono"]) {
    const r = alternarMarca("Hola Cory", 5, 9, marca);
    const pedazos = aPedazos(r.valor);
    const marcado = pedazos.find((p) => p.texto === "Cory");
    assert.ok(marcado, `«${r.valor}» no se leyó en tramos`);
    assert.equal(marcado[marca], true, `«${r.valor}» no salió en ${marca}`);
  }
});
