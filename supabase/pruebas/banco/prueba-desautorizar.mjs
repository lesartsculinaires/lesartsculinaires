/**
 * Desautorizar: apagar el token, cerrar el hilo, y NO borrar nada.
 *
 *     node supabase/pruebas/banco/prueba-desautorizar.mjs
 *
 * ============================================================================
 * LOS DOS AVISOS DE META, QUE SE PARECEN Y NO SON LO MISMO
 * ============================================================================
 *
 *   DESAUTORIZAR      «Dejá de usar mi token.» Es éste.
 *   ELIMINAR DATOS    «Borrá lo que tengas mío.» Es el otro.
 *
 * Confundirlos tiene una sola dirección mala y es catastrófica: borrar el
 * historial de la escuela por un pedido que no lo pidió, sin forma de
 * deshacerlo. Por eso la prueba más importante de acá no es que algo cambie
 * sino que los mensajes SIGAN ESTANDO.
 *
 * ============================================================================
 * Y EL IDENTIFICADOR PUEDE SER DOS COSAS
 * ============================================================================
 *
 * El de un negocio que conectó su cuenta, o el de una persona que escribió.
 * No vienen marcados, así que se prueban los dos casos por separado —y también
 * uno que no es ninguno de los dos, que es el que tiene que quedar registrado
 * en cero para poder diagnosticarlo desde los registros de Netlify.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación compilada.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const SECRETO = "secreto-de-prueba";

const IG_NEGOCIO = "17841400000" + String(Date.now()).slice(-6);
const IG_PERSONA = "77700000000" + String(Date.now()).slice(-5);
const IG_DESCONOCIDO = "99999999999999";
const PAGINA = "900000" + String(Date.now()).slice(-9);

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-desaut-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
    if (/^psql:.*ERROR:/m.test(salida)) {
      console.error(`\nLa base rechazó una sentencia de la prueba:\n${salida}\n`);
      process.exit(1);
    }
    return salida;
  } finally {
    fs.rmSync(ruta, { force: true });
  }
};

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const limpiar = () => {
  sql(`
    delete from public.actividad where entidad='canal' and accion='desautorizo'
      and campos->>'identificador' in ('${IG_NEGOCIO}','${IG_PERSONA}','${IG_DESCONOCIDO}');
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador='${IG_PERSONA}');
    delete from public.conversaciones where identificador='${IG_PERSONA}';
    delete from public.canal_credenciales where page_id='${PAGINA}';
  `);
};
limpiar();

/*
 * Un negocio conectado y una persona con hilo, los dos por Instagram.
 *
 * El hilo lleva DOS mensajes a propósito: son los que al final tienen que
 * seguir ahí.
 */
sql(`
  insert into public.canal_credenciales
    (canal_id, page_id, page_nombre, ig_business_account_id, access_token, token_tipo, activo)
  values (1, '${PAGINA}', 'Página de Prueba', '${IG_NEGOCIO}', 'TOKEN-QUE-DEBE-BORRARSE', 'page', true);

  insert into public.conversaciones (canal, identificador, nombre_perfil, ultimo_mensaje_en, agente_activo)
  values ('instagram', '${IG_PERSONA}', 'Persona Desautoriza', now(), true);

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado)
  select c.id, 'mid.DESAUT.1', 'entrante', 'text', 'hola', 'recibido'
  from public.conversaciones c where c.identificador='${IG_PERSONA}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado)
  select c.id, 'mid.DESAUT.2', 'saliente', 'text', 'te respondo', 'enviado'
  from public.conversaciones c where c.identificador='${IG_PERSONA}';
`);

// ── la aplicación ──────────────────────────────────────────────────────────

