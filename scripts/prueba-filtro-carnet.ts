/**
 * Prueba del filtro de carnets, sin base ni red.
 *
 * Comprueba las dos cosas que importan: que no se escape nada que deba salir
 * (un estudiante sin carnet) y que no salga nada de más (ejecuciones de n8n
 * quemadas). Se corre con `npx tsx scripts/prueba-filtro-carnet.ts`.
 */
import { decidirReenvio } from "../src/lib/whatsapp/filtroCarnet";

type Fila = { telefono: string; expira_en: string };

/** Supabase de mentira: la ventana vive en un Map. */
function baseFalsa(filas: Fila[] = []) {
  const tabla = new Map(filas.map((f) => [f.telefono, f]));
  return {
    from() {
      let buscado = "";
      const api = {
        select: () => api,
        eq: (_c: string, v: string) => {
          buscado = v;
          return api;
        },
        maybeSingle: async () => ({ data: tabla.get(buscado) ?? null, error: null }),
        upsert: async (fila: Fila) => {
          tabla.set(fila.telefono, fila);
          return { error: null };
        },
      };
      return api;
    },
    _tabla: tabla,
  };
}

const mensaje = (texto: string, de = "50370000000") => ({
  entry: [
    {
      changes: [
        { value: { messages: [{ from: de, type: "text", text: { body: texto } }] } },
      ],
    },
  ],
});

const estado = () => ({
  entry: [{ changes: [{ value: { statuses: [{ id: "wamid.X", status: "delivered" }] } }] }],
});

const audio = (de = "50370000000") => ({
  entry: [{ changes: [{ value: { messages: [{ from: de, type: "audio", audio: {} }] } }] }],
});

const boton = (id: string, de = "50370000000") => ({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              { from: de, type: "interactive", interactive: { button_reply: { id } } },
            ],
          },
        },
      ],
    },
  ],
});

const DEBEN_SALIR = [
  "Ver Carnet",
  "ver carnet",
  "VER CARNET",
  "Ver carnét",
  "ver  mi   carnet",
  "Quiero ver mi carnet por favor",
  "carnet de estudiante",
  "Hola, necesito el carnet de estudiante",
  "descargar carnet",
  "Descargar mi carnet",
  "carnet",
  "LAC3013-2026",
  "Mi código es LAC3013-2026",
  "lac 3013 - 2026",
];

const NO_DEBEN_SALIR = [
  "Hola",
  "Buenos días, información por favor",
  "¿Cuánto cuesta el diplomado de cocina?",
  "Me interesa el curso de pastelería",
  "¿Tienen clases los sábados?",
  "Gracias, quedo atenta",
  "4821",
  "Quiero inscribirme",
  "¿Dan carné de manipulación de alimentos?",
  "Buenas, ¿a qué hora abren?",
];

let fallos = 0;
const comprobar = (ok: boolean, etiqueta: string, motivo: string) => {
  if (!ok) {
    fallos += 1;
    console.log(`  FALLA  ${etiqueta}  (motivo: ${motivo})`);
  }
};

async function main() {
  console.log("Disparadores que deben salir:");
  for (const texto of DEBEN_SALIR) {
    const base = baseFalsa();
    const d = await decidirReenvio(base as never, mensaje(texto));
    comprobar(d.reenviar, JSON.stringify(texto), d.motivo);
  }

  console.log("Conversación de ventas que NO debe salir:");
  for (const texto of NO_DEBEN_SALIR) {
    const base = baseFalsa();
    const d = await decidirReenvio(base as never, mensaje(texto));
    comprobar(!d.reenviar, JSON.stringify(texto), d.motivo);
  }

  console.log("Casos de infraestructura:");

  const sinEstado = await decidirReenvio(baseFalsa() as never, estado());
  comprobar(!sinEstado.reenviar, "aviso de estado", sinEstado.motivo);

  const sinAudio = await decidirReenvio(baseFalsa() as never, audio());
  comprobar(!sinAudio.reenviar, "nota de voz", sinAudio.motivo);

  const btn = await decidirReenvio(baseFalsa() as never, boton("btn_carnet"));
  comprobar(btn.reenviar, "botón del bot", btn.motivo);

  const btnOtro = await decidirReenvio(baseFalsa() as never, boton("btn_asesor"));
  comprobar(!btnOtro.reenviar, "botón de ventas", btnOtro.motivo);

  // La ventana: el DUI suelto sale sólo después de un disparador.
  const base = baseFalsa();
  const dui0 = await decidirReenvio(base as never, mensaje("4821"));
  comprobar(!dui0.reenviar, "DUI sin ventana abierta", dui0.motivo);

  await decidirReenvio(base as never, mensaje("Ver Carnet"));
  const dui1 = await decidirReenvio(base as never, mensaje("4821"));
  comprobar(dui1.reenviar, "DUI con ventana abierta", dui1.motivo);

  const otro = await decidirReenvio(base as never, mensaje("4821", "50399999999"));
  comprobar(!otro.reenviar, "DUI de otro teléfono", otro.motivo);

  // Ventana vencida: vuelve a ventas.
  const vencida = baseFalsa([
    { telefono: "50370000000", expira_en: new Date(Date.now() - 60_000).toISOString() },
  ]);
  const tarde = await decidirReenvio(vencida as never, mensaje("4821"));
  comprobar(!tarde.reenviar, "ventana vencida", tarde.motivo);

  const total = DEBEN_SALIR.length + NO_DEBEN_SALIR.length + 8;
  console.log(fallos === 0 ? `\nOK  ${total}/${total}` : `\n${fallos} fallas de ${total}`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
