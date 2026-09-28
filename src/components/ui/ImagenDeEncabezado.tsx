"use client";

import { useEffect, useRef, useState } from "react";

import { getBrowserClient } from "@/lib/supabase/browser";
import { BALDE_WHATSAPP } from "@/lib/whatsapp/adjuntos";
import {
  ACEPTA_ENCABEZADO,
  IMAGENES_DE_ENCABEZADO,
  TOPE_ENCABEZADO_BYTES,
  carpetaDePlantilla,
  comoSubida,
  esSubida,
} from "@/lib/whatsapp/imagenDeEncabezado";
import { T } from "@/lib/theme";

/**
 * Elegir la imagen que lleva una plantilla en el encabezado.
 *
 * ============================================================================
 * POR QUÉ UN BOTÓN Y NO UNA CASILLA DE ENLACE
 * ============================================================================
 *
 * La primera versión pedía la dirección de la imagen. Funcionaba, pero supone
 * tener la foto publicada en algún lado con un enlace directo —no un Drive, no
 * un WhatsApp: un enlace que Meta pueda bajar sin permiso—, y eso no es algo
 * que una asesora tenga a mano. Lo que sí tiene es el archivo: el mismo que se
 * subió a Meta cuando se creó la plantilla.
 *
 * Así que el camino principal es elegir el archivo. La casilla de enlace sigue
 * existiendo, escondida detrás de «o pegar una dirección», porque hay un caso
 * real en el que sirve: cuando la imagen ya está publicada y se quiere usar esa
 * misma, sin subir una copia.
 *
 * ============================================================================
 * SE SUBE ACÁ, NO AL MANDAR
 * ============================================================================
 *
 * El navegador sube derecho al bucket de Supabase, igual que las fotos del
 * Inbox y por el mismo motivo: el cuerpo de una llamada al servidor se corta en
 * unos pocos megas. Lo que queda guardado como valor es la RUTA, marcada con
 * `subida:`; la dirección que ve Meta se firma en el servidor, en el momento de
 * mandar, y caduca enseguida.
 *
 * Que se suba al elegir y no al mandar tiene una razón de uso: una campaña a
 * trescientos no puede empezar con una subida de cinco megas que puede fallar.
 * Cuando se aprieta Mandar, la imagen ya está arriba.
 */

const CAJA: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  marginBottom: 5,
};

