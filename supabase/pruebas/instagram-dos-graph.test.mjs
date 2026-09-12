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
const base = () =>
  (process.env.INSTAGRAM_API ?? "").trim().toLowerCase() === "instagram"
    ? `https://graph.instagram.com/${VERSION}`
    : `https://graph.facebook.com/${VERSION}`;

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

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
