/**
 * «RECUPERACIÓN» en una nota, ¿deja el recordatorio para dentro de una semana?
 *
 *     npx esbuild src/lib/seguimientos.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/seg.mjs
 *     node supabase/pruebas/recuperacion.test.mjs /tmp/seg.mjs
 *
 * ------------------------------------------------------------------------
 * DÓNDE SE ROMPE ESTO
 * ------------------------------------------------------------------------
 *
 * En cómo se escribe la palabra. El asesor la teclea rápido, a una mano y
 * entre otras frases: «RECUPERACIÓN», «recuperacion», «Recuperación.», «hay
 * que hacer recuperación con este». Todas quieren decir lo mismo y todas
 * tienen que dejar el recordatorio.
 *
 * Y del otro lado están las que NO tienen que dispararlo, que es donde una
 * detección demasiado suelta hace daño: si «recuperar» o «recuperado»
 * activaran el recordatorio, media bitácora terminaría agendando llamadas que
 * nadie pidió, y los avisos dejarían de mirarse.
 */
const { detectarSeguimiento, DIAS_PARA_RECUPERAR, sumarDias, tituloDe, rotuloDe } =
  await import(process.argv[2] ?? "/tmp/seg.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const HOY = "2026-08-27";
const EN_UNA_SEMANA = sumarDias(HOY, DIAS_PARA_RECUPERAR);

console.log(`── una semana desde ${HOY} es ${EN_UNA_SEMANA} ──`);
es("son siete días", DIAS_PARA_RECUPERAR, 7);
es("y la cuenta da el 3 de septiembre", EN_UNA_SEMANA, "2026-09-03");

console.log("\n── se escriba como se escriba ──");
{
  const formas = [
    "RECUPERACION",
    "RECUPERACIÓN",
    "Recuperación",
    "recuperacion",
    "Hay que hacer RECUPERACIÓN con este cliente",
    "no contestó. recuperación.",
    "recuperaciones",
  ];

  for (const nota of formas) {
    const d = detectarSeguimiento(nota, HOY);
    es(`«${nota}» → recordatorio`, d?.tipo ?? null, "recuperacion");
    if (d) es(`   y para el ${EN_UNA_SEMANA}`, d.proxima, EN_UNA_SEMANA);
  }
}

console.log("\n── lo que NO tiene que dispararlo ──");
{
  /*
   * Estas son las que importan. Una detección suelta llenaría la agenda de
   * llamadas que nadie pidió, y un aviso que suena de más deja de mirarse.
   */
  const noDeberian = [
    "el cliente ya recuperó su cupo",
    "recuperar el anticipo",
    "está recuperado",
    "recuperamos la conversación",
    "hablamos de la recuperacional", // no es palabra, pero prueba el borde
  ];

  for (const nota of noDeberian) {
    es(`«${nota}» no agenda nada`, detectarSeguimiento(nota, HOY)?.tipo ?? null, null);
  }
}

console.log("\n── convive con las que ya había ──");
{
  const pago = detectarSeguimiento("seguimiento de pago el 15 de cada mes", HOY);
  es("«seguimiento de pago» sigue andando", pago?.tipo ?? null, "pago");

  const cierre = detectarSeguimiento("seguimiento de cierre mañana", HOY);
  es("«seguimiento de cierre» también", cierre?.tipo ?? null, "cierre");

  // Con las dos palabras gana la recuperación: es la más específica y la que
  // la escuela escribe cuando quiere exactamente esto.
  const mixta = detectarSeguimiento("recuperación, y seguimiento de pago el 5", HOY);
  es("con las dos, manda recuperación", mixta?.tipo ?? null, "recuperacion");
}

console.log("\n── cómo se lee en la lista ──");
{
  es("el título dice qué llamada es", tituloDe("recuperacion"), "Llamar para recuperar");
  es("y la pastilla, corto", rotuloDe("recuperacion"), "Recuperación");
  // Los otros no cambiaron.
  es("«pago» sigue diciendo Pago", rotuloDe("pago"), "Pago");
  es("y «reactivacion», Reactivación", rotuloDe("reactivacion"), "Reactivación");
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
