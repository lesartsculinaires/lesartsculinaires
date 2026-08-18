"use client";

import { useRef, useState } from "react";

import { addNota } from "@/app/actions";
import { Adjuntos } from "@/components/modules/Adjuntos";
import { ConfirmarCambios } from "@/components/modules/ConfirmarCambios";
import { CampoEditable } from "@/components/ui/CampoEditable";
import { Drawer, DrawerClose, SectionLabel } from "@/components/ui/Drawer";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { Sugerencias } from "@/components/ui/Sugerencias";
import { TecladoAcentos } from "@/components/ui/TecladoAcentos";
import {
  anotar,
  hayCambios,
  listar,
  quitar,
  valorVisible,
  VACIOS,
  type Pendientes,
} from "@/lib/cambios";
import { useCatalogo } from "@/lib/catalog";
import { fechaCorta, mesLargo, money } from "@/lib/format";
import { promocionesUsadas } from "@/lib/promociones";
import { estadoTone } from "@/lib/selectors";
import { T, softer } from "@/lib/theme";
import {
  esMenor,
  type CatalogItem,
  type ClientePatch,
  type Oportunidad,
  type OportunidadPatch,
} from "@/lib/types";

interface Props {
  oportunidad: Oportunidad;
  /** Para ofrecer las promociones ya escritas en otras oportunidades. */
  todas: readonly Oportunidad[];
  accent: string;
  menu: string | null;
  onToggleMenu: (key: string) => void;
  onEditar: (
    id: number,
    patch: OportunidadPatch,
    display: Partial<Oportunidad>,
  ) => void;
  onEditarCliente: (
    clienteId: number,
    patch: ClientePatch,
    display: Partial<Oportunidad>,
  ) => void;
  onClose: () => void;
}

/** Text box → the value a nullable column should store. */
const oNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/**
 * Casilla de edad → número, null al vaciarla, o `undefined` si no se entiende.
 *
 * Los tres casos son distintos y hay que poder distinguirlos. Vaciar la
 * casilla es una orden: borrá la edad. Escribir «1998» —el año de nacimiento
 * en la casilla equivocada, que pasa seguido— no es una orden de borrar nada,
 * y tratarlo como `null` haría desaparecer en silencio la edad que ya estaba.
 * Con `undefined` el cambio no se aplica y el campo vuelve a lo guardado.
 */
const oEdad = (s: string): number | null | undefined => {
  const v = s.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : undefined;
};

