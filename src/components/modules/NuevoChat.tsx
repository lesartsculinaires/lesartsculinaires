"use client";

import { useMemo, useState } from "react";

import { abrirChat, altaYChat } from "@/app/inbox-actions";
import { enviarPlantillaAConversacion } from "@/app/plantillas-actions";
import { Buscador } from "@/components/ui/Buscador";
import {
  SelectorPlantilla,
  aprobadas,
  listaParaMandar,
} from "@/components/ui/SelectorPlantilla";
import { T } from "@/lib/theme";
import { useCatalogo } from "@/lib/catalog";
import { activos } from "@/lib/types";
import { aInternacional, bonito } from "@/lib/whatsapp/numero";
import type { Oportunidad, Plantilla } from "@/lib/types";

/**
 * Abrir un chat con alguien que ya está en la base.
 *
 * Se elige de los contactos que ya existen y no se escribe un número suelto:
 * un chat con un número que no es de nadie queda huérfano —sin ficha, sin
 * vendedor, sin historia— y es exactamente lo que la bandeja evita.
 *
 * LO QUE SE MUESTRA ANTES DE ABRIR, Y POR QUÉ
 *
 * El número tal como se va a usar. Los teléfonos del CRM vienen de planillas y
 * están escritos de diez maneras; para WhatsApp hay que armarlos con código de
 * país, y eso implica suponer. Escribirle a un desconocido por una suposición
 * silenciosa es peor que un paso de más, así que el número se muestra, se dice
 * qué se le cambió, y se puede corregir.
 */
