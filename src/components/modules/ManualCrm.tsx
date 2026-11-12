"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import {
  CAPITULOS,
  FRECUENTES,
  GLOSARIO,
  type Capitulo,
  type Foto,
  type Guia,
  type PreguntaRapida,
} from "@/lib/manual/contenido";
import puntosDeLasFotos from "@/lib/manual/puntos.json";
import { T, softer, tinte } from "@/lib/theme";

/**
 * El «Manual CRM» (12/11/2026).
 *
 * Para quien entra por primera vez, o para la duda de un martes a las tres:
 * un capítulo por módulo con la pantalla de verdad y números que se tocan,
 * «¿Cómo hago…?» paso a paso, consejos, una pregunta rápida para ver si quedó,
 * preguntas frecuentes, glosario y un buscador que encuentra todo.
 *
 * Cada persona ve sólo los capítulos de los módulos que su rol le deja ver:
 * a una asesora no le sirve el de «Usuarios y Roles». El contenido vive en
 * `@/lib/manual/contenido`; las fotos, en `public/manual/`.
 */

/** Dónde está cada número sobre cada foto, en % del ancho y alto. */
type Caja = { x: number; y: number; w: number; h: number };
const PUNTOS = puntosDeLasFotos as Record<string, Record<string, Caja>>;

const CLAVE_LEIDOS = "crm.manual.leidos";

interface Props {
  accent: string;
  /** Los módulos que esta persona puede ver (los mismos de la barra). */
  permitidos: readonly string[];
  /** Ir a un módulo desde el manual. */
  onIrA: (modulo: string) => void;
}

