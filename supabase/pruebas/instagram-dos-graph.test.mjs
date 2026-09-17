/**
 * Los dos Graph de Instagram: ¿le pega al que corresponde?
 *
 * Meta tiene dos formas de conectar la mensajería de Instagram y cada una tiene
 * su propio servidor. Con el equivocado devuelve «Invalid OAuth 2.0 Access
 * Token» aunque el token esté perfecto — que es lo que le pasó a la escuela.
 */
let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const VERSION = "v21.0";
const base = () => {
  const propuesta = process.env.INSTAGRAM_GRAPH_URL;
  if (propuesta && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(propuesta.trim())) {
    return `${propuesta.trim()}/${VERSION}`;
  }
  return (process.env.INSTAGRAM_API ?? "").trim().toLowerCase() === "instagram"
    ? `https://graph.instagram.com/${VERSION}`
    : `https://graph.facebook.com/${VERSION}`;
};

console.log("── a qué servidor le habla ──");
delete process.env.INSTAGRAM_API;
es("sin la variable, sigue como antes (facebook)", base(), `https://graph.facebook.com/${VERSION}`);
process.env.INSTAGRAM_API = "instagram";
es("con «instagram», al de Instagram", base(), `https://graph.instagram.com/${VERSION}`);
process.env.INSTAGRAM_API = "  Instagram  ";
es("no importan espacios ni mayúsculas", base(), `https://graph.instagram.com/${VERSION}`);
process.env.INSTAGRAM_API = "facebook";
es("con «facebook», explícito", base(), `https://graph.facebook.com/${VERSION}`);
process.env.INSTAGRAM_API = "cualquier-cosa";
es("un valor raro NO manda a un servidor inventado", base(), `https://graph.facebook.com/${VERSION}`);

/*
 * El desvío al banco, y por qué sólo puede ser local.
 *
 * Por acá viaja el token de Instagram de la escuela. Una variable que decida a
 * dónde se manda es, si se pone mal —o si la pone quien no debía—, una forma de
 * entregarle esa credencial a otro servidor. Aceptar únicamente esta misma
 * máquina cierra eso: no hay a dónde llevarse nada.
 *
 * Las tres pruebas de abajo son esa regla. La última es la que importa: una
 * dirección de afuera no se rechaza con un error, se IGNORA, y se sigue
 * hablando con Meta, que es lo correcto en producción.
 */
delete process.env.INSTAGRAM_API;
process.env.INSTAGRAM_GRAPH_URL = "http://127.0.0.1:3144";
es("con la dirección del banco, le habla al banco", base(), `http://127.0.0.1:3144/${VERSION}`);
process.env.INSTAGRAM_GRAPH_URL = "http://localhost:3144";
es("«localhost» también", base(), `http://localhost:3144/${VERSION}`);
process.env.INSTAGRAM_GRAPH_URL = "https://servidor-de-otro.example";
es(
  "UNA DIRECCIÓN DE AFUERA SE IGNORA: el token no sale de la máquina",
  base(),
  `https://graph.facebook.com/${VERSION}`,
);
delete process.env.INSTAGRAM_GRAPH_URL;

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
