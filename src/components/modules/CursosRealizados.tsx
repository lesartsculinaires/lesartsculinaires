"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  agregarCurso,
  listarCursos,
  quitarCurso,
  type CursoRealizado,
} from "@/app/cursos-actions";
import { useCatalogo } from "@/lib/catalog";
import type { Cambio, Pendientes } from "@/lib/cambios";
import { fechaCorta } from "@/lib/format";
import { T } from "@/lib/theme";

interface Props {
  clienteId: number;
  accent: string;
  /** Lo que está en espera de confirmarse, para poder pintarlo. */
  pendientes: Pendientes;
  /** Anota un alta o una baja. No toca la base: eso pasa al aceptar. */
  onAnotar: (cambio: Cambio) => void;
  /** Deshace algo anotado que todavía no se guardó. */
  onDeshacer: (clave: string) => void;
  /** Sube cuando la ficha aplicó los cambios: hay que releer la lista. */
  refresco: number;
  /**
   * Se llama cuando un alta o una baja terminó de escribirse.
   *
   * La ficha no puede saber cuándo pasa eso: `aplicar` no devuelve nada, así
   * que desde afuera sólo se puede esperar un rato y adivinar. Avisando desde
   * acá la lista se relee justo cuando hay algo nuevo que leer.
   */
  onAplicado?: () => void;
}

/**
 * Qué cursó antes esta persona.
 *
 * Sirve para dos cosas concretas: no ofrecerle un programa que ya hizo, y
 * saber que es alumno de la casa cuando se discute un precio.
 *
 * Agregar y quitar NO tocan la base al momento: quedan anotados como el resto
 * de la ficha y se aplican con «Guardar cambios». Antes se guardaban solos, y
 * eso rompía la promesa del resto de la pantalla —«nada se guarda hasta que
 * uses Guardar cambios»—; peor todavía con quitar, que borraba de verdad
 * mientras el botón de abajo seguía diciendo que no había nada sin guardar.
 *
 * Mientras tanto la lista muestra los dos estados: lo que va a entrar, y lo
 * que va a salir tachado, los dos con su aviso al lado. Así se ve cómo va a
 * quedar antes de que quede.
 */