const BOTON: React.CSSProperties = {
  height: 28,
  padding: "0 11px",
  fontSize: 12,
  fontWeight: 600,
  color: T.ink,
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const ENLACE: React.CSSProperties = {
  padding: 0,
  fontSize: 11,
  color: T.faint,
  background: "none",
  border: "none",
  textDecoration: "underline",
  cursor: "pointer",
};

export function ImagenDeEncabezado({
  valor,
  etiqueta,
  plantillaId,
  yaAprobada = null,
  onValor,
}: {
  /** Lo que hay puesto: una ruta marcada, un enlace, o vacío. */
  valor: string;
  /** Cómo se llama este pedido, para lectores de pantalla. */
  etiqueta: string;
  /**
   * Qué plantilla es, para acordarse de su imagen.
   *
   * La imagen de una plantilla es SIEMPRE la misma —la invitación al workshop
   * no cambia entre un cliente y el siguiente—, así que subirla en cada envío
   * sería trabajo repetido todos los días. Se guarda en una carpeta con este
   * nombre y la próxima vez aparece sola.
   */
  plantillaId: string;
  /**
   * La imagen que Meta ya tiene aprobada para esta plantilla, si la hay.
   *
   * Cuando está, no hay nada que pedir: dejando la casilla vacía se manda ésa.
   * La pantalla lo dice y la muestra, en vez de un botón que hace pensar que
   * falta algo.
   */
  yaAprobada?: string | null;
  onValor: (valor: string) => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Cómo se llamaba el archivo elegido. Sólo para mostrarlo. */
  const [nombre, setNombre] = useState<string | null>(null);
  /** La miniatura, para confirmar de un vistazo que es la que va. */
  const [mira, setMira] = useState<string | null>(null);
  const [pegando, setPegando] = useState(false);

  /** La miniatura de la imagen que quedó guardada de otra vez. */
  const [guardada, setGuardada] = useState<string | null>(null);

  /*
   * `createObjectURL` reserva memoria hasta que se la suelta. Una asesora que
   * prueba tres imágenes antes de decidirse deja tres reservadas si no se
   * limpian, y no hay ninguna señal de que eso esté pasando.
   */
  useEffect(() => () => {
    if (mira) URL.revokeObjectURL(mira);
  }, [mira]);

  /*
   * ¿Ya hay una imagen guardada para esta plantilla?
   *
   * ==========================================================================
   * POR QUÉ ESTO EXISTE
   * ==========================================================================
   *
   * La imagen de una plantilla no cambia entre un cliente y el siguiente: la
   * invitación al workshop es la misma para los trescientos. Sin esto habría
   * que buscarla en la computadora y subirla en CADA envío, todos los días, y
   * ésa es exactamente la clase de trabajo repetido por el que la escuela se
   * quejó de esta pantalla.
   *
   * Se lista la carpeta de la plantilla y vale el archivo más nuevo. Que
   * gane el más nuevo es lo que deja cambiar la imagen: quien suba otra la
   * agrega, y desde ahí es la que va, sin tener que pisar la de nadie.
   */
  useEffect(() => {
    let vigente = true;

    const buscar = async () => {
      if (plantillaId === "") return;

      try {
        const carpeta = carpetaDePlantilla(plantillaId);
        const { data } = await getBrowserClient()
          .storage.from(BALDE_WHATSAPP)
          .list(carpeta, { limit: 1, sortBy: { column: "created_at", order: "desc" } });

        const archivo = data?.[0];
        if (!vigente || !archivo) return;

        const ruta = `${carpeta}/${archivo.name}`;

        /*
         * La miniatura se pide firmada porque el bucket es privado. Si no sale,
         * no pasa nada: se sigue sabiendo que hay una imagen guardada, que es lo
         * que decide si se puede mandar.
         */
        const { data: firma } = await getBrowserClient()
          .storage.from(BALDE_WHATSAPP)
          .createSignedUrl(ruta, 600);

        if (!vigente) return;
        setGuardada(firma?.signedUrl ?? null);
        onValor(comoSubida(ruta));
      } catch {
        // Sin imagen guardada se sigue como siempre: con el botón de subir.
      }
    };

    void buscar();
    return () => {
      vigente = false;
    };
    // Sólo cuando cambia la plantilla: `onValor` se vuelve a crear en cada
    // pintada y ponerlo acá dispararía la búsqueda sin parar.
  }, [plantillaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const subir = async (f: File) => {
    setAviso(null);

    if (!IMAGENES_DE_ENCABEZADO.includes(f.type)) {
      setAviso("En el encabezado de una plantilla, Meta sólo acepta JPG o PNG.");
      return;
    }
    if (f.size > TOPE_ENCABEZADO_BYTES) {
      const megas = (f.size / 1024 / 1024).toFixed(1);
      setAviso(`La imagen pesa ${megas} MB y Meta acepta hasta 5. Probá con una más liviana.`);
      return;
    }

    /*
     * Dentro de la carpeta de ESTA plantilla, con un nombre nuevo.
     *
     * La carpeta es lo que permite encontrarla la próxima vez. El nombre nuevo
     * es lo que permite cambiarla sin pisar la de nadie: se agrega, y desde ahí
     * gana la más nueva.
     */
    const ruta = `${carpetaDePlantilla(plantillaId)}/${crypto.randomUUID()}`;

    setSubiendo(true);
    try {
      const { error } = await getBrowserClient()
        .storage.from(BALDE_WHATSAPP)
        .upload(ruta, f, { contentType: f.type, upsert: false });

      if (error) {
        const dice = error.message;
        setAviso(
          /row-level security|Unauthorized|violates|403/i.test(dice)
            ? "El servidor no deja subir la imagen. Falta correr la migración " +
              "20260921120000_adjuntos_grandes.sql en Supabase."
            : `No se pudo subir la imagen: ${dice}`,
        );
        return;
      }

      if (mira) URL.revokeObjectURL(mira);
      setMira(URL.createObjectURL(f));
      setNombre(f.name);
      setGuardada(null);
      onValor(comoSubida(ruta));
    } catch (e) {
      setAviso(`No se pudo subir la imagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubiendo(false);
      // Para que elegir el MISMO archivo otra vez vuelva a disparar el cambio.
      if (archivo.current) archivo.current.value = "";
    }
  };

  const quitar = () => {
    if (mira) URL.revokeObjectURL(mira);
    setMira(null);
    setNombre(null);
    setGuardada(null);
    setAviso(null);
    onValor("");
  };

  const hayImagen = valor.trim() !== "";
  const pegada = hayImagen && !esSubida(valor);

  /*
   * Lo que se va a mandar si no se toca nada.
   *
   * Con una imagen aprobada en Meta, dejar esto vacío NO es dejarlo incompleto:
   * se manda la de Meta. Eso cambia lo que la pantalla tiene que decir —«va a
   * ir ésta», no «falta subirla»— y es la queja concreta de la escuela: el CRM
   * pedía de nuevo una imagen que ya estaba en la plantilla.
   */
  const vaLaDeMeta = !hayImagen && yaAprobada != null;
  /** Va la que quedó guardada de otra vez: ni recién elegida ni la de Meta. */
  const vaLaGuardada = hayImagen && guardada != null && mira == null;
  const miniatura = mira ?? guardada ?? (vaLaDeMeta ? yaAprobada : null);

  return (
    /*
      El nombre del pedido va en el GRUPO, no en el botón.
      ------------------------------------------------------------------------
      Estaba como `aria-label` del botón, y eso le pisa el nombre: para quien
      usa lector de pantalla —y para cualquiera que busque el botón por su
      texto— el botón dejaba de llamarse «Subir imagen» y pasaba a llamarse «La
      imagen del encabezado». Acá adentro hay dos controles, así que el nombre
      del pedido es del conjunto y cada botón conserva el suyo.
    */
    <div role="group" aria-label={etiqueta} style={{ marginBottom: 6 }}>
      <input
        ref={archivo}
        type="file"
        accept={ACEPTA_ENCABEZADO}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void subir(f);
        }}
        style={{ display: "none" }}
      />

      <div style={CAJA}>
        {miniatura && (
          /*
            La miniatura no es adorno: la plantilla se manda a gente de verdad y
            el único momento para darse cuenta de que se eligió la imagen
            equivocada es antes de apretar Mandar. Cuando va la de Meta, es
            además la confirmación de que no falta nada.
          */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={miniatura}
            alt=""
            style={{
              width: 34,
              height: 34,
              objectFit: "cover",
              borderRadius: 5,
              border: `1px solid ${T.border}`,
              flexShrink: 0,
            }}
          />
        )}

        {(vaLaDeMeta || vaLaGuardada) && (
          <span style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.35 }}>
            {vaLaGuardada ? "Va con la imagen guardada." : "Va con la imagen aprobada en Meta."}
          </span>
        )}

        <button
          type="button"
          onClick={() => archivo.current?.click()}
          disabled={subiendo}
          style={{ ...BOTON, opacity: subiendo ? 0.6 : 1 }}
        >
          {subiendo
            ? "Subiendo…"
            : hayImagen && !vaLaGuardada
              ? "Cambiar imagen"
              : vaLaDeMeta || vaLaGuardada
                ? "Usar otra imagen"
                : "Subir imagen"}
        </button>

        {nombre && (
          <span
            title={nombre}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 11.5,
              color: T.faint,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {nombre}
          </span>
        )}

        {hayImagen && (
          <button type="button" onClick={quitar} style={{ ...ENLACE, flexShrink: 0 }}>
            Quitar
          </button>
        )}
      </div>

      {/*
        El camino de atrás, para cuando la imagen ya está publicada.
        --------------------------------------------------------------------
        Se muestra plegado porque es el caso raro: quien manda tiene el
        archivo, no un enlace directo. Pero si ya se pegó una dirección alguna
        vez —o se guardó así en una campaña vieja—, la casilla aparece sola con
        lo que hay adentro, para poder verla y corregirla.
      */}
      {pegando || pegada ? (
        <input
          type="url"
          value={pegada ? valor : ""}
          onChange={(e) => onValor(e.target.value)}
          placeholder="https://… (dirección de la imagen)"
          aria-label={`${etiqueta} — dirección`}
          style={{
            display: "block",
            width: "100%",
            height: 28,
            padding: "0 8px",
            fontSize: 12,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            background: T.surface,
            color: T.ink,
          }}
        />
      ) : (
        !hayImagen &&
        // Con la de Meta puesta no hay nada que resolver, así que ofrecer el
        // camino de atrás sólo agrega ruido a una casilla que ya está lista.
        !vaLaDeMeta && (
          <button type="button" onClick={() => setPegando(true)} style={ENLACE}>
            o pegar una dirección
          </button>
        )
      )}

      {aviso && (
        <p style={{ margin: "4px 0 0", fontSize: 11, lineHeight: 1.45, color: "#9E2F29" }}>
          {aviso}
        </p>
      )}
    </div>
  );
}
