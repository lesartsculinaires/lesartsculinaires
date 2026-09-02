"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  colgarLlamada,
  contestarLlamada,
  llamarA,
  pedirPermisoDeLlamada,
  rechazarLlamada,
} from "@/app/llamadas-actions";
import {
  cerrarTodo,
  crearConexion,
  esperarCandidatos,
  hayWebRTC,
  porQueNoHayMicrofono,
} from "@/lib/audioLlamada";
import {
  comoReloj,
  comoSeMuestra,
  porQueLoVeo,
  type QueEstaHaciendo,
  type Quien,
} from "@/lib/llamadas";
import type { LlamadaConSdp } from "@/hooks/useLlamadaEnVivo";
import { T } from "@/lib/theme";

/**
 * La llamada en pantalla: el pop-up, o la tarjeta de la esquina.
 *
 * ============================================================================
 * LO QUE PIDIÓ LA ESCUELA, EN UN COMPONENTE
 * ============================================================================
 *
 * «Me gustaría que apareciera como pop up la llamada y contestarla, pero en los
 *  demás dispositivos se minimice y se visualice en una esquina.»
 *
 * Las dos formas son la misma tarjeta con distinto tamaño y distinto lugar, y
 * cuál toca no lo decide este archivo: lo decide `comoSeMuestra`, en
 * `lib/llamadas.ts`, que se prueba sin navegador. Acá sólo se dibuja.
 *
 * ============================================================================
 * NUNCA SE ROBA EL FOCO
 * ============================================================================
 *
 * Ni siquiera el pop-up. No hay `autoFocus` en ningún botón y no hay ningún
 * campo de texto: si alguien está escribiendo cuando la tarjeta sube —puede
 * pasar, entre que se mira el reloj y se dibuja—, las teclas siguientes siguen
 * yendo a donde estaban yendo. Un pop-up que se lleva el foco es exactamente lo
 * que la escuela pidió evitar, y taparlo con un botón enfocado sería lo mismo
 * con otra forma.
 *
 * Tampoco hay fondo oscuro que bloquee la pantalla: el CRM sigue usable
 * mientras suena. Se puede seguir escribiendo y decidir después.
 */