const parar = (puerto) => {
  try {
    execSync(`fuser -k ${puerto}/tcp 2>/dev/null || true`, { shell: "/bin/bash" });
  } catch {
    // No estaba levantado.
  }
  for (let i = 0; i < 20; i++) {
    const ocupado = execSync(`fuser ${puerto}/tcp 2>/dev/null || true`, {
      encoding: "utf8",
      shell: "/bin/bash",
    }).trim();
    if (!ocupado) return;
    execSync("sleep 1");
  }
};

parar(3142);
execSync(`cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-desaut.log 2>&1 < /dev/null &)`, {
  shell: "/bin/bash",
});
{
  let vivo = false;
  for (let i = 0; i < 40; i++) {
    const code = execSync(
      "curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
      { encoding: "utf8", shell: "/bin/bash" },
    ).trim();
    if (code === "200") {
      vivo = true;
      break;
    }
    execSync("sleep 1");
  }
  if (!vivo) throw new Error("La aplicación no levantó en el 3142.");
}

/** Arma el `signed_request` como lo manda Facebook. */
const firmar = (datos, secreto = SECRETO) => {
  const contenido = Buffer.from(JSON.stringify(datos)).toString("base64url");
  const firma = crypto.createHmac("sha256", secreto).update(contenido).digest("base64url");
  return `${firma}.${contenido}`;
};

