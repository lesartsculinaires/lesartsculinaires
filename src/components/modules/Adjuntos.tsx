"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { borrarAdjunto, listarAdjuntos, registrarAdjunto } from "@/app/adjuntos-actions";
import {
  ACEPTA,
  esImagen,
  nombreCorto,
  peso,
  porExtension,
  revisar,
  rutaPara,
  type Adjunto,
} from "@/lib/adjuntos";
import { fechaCorta } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/browser";
import { T } from "@/lib/theme";

interface Props {
  oportunidadId: number;
  accent: string;
  /**
   * Se llama cuando algo cambió de verdad: subir o quitar un archivo.
   *
   * Subir y quitar dejan una línea en la bitácora, así que quien la muestra
   * tiene que enterarse. Se avisa desde acá en vez de que la bitácora se
   * recargue sola cada tanto: una recarga a destiempo no muestra nada y una
   * cada pocos segundos consulta la base sin motivo casi siempre.
   */
  onCambio?: () => void;
}

const BALDE = "adjuntos";

/**
 * Documentos de una oportunidad: la papelería del cliente y los comprobantes
 * de transferencia.
 *
 * El archivo va del navegador al almacenamiento de Supabase sin pasar por el
 * servidor de la aplicación. No es un atajo: una Server Action acepta 1 MB de
 * cuerpo por omisión, y una foto de transferencia sacada con el celular pesa
 * más que eso. Recién cuando el archivo está arriba se anota la ficha.
 *
 * Se sube ni bien se elige el archivo, sin un botón de confirmar aparte. Quien
 * está atendiendo agrega el comprobante y sigue escribiendo; un segundo paso
 * es un paso que se olvida, y el archivo quedaría sin subir.
 */
