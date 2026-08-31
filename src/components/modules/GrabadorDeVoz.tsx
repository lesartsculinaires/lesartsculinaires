"use client";

import { useEffect, useRef, useState } from "react";

import { enviarArchivo } from "@/app/inbox-actions";
import { BALDE_WHATSAPP, CARPETA_SALIENTE } from "@/lib/whatsapp/adjuntos";
import { TIPO_OGG, webmAOgg } from "@/lib/audio/ogg";
import { getBrowserClient } from "@/lib/supabase/browser";
import { T } from "@/lib/theme";

/**
 * Grabar una nota de voz y mandarla.
 *
 * ============================================================================
 * QUÉ RESUELVE
 * ============================================================================
 *
 * Que se pueda contestar hablando. Media consulta de esta escuela se resuelve
 * mejor dicha que escrita —el temario, la forma de pago, por qué conviene un
 * diplomado y no un curso corto— y hasta ahora la asesora tenía que sacar el
 * teléfono, buscar el chat y mandarla desde ahí. Eso deja la nota afuera del
 * CRM: no queda en el hilo, no queda en la ficha, y nadie más se entera de qué
 * se le dijo al cliente.
 *
 * ============================================================================
 * SE ESCUCHA ANTES DE MANDARLA
 * ============================================================================
 *
 * WhatsApp manda al soltar el botón. Acá no: al parar queda un reproductor
 * para oírla, y recién después se manda. Es el mismo criterio que ya tienen
 * las fotos en esta bandeja —«la única pantalla entre elegir un archivo y que
 * lo tenga el cliente»— y acá pesa más todavía: una nota sale con la voz de
 * una persona, con el ruido de la oficina de fondo, y no se puede deshacer.
 *
 * ============================================================================
 * LO QUE PASA ENTRE PARAR Y MANDAR
 * ============================================================================
 *
 * El navegador graba en un envase que WhatsApp no abre, así que antes de subir
 * hay que cambiarlo. Eso lo hace `@/lib/audio/ogg` —está explicado ahí— y
 * tarda milisegundos, sin recodificar el sonido.
 *
 * Después el camino es el mismo que el de una foto: el archivo sube derecho al
 * bucket desde el navegador y al servidor le llega la ruta, no los bytes.
 */

/**
 * Tope de una nota, en segundos.
 *
 * Cinco minutos es larguísimo para una nota de voz y sigue estando muy por
 * debajo del tope de Meta. Existe sobre todo por el otro caso: una grabación
 * que quedó abierta sin que nadie se diera cuenta —se cambió de pestaña, sonó
 * el teléfono— y que sin esto seguiría grabando la oficina entera.
 */
const TOPE_SEGUNDOS = 5 * 60;

/** Lo que el navegador tiene que saber grabar. */
const FORMATO = "audio/webm;codecs=opus";

const reloj = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Fase = "quieto" | "grabando" | "escuchando" | "mandando";