/** Llama al aviso y devuelve el código y el cuerpo. */
const desautorizar = (firmado) => {
  const salida = execSync(
    `curl -s --noproxy '*' -w '\\n%{http_code}' -X POST http://127.0.0.1:3142/api/meta/deauthorize ` +
      `-H 'content-type: application/x-www-form-urlencoded' ` +
      `--data-urlencode 'signed_request=${firmado}'`,
    { encoding: "utf8", shell: "/bin/bash", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
  const lineas = salida.split("\n");
  const code = lineas.pop();
  let cuerpo = null;
  try {
    cuerpo = JSON.parse(lineas.join("\n"));
  } catch {
    cuerpo = lineas.join("\n");
  }
  return { code, cuerpo };
};

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. SIN FIRMA VÁLIDA NO SE TOCA NADA ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * La dirección es pública. Sin comprobar la firma, cualquiera que la descubra
 * puede desconectarle la cuenta a la escuela mandando un identificador.
 */
{
  const conOtroSecreto = firmar({ user_id: IG_NEGOCIO }, "secreto-equivocado");
  const r = desautorizar(conOtroSecreto);
  es("SE RECHAZA", r.code, "401");
  es("y se dice que la firma no valía", r.cuerpo?.error, "firma inválida");
  es(
    "LA CREDENCIAL SIGUE ACTIVA",
    sql(`select activo from public.canal_credenciales where page_id='${PAGINA}'`),
    "t",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. EL IDENTIFICADOR DE UN NEGOCIO: SE APAGA EL TOKEN ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const r = desautorizar(firmar({ user_id: IG_NEGOCIO }));
  es("contesta bien", r.code, "200");
  es("DICE CUÁNTAS CREDENCIALES APAGÓ", r.cuerpo?.credenciales, 1);
  es("y que no cerró ninguna conversación", r.cuerpo?.conversaciones, 0);

  es(
    "la credencial quedó apagada",
    sql(`select activo from public.canal_credenciales where page_id='${PAGINA}'`),
    "f",
  );
  es(
    "Y EL TOKEN SE VACIÓ, no se quedó guardado muerto",
    sql(`select coalesce(access_token,'(null)') from public.canal_credenciales where page_id='${PAGINA}'`),
    "",
  );
  es(
    "la fila se conserva, para que quede el registro",
    sql(`select count(*) from public.canal_credenciales where page_id='${PAGINA}'`),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. EL DE UNA PERSONA: SE CIERRA EL HILO Y SE APAGA EL AGENTE ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const r = desautorizar(firmar({ user_id: IG_PERSONA }));
  es("contesta bien", r.code, "200");
  es("DICE CUÁNTAS CONVERSACIONES CERRÓ", r.cuerpo?.conversaciones, 1);
  es("y que no apagó credenciales", r.cuerpo?.credenciales, 0);

  es(
    "la conversación quedó cerrada",
    sql(`select estado from public.conversaciones where identificador='${IG_PERSONA}'`),
    "cerrada",
  );
  es(
    "Y EL AGENTE APAGADO, que es lo único que podría volver a escribirle solo",
    sql(`select agente_activo from public.conversaciones where identificador='${IG_PERSONA}'`),
    "f",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. Y LO QUE NO TIENE QUE PASAR: QUE SE BORRE ALGO ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * ES LA PRUEBA QUE IMPORTA. Desautorizar es «dejá de usar mi token», no «borrá
 * mis datos». Si algún día alguien mezcla los dos avisos, esto se pone rojo
 * antes de que el historial de la escuela desaparezca.
 */
{
  es(
    "LOS DOS MENSAJES SIGUEN AHÍ",
    sql(`select count(*) from public.mensajes m join public.conversaciones c on c.id=m.conversacion_id
         where c.identificador='${IG_PERSONA}'`),
    "2",
  );
  es(
    "y la conversación también",
    sql(`select count(*) from public.conversaciones where identificador='${IG_PERSONA}'`),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. UNO QUE NO CONOCEMOS QUEDA REGISTRADO EN CERO ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * No es un error y no puede parecerlo. Pero es lo primero que uno quiere ver en
 * los registros cuando alguien dice «quité la app y sigue conectada»: saber si
 * el aviso llegó, y con qué identificador.
 */
{
  const r = desautorizar(firmar({ user_id: IG_DESCONOCIDO }));
  es("contesta bien igual", r.code, "200");
  es("con cero y cero", [r.cuerpo?.credenciales, r.cuerpo?.conversaciones], [0, 0]);
  es(
    "Y QUEDÓ ANOTADO EN ACTIVIDAD",
    sql(`select count(*) from public.actividad where entidad='canal' and accion='desautorizo'
         and campos->>'identificador'='${IG_DESCONOCIDO}'`),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. TODO QUEDA EN ACTIVIDAD, SIN INVENTAR UN AUTOR ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "los tres avisos quedaron anotados",
    sql(`select count(*) from public.actividad where entidad='canal' and accion='desautorizo'
         and campos->>'identificador' in ('${IG_NEGOCIO}','${IG_PERSONA}','${IG_DESCONOCIDO}')`),
    "3",
  );
  es(
    "SIN ACTOR: no fue una persona del equipo, fue un aviso de Meta",
    sql(`select count(*) from public.actividad where entidad='canal' and accion='desautorizo'
         and actor_id is not null
         and campos->>'identificador' in ('${IG_NEGOCIO}','${IG_PERSONA}','${IG_DESCONOCIDO}')`),
    "0",
  );
  /*
   * Y que NINGUNO haya tenido problemas.
   *
   * `revocarCuentaDeInstagram` no lanza nunca —Meta reintenta ante un error y
   * termina desactivando el aviso—, así que una consulta que falla se guarda en
   * `problemas` y la función sigue como si nada. Eso está bien y tiene un
   * precio: sin mirar ese campo, un fallo se ve igual que «no había nada que
   * tocar». Escribiendo esta prueba pasó exactamente eso.
   */
  es(
    "NINGUNO TUVO PROBLEMAS, que si no «cero» podría estar tapando un error",
    sql(`select count(*) from public.actividad where entidad='canal' and accion='desautorizo'
         and campos ? 'problemas'
         and campos->>'identificador' in ('${IG_NEGOCIO}','${IG_PERSONA}','${IG_DESCONOCIDO}')`),
    "0",
  );
  es(
    "y con los números adentro, para poder mirarlos después",
    sql(`select campos->>'credenciales_apagadas' from public.actividad
         where entidad='canal' and accion='desautorizo' and campos->>'identificador'='${IG_NEGOCIO}'`),
    "1",
  );
}

limpiar();
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