export function Adjuntos({ oportunidadId, accent, onCambio }: Props) {
  const [lista, setLista] = useState<Adjunto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const entrada = useRef<HTMLInputElement | null>(null);

  /**
   * Al desmontar se deja de escribir en el estado.
   *
   * Una subida puede tardar; si mientras tanto cierran la ficha, el componente
   * ya no está y React avisa por cada `setState` que llegue tarde.
   */
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const recargar = useCallback(async () => {
    const r = await listarAdjuntos(oportunidadId);
    if (!vivo.current) return;
    setFaltaMigracion(r.faltaMigracion);
    if (r.ok) setLista(r.adjuntos);
    else setError(r.error);
    setCargando(false);
  }, [oportunidadId]);

  useEffect(() => {
    setCargando(true);
    void recargar();
  }, [recargar]);

  const subir = useCallback(
    async (archivos: File[]) => {
      if (archivos.length === 0) return;
      setError(null);

      // Se revisan todos antes de subir ninguno: avisar de a uno haría que
      // quien eligió cinco archivos descubra el problema del quinto después de
      // esperar los cuatro primeros.
      const malos = archivos.map(revisar).filter((m): m is string => m != null);
      if (malos.length > 0) {
        setError(malos.join(" "));
        return;
      }

      const supabase = getBrowserClient();

      for (const archivo of archivos) {
        if (!vivo.current) return;
        setSubiendo((s) => [...s, archivo.name]);

        const tipo = archivo.type || porExtension(archivo.name);
        const ruta = rutaPara(oportunidadId, archivo.name);

        const { error: errSubida } = await supabase.storage
          .from(BALDE)
          .upload(ruta, archivo, { contentType: tipo, upsert: false });

        if (errSubida) {
          if (vivo.current) {
            setSubiendo((s) => s.filter((n) => n !== archivo.name));
            setError(`No se pudo subir «${archivo.name}»: ${errSubida.message}`);
          }
          continue;
        }

        const r = await registrarAdjunto({
          oportunidadId,
          ruta,
          nombre: archivo.name,
          tipoMime: tipo,
          tamanoBytes: archivo.size,
        });

        if (!vivo.current) return;
        setSubiendo((s) => s.filter((n) => n !== archivo.name));
        if (!r.ok) setError(r.error);
      }

      if (vivo.current) {
        await recargar();
        onCambio?.();
      }
    },
    [oportunidadId, recargar, onCambio],
  );

  /**
   * Pegar con Ctrl+V.
   *
   * Es el camino corto para lo que más se sube: se recorta la pantalla del
   * comprobante y se pega. Sin esto habría que guardar la imagen en el
   * escritorio primero, buscarla en el selector y recién ahí adjuntarla.
   */
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      const imagenes = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (imagenes.length === 0) return;
      e.preventDefault();
      // Una captura pegada no trae nombre; sin uno propio todas se llamarían
      // «image.png» y en la lista no se distinguirían.
      const conNombre = imagenes.map((f, i) => {
        const ext = f.type.split("/")[1] ?? "png";
        const sello = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
        return new File([f], `captura-${sello}${i ? `-${i + 1}` : ""}.${ext}`, {
          type: f.type,
        });
      });
      void subir(conNombre);
    };

    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  }, [subir]);

  const quitar = async (a: Adjunto) => {
    if (!window.confirm(`¿Quitar «${a.nombre}»? Esto no se puede deshacer.`)) return;
    setError(null);
    const r = await borrarAdjunto(a.id);
    if (!vivo.current) return;
    if (!r.ok) setError(r.error);
    await recargar();
    onCambio?.();
  };

  if (faltaMigracion) {
    return (
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.5 }}>
        Para poder adjuntar documentos falta correr la migración{" "}
        <code>20260818120000_adjuntos.sql</code> en Supabase.
      </p>
    );
  }

  const boton = {
    height: 34,
    padding: "0 14px",
    fontSize: 12.5,
    borderRadius: 7,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.ink,
    cursor: "pointer",
  } as const;

  return (
    <div style={{ marginTop: 10 }}>
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACEPTA}
        style={{ display: "none" }}
        onChange={(e) => {
          const elegidos = Array.from(e.target.files ?? []);
          // Se limpia el valor para que elegir el mismo archivo dos veces
          // seguidas vuelva a disparar el cambio.
          e.target.value = "";
          void subir(elegidos);
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={subiendo.length > 0}
          style={{
            ...boton,
            cursor: subiendo.length > 0 ? "wait" : "pointer",
            color: subiendo.length > 0 ? T.faint : T.ink,
          }}
        >
          {subiendo.length > 0 ? "Subiendo…" : "Adjuntar documento"}
        </button>
        <span style={{ fontSize: 11, color: T.faint, lineHeight: 1.4 }}>
          Fotos, PDF, texto, Word o Excel, hasta 15 MB. También podés pegar una
          captura con Ctrl+V.
        </span>
      </div>

      {error && (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#A33", lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      {subiendo.map((n) => (
        <div key={n} style={{ marginTop: 8, fontSize: 12, color: T.muted }}>
          Subiendo {nombreCorto(n)}…
        </div>
      ))}

      {!cargando && lista.length > 0 && (
        <div
          style={{
            marginTop: 10,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {lista.map((a, i) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 11px",
                borderTop: i ? `1px solid ${T.border}` : "none",
                background: T.surface,
              }}
            >
              {/* La miniatura vale la pena: entre seis comprobantes casi
                  iguales, el nombre del archivo no distingue ninguno. */}
              {esImagen(a.tipoMime) && a.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.url}
                  alt=""
                  style={{
                    width: 38,
                    height: 38,
                    objectFit: "cover",
                    borderRadius: 5,
                    border: `1px solid ${T.border}`,
                    flexShrink: 0,
                  }}
                />
              ) : (
                <span
                  aria-hidden
                  style={{
                    width: 38,
                    height: 38,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 5,
                    background: T.paper,
                    border: `1px solid ${T.border}`,
                    fontSize: 10,
                    fontWeight: 700,
                    color: T.muted,
                    flexShrink: 0,
                  }}
                >
                  {(a.nombre.split(".").pop() ?? "?").slice(0, 4).toUpperCase()}
                </span>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: T.ink, wordBreak: "break-word" }}>
                  {nombreCorto(a.nombre)}
                </div>
                <div style={{ fontSize: 11, color: T.faint }}>
                  {[peso(a.tamanoBytes), fechaCorta(a.creadoEn)].filter(Boolean).join(" · ")}
                </div>
              </div>

              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 11.5,
                    padding: "3px 9px",
                    borderRadius: 6,
                    border: `1px solid ${T.border}`,
                    color: accent,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Abrir
                </a>
              )}

              {/* El botón sólo aparece si le corresponde. Un administrador
                  puede quitar cualquiera, pero eso lo resuelve la base: acá se
                  esconde el de los ajenos para no ofrecer algo que va a
                  fallar. */}
              {a.propio && (
                <button
                  type="button"
                  onClick={() => void quitar(a)}
                  title="Quitar este adjunto"
                  style={{
                    fontSize: 11.5,
                    padding: "3px 9px",
                    borderRadius: 6,
                    border: `1px solid ${T.border}`,
                    background: T.surface,
                    color: T.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