/** Money box → number, or null when cleared. */
const oMonto = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function ClienteDrawer({
  oportunidad: o,
  todas,
  accent,
  menu,
  onToggleMenu,
  onEditar,
  onEditarCliente,
  onClose,
}: Props) {
  const cat = useCatalogo();
  const soft = softer(accent);
  const [nota, setNota] = useState("");
  const [notaEstado, setNotaEstado] = useState<"idle" | "guardando" | "listo">("idle");
  const notaRef = useRef<HTMLTextAreaElement | null>(null);
  const promos = promocionesUsadas(todas);

  // Los campos ya no escriben solos: dejan acá lo que cambiaron y esperan a
  // que la persona lo revise y lo acepte.
  const [pendientes, setPendientes] = useState<Pendientes>(VACIOS);
  /** Lo tecleado en la casilla de Edad ahora mismo. Null si nadie la está tocando. */
  const [borradorEdad, setBorradorEdad] = useState<string | null>(null);
  const [repasando, setRepasando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [avisoSalida, setAvisoSalida] = useState(false);

  const anotarCambio = (
    clave: string,
    etiqueta: string,
    antes: string,
    despues: string,
    aplicar: () => void,
  ) => setPendientes((p) => anotar(p, { clave, etiqueta, antes, despues, aplicar }));

  const aceptar = () => {
    setGuardando(true);
    // Se aplican en el orden en que se hicieron. Cada uno ya es una escritura
    // optimista con su propio reintento, así que no hace falta esperarlos acá.
    for (const c of listar(pendientes)) c.aplicar();
    setPendientes(VACIOS);
    setGuardando(false);
    setRepasando(false);
  };

  /** Cerrar con cambios sin guardar pide confirmación en vez de perderlos. */
  const intentarCerrar = () => {
    if (hayCambios(pendientes)) setAvisoSalida(true);
    else onClose();
  };

  const [estadoFg, estadoBg] = estadoTone(o.estado, accent);

  /**
   * Each dropdown writes the foreign key and, separately, the label the UI
   * shows — so the change is visible immediately without a re-fetch.
   */
  const campos: {
    key: string;
    label: string;
    items: CatalogItem[];
    current: number | null;
    columna: keyof OportunidadPatch;
    display: keyof Oportunidad;
    displayId: keyof Oportunidad;
  }[] = [
    { key: "etapa", label: "Etapa", items: cat.etapas, current: o.etapaId, columna: "etapa_id", display: "etapa", displayId: "etapaId" },
    { key: "estado", label: "Estado", items: cat.estados, current: o.estadoId, columna: "estado_id", display: "estado", displayId: "estadoId" },
    { key: "producto", label: "Programa", items: cat.productos, current: o.productoId, columna: "producto_id", display: "producto", displayId: "productoId" },
    { key: "vendedor", label: "Vendedor", items: cat.vendedores, current: o.vendedorId, columna: "vendedor_id", display: "vendedor", displayId: "vendedorId" },
    { key: "canal", label: "Canal", items: cat.canales, current: o.canalId, columna: "canal_id", display: "canal", displayId: "canalId" },
    { key: "territorio", label: "Territorio", items: cat.territorios, current: o.territorioId, columna: "territorio_id", display: "territorio", displayId: "territorioId" },
  ];

  const etapaIdx = cat.etapas.findIndex((e) => e.id === o.etapaId);
  const perdida = o.estado === "Perdido";

  /** Fields stored on the opportunity itself. */
  const editables = [
    {
      clave: "fecha_registro",
      label: "Fecha de registro",
      value: o.fechaRegistro,
      tipo: "fecha" as const,
      requerido: true,
      guardar: (v: string) =>
        onEditar(o.id, { fecha_registro: v }, { fechaRegistro: v, mes: v.slice(0, 8) + "01" }),
    },
    {
      clave: "fecha_cierre",
      label: "Fecha de cierre",
      value: o.fechaCierre ?? "",
      tipo: "fecha" as const,
      requerido: false,
      guardar: (v: string) =>
        onEditar(o.id, { fecha_cierre: oNull(v) }, { fechaCierre: oNull(v) }),
    },
    {
      clave: "valor_oportunidad",
      label: "Valor oportunidad",
      value: o.valor == null ? "" : String(o.valor),
      tipo: "monto" as const,
      requerido: false,
      guardar: (v: string) =>
        onEditar(o.id, { valor_oportunidad: oMonto(v) }, { valor: oMonto(v) }),
    },
    {
      clave: "venta_cerrada",
      label: "Venta cerrada",
      value: o.cerrada == null ? "" : String(o.cerrada),
      tipo: "monto" as const,
      requerido: false,
      guardar: (v: string) =>
        onEditar(o.id, { venta_cerrada: oMonto(v) }, { cerrada: oMonto(v) }),
    },
    {
      clave: "descuento_promocion",
      label: "Descuento / promoción",
      value: o.descuento ?? "",
      tipo: "texto" as const,
      requerido: false,
      multilinea: true,
      acentos: true,
      placeholder: "Describí la promoción",
      guardar: (v: string) =>
        onEditar(o.id, { descuento_promocion: oNull(v) }, { descuento: oNull(v) }),
    },
  ];

  /** Fields stored on the shared client record. */
  const delCliente = [
    {
      clave: "cliente_nombre",
      label: "Nombre",
      value: o.cliente,
      tipo: "texto" as const,
      requerido: true,
      acentos: true,
      esNombre: true,
      guardar: (v: string) =>
        onEditarCliente(o.clienteId, { nombre: v }, { cliente: v }),
    },
    {
      clave: "cliente_telefono",
      label: "Teléfono",
      value: o.telefono ?? "",
      tipo: "texto" as const,
      requerido: false,
      guardar: (v: string) =>
        onEditarCliente(o.clienteId, { telefono: oNull(v) }, { telefono: oNull(v) }),
    },
    {
      clave: "cliente_correo",
      label: "Correo",
      value: o.correo ?? "",
      tipo: "texto" as const,
      requerido: false,
      guardar: (v: string) =>
        onEditarCliente(o.clienteId, { correo: oNull(v) }, { correo: oNull(v) }),
    },
    {
      clave: "cliente_edad",
      label: "Edad",
      value: o.edad == null ? "" : String(o.edad),
      tipo: "monto" as const,
      requerido: false,
      placeholder: "Sin dato",
      guardar: (v: string) => {
        const edad = oEdad(v);
        if (edad === undefined) return;
        onEditarCliente(o.clienteId, { edad }, { edad });
      },
    },
  ];

  // Los datos del adulto responsable. Sólo se piden para menores: mostrarlos
  // siempre llenaría la ficha de casillas vacías que nadie va a completar, y
  // las que importan se perderían entre ellas.
  const delResponsable = [
    {
      clave: "responsable_nombre",
      label: "Nombre y apellido",
      value: o.responsableNombre ?? "",
      tipo: "texto" as const,
      requerido: false,
      acentos: true,
      esNombre: true,
      placeholder: "Nombre y apellido del responsable",
      guardar: (v: string) =>
        onEditarCliente(
          o.clienteId,
          { responsable_nombre: oNull(v) },
          { responsableNombre: oNull(v) },
        ),
    },
    {
      clave: "responsable_correo",
      label: "Correo",
      value: o.responsableCorreo ?? "",
      tipo: "texto" as const,
      requerido: false,
      placeholder: "Correo del responsable",
      guardar: (v: string) =>
        onEditarCliente(
          o.clienteId,
          { responsable_correo: oNull(v) },
          { responsableCorreo: oNull(v) },
        ),
    },
    {
      clave: "responsable_telefono",
      label: "Celular",
      value: o.responsableTelefono ?? "",
      tipo: "texto" as const,
      requerido: false,
      placeholder: "Celular del responsable",
      guardar: (v: string) =>
        onEditarCliente(
          o.clienteId,
          { responsable_telefono: oNull(v) },
          { responsableTelefono: oNull(v) },
        ),
    },
  ];

  // La edad que manda es la que se está tecleando, no la guardada.
  //
  // `borradorEdad` es lo que hay en la casilla en este instante. Los campos de
  // la ficha guardan al perder el foco, así que sin esto las casillas del
  // responsable saldrían recién cuando el asesor hace clic en otro lado, y
  // hasta ese momento parecería que escribir la edad no hace nada.
  //
  // Con null —nadie tocando la casilla— se cae al valor guardado, o al que
  // haya quedado pendiente de confirmar.
  const edadEnPantalla = (() => {
    const puesto =
      borradorEdad ??
      valorVisible(pendientes, "cliente_edad", o.edad == null ? "" : String(o.edad));
    const n = Number(puesto);
    return puesto.trim() === "" || !Number.isFinite(n) ? null : n;
  })();

  const pideResponsable = esMenor(edadEnPantalla);
  const faltaResponsable =
    pideResponsable &&
    !valorVisible(pendientes, "responsable_nombre", o.responsableNombre ?? "").trim();

  const guardarNota = async () => {
    if (!nota.trim()) return;
    setNotaEstado("guardando");
    const r = await addNota(o.id, nota);
    setNotaEstado(r.ok ? "listo" : "idle");
    if (r.ok) setNota("");
  };

  const miniBtn = {
    height: 28,
    padding: "0 11px",
    fontSize: 12,
    borderRadius: 6,
    background: T.surface,
    border: `1px solid ${T.border}`,
    color: T.ink,
  } as const;

  return (
    <Drawer width={500} onClose={intentarCerrar}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            className="mono"
            style={{ margin: "0 0 5px", fontSize: 11, letterSpacing: "0.08em", color: T.faint }}
          >
            {o.codigo} · {fechaCorta(o.fechaRegistro)}
          </p>
          <h2
            className="dsp"
            style={{ margin: "0 0 4px", fontSize: 23, fontWeight: 700, lineHeight: 1.15 }}
          >
            {o.cliente}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
            {o.producto} · {o.territorio}
          </p>
        </div>
        <DrawerClose onClose={intentarCerrar} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, padding: "4px 11px", borderRadius: 20, background: estadoBg, color: estadoFg }}>
          {o.estado}
        </span>
        <span style={{ fontSize: 12, padding: "4px 11px", borderRadius: 20, background: T.paper, color: T.muted }}>
          {o.canal}
        </span>
      </div>

      <SectionLabel>Etapa del proceso</SectionLabel>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {cat.etapas.map((e, i) => {
          // A lost deal lights only its own step; the funnel never completed.
          const done = perdida ? i === etapaIdx : etapaIdx >= 0 && i <= etapaIdx;
          return (
            <div
              key={e.id}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 3,
                background: done ? (perdida ? "#B85042" : accent) : T.border,
              }}
            />
          );
        })}
      </div>
      <p style={{ margin: "0 0 22px", fontSize: 12, color: T.muted }}>
        {etapaIdx >= 0
          ? `Etapa ${etapaIdx + 1} de ${cat.etapas.length} · ${o.etapa}`
          : "Sin etapa asignada"}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Valor oportunidad", value: money(o.valor), bg: T.paper, color: undefined as string | undefined },
          { label: "Venta cerrada", value: money(o.cerrada), bg: o.cerrada ? soft : T.paper, color: o.cerrada ? accent : T.faint },
          { label: "Descuento", value: o.descuento ?? "—", bg: T.paper, color: undefined },
        ].map((m) => (
          <div key={m.label} style={{ background: m.bg, borderRadius: 8, padding: "11px 12px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: T.muted, lineHeight: 1.3 }}>
              {m.label}
            </p>
            <p
              className="mono dsp"
              style={{ margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: m.color }}
            >
              {m.value}
            </p>
          </div>
        ))}
      </div>

      <SectionLabel>Clasificación</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {campos.map((f) => {
          const key = `d:${f.key}`;
          const nombreDe = (id: number | null) =>
            f.items.find((i) => i.id === id)?.nombre ?? "—";
          // El desplegable muestra el borrador si ya se tocó, igual que los
          // campos de texto: si no, elegir algo no se vería hasta aceptar.
          const elegido = pendientes.get(`clas_${f.key}`);
          const nombreActual = elegido?.despues ?? nombreDe(f.current);

          return (
            <FilterMenu
              key={key}
              menuKey={key}
              label={f.label}
              variant="stacked"
              options={f.items.map((i) => ({ label: i.nombre, value: i.id }))}
              current={f.items.find((i) => i.nombre === nombreActual)?.id ?? f.current}
              valueText={nombreActual}
              open={menu === key}
              accent={accent}
              onToggle={() => onToggleMenu(key)}
              onPick={(v) => {
                const id = v as number;
                const nombre = nombreDe(id);
                anotarCambio(`clas_${f.key}`, f.label, nombreDe(f.current), nombre, () =>
                  onEditar(
                    o.id,
                    { [f.columna]: id } as OportunidadPatch,
                    { [f.display]: nombre, [f.displayId]: id } as Partial<Oportunidad>,
                  ),
                );
              }}
            />
          );
        })}
      </div>

      <SectionLabel>Registro</SectionLabel>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 9, marginBottom: 8 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            padding: "9px 13px",
          }}
        >
          <span style={{ fontSize: 12, color: T.muted }}>Código</span>
          <span className="mono" style={{ fontSize: 13 }}>{o.codigo}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            padding: "9px 13px",
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <span style={{ fontSize: 12, color: T.muted }}>Mes</span>
          <span style={{ fontSize: 13 }}>{mesLargo(o.mes)}</span>
        </div>
        {editables.map((f) => (
          <div key={f.label} style={{ borderTop: `1px solid ${T.border}` }}>
            <CampoEditable
              label={f.label}
              value={valorVisible(pendientes, f.clave, f.value)}
              tipo={f.tipo}
              requerido={f.requerido}
              accent={accent}
              acentos={"acentos" in f && f.acentos}
              multilinea={"multilinea" in f && f.multilinea}
              placeholder={"placeholder" in f ? f.placeholder : undefined}
              extra={
                f.label === "Descuento / promoción"
                  ? (borrador, poner) => (
                      <Sugerencias
                        opciones={promos}
                        valor={borrador}
                        onElegir={poner}
                        accent={accent}
                      />
                    )
                  : undefined
              }
              onGuardar={(v) =>
                anotarCambio(f.clave, f.label, f.value, v, () => f.guardar(v))
              }
            />
          </div>
        ))}
      </div>
      <p style={{ margin: "0 0 20px", fontSize: 11, color: T.faint }}>
        Nada se guarda hasta que uses <strong>Guardar cambios</strong>, abajo.
      </p>

      <SectionLabel>Datos del cliente</SectionLabel>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 9 }}>
        {delCliente.map((f, i) => (
          <div key={f.label} style={{ borderTop: i ? `1px solid ${T.border}` : "none" }}>
            <CampoEditable
              label={f.label}
              value={valorVisible(pendientes, f.clave, f.value)}
              tipo={f.tipo}
              requerido={f.requerido}
              accent={accent}
              acentos={"acentos" in f && f.acentos}
              esNombre={"esNombre" in f && f.esNombre}
              placeholder={f.requerido ? undefined : "Sin dato"}
              onBorrador={f.clave === "cliente_edad" ? setBorradorEdad : undefined}
              onGuardar={(v) =>
                anotarCambio(f.clave, f.label, f.value, v, () => f.guardar(v))
              }
            />
          </div>
        ))}
      </div>
      <p style={{ margin: "6px 0 14px", fontSize: 11, color: T.warn, lineHeight: 1.45 }}>
        Ojo: estos datos son del cliente, no de esta oportunidad. Si tiene varias,
        el cambio se ve en todas.
      </p>

      {pideResponsable && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Adulto responsable</SectionLabel>
          <p style={{ margin: "0 0 8px", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
            El alumno tiene {edadEnPantalla} años, así que la inscripción necesita un
            adulto que responda por él.
          </p>
          <div
            style={{
              border: `1px solid ${faltaResponsable ? T.warn : T.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {delResponsable.map((f, i) => (
              <div key={f.clave} style={{ borderTop: i ? `1px solid ${T.border}` : "none" }}>
                <CampoEditable
                  label={f.label}
                  value={valorVisible(pendientes, f.clave, f.value)}
                  tipo={f.tipo}
                  requerido={f.requerido}
                  accent={accent}
                  acentos={"acentos" in f && f.acentos}
                  esNombre={"esNombre" in f && f.esNombre}
                  placeholder={f.placeholder}
                  onGuardar={(v) =>
                    anotarCambio(f.clave, `Responsable · ${f.label}`, f.value, v, () =>
                      f.guardar(v),
                    )
                  }
                />
              </div>
            ))}
          </div>
          {faltaResponsable && (
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: T.warn, lineHeight: 1.45 }}>
              Falta el nombre del responsable.
            </p>
          )}
        </div>
      )}

      {(o.telefono || o.correo) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {o.telefono && (
            <>
              <a href={`tel:${o.telefono}`} style={{ ...miniBtn, textDecoration: "none", lineHeight: "28px" }}>
                Llamar
              </a>
              <a
                href={`https://wa.me/503${o.telefono.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                style={{ ...miniBtn, textDecoration: "none", lineHeight: "28px" }}
              >
                WhatsApp
              </a>
            </>
          )}
          {o.correo && (
            <a href={`mailto:${o.correo}`} style={{ ...miniBtn, textDecoration: "none", lineHeight: "28px" }}>
              Escribir
            </a>
          )}
        </div>
      )}

      <SectionLabel>Registrar seguimiento</SectionLabel>
      <textarea
        ref={notaRef}
        value={nota}
        onChange={(e) => {
          setNota(e.target.value);
          setNotaEstado("idle");
        }}
        placeholder="Qué pasó en el contacto, objeciones, acuerdos…"
        style={{
          width: "100%",
          minHeight: 74,
          padding: "11px 13px",
          font: "inherit",
          fontSize: 13,
          color: T.ink,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          background: T.paper,
          resize: "vertical",
        }}
      />
      <div style={{ marginTop: 8 }}>
        <TecladoAcentos
          campo={notaRef}
          valor={nota}
          onCambio={(v: string) => {
            setNota(v);
            setNotaEstado("idle");
          }}
          accent={accent}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button
          type="button"
          onClick={guardarNota}
          disabled={!nota.trim() || notaEstado === "guardando"}
          style={{
            height: 36,
            padding: "0 16px",
            fontSize: 13,
            borderRadius: 7,
            background: nota.trim() ? accent : T.border,
            color: nota.trim() ? "#fff" : T.faint,
            cursor: nota.trim() ? "pointer" : "not-allowed",
          }}
        >
          {notaEstado === "guardando" ? "Guardando…" : "Guardar nota"}
        </button>
        {notaEstado === "listo" && (
          <span style={{ fontSize: 12, color: "#2F6B4F" }}>Nota guardada.</span>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <SectionLabel>Documentos adjuntos</SectionLabel>
        <Adjuntos oportunidadId={o.id} accent={accent} />
      </div>

      <div
        style={{
          marginTop: 22,
          paddingTop: 16,
          borderTop: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setRepasando(true)}
          disabled={!hayCambios(pendientes)}
          style={{
            height: 38,
            padding: "0 18px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 7,
            background: hayCambios(pendientes) ? accent : T.border,
            color: hayCambios(pendientes) ? "#fff" : T.faint,
            cursor: hayCambios(pendientes) ? "pointer" : "not-allowed",
          }}
        >
          Guardar cambios
        </button>

        <span style={{ fontSize: 12, color: hayCambios(pendientes) ? T.warn : T.faint }}>
          {hayCambios(pendientes)
            ? `${pendientes.size} sin guardar`
            : "No hay cambios sin guardar"}
        </span>

        {hayCambios(pendientes) && (
          <button
            type="button"
            onClick={() => setPendientes(VACIOS)}
            style={{ fontSize: 12, color: T.muted, padding: "0 4px" }}
          >
            Descartar todo
          </button>
        )}
      </div>

      {repasando && (
        <ConfirmarCambios
          pendientes={pendientes}
          accent={accent}
          cliente={o.cliente}
          guardando={guardando}
          onAceptar={aceptar}
          onCancelar={() => setRepasando(false)}
          onQuitar={(clave) =>
            setPendientes((p) => {
              const resto = quitar(p, clave);
              // Quitado el último, el repaso se queda sin nada que mostrar.
              if (!hayCambios(resto)) setRepasando(false);
              return resto;
            })
          }
        />
      )}

      {avisoSalida && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cambios sin guardar"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 95,
            background: "rgba(3, 27, 79, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 380,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: "18px 20px",
              boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
            }}
          >
            <h2 className="dsp" style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              Tenés cambios sin guardar
            </h2>
            <p style={{ margin: "7px 0 16px", fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
              {pendientes.size === 1 ? "1 cambio" : `${pendientes.size} cambios`} en esta
              ficha. Si salís ahora se pierden.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              <button
                type="button"
                onClick={() => setAvisoSalida(false)}
                style={{
                  height: 34,
                  padding: "0 14px",
                  fontSize: 12.5,
                  borderRadius: 7,
                  border: `1px solid ${T.border}`,
                  color: T.ink,
                  background: T.surface,
                }}
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendientes(VACIOS);
                  setAvisoSalida(false);
                  onClose();
                }}
                style={{
                  height: 34,
                  padding: "0 14px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  borderRadius: 7,
                  background: "#B85042",
                  color: "#fff",
                }}
              >
                Salir sin guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