export function ManualCrm({ accent, permitidos, onIrA }: Props) {
  const capitulos = useMemo(
    () => CAPITULOS.filter((c) => c.modulo == null || permitidos.includes(c.modulo)),
    [permitidos],
  );
  const visibles = new Set(capitulos.map((c) => c.id));
  const frecuentes = FRECUENTES.filter((f) => !f.capitulo || visibles.has(f.capitulo));

  const [abierto, setAbierto] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [leidos, setLeidos] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE_LEIDOS) ?? "[]");
      if (Array.isArray(guardado)) setLeidos(new Set(guardado.filter((x) => typeof x === "string")));
    } catch {
      // Sin almacenamiento: el avance no se recuerda, el manual sigue andando.
    }
  }, []);

  const marcarLeido = (id: string, leido: boolean) => {
    setLeidos((antes) => {
      const n = new Set(antes);
      if (leido) n.add(id);
      else n.delete(id);
      try {
        localStorage.setItem(CLAVE_LEIDOS, JSON.stringify([...n]));
      } catch {
        // Ídem.
      }
      return n;
    });
  };

  const irACapitulo = (id: string) => {
    setAbierto(id);
    setBusqueda("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const capitulo = capitulos.find((c) => c.id === abierto) ?? null;
  const leidosVisibles = capitulos.filter((c) => leidos.has(c.id)).length;

  return (
    <div data-manual style={{ maxWidth: 1180, margin: "0 auto" }}>
      <style>{`
        [data-manual] .man-tarjeta { transition: transform .15s ease, box-shadow .15s ease; }
        [data-manual] .man-tarjeta:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(3,27,79,.14); }
        [data-manual] .man-punto { transition: transform .12s ease; }
        [data-manual] .man-punto:hover { transform: translate(-50%, -50%) scale(1.15) !important; }
        @keyframes man-latido { 0%,100% { box-shadow: 0 0 0 0 ${tinte(accent, 40)}; } 50% { box-shadow: 0 0 0 7px ${tinte(accent, 0)}; } }
      `}</style>

      {/* ── Encabezado: título, buscador y avance ─────────────────────────── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${softer(accent)} 0%, ${T.surface} 70%)`,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          padding: "22px 24px",
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 40 }} aria-hidden>
            📘
          </span>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: T.ink }}>Manual del CRM</h2>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
              Todo lo que necesitas para trabajar en el CRM, con la pantalla de verdad. Toca un capítulo, o
              escribe tu duda aquí abajo.
            </p>
          </div>
          <div style={{ flex: "0 1 260px", minWidth: 200 }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>
              Llevas <strong style={{ color: T.ink }}>{leidosVisibles}</strong> de {capitulos.length} capítulos
            </div>
            <div style={{ height: 8, borderRadius: 4, background: T.border, overflow: "hidden" }}>
              <div
                style={{
                  width: `${(leidosVisibles / Math.max(1, capitulos.length)) * 100}%`,
                  height: "100%",
                  background: accent,
                  transition: "width .3s ease",
                }}
              />
            </div>
          </div>
        </div>
        <div style={{ position: "relative", marginTop: 16 }}>
          <span aria-hidden style={{ position: "absolute", left: 14, top: 11, fontSize: 16 }}>
            🔍
          </span>
          <input
            data-manual-buscar
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="¿Qué quieres saber? Ej.: plantilla, recordatorio, pasar un lead…"
            style={{
              width: "100%",
              height: 44,
              padding: "0 14px 0 42px",
              fontSize: 14.5,
              borderRadius: 22,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.ink,
              boxShadow: "0 2px 8px rgba(3,27,79,.06)",
            }}
          />
        </div>
      </div>

      {busqueda.trim() ? (
        <Resultados busqueda={busqueda} capitulos={capitulos} frecuentes={frecuentes} accent={accent} onIr={irACapitulo} />
      ) : capitulo ? (
        <VistaCapitulo
          c={capitulo}
          accent={accent}
          leido={leidos.has(capitulo.id)}
          siguiente={capitulos[capitulos.indexOf(capitulo) + 1] ?? null}
          onVolver={() => setAbierto(null)}
          onIrA={onIrA}
          onLeido={(v) => marcarLeido(capitulo.id, v)}
          onSiguiente={irACapitulo}
        />
      ) : (
        <Inicio
          capitulos={capitulos}
          frecuentes={frecuentes}
          leidos={leidos}
          accent={accent}
          onAbrir={irACapitulo}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Inicio: los capítulos, las preguntas frecuentes y el glosario
// ════════════════════════════════════════════════════════════════════════════

function Inicio({
  capitulos,
  frecuentes,
  leidos,
  accent,
  onAbrir,
}: {
  capitulos: Capitulo[];
  frecuentes: typeof FRECUENTES;
  leidos: ReadonlySet<string>;
  accent: string;
  onAbrir: (id: string) => void;
}) {
  return (
    <>
      <Titulo>¿Qué quieres aprender hoy?</Titulo>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 28 }}>
        {capitulos.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className="man-tarjeta"
            data-manual-capitulo={c.id}
            onClick={() => onAbrir(c.id)}
            style={{
              textAlign: "left",
              background: T.surface,
              border: `1px solid ${leidos.has(c.id) ? accent : T.border}`,
              borderRadius: 12,
              padding: "14px 16px",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 26 }} aria-hidden>
                {c.emoji}
              </span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: T.ink }}>{c.titulo}</span>
              {leidos.has(c.id) ? (
                <span title="Ya lo leíste" style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: accent, borderRadius: 10, padding: "2px 8px" }}>
                  ✓ Leído
                </span>
              ) : (
                i === 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: accent, background: softer(accent), borderRadius: 10, padding: "2px 8px" }}>
                    Empieza aquí
                  </span>
                )
              )}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: T.muted, lineHeight: 1.45 }}>{c.resumen}</p>
          </button>
        ))}
      </div>

      <Titulo>Preguntas frecuentes</Titulo>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
        {frecuentes.map((f) => (
          <Desplegable key={f.pregunta} titulo={f.pregunta} accent={accent}>
            <p style={{ margin: 0, fontSize: 13.5, color: T.ink, lineHeight: 1.55 }}>{f.respuesta}</p>
            {f.capitulo && (
              <button type="button" onClick={() => onAbrir(f.capitulo!)} style={{ ...enlace(accent), marginTop: 8 }}>
                Ver el capítulo →
              </button>
            )}
          </Desplegable>
        ))}
      </div>

      <Titulo>Glosario: las palabras del CRM</Titulo>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 12 }}>
        {GLOSARIO.map((g) => (
          <div key={g.termino} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "11px 14px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: accent }}>{g.termino}</div>
            <div style={{ fontSize: 12.5, color: T.ink, marginTop: 3, lineHeight: 1.5 }}>{g.significado}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: T.muted, textAlign: "center", margin: "20px 0 4px" }}>
        ¿No encontraste lo que buscabas? Pregúntale a tu jefa o a una administradora: lo agregamos al manual.
      </p>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Un capítulo
// ════════════════════════════════════════════════════════════════════════════

function VistaCapitulo({
  c,
  accent,
  leido,
  siguiente,
  onVolver,
  onIrA,
  onLeido,
  onSiguiente,
}: {
  c: Capitulo;
  accent: string;
  leido: boolean;
  siguiente: Capitulo | null;
  onVolver: () => void;
  onIrA: (modulo: string) => void;
  onLeido: (v: boolean) => void;
  onSiguiente: (id: string) => void;
}) {
  return (
    <div data-manual-abierto={c.id}>
      <button type="button" onClick={onVolver} style={{ ...enlace(accent), marginBottom: 12 }}>
        ← Todos los capítulos
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <span style={{ fontSize: 44, lineHeight: 1 }} aria-hidden>
          {c.emoji}
        </span>
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: T.ink }}>{c.titulo}</h2>
          <p style={{ margin: "6px 0 0", fontSize: 15, color: T.ink, lineHeight: 1.5 }}>{c.resumen}</p>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: T.muted }}>👤 {c.paraQuien}</p>
        </div>
        {c.modulo && (
          <button
            type="button"
            onClick={() => onIrA(c.modulo!)}
            style={{ height: 38, padding: "0 16px", borderRadius: 19, background: accent, color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            Ir a {c.modulo} →
          </button>
        )}
      </div>

      {c.fotos.map((f) => (
        <FotoConPuntos key={f.archivo} foto={f} accent={accent} />
      ))}

      {c.guias.length > 0 && (
        <>
          <Titulo>¿Cómo hago…?</Titulo>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {c.guias.map((g, i) => (
              <Desplegable key={g.pregunta} titulo={g.pregunta} accent={accent} abierto={i === 0}>
                <PasoAPaso guia={g} accent={accent} />
              </Desplegable>
            ))}
          </div>
        </>
      )}

      {c.consejos.length > 0 && (
        <>
          <Titulo>Consejos</Titulo>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 24 }}>
            {c.consejos.map((t) => (
              <div key={t} style={{ display: "flex", gap: 10, background: "#FFF8E1", border: "1px solid #F5E2A8", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#4A3B12", lineHeight: 1.5 }}>
                <span aria-hidden>💡</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {c.rapida && <Rapida p={c.rapida} accent={accent} />}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.ink, cursor: "pointer" }}>
          <input type="checkbox" data-manual-leido checked={leido} onChange={(e) => onLeido(e.target.checked)} style={{ width: 18, height: 18, accentColor: accent }} />
          Ya lo leí
        </label>
        {siguiente && (
          <button
            type="button"
            onClick={() => {
              onLeido(true);
              onSiguiente(siguiente.id);
            }}
            style={{ height: 38, padding: "0 16px", borderRadius: 19, border: `1px solid ${accent}`, color: accent, background: T.surface, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            Siguiente: {siguiente.emoji} {siguiente.titulo} →
          </button>
        )}
      </div>
    </div>
  );
}

/** La foto de la pantalla con los números encima, y la explicación de cada uno. */
function FotoConPuntos({ foto, accent }: { foto: Foto; accent: string }) {
  const cajas = PUNTOS[foto.archivo] ?? {};
  const [activo, setActivo] = useState<number | null>(foto.partes[0]?.n ?? null);
  const [grande, setGrande] = useState(false);
  const [falta, setFalta] = useState(false);
  const caja = activo != null ? cajas[String(activo)] : undefined;

  const imagen = (
    // `overflow: hidden` para que el sombreado de la parte elegida no se salga
    // de la foto y oscurezca la página entera.
    <div style={{ position: "relative", lineHeight: 0, overflow: "hidden", borderRadius: 8 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/manual/${foto.archivo}.jpg`}
        alt={foto.pie}
        onError={() => setFalta(true)}
        style={{ width: "100%", height: "auto", display: falta ? "none" : "block", borderRadius: 8 }}
      />
      {falta && (
        <div style={{ lineHeight: 1.5, padding: "40px 20px", textAlign: "center", color: T.muted, fontSize: 13, background: T.paper, borderRadius: 8 }}>
          🖼️ La imagen de esta pantalla todavía no está.
        </div>
      )}
      {!falta && caja && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${caja.x}%`,
            top: `${caja.y}%`,
            width: `${caja.w}%`,
            height: `${caja.h}%`,
            border: `3px solid ${accent}`,
            borderRadius: 8,
            boxShadow: `0 0 0 9999px rgba(3,27,79,0.18)`,
            pointerEvents: "none",
            transition: "all .2s ease",
          }}
        />
      )}
      {!falta &&
        foto.partes.map((p) => {
          const k = cajas[String(p.n)];
          if (!k) return null;
          const sel = activo === p.n;
          return (
            <button
              key={p.n}
              type="button"
              className="man-punto"
              data-manual-punto={p.n}
              aria-label={`${p.n}. ${p.titulo}`}
              onClick={(e) => {
                e.stopPropagation();
                setActivo(p.n);
              }}
              style={{
                position: "absolute",
                // Al borde izquierdo de la parte, a media altura, y sin salirse de la foto.
                left: `${Math.min(97, Math.max(2.5, k.x))}%`,
                top: `${Math.min(96, Math.max(3.5, k.y + k.h / 2))}%`,
                transform: "translate(-50%, -50%)",
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: sel ? accent : "#fff",
                color: sel ? "#fff" : accent,
                border: `2px solid ${accent}`,
                fontSize: 13,
                fontWeight: 800,
                lineHeight: "22px",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(3,27,79,.3)",
                animation: sel ? "none" : "man-latido 2s ease-in-out infinite",
              }}
            >
              {p.n}
            </button>
          );
        })}
    </div>
  );

  return (
    <figure data-manual-foto={foto.archivo} style={{ margin: "0 0 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: foto.partes.length ? "minmax(0, 1fr) minmax(240px, 320px)" : "1fr", gap: 16, alignItems: "start" }} className="man-foto">
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 8, cursor: falta ? "default" : "zoom-in" }} onClick={() => !falta && setGrande(true)}>
          {imagen}
        </div>
        {foto.partes.length > 0 && (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {foto.partes.map((p) => {
              const sel = activo === p.n;
              return (
                <li key={p.n}>
                  <button
                    type="button"
                    onClick={() => setActivo(p.n)}
                    onMouseEnter={() => setActivo(p.n)}
                    style={{
                      display: "flex",
                      gap: 10,
                      width: "100%",
                      textAlign: "left",
                      padding: "9px 11px",
                      borderRadius: 10,
                      border: `1px solid ${sel ? accent : T.border}`,
                      background: sel ? softer(accent) : T.surface,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: accent, color: "#fff", fontSize: 12, fontWeight: 800, textAlign: "center", lineHeight: "22px" }}>
                      {p.n}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: "block", fontSize: 13, color: T.ink }}>{p.titulo}</strong>
                      {sel && <span style={{ display: "block", fontSize: 12.5, color: T.ink, marginTop: 3, lineHeight: 1.5 }}>{p.texto}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <figcaption style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>🖼️ {foto.pie} {!falta && "Toca la imagen para verla en grande."}</figcaption>

      {grande && (
        <div
          role="dialog"
          aria-label="Imagen en grande"
          onClick={() => setGrande(false)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(3,27,79,.7)", display: "grid", placeItems: "center", padding: 20, cursor: "zoom-out" }}
        >
          <div style={{ width: "min(1400px, 100%)", background: T.surface, borderRadius: 12, padding: 10 }} onClick={(e) => e.stopPropagation()}>
            {imagen}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, lineHeight: 1 }}>
              <button type="button" onClick={() => setGrande(false)} style={{ height: 32, padding: "0 14px", borderRadius: 6, background: accent, color: "#fff", fontSize: 13, cursor: "pointer" }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@media (max-width: 860px) { [data-manual-foto="${foto.archivo}"] .man-foto { grid-template-columns: 1fr !important; } }`}</style>
    </figure>
  );
}

function PasoAPaso({ guia, accent }: { guia: Guia; accent: string }) {
  const [hecho, setHecho] = useState<ReadonlySet<number>>(() => new Set());
  return (
    <div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {guia.pasos.map((p, i) => {
          const listo = hecho.has(i);
          return (
            <li key={p}>
              <button
                type="button"
                onClick={() =>
                  setHecho((s) => {
                    const n = new Set(s);
                    if (n.has(i)) n.delete(i);
                    else n.add(i);
                    return n;
                  })
                }
                title="Tócalo para marcarlo como hecho"
                style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%", textAlign: "left", cursor: "pointer", padding: 0 }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: listo ? accent : softer(accent),
                    color: listo ? "#fff" : accent,
                    fontSize: 13,
                    fontWeight: 800,
                    textAlign: "center",
                    lineHeight: "26px",
                  }}
                >
                  {listo ? "✓" : i + 1}
                </span>
                <span style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.55, paddingTop: 3, textDecoration: listo ? "line-through" : "none", opacity: listo ? 0.6 : 1 }}>
                  {p}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {guia.nota && (
        <p style={{ margin: "12px 0 0", padding: "9px 12px", borderRadius: 8, background: T.paper, fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>
          👉 {guia.nota}
        </p>
      )}
    </div>
  );
}

function Rapida({ p, accent }: { p: PreguntaRapida; accent: string }) {
  const [elegida, setElegida] = useState<number | null>(null);
  const bien = elegida === p.correcta;
  return (
    <div data-manual-rapida style={{ background: T.surface, border: `2px dashed ${accent}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: ".04em" }}>🎯 PREGUNTA RÁPIDA</div>
      <p style={{ margin: "6px 0 12px", fontSize: 15, fontWeight: 600, color: T.ink }}>{p.pregunta}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {p.opciones.map((o, i) => {
          const es = elegida === i;
          const color = elegida == null ? T.border : i === p.correcta ? "#2F6B4F" : es ? "#B85042" : T.border;
          return (
            <button
              key={o}
              type="button"
              onClick={() => setElegida(i)}
              style={{
                textAlign: "left",
                padding: "10px 14px",
                borderRadius: 10,
                border: `2px solid ${color}`,
                background: elegida != null && i === p.correcta ? "#E6F0E9" : es ? "#F7EBE9" : T.surface,
                fontSize: 13.5,
                color: T.ink,
                cursor: "pointer",
              }}
            >
              {elegida != null && i === p.correcta ? "✅ " : es ? "❌ " : ""}
              {o}
            </button>
          );
        })}
      </div>
      {elegida != null && (
        <p style={{ margin: "12px 0 0", fontSize: 13.5, color: bien ? "#2F6B4F" : "#8C3B2F", lineHeight: 1.5 }}>
          <strong>{bien ? "¡Exacto! " : "Casi. "}</strong>
          {p.porque}
        </p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// El buscador
// ════════════════════════════════════════════════════════════════════════════

interface Hallazgo {
  capitulo: Capitulo | null;
  tipo: string;
  titulo: string;
  texto: string;
}

/** Sin tildes ni mayúsculas, para que «plantilla» encuentre «Plantillas». */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Resultados({
  busqueda,
  capitulos,
  frecuentes,
  accent,
  onIr,
}: {
  busqueda: string;
  capitulos: Capitulo[];
  frecuentes: typeof FRECUENTES;
  accent: string;
  onIr: (id: string) => void;
}) {
  const palabras = plano(busqueda).split(/\s+/).filter((p) => p.length > 1);
  const coincide = (...t: string[]) => {
    const todo = plano(t.join(" "));
    return palabras.every((p) => todo.includes(p));
  };

  const hallazgos: Hallazgo[] = [];
  for (const c of capitulos) {
    if (coincide(c.titulo, c.resumen)) hallazgos.push({ capitulo: c, tipo: "Capítulo", titulo: `${c.emoji} ${c.titulo}`, texto: c.resumen });
    for (const g of c.guias) if (coincide(g.pregunta, ...g.pasos, g.nota ?? "")) hallazgos.push({ capitulo: c, tipo: "¿Cómo hago…?", titulo: g.pregunta, texto: g.pasos.join(" → ") });
    for (const f of c.fotos) for (const p of f.partes) if (coincide(p.titulo, p.texto)) hallazgos.push({ capitulo: c, tipo: "En la pantalla", titulo: `${c.titulo}: ${p.titulo}`, texto: p.texto });
    for (const t of c.consejos) if (coincide(t)) hallazgos.push({ capitulo: c, tipo: "Consejo", titulo: c.titulo, texto: t });
  }
  for (const f of frecuentes) {
    if (coincide(f.pregunta, f.respuesta)) {
      hallazgos.push({ capitulo: capitulos.find((c) => c.id === f.capitulo) ?? null, tipo: "Pregunta frecuente", titulo: f.pregunta, texto: f.respuesta });
    }
  }
  for (const g of GLOSARIO) if (coincide(g.termino, g.significado)) hallazgos.push({ capitulo: null, tipo: "Glosario", titulo: g.termino, texto: g.significado });

  if (hallazgos.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: T.muted, fontSize: 14 }}>
        <div style={{ fontSize: 36 }}>🤔</div>
        No encontramos nada con «{busqueda}». Prueba con otra palabra (por ejemplo «chat», «venta», «recordatorio») o pregúntale a tu jefa.
      </div>
    );
  }

  return (
    <div data-manual-resultados>
      <Titulo>
        {hallazgos.length} resultado{hallazgos.length === 1 ? "" : "s"}
      </Titulo>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hallazgos.slice(0, 40).map((h, i) => (
          <button
            key={`${h.tipo}-${h.titulo}-${i}`}
            type="button"
            disabled={!h.capitulo}
            onClick={() => h.capitulo && onIr(h.capitulo.id)}
            className={h.capitulo ? "man-tarjeta" : undefined}
            style={{ textAlign: "left", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "11px 14px", cursor: h.capitulo ? "pointer" : "default" }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>{h.tipo}</span>
            <strong style={{ display: "block", fontSize: 14, color: T.ink, marginTop: 2 }}>{h.titulo}</strong>
            <span style={{ display: "block", fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{h.texto}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Piezas chicas
// ════════════════════════════════════════════════════════════════════════════

function Titulo({ children }: { children: ReactNode }) {
  return <h3 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 600, color: T.ink }}>{children}</h3>;
}

function Desplegable({
  titulo,
  accent,
  abierto = false,
  children,
}: {
  titulo: string;
  accent: string;
  abierto?: boolean;
  children: ReactNode;
}) {
  const [ver, setVer] = useState(abierto);
  return (
    <div style={{ background: T.surface, border: `1px solid ${ver ? accent : T.border}`, borderRadius: 10, overflow: "hidden" }}>
      <button
        type="button"
        aria-expanded={ver}
        onClick={() => setVer((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 14px", fontSize: 14, fontWeight: 600, color: T.ink, cursor: "pointer" }}
      >
        <span style={{ flex: 1 }}>{titulo}</span>
        <span style={{ color: accent, fontSize: 18, transform: ver ? "rotate(45deg)" : "none", transition: "transform .15s ease" }}>+</span>
      </button>
      {ver && <div style={{ padding: "0 16px 14px" }}>{children}</div>}
    </div>
  );
}

const enlace = (accent: string): CSSProperties => ({
  fontSize: 13,
  fontWeight: 600,
  color: accent,
  cursor: "pointer",
  padding: 0,
});