export function NuevoChat({
  oportunidades,
  plantillas,
  accent,
  onCerrar,
  onAbierta,
}: {
  oportunidades: Oportunidad[];
  /** Las de Meta. Se ofrecen sólo las aprobadas. */
  plantillas: Plantilla[];
  accent: string;
  onCerrar: () => void;
  /** Recibe la conversación lista, para que la bandeja la muestre abierta. */
  onAbierta: (conversacionId: number) => void;
}) {
  const cat = useCatalogo();
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<Oportunidad | null>(null);
  const [numero, setNumero] = useState("");
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Alta de alguien que no está en la base. */
  const [dandoAlta, setDandoAlta] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [correoNuevo, setCorreoNuevo] = useState("");
  const [vendedorNuevo, setVendedorNuevo] = useState<number | "">("");
  const [parecidos, setParecidos] = useState<string[] | null>(null);

  /** La plantilla con que se rompe el hielo, y sus huecos. */
  const [plantillaId, setPlantillaId] = useState("");
  const [valores, setValores] = useState<string[]>([]);
  /**
   * El hilo que ya quedó abierto cuando la plantilla no salió.
   *
   * Se guarda para no perderlo: el chat existe aunque el envío haya fallado, y
   * cerrar la ventana con un error dejaría al asesor sin saber que la
   * conversación está creada. Con esto puede entrar igual y ver qué pasó.
   */
  const [abiertaConError, setAbiertaConError] = useState<number | null>(null);

  const plantilla = aprobadas(plantillas).find((p) => p.id === plantillaId) ?? null;
  const plantillaLista = listaParaMandar(plantilla, valores);

  /**
   * Un contacto por persona, no una fila por oportunidad.
   *
   * La misma persona puede tener tres oportunidades y sería confuso verla tres
   * veces en una lista de «a quién le escribo». Se queda la más reciente.
   */
  const contactos = useMemo(() => {
    const porCliente = new Map<number, Oportunidad>();
    for (const o of oportunidades) {
      if (!porCliente.has(o.clienteId)) porCliente.set(o.clienteId, o);
    }
    return [...porCliente.values()];
  }, [oportunidades]);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    const digitos = q.replace(/\D/g, "");
    return contactos
      .filter(
        (o) =>
          o.cliente.toLowerCase().includes(q) ||
          o.codigo.toLowerCase().includes(q) ||
          (digitos.length >= 4 && (o.telefono ?? "").replace(/\D/g, "").includes(digitos)),
      )
      .slice(0, 40);
  }, [contactos, busqueda]);

  const elegir = (o: Oportunidad) => {
    const propuesta = aInternacional(o.telefono);
    setElegido(o);
    setNumero(propuesta.numero ?? "");
    setError(null);
  };

  const propuesta = elegido ? aInternacional(elegido.telefono) : null;

  /**
   * Manda la plantilla en el hilo recién abierto y entra a la conversación.
   *
   * Si el envío falla no se cierra la ventana. El hilo ya existe —eso salió
   * bien— y lo que falló fue Meta: una plantilla rechazada, un número que no
   * tiene WhatsApp. Cerrar y saltar a la conversación mostraría un chat vacío
   * sin decir por qué, y el asesor creería que el mensaje salió.
   */
  const abrirYMandar = async (conversacionId: number) => {
    if (!plantilla) {
      onAbierta(conversacionId);
      return;
    }
    const envio = await enviarPlantillaAConversacion(conversacionId, plantilla.id, valores);
    if (!envio.ok) {
      setAbiertaConError(conversacionId);
      setError(envio.error ?? "No se pudo mandar la plantilla.");
      return;
    }
    onAbierta(conversacionId);
  };

  const abrir = async () => {
    if (!elegido) return;
    setAbriendo(true);
    setError(null);
    const r = await abrirChat(elegido.clienteId, numero);
    if (!r.ok || r.conversacionId == null) {
      setAbriendo(false);
      setError(r.error ?? "No se pudo abrir el chat.");
      return;
    }
    await abrirYMandar(r.conversacionId);
    setAbriendo(false);
  };

  const listo = numero.replace(/\D/g, "").length >= 8;

  /**
   * Dar de alta y abrir el chat, en un paso.
   *
   * Crea la persona Y su oportunidad, no sólo la ficha: el CRM lista
   * oportunidades, así que un cliente suelto no aparecería en Clientes ni en el
   * pipeline y existiría nada más que en la bandeja.
   */
  const darAlta = async (forzar: boolean) => {
    setAbriendo(true);
    setError(null);

    const r = await altaYChat(
      {
        nombre: nombreNuevo,
        telefono: numero,
        correo: correoNuevo.trim() || null,
        vendedorId: vendedorNuevo === "" ? null : Number(vendedorNuevo),
      },
      forzar,
    );

    setAbriendo(false);

    if (r.coincidencias?.length) {
      setParecidos(r.coincidencias.map((c) => c.nombre));
      return;
    }
    if (!r.ok || r.conversacionId == null) {
      setError(r.error ?? "No se pudo abrir el chat.");
      return;
    }
    await abrirYMandar(r.conversacionId);
  };

  const listoParaAlta = nombreNuevo.trim() !== "" && listo;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo chat"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(3, 27, 79, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !abriendo) onCerrar();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          Nuevo chat
        </h2>
        <p style={{ margin: "0 0 13px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          Buscá a quién le querés escribir entre los contactos que ya están en el CRM.
        </p>

        <Buscador
          valor={busqueda}
          onCambio={(v) => {
            setBusqueda(v);
            setElegido(null);
            setError(null);
          }}
          placeholder="Nombre, código o teléfono…"
          autoFocus
        />

        {!elegido && !dandoAlta && (
          <div style={{ flex: 1, overflowY: "auto", marginTop: 10, minHeight: 60 }}>
            {busqueda.trim() === "" ? (
              <p style={{ margin: 0, fontSize: 12, color: T.faint, lineHeight: 1.6 }}>
                Escribí algo para buscar.
              </p>
            ) : resultados.length === 0 ? (
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                  Nadie con ese nombre ni ese número en el CRM.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    // Lo que se escribió se aprovecha: si son dígitos era el
                    // número, y si no, el nombre. Volver a tipearlo sería
                    // trabajo que la pantalla ya vio.
                    const digitos = busqueda.replace(/\D/g, "");
                    const parece = digitos.length >= 8 && digitos.length >= busqueda.trim().length - 3;
                    setNombreNuevo(parece ? "" : busqueda.trim());
                    setNumero(parece ? (aInternacional(busqueda).numero ?? "") : "");
                    setDandoAlta(true);
                    setError(null);
                    setParecidos(null);
                  }}
                  style={{
                    height: 30,
                    padding: "0 12px",
                    fontSize: 12.5,
                    fontWeight: 600,
                    borderRadius: 7,
                    border: `1px solid ${accent}`,
                    color: accent,
                    background: "transparent",
                  }}
                >
                  + Ingresar un número nuevo
                </button>
              </div>
            ) : (
              resultados.map((o) => (
                <button
                  key={o.clienteId}
                  type="button"
                  onClick={() => elegir(o)}
                  className="row"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 9px",
                    borderRadius: 7,
                    borderBottom: `1px solid ${T.border}`,
                  }}
                >
                  <span style={{ display: "block", fontSize: 13, color: T.ink }}>{o.cliente}</span>
                  <span className="mono" style={{ fontSize: 11, color: T.faint }}>
                    {o.telefono ? bonito(o.telefono) : "sin teléfono"} · {o.codigo}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {elegido && !dandoAlta && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 9px", fontSize: 13, color: T.ink }}>
              <strong>{elegido.cliente}</strong>{" "}
              <button
                type="button"
                onClick={() => setElegido(null)}
                style={{ fontSize: 11.5, color: accent }}
              >
                cambiar
              </button>
            </p>

            <label style={{ display: "block" }}>
              <span
                style={{
                  display: "block",
                  marginBottom: 3,
                  fontSize: 10.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: T.faint,
                }}
              >
                Número de WhatsApp
              </span>
              <input
                value={numero}
                onChange={(e) => {
                  setNumero(e.target.value);
                  setError(null);
                }}
                inputMode="numeric"
                // El marcador no es un número de ejemplo a propósito: uno que
                // parezca real se lee como si el campo ya tuviera valor, justo
                // en el caso en que está vacío porque el contacto no tiene
                // teléfono. Acá lo que se muestre tiene que ser lo que se va a
                // usar, o nada.
                placeholder="Escribilo con código de país"
                className="mono"
                style={{
                  width: "100%",
                  height: 34,
                  padding: "0 10px",
                  fontSize: 13,
                  border: `1px solid ${listo ? T.border : T.warn}`,
                  borderRadius: 7,
                  background: T.surface,
                  color: T.ink,
                }}
              />
            </label>

            {/* Qué se le hizo al número guardado. Se dice siempre que se lo
                haya tocado: es una suposición y quien manda tiene que verla. */}
            {propuesta?.nota && (
              <p style={{ margin: "5px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                {propuesta.nota}
                {elegido.telefono ? ` Guardado: ${elegido.telefono}.` : ""}
              </p>
            )}

          </div>
        )}

        {dandoAlta && (
          <div style={{ marginTop: 12, overflowY: "auto" }}>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: T.muted, lineHeight: 1.55 }}>
              Se da de alta el contacto <strong>y su oportunidad</strong>, para que
              aparezca en Clientes y en el pipeline y no sólo acá. Después se le abre
              el chat.
            </p>

            <label style={{ display: "block", marginBottom: 9 }}>
              <span style={ETIQUETA}>Nombre y apellido</span>
              <input
                value={nombreNuevo}
                onChange={(e) => {
                  setNombreNuevo(e.target.value);
                  setParecidos(null);
                  setError(null);
                }}
                placeholder="Marta Rivas"
                autoFocus
                style={CAMPO}
              />
            </label>

            <label style={{ display: "block", marginBottom: 9 }}>
              <span style={ETIQUETA}>Número de WhatsApp</span>
              <input
                value={numero}
                onChange={(e) => {
                  setNumero(e.target.value);
                  setParecidos(null);
                  setError(null);
                }}
                inputMode="numeric"
                placeholder="Escribilo con código de país"
                className="mono"
                style={{ ...CAMPO, borderColor: listo ? T.border : T.warn }}
              />
              <span style={{ fontSize: 10.5, color: T.faint, lineHeight: 1.4 }}>
                Con código de país: 503 y los ocho dígitos.
              </span>
            </label>

            <label style={{ display: "block", marginBottom: 9 }}>
              <span style={ETIQUETA}>Correo</span>
              <input
                value={correoNuevo}
                onChange={(e) => setCorreoNuevo(e.target.value)}
                type="email"
                placeholder="opcional"
                style={CAMPO}
              />
            </label>

            <label style={{ display: "block", marginBottom: 4 }}>
              <span style={ETIQUETA}>A quién le toca</span>
              <select
                value={vendedorNuevo}
                onChange={(e) => setVendedorNuevo(e.target.value === "" ? "" : Number(e.target.value))}
                style={CAMPO}
              >
                <option value="">Sin asignar</option>
                {activos(cat.vendedores).map((v) => (
                  <option key={v.id} value={v.id}>{v.nombre}</option>
                ))}
              </select>
            </label>

            {/* Alguien parecido ya en la base. Es el caso que importa: un
                número nuevo que en realidad ya es de un contacto cargado con
                otro nombre, que si se fuerza queda como dos personas. */}
            {parecidos && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 11px",
                  borderRadius: 8,
                  border: `1px solid ${T.warn}`,
                  background: T.paper,
                }}
              >
                <p style={{ margin: "0 0 5px", fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>
                  Ya hay {parecidos.length === 1 ? "alguien" : "gente"} con estos datos:
                </p>
                <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 12.5, color: T.ink }}>
                  {parecidos.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                  Si es la misma persona, cerrá y buscala por su nombre: darla de alta
                  otra vez la parte en dos fichas.
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        {/*
          Con qué se rompe el hielo.

          Va después de elegir a la persona y antes de los botones, en el orden
          en que se piensa: a quién, qué le mando, mandar.
        */}
        {(elegido || dandoAlta) && (
          <div
            style={{
              marginTop: 14,
              padding: "11px 12px",
              borderRadius: 9,
              border: `1px solid ${T.border}`,
              background: T.paper,
            }}
          >
            <p style={{ margin: "0 0 3px", fontSize: 12.5, fontWeight: 600, color: T.ink }}>
              Con qué le escribimos
            </p>
            <p style={{ margin: "0 0 8px", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
              A quien no escribió primero, WhatsApp sólo deja mandarle una
              plantilla aprobada por Meta. Cualquier otro texto rebota.
            </p>

            <SelectorPlantilla
              plantillas={plantillas}
              elegida={plantillaId}
              valores={valores}
              rotulo="Elegí una plantilla…"
              onElegir={(id) => {
                setPlantillaId(id);
                setError(null);
              }}
              onValores={(v) => {
                setValores(v);
                setError(null);
              }}
            />

            {/*
              Se puede abrir sin mandar nada, pero se dice qué significa.

              Hace falta para el caso en que la persona escribió hace un rato:
              ahí la ventana de 24 horas está abierta, se le puede escribir
              normal, y gastar una plantilla sería pagar de más por nada.
            */}
            {!plantilla && (
              <p style={{ margin: "8px 0 0", fontSize: 11, color: T.faint, lineHeight: 1.5 }}>
                Sin plantilla el hilo se abre igual, pero sólo vas a poder
                escribirle si esa persona te escribió en las últimas 24 horas.
              </p>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 14 }}>
          <button
            type="button"
            onClick={() => (dandoAlta ? setDandoAlta(false) : onCerrar())}
            disabled={abriendo}
            style={{
              height: 36,
              padding: "0 16px",
              fontSize: 13,
              borderRadius: 7,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.ink,
            }}
          >
            {abiertaConError != null ? "Cerrar" : dandoAlta ? "Volver" : "Cancelar"}
          </button>
          {abiertaConError != null ? (
            <button
              type="button"
              onClick={() => onAbierta(abiertaConError)}
              style={{
                height: 36,
                padding: "0 18px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 7,
                background: accent,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Entrar al chat igual
            </button>
          ) : dandoAlta ? (
            <button
              type="button"
              onClick={() => void darAlta(parecidos != null)}
              disabled={abriendo || !listoParaAlta || (plantilla != null && !plantillaLista)}
              style={{
                height: 36,
                padding: "0 18px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 7,
                background: listoParaAlta ? accent : T.border,
                color: listoParaAlta ? "#fff" : T.faint,
                cursor: abriendo ? "wait" : listoParaAlta ? "pointer" : "not-allowed",
              }}
            >
              {abriendo
                ? "Dando de alta…"
                : parecidos
                  ? "Darlo de alta igual"
                  : plantilla
                    ? "Dar de alta y enviar"
                    : "Dar de alta y abrir chat"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void abrir()}
              // Con una plantilla elegida y huecos sin llenar el botón se
              // apaga: Meta rechaza el envío y el error que devuelve no dice
              // cuál faltó.
              disabled={abriendo || !elegido || !listo || (plantilla != null && !plantillaLista)}
              style={{
                height: 36,
                padding: "0 18px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 7,
                background: elegido && listo ? accent : T.border,
                color: elegido && listo ? "#fff" : T.faint,
                cursor: abriendo ? "wait" : elegido && listo ? "pointer" : "not-allowed",
              }}
            >
              {abriendo
                ? plantilla
                  ? "Enviando…"
                  : "Abriendo…"
                : plantilla
                  ? "Abrir y enviar la plantilla"
                  : "Abrir chat sin enviar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const CAMPO: React.CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 9px",
  fontSize: 13,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

const ETIQUETA: React.CSSProperties = {
  display: "block",
  marginBottom: 3,
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.faint,
};