export function Llamada({
  llamada,
  yo,
  nombreDeQuienLlama,
  nombreDelDueno,
  haciendo,
  /** La conversación que se quiere llamar; la pone el botón de la bandeja. */
  pedido,
  accent,
  onSoltar,
  onPoner,
  onVerHilo,
}: {
  llamada: LlamadaConSdp | null;
  yo: Quien;
  /**
   * Cómo se llama en el CRM, si esta pantalla puede ver el hilo. Es un
   * complemento del nombre que ya trae la llamada, no su reemplazo.
   */
  nombreDeQuienLlama: string | null;
  nombreDelDueno: string | null;
  haciendo: QueEstaHaciendo;
  pedido: { conversacionId: number; n: number } | null;
  accent: string;
  onSoltar: () => void;
  onPoner: (l: LlamadaConSdp) => void;
  onVerHilo: (conversacionId: number) => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [faltaPermiso, setFaltaPermiso] = useState<number | null>(null);
  const [segundos, setSegundos] = useState(0);

  const pc = useRef<RTCPeerConnection | null>(null);
  const micro = useRef<MediaStream | null>(null);
  const parlante = useRef<HTMLAudioElement | null>(null);
  /** Para no volver a pegarle la respuesta a una conexión que ya la tiene. */
  const respuestaPuesta = useRef<string | null>(null);

  const soltarTodo = useCallback(() => {
    cerrarTodo(pc.current, micro.current, parlante.current);
    pc.current = null;
    micro.current = null;
    respuestaPuesta.current = null;
  }, []);

  const veredicto = comoSeMuestra(
    llamada ?? {
      callId: "",
      telefono: "",
      conversacionId: null,
      vendedorId: null,
      nombre: null,
      direccion: "entrante",
      estado: "terminada",
      atendidaPor: null,
      creadoEn: new Date().toISOString(),
    },
    yo,
    // De quién es el hilo sale de la propia fila de la llamada y no de la
    // conversación: `conversaciones` no se ve entera —una asesora no ve los
    // hilos de otra— y en la pantalla de quien no lo ve la llamada parecería
    // sin asignar, con el pop-up encima de todo el equipo.
    llamada?.vendedorId ?? null,
    haciendo,
  );

  const hablando = llamada?.estado === "en_curso" || llamada?.estado === "contestando";
  const mia = llamada != null && llamada.atendidaPor === yo.usuarioId;

  /*
   * Cuando la llamada se cae del aire —colgó el cliente, se venció el plazo,
   * la atendió otra— se suelta el micrófono. Sin esto la lucecita quedaría
   * prendida después de colgar, y el navegador escuchando una oficina donde se
   * habla de otros clientes.
   */
  useEffect(() => {
    if (veredicto.presencia !== "nada") return;
    soltarTodo();
    setTrabajando(false);
    setSegundos(0);
  }, [veredicto.presencia, soltarTodo]);

  // Y al cerrar la pestaña o cambiar de pantalla, lo mismo.
  useEffect(() => soltarTodo, [soltarTodo]);

  /** El reloj de la llamada, mientras se habla. */
  useEffect(() => {
    if (!hablando || !mia) return;
    const desde = Date.now();
    const reloj = window.setInterval(
      () => setSegundos(Math.floor((Date.now() - desde) / 1000)),
      1000,
    );
    return () => window.clearInterval(reloj);
  }, [hablando, mia]);

  /*
   * En una saliente, la respuesta de Meta llega por el websocket un rato
   * después de que apretamos «Llamar». Pegársela a la conexión es el último
   * paso: recién ahí empieza a salir la voz.
   */
  useEffect(() => {
    const sdp = llamada?.sdpTipo === "answer" ? llamada.sdpRemoto : null;
    if (!sdp || !pc.current || respuestaPuesta.current === sdp) return;
    if (pc.current.signalingState !== "have-local-offer") return;

    respuestaPuesta.current = sdp;
    void pc.current
      .setRemoteDescription({ type: "answer", sdp })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo abrir el audio."));
  }, [llamada?.sdpRemoto, llamada?.sdpTipo]);

  // ------------------------------------------------------------- contestar

  const atender = async () => {
    if (!llamada?.sdpRemoto || trabajando) return;
    if (!hayWebRTC()) {
      setError("Este navegador no puede hacer llamadas. Probá con Chrome o Edge actualizado.");
      return;
    }

    setTrabajando(true);
    setError(null);

    try {
      const conexion = crearConexion();
      pc.current = conexion;

      // El audio del cliente entra por acá. Se engancha ANTES de negociar: si
      // se enganchara después, la primera pista podría llegar sin nadie
      // escuchando y las primeras palabras se perderían.
      conexion.ontrack = (e) => {
        if (parlante.current) parlante.current.srcObject = e.streams[0] ?? null;
      };

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micro.current = mic;
      for (const pista of mic.getTracks()) conexion.addTrack(pista, mic);

      await conexion.setRemoteDescription({ type: "offer", sdp: llamada.sdpRemoto });
      await conexion.setLocalDescription(await conexion.createAnswer());
      // Ver `esperarCandidatos`: con Meta el SDP se manda una sola vez.
      await esperarCandidatos(conexion);

      const r = await contestarLlamada(llamada.callId, conexion.localDescription?.sdp ?? "");

      if (!r.conseguida) {
        // La agarró otra persona primero. No es un error: es lo que tiene que
        // pasar cuando dos aprietan a la vez, y lo importante es soltar el
        // micrófono en vez de dejarlo abierto contra una llamada ajena.
        soltarTodo();
        setAviso("Otra persona atendió esta llamada.");
        onSoltar();
        return;
      }

      if (!r.ok) {
        soltarTodo();
        setError(r.error);
        return;
      }
    } catch (e) {
      soltarTodo();
      setError(porQueNoHayMicrofono(e));
    } finally {
      setTrabajando(false);
    }
  };

  const rechazarla = async () => {
    if (!llamada) return;
    setTrabajando(true);
    soltarTodo();
    await rechazarLlamada(llamada.callId);
    setTrabajando(false);
    onSoltar();
  };

  const colgarla = async () => {
    if (!llamada) return;
    setTrabajando(true);
    soltarTodo();
    await colgarLlamada(llamada.callId);
    setTrabajando(false);
    onSoltar();
  };

  // ---------------------------------------------------------------- llamar

  /*
   * El botón de la bandeja no llama: pide que se llame, y el trabajo se hace
   * acá. Es lo que evita tener el micrófono y la conexión en dos lugares —uno
   * para atender y otro para marcar—, que es como se termina con dos llamadas
   * abiertas a la vez y ninguna que se pueda colgar.
   */
  const marcarA = useCallback(
    async (conversacionId: number) => {
      if (!hayWebRTC()) {
        setError("Este navegador no puede hacer llamadas. Probá con Chrome o Edge actualizado.");
        return;
      }

      setTrabajando(true);
      setError(null);
      setAviso(null);
      setFaltaPermiso(null);

      try {
        const conexion = crearConexion();
        pc.current = conexion;
        conexion.ontrack = (e) => {
          if (parlante.current) parlante.current.srcObject = e.streams[0] ?? null;
        };

        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        micro.current = mic;
        for (const pista of mic.getTracks()) conexion.addTrack(pista, mic);

        await conexion.setLocalDescription(await conexion.createOffer());
        await esperarCandidatos(conexion);

        const r = await llamarA(conversacionId, conexion.localDescription?.sdp ?? "");

        if (!r.ok || !r.callId) {
          soltarTodo();
          setError(r.error);
          if (r.faltaPermiso) setFaltaPermiso(conversacionId);
          return;
        }

        // Se pone en pantalla sin esperar al websocket: quien acaba de apretar
        // «Llamar» tiene que ver que está llamando en el momento, y tener el
        // botón de cortar antes de que el otro atienda.
        onPoner({
          callId: r.callId,
          telefono: "",
          conversacionId,
          vendedorId: yo.vendedorId,
          nombre: null,
          direccion: "saliente",
          estado: "sonando",
          atendidaPor: yo.usuarioId,
          creadoEn: new Date().toISOString(),
          sdpRemoto: null,
          sdpTipo: null,
        });
      } catch (e) {
        soltarTodo();
        setError(porQueNoHayMicrofono(e));
      } finally {
        setTrabajando(false);
      }
    },
    [onPoner, soltarTodo, yo.usuarioId],
  );

  /*
   * Cada clic en «Llamar» trae un número más alto que el anterior, y de ahí
   * sale qué es un pedido nuevo y qué es el mismo dibujándose otra vez. Sin
   * eso, un efecto que se vuelve a correr —cosa que pasa sola— marcaría dos
   * veces, y quedarían dos llamadas abiertas contra el mismo cliente.
   */
  const ultimoPedido = useRef<number>(0);
  useEffect(() => {
    if (pedido == null || pedido.n <= ultimoPedido.current) return;
    ultimoPedido.current = pedido.n;
    void marcarA(pedido.conversacionId);
  }, [pedido, marcarA]);

  const pedirElPermiso = async () => {
    if (faltaPermiso == null) return;
    setTrabajando(true);
    const r = await pedirPermisoDeLlamada(faltaPermiso);
    setTrabajando(false);
    setFaltaPermiso(null);
    setError(r.ok ? null : r.error);
    setAviso(
      r.ok ? "Se le mandó la solicitud. Cuando la acepte vas a poder llamarlo." : null,
    );
  };

  // ---------------------------------------------------------------- dibujo

  /*
   * El aviso suelto: «la atendió otra», «se le mandó el permiso», un error de
   * micrófono. Sobrevive a que la llamada se vaya de pantalla, porque casi
   * siempre habla justamente de por qué se fue.
   */
  const soloUnAviso = llamada == null || veredicto.presencia === "nada";
  if (soloUnAviso && !error && !aviso) return null;

  const enPopUp = !soloUnAviso && veredicto.presencia === "pop-up";

  /*
   * Cómo se llama quien llama.
   *
   * El de la fila primero, y el del hilo después. El de la fila lo copió el
   * webhook y se ve siempre; el del hilo sólo lo ve quien tiene permiso sobre
   * ese hilo, así que solo con él la mitad del equipo vería un número pelado.
   */
  const quien =
    llamada?.nombre ??
    nombreDeQuienLlama ??
    (llamada?.telefono ? `+${llamada.telefono}` : "Número desconocido");

  return (
    <>
      {/*
        El parlante. Va siempre montado y no sólo durante la llamada: creándolo
        al atender, el navegador tiene que arrancar la reproducción con la
        pista ya puesta, y eso es lo que hace que se pierdan las primeras
        palabras. `playsInline` es para el iPhone, que si no abre el
        reproductor a pantalla completa.
      */}
      <audio ref={parlante} autoPlay playsInline />

      <div
        style={{
          position: "fixed",
          zIndex: 60,
          ...(enPopUp
            ? // Arriba y al centro: se ve sin tapar el contenido, y no cae
              // sobre ningún botón de la barra lateral ni del encabezado.
              { top: 22, left: "50%", transform: "translateX(-50%)", width: 380 }
            : { bottom: 18, right: 18, width: 300 }),
          background: T.surface,
          border: `1px solid ${enPopUp ? accent : T.border}`,
          borderRadius: 12,
          boxShadow: enPopUp
            ? "0 18px 44px rgba(3, 27, 79, 0.24)"
            : "0 8px 22px rgba(3, 27, 79, 0.14)",
          padding: enPopUp ? "16px 18px" : "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
        role="dialog"
        aria-live="polite"
        aria-label="Llamada de WhatsApp"
      >
        {!soloUnAviso && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                aria-hidden
                style={{
                  fontSize: enPopUp ? 24 : 18,
                  // Pulsa mientras suena y se queda quieto al hablar: de un
                  // vistazo, desde el otro lado del escritorio, se distingue
                  // «atendé» de «están hablando».
                  animation: llamada?.estado === "sonando" ? "lacTimbre 1s ease-in-out infinite" : undefined,
                }}
              >
                📞
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: enPopUp ? 16 : 13.5,
                    fontWeight: 700,
                    color: T.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {quien}
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: T.muted }}>
                  {hablando && mia
                    ? `En llamada · ${comoReloj(segundos)}`
                    : porQueLoVeo(veredicto.porque, nombreDelDueno)}
                </span>
              </span>
            </div>

            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {llamada?.estado === "sonando" && llamada.direccion === "entrante" && (
                <>
                  <button
                    type="button"
                    onClick={() => void atender()}
                    disabled={trabajando || !llamada.sdpRemoto}
                    style={boton("#2F6B4F", true)}
                  >
                    {trabajando ? "Conectando…" : "Contestar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void rechazarla()}
                    disabled={trabajando}
                    style={boton("#B85042", true)}
                  >
                    Rechazar
                  </button>
                </>
              )}

              {(hablando || llamada?.direccion === "saliente") && mia && (
                <button
                  type="button"
                  onClick={() => void colgarla()}
                  disabled={trabajando}
                  style={boton("#B85042", true)}
                >
                  Colgar
                </button>
              )}

              {llamada?.conversacionId != null && (
                <button
                  type="button"
                  onClick={() => onVerHilo(llamada.conversacionId!)}
                  style={boton(T.muted, false)}
                >
                  Ver el chat
                </button>
              )}
            </div>

            {/*
              Sin SDP no hay forma de armar el audio, y el botón de contestar
              está apagado. Decirlo es lo que evita que alguien lo apriete tres
              veces creyendo que el CRM no responde.
            */}
            {llamada?.estado === "sonando" && !llamada.sdpRemoto && (
              <p style={{ margin: 0, fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
                WhatsApp no mandó los datos de audio de esta llamada, así que no se
                puede contestar desde el CRM. Devolvele la llamada cuando corte.
              </p>
            )}
          </>
        )}

        {error && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#B85042", lineHeight: 1.45 }}>{error}</p>
        )}
        {aviso && (
          <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.45 }}>{aviso}</p>
        )}

        {faltaPermiso != null && (
          <button
            type="button"
            onClick={() => void pedirElPermiso()}
            disabled={trabajando}
            style={boton(accent, true)}
          >
            Pedirle permiso para llamarlo
          </button>
        )}

        {(error || aviso) && soloUnAviso && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAviso(null);
              setFaltaPermiso(null);
            }}
            style={boton(T.muted, false)}
          >
            Cerrar
          </button>
        )}
      </div>

      <style>{`
        @keyframes lacTimbre {
          0%, 100% { transform: rotate(-9deg); }
          50%      { transform: rotate(9deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes lacTimbre { 0%, 100% { transform: none; } }
        }
      `}</style>
    </>
  );
}

const boton = (color: string, lleno: boolean): React.CSSProperties => ({
  height: 32,
  padding: "0 13px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 7,
  cursor: "pointer",
  border: `1px solid ${color}`,
  background: lleno ? color : "transparent",
  color: lleno ? "#FFFFFF" : color,
});