export function GrabadorDeVoz({
  conversacionId,
  accent,
  disabled,
  onEnviado,
  onOcupado,
}: {
  conversacionId: number;
  accent: string;
  /** Verdadero sin token de WhatsApp o con la ventana de 24 horas cerrada. */
  disabled: boolean;
  onEnviado: () => void;
  /**
   * Avisa cuando el grabador ocupa la fila entera.
   *
   * La bandeja lo usa para esconder el cuadro de texto mientras se graba. Una
   * nota de voz no lleva pie —Meta no lo acepta en un audio— así que dejarlo a
   * la vista invitaría a escribir algo que no va a salir con la nota.
   */
  onOcupado: (ocupado: boolean) => void;
}) {
  const [fase, setFase] = useState<Fase>("quieto");
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** La nota grabada, lista para oírse y mandarse. */
  const [nota, setNota] = useState<{ bytes: Uint8Array; url: string } | null>(null);

  const grabadora = useRef<MediaRecorder | null>(null);
  const micro = useRef<MediaStream | null>(null);
  const trozos = useRef<Blob[]>([]);
  /**
   * Si la grabación se abandonó.
   *
   * Hace falta porque parar la grabadora no es inmediato: el último pedazo de
   * audio llega en un evento posterior. Sin esta marca, cancelar y que después
   * llegara ese evento armaría igual la nota y la dejaría en pantalla, lista
   * para mandarse, cuando la persona ya había dicho que no.
   */
  const cancelado = useRef(false);

  /** Suelta el micrófono. Sin esto el navegador deja el punto rojo encendido. */
  const soltarMicro = () => {
    micro.current?.getTracks().forEach((t) => t.stop());
    micro.current = null;
  };

  // El reloj de la grabación, y el corte por tiempo.
  useEffect(() => {
    if (fase !== "grabando") return;

    const t = setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= TOPE_SEGUNDOS) {
          // Se para sola. `parar` es estable durante la grabación porque sólo
          // toca refs, así que llamarla desde acá no reinicia el intervalo.
          grabadora.current?.stop();
        }
        return s + 1;
      });
    }, 1000);

    return () => clearInterval(t);
  }, [fase]);

  // Que la bandeja sepa si el grabador está ocupando la fila.
  useEffect(() => {
    onOcupado(fase !== "quieto");
  }, [fase, onOcupado]);

  // Al desmontarse —cambiar de conversación, cerrar el módulo— se suelta todo.
  useEffect(
    () => () => {
      soltarMicro();
      setNota((n) => {
        if (n) URL.revokeObjectURL(n.url);
        return null;
      });
    },
    [],
  );

  const empezar = async () => {
    setError(null);

    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported(FORMATO)) {
      // Safari graba en otro formato y este navegador no lo sabe re-empaquetar.
      // Decirlo es mejor que grabar algo que después no se puede mandar.
      setError(
        "Este navegador no sabe grabar notas de voz. Probá desde Chrome o Edge, " +
          "que es donde funciona.",
      );
      return;
    }

    let entrada: MediaStream;
    try {
      entrada = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const nombre = e instanceof Error ? e.name : "";
      setError(
        nombre === "NotAllowedError"
          ? "El navegador no dio permiso para usar el micrófono. Se habilita en el candado de la barra de direcciones."
          : nombre === "NotFoundError"
            ? "No se encontró ningún micrófono conectado."
            : "No se pudo abrir el micrófono.",
      );
      return;
    }

    micro.current = entrada;
    trozos.current = [];
    cancelado.current = false;

    const rec = new MediaRecorder(entrada, { mimeType: FORMATO });
    grabadora.current = rec;

    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) trozos.current.push(ev.data);
    };

    rec.onstop = () => {
      soltarMicro();
      if (cancelado.current) {
        setFase("quieto");
        return;
      }
      void armar();
    };

    setSegundos(0);
    setFase("grabando");
    rec.start();
  };

  /** Del WebM que quedó al Ogg que se puede mandar. */
  const armar = async () => {
    try {
      const crudo = new Uint8Array(
        await new Blob(trozos.current, { type: FORMATO }).arrayBuffer(),
      );
      const ogg = webmAOgg(crudo);

      setNota({
        bytes: ogg,
        // Para poder escucharla acá mismo. Es el mismo archivo que se va a
        // mandar, no una versión distinta: lo que se oye es lo que se manda.
        url: URL.createObjectURL(new Blob([ogg as BlobPart], { type: TIPO_OGG })),
      });
      setFase("escuchando");
    } catch (e) {
      setFase("quieto");
      setError(e instanceof Error ? e.message : "No se pudo preparar la nota de voz.");
    }
  };

  const parar = () => grabadora.current?.stop();

  const descartar = () => {
    cancelado.current = true;
    grabadora.current?.stop();
    soltarMicro();
    setNota((n) => {
      if (n) URL.revokeObjectURL(n.url);
      return null;
    });
    setSegundos(0);
    setError(null);
    setFase("quieto");
  };

  const mandar = async () => {
    if (!nota) return;
    setFase("mandando");
    setError(null);

    // Un nombre nuevo, sin relación con nada: dos notas del mismo minuto no se
    // pisan. Va bajo «saliente/», que es la única carpeta que la política de
    // Supabase deja escribir desde el navegador.
    const ruta = `${CARPETA_SALIENTE}/${conversacionId}/${crypto.randomUUID()}.ogg`;

    try {
      const { error: errSubida } = await getBrowserClient()
        .storage.from(BALDE_WHATSAPP)
        .upload(ruta, new Blob([nota.bytes as BlobPart], { type: TIPO_OGG }), {
          contentType: TIPO_OGG,
          upsert: false,
        });

      if (errSubida) {
        setFase("escuchando");
        setError(`No se pudo subir la nota: ${errSubida.message}`);
        return;
      }

      const r = await enviarArchivo({
        conversacionId,
        ruta,
        nombre: "Nota de voz.ogg",
        mime: TIPO_OGG,
        bytes: nota.bytes.length,
        pie: "",
      });

      if (!r.ok) {
        setFase("escuchando");
        setError(r.error);
        return;
      }

      descartar();
      onEnviado();
    } catch (e) {
      setFase("escuchando");
      setError(e instanceof Error ? e.message : "No se pudo mandar la nota de voz.");
    }
  };

  // ---------------------------------------------------------------- pantalla

  if (fase === "quieto") {
    return (
      // `relative` para el aviso, que va flotando encima. Adentro de la fila
      // empujaría el cuadro de texto y lo dejaría de tres letras de ancho: los
      // errores de acá —permiso denegado, sin micrófono— son frases enteras.
      <div style={{ alignSelf: "flex-end", position: "relative" }}>
        <button
          type="button"
          onClick={() => void empezar()}
          disabled={disabled}
          title={
            disabled
              ? "Pasadas las 24 horas sólo se puede mandar una plantilla"
              : "Grabar una nota de voz"
          }
          aria-label="Grabar una nota de voz"
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: disabled ? T.faint : T.ink,
            fontSize: 17,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          🎤
        </button>
        {error && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              width: 300,
              zIndex: 80,
              padding: "8px 10px",
              background: "#FAE8E6",
              border: "1px solid #E4C3BF",
              borderRadius: 8,
              boxShadow: "0 10px 24px rgba(3,27,79,0.14)",
            }}
          >
            <Aviso texto={error} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        background: T.paper,
      }}
    >
      {fase === "grabando" ? (
        <>
          {/* El punto rojo y el reloj: es lo único que dice que el micrófono
              está abierto, y tiene que verse sin buscarlo. */}
          <span
            aria-hidden
            style={{ width: 9, height: 9, borderRadius: 5, background: "#B85042" }}
          />
          <span className="mono" style={{ fontSize: 13, color: T.ink, minWidth: 44 }}>
            {reloj(segundos)}
          </span>
          <span style={{ fontSize: 12, color: T.muted }}>Grabando…</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={descartar} style={secundario}>
            Descartar
          </button>
          <button
            type="button"
            onClick={parar}
            style={{ ...principal(accent), background: accent }}
          >
            Parar
          </button>
        </>
      ) : (
        <>
          <audio
            controls
            src={nota?.url}
            style={{ flex: 1, minWidth: 200, height: 34 }}
            aria-label="Escuchar la nota antes de mandarla"
          />
          <button
            type="button"
            onClick={descartar}
            disabled={fase === "mandando"}
            style={secundario}
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={() => void mandar()}
            disabled={fase === "mandando"}
            style={{
              ...principal(accent),
              cursor: fase === "mandando" ? "wait" : "pointer",
            }}
          >
            {fase === "mandando" ? "Mandando…" : "Mandar"}
          </button>
        </>
      )}

      {error && <Aviso texto={error} />}
    </div>
  );
}

const Aviso = ({ texto }: { texto: string }) => (
  <p
    role="alert"
    style={{
      flexBasis: "100%",
      margin: "4px 0 0",
      fontSize: 11.5,
      lineHeight: 1.45,
      color: "#9E2F29",
    }}
  >
    {texto}
  </p>
);

const secundario = {
  height: 30,
  padding: "0 11px",
  fontSize: 12.5,
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.muted,
  cursor: "pointer",
} as const;

const principal = (accent: string) =>
  ({
    height: 30,
    padding: "0 15px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 6,
    background: accent,
    color: "#fff",
    cursor: "pointer",
  }) as const;
