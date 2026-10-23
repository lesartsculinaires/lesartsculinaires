import { compilar } from "./compilar.mjs";
/**
 * ¿Esto es un teléfono?
 *
 *     node supabase/pruebas/telefonos.test.mjs
 *
 * El 24/08/2026 una base cargó el código del grupo en la columna del teléfono
 * («DSBA-1-2026») y el 23/10 un masivo dejó 83 egresados afuera «sin
 * teléfono». Ahora el importador no guarda como teléfono lo que no es un
 * número, y lo avisa en la revisión.
 */
const { esTelefono, telefonoDeLaCelda } = await compilar("src/lib/duplicados.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

for (const t of ["7559 7529", "7730-3598", "+503 6680-1780", "50377292123", "+1 (801) 953-8174"]) es(`«${t}» es teléfono`, esTelefono(t), true);
for (const t of ["DSBA-1-2026", "DSMG-grupo 2-fase 2-2026-activo", "DSCI-9-2025 con demo en laboratorio", "12026", "", null]) es(`«${t}» no`, esTelefono(t), false);

es("una celda con código queda vacía, con aviso", telefonoDeLaCelda("DSBA-1-2026"), { telefono: null, aviso: "Teléfono «DSBA-1-2026» no es un número; se deja vacío" });
es("con dos números se usa el primero", telefonoDeLaCelda("70302571/ 7906-9197").telefono, "70302571");
es("un número normal pasa sin aviso", telefonoDeLaCelda("7088-0001"), { telefono: "7088-0001", aviso: null });
es("vacía, vacía", telefonoDeLaCelda("  "), { telefono: null, aviso: null });

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