export function CursosRealizados({
  clienteId,
  accent,
  pendientes,
  onAnotar,
  onDeshacer,
  refresco,
  onAplicado,
}: Props) {
  const cat = useCatalogo();
  const [cursos, setCursos] = useState<CursoRealizado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);

  // El formulario de alta. `producto` vacío significa «lo escribo yo».
  const [producto, setProducto] = useState<string>("");
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  /**
   * Para que dos altas seguidas no compartan clave.
   *
   * Va en un ref y no en el estado: cambiarlo no tiene que repintar nada, y
   * con estado dos clics rápidos podrían leer el mismo número.
   */
  const contador = useRef(0);

  const cargar = useCallback(async () => {
    const r = await listarCursos(clienteId);
    setFaltaMigracion(r.faltaMigracion);
    if (r.ok) {
      setCursos(r.cursos);
      setError(null);
    } else {
      setError(r.error);
    }
    setCargando(false);
  }, [clienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar, refresco]);

  const anotarAlta = () => {
    setError(null);

    const nombreEscrito = nombre.trim();
    const productoId = producto ? Number(producto) : null;
    if (productoId == null && !nombreEscrito) return;

    if (desde && hasta && hasta < desde) {
      setError("La fecha de fin es anterior a la de inicio.");
      return;
    }

    const comoSeLlama =
      productoId != null
        ? (cat.productos.find((p) => p.id === productoId)?.nombre ?? "Programa")
        : nombreEscrito;

    const clave = `curso_alta_${(contador.current += 1)}`;

    onAnotar({
      clave,
      etiqueta: "Curso realizado",
      // Sin valor previo: es un alta. La pantalla de confirmación lo muestra
      // como «(vacío) → Diplomado…», que se lee como lo que es.
      antes: "",
      despues: `${comoSeLlama} · ${periodoDe(desde || null, hasta || null)}`,
      aplicar: () => {
        void agregarCurso({
          clienteId,
          productoId,
          nombre: productoId == null ? nombreEscrito : null,
          iniciaEn: desde || null,
          terminaEn: hasta || null,
        }).then(() => onAplicado?.());
      },
    });

    setProducto("");
    setNombre("");
    setDesde("");
    setHasta("");
  };

  const anotarBaja = (c: CursoRealizado) => {
    onAnotar({
      clave: `curso_baja_${c.id}`,
      etiqueta: "Curso realizado",
      antes: `${c.nombre} · ${periodo(c)}`,
      despues: "",
      aplicar: () => {
        void quitarCurso(c.id).then(() => onAplicado?.());
      },
    });
  };

  if (faltaMigracion) {
    return (
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.5 }}>
        Para llevar este historial falta correr la migración{" "}
        <code>20260826120000_cursos_realizados.sql</code> en Supabase.
      </p>
    );
  }

  // Lo anotado que todavía no se guardó, separado en altas y bajas.
  const altas = [...pendientes.values()].filter((c) => c.clave.startsWith("curso_alta_"));
  const bajas = new Set(
    [...pendientes.keys()]
      .filter((k) => k.startsWith("curso_baja_"))
      .map((k) => Number(k.slice("curso_baja_".length))),
  );

  const puedeAgregar = Boolean(producto || nombre.trim());
  const vacio = !cargando && cursos.length === 0 && altas.length === 0;

  return (
    <div style={{ marginTop: 10 }}>
      {(cursos.length > 0 || altas.length > 0) && (
        <div
          style={{
            border: `1px solid ${T.border}`,
            borderRadius: 9,
            overflow: "hidden",
            marginBottom: 10,
          }}
        >
          {cursos.map((c, i) => {
            const seVa = bajas.has(c.id);
            return (
              <Fila
                key={c.id}
                primera={i === 0}
                titulo={c.nombre}
                detalle={periodo(c)}
                tachado={seVa}
                aviso={seVa ? "se quita al guardar" : null}
                accion={seVa ? "Deshacer" : "Quitar"}
                accent={accent}
                onAccion={() => (seVa ? onDeshacer(`curso_baja_${c.id}`) : anotarBaja(c))}
              />
            );
          })}

          {altas.map((c, i) => (
            <Fila
              key={c.clave}
              primera={cursos.length === 0 && i === 0}
              titulo={c.despues.split(" · ")[0]}
              detalle={c.despues.split(" · ").slice(1).join(" · ")}
              tachado={false}
              aviso="se agrega al guardar"
              accion="Deshacer"
              accent={accent}
              onAccion={() => onDeshacer(c.clave)}
            />
          ))}
        </div>
      )}

      {vacio && (
        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
          No tiene cursos anteriores registrados.
        </p>
      )}

      {/* --------------------------------------------------------- agregar */}
      <div style={{ display: "grid", gap: 6 }}>
        <select
          value={producto}
          onChange={(e) => {
            setProducto(e.target.value);
            // Elegir del catálogo descarta lo escrito, y viceversa: si los dos
            // quedaran cargados no habría forma de saber cuál vale.
            if (e.target.value) setNombre("");
          }}
          style={CAMPO}
        >
          <option value="">Otro (lo escribo)</option>
          {cat.productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        {!producto && (
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del curso o diplomado"
            style={CAMPO}
          />
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={ETIQUETA}>Inicio</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={CAMPO} />
          </label>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={ETIQUETA}>Fin</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={CAMPO} />
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={anotarAlta}
            disabled={!puedeAgregar}
            style={{
              height: 32,
              padding: "0 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 7,
              background: puedeAgregar ? accent : T.border,
              color: puedeAgregar ? "#fff" : T.faint,
              cursor: puedeAgregar ? "pointer" : "not-allowed",
            }}
          >
            Agregar curso
          </button>
          <span style={{ fontSize: 11, color: T.faint, lineHeight: 1.4 }}>
            Las fechas son opcionales. Se guarda con <strong>Guardar cambios</strong>.
          </span>
        </div>
      </div>

      {error && (
        <p style={{ margin: "7px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Fila({
  primera,
  titulo,
  detalle,
  tachado,
  aviso,
  accion,
  accent,
  onAccion,
}: {
  primera: boolean;
  titulo: string;
  detalle: string;
  tachado: boolean;
  aviso: string | null;
  accion: string;
  accent: string;
  onAccion: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 11px",
        borderTop: primera ? "none" : `1px solid ${T.border}`,
        background: aviso ? T.paper : T.surface,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            color: tachado ? T.faint : T.ink,
            textDecoration: tachado ? "line-through" : "none",
            wordBreak: "break-word",
          }}
        >
          {titulo}
        </div>
        <div style={{ fontSize: 11, color: T.faint }}>
          {detalle}
          {aviso && (
            <span style={{ color: T.warn }}>{detalle ? " · " : ""}{aviso}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onAccion}
        style={{
          flexShrink: 0,
          fontSize: 11.5,
          padding: "3px 9px",
          borderRadius: 6,
          border: `1px solid ${aviso ? accent : T.border}`,
          background: T.surface,
          color: aviso ? accent : T.muted,
          whiteSpace: "nowrap",
        }}
      >
        {accion}
      </button>
    </div>
  );
}

const CAMPO: React.CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 8px",
  fontSize: 12.5,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

const ETIQUETA: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.faint,
};

/**
 * «01/05/19 – 30/08/19», «desde 05/2019», o «sin fechas».
 *
 * De un curso viejo a veces sólo se sabe que se hizo. Mostrar «— – —» en ese
 * caso ocupa lugar para decir nada.
 */
function periodoDe(inicia: string | null, termina: string | null): string {
  if (inicia && termina) return `${fechaCorta(inicia)} – ${fechaCorta(termina)}`;
  if (inicia) return `desde ${fechaCorta(inicia)}`;
  if (termina) return `hasta ${fechaCorta(termina)}`;
  return "sin fechas";
}

const periodo = (c: CursoRealizado): string => periodoDe(c.iniciaEn, c.terminaEn);
