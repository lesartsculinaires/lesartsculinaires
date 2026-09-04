"use client";

import { useMemo, useRef, useState } from "react";

import { importarClientes, type FilaParaImportar } from "@/app/actions";
import { RevisarBase } from "@/components/modules/RevisarBase";
import {
  claveDePersona,
  construirPlan,
  enLotes,
  type Modo,
} from "@/lib/planImportacion";
import { useCatalogo } from "@/lib/catalog";
import { fechaCorta, money } from "@/lib/format";
import type { ContactoConocido } from "@/lib/duplicados";
import {
  A_NOTA,
  CAMPOS,
  construirFilas,
  detectarMapeo,
  parseDelimitado,
  type ClaveCampo,
  type FilaImportada,
  type Mapeo,
} from "@/lib/importar";
import { seAcomoda } from "@/lib/texto";
import { T, softer } from "@/lib/theme";
import { CORTO_VALOR_OPORTUNIDAD } from "@/lib/montosDelLead";
import type { Oportunidad } from "@/lib/types";

interface Props {
  accent: string;
  /** Para saber qué clientes ya existen y marcar duplicados. */
  oportunidades: readonly Oportunidad[];
  onCerrar: () => void;
  onImportado: (resumen: string) => void;
}

/** Cuántas filas manda cada llamada. Los server actions tienen tope de cuerpo. */
const LOTE = 200;

function hoyISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ImportarClientes({ accent, oportunidades, onCerrar, onImportado }: Props) {
  const catalogo = useCatalogo();

  const [archivo, setArchivo] = useState<string | null>(null);
  const [matriz, setMatriz] = useState<string[][] | null>(null);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  /** Qué hacer con las filas que coinciden con un contacto existente. */
  // Unificar es el valor por omisión: es lo que casi siempre se quiere y lo
  // que evita el problema por el que existe esta pantalla. Antes venía en
  // «omitir», que descartaba filas en silencio.
  const [modoDuplicados, setModoDuplicados] = useState<Modo>("unificar");
  const [revisando, setRevisando] = useState(false);
  /** Grupos que alguien miró y dijo que no son la misma persona. */
  const [separados, setSeparados] = useState<string[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  /** Aviso cuando el Excel traía varias hojas. */
  const [hoja, setHoja] = useState<string | null>(null);
  /*
   * Enderezar los nombres que vienen en MAYÚSCULAS o con espacios de más.
   *
   * Encendido por omisión, y no apagado, porque el caso normal es que haga
   * falta: las planillas que exporta la escuela vienen en mayúsculas enteras.
   * Apagado por omisión, nadie lo encontraría, y las trescientas fichas
   * entrarían gritando.
   *
   * Es seguro de tener encendido: son las mismas letras en otro caso. Las
   * tildes NO se tocan acá —eso cambia letras y se propone de a una, en la
   * ficha, con alguien mirando—.
   */
  const [acomodarNombres, setAcomodarNombres] = useState(true);

  const existentes: ContactoConocido[] = useMemo(() => {
    const m = new Map<number, ContactoConocido>();
    for (const o of oportunidades) {
      if (!m.has(o.clienteId)) {
        m.set(o.clienteId, {
          clienteId: o.clienteId,
          nombre: o.cliente,
          telefono: o.telefono,
          correo: o.correo,
          codigo: o.codigo,
        });
      }
    }
    return [...m.values()];
  }, [oportunidades]);

  const filas: FilaImportada[] = useMemo(() => {
    if (!matriz || matriz.length < 2) return [];
    return construirFilas({
      matriz,
      mapeo,
      catalogo,
      existentes,
      fechaPorDefecto: hoyISO(),
      acomodarNombres,
    });
  }, [matriz, mapeo, catalogo, existentes, acomodarNombres]);

  /*
   * Cuántos nombres cambiarían. Se calcula siempre con la opción apagada, para
   * poder decir el número aunque esté encendida: si se contara sobre `filas`,
   * al encenderla el número caería a cero y no se sabría qué se aplicó.
   */
  const nombresQueSeAcomodan = useMemo(() => {
    if (!matriz || matriz.length < 2) return 0;
    return construirFilas({
      matriz,
      mapeo,
      catalogo,
      existentes: [],
      fechaPorDefecto: hoyISO(),
    }).filter((f) => f.nombre && seAcomoda(f.nombre)).length;
  }, [matriz, mapeo, catalogo]);

  const validas = filas.filter((f) => f.errores.length === 0);
  const conError = filas.length - validas.length;
  const duplicadas = validas.filter((f) => f.duplicado).length;
  const conAviso = validas.filter((f) => f.avisos.length > 0).length;

  // Quién es quién: junta las filas del archivo entre sí y contra el CRM, y
  // deja dicho qué se crea, qué se completa y qué se omite.
  /*
   * Los programas de los leads ABIERTOS de cada contacto.
   *
   * Con esto el resumen puede avisar antes de importar cuántas filas le van a
   * abrir un segundo lead a alguien que ya está, por ser de otro programa. Es
   * lo que la escuela vio como duplicado sin serlo.
   *
   * Los cerrados se dejan afuera: no reciben nada, así que no cambian la
   * respuesta.
   */
  const leadsAbiertos = useMemo(() => {
    const m = new Map<number, (number | null)[]>();
    for (const o of oportunidades) {
      if (o.estado === "Ganado" || o.estado === "Perdido") continue;
      const suyos = m.get(o.clienteId);
      if (suyos) suyos.push(o.productoId);
      else m.set(o.clienteId, [o.productoId]);
    }
    return m;
  }, [oportunidades]);

  const plan = useMemo(
    () => construirPlan({ filas, existentes, modo: modoDuplicados, separados, leadsAbiertos }),
    [filas, existentes, modoDuplicados, separados, leadsAbiertos],
  );

  const aImportar = plan.destinos;
  const seUnifican = plan.resumen.seUnenAlCrm + plan.resumen.seJuntanEntreSi;
  const hayNombre = Object.values(mapeo).includes("nombre");

  // Los encabezados que van a la bitácora, para decirlo antes de importar: es
  // la única parte del mapeo que admite varias columnas, y conviene que quien
  // sube el archivo vea cuáles agarró solo.
  const encabezadosNota = matriz
    ? Object.keys(mapeo)
        .map(Number)
        .filter((i) => mapeo[i] === A_NOTA)
        .sort((a, b) => a - b)
        .map((i) => matriz[0][i]?.trim() || `columna ${i + 1}`)
    : [];

  const leerArchivo = async (file: File) => {
    setLeyendo(true);
    setError(null);
    setMatriz(null);
    setArchivo(file.name);

    try {
      let datos: string[][];

      if (/\.xlsx?$/i.test(file.name)) {
        // Se carga sólo al abrir un Excel: es la dependencia más pesada y la
        // mayoría de las importaciones son CSV.
        // El paquete sólo expone subrutas; `/browser` es la build para el DOM.
        const readXlsx = (await import("read-excel-file/browser")).default;

        // Sin opciones, la librería devuelve una entrada por hoja
        // (`{ sheet, data }`), no una matriz plana. Se toma la primera hoja
        // que tenga encabezado y datos, y se avisa si el libro traía más.
        const crudo = (await readXlsx(file)) as unknown;
        const hojas: { sheet: string; data: unknown[][] }[] = Array.isArray(crudo)
          && crudo.length > 0
          && typeof crudo[0] === "object"
          && crudo[0] !== null
          && "data" in (crudo[0] as object)
            ? (crudo as { sheet: string; data: unknown[][] }[])
            : [{ sheet: "", data: (crudo ?? []) as unknown[][] }];

        const util = hojas.find((h) => h.data.filter((f) => f.some((c) => String(c ?? "").trim())).length >= 2);
        if (!util) {
          setError("El Excel no tiene ninguna hoja con encabezado y datos.");
          setLeyendo(false);
          return;
        }
        if (hojas.length > 1) {
          setHoja(`Se leyó la hoja «${util.sheet}» de ${hojas.length} que trae el archivo.`);
        } else {
          setHoja(null);
        }

        datos = util.data.map((fila) =>
          fila.map((c) =>
            c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c),
          ),
        );
      } else {
        setHoja(null);
        datos = parseDelimitado(await file.text());
      }

      const utiles = datos.filter((f) => f.some((c) => String(c).trim()));
      if (utiles.length < 2) {
        setError("El archivo no tiene encabezado y al menos una fila de datos.");
        setLeyendo(false);
        return;
      }

      setMatriz(utiles);
      setMapeo(detectarMapeo(utiles[0]));
    } catch (e) {
      setError(
        `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    setLeyendo(false);
  };

  /*
   * ------------------------------------------------------------------------
   * UNA IMPORTACIÓN A LA VEZ, Y ESTO ES LO QUE DE VERDAD LO IMPIDE
   * ------------------------------------------------------------------------
   *
   * Apagar el botón mientras corre acomoda la pantalla, pero no alcanza:
   * entre el clic y el repintado de React hay un instante, y un segundo clic
   * que caiga ahí entra igual. En una tablet es todavía más fácil, porque un
   * toque puede llegar dos veces.
   *
   * Y el precio de que entre es alto: la segunda vuelta arranca con `base` en
   * nulo, así que abre OTRA fila de importación y vuelve a cargar el archivo
   * entero. Es exactamente lo que pasó con «Asalariados 2025-2026»: dos bases
   * del mismo nombre, del mismo minuto, con las mismas 326 filas cada una.
   *
   * Un `ref` no espera al repintado: se pone en el mismo tick del primer clic,
   * así que el segundo ya lo encuentra puesto.
   */
  const corriendo = useRef(false);

  const importar = async () => {
    if (corriendo.current) return;
    corriendo.current = true;
    try {
      await importarDeVerdad();
    } finally {
      corriendo.current = false;
    }
  };

  const importarDeVerdad = async () => {
    setError(null);
    setProgreso({ hechas: 0, total: aImportar.length });

    // Los datos del contacto salen del grupo y no de la fila suelta: es lo que
    // hace que el teléfono que traía una fila complete el hueco de la otra. Lo
    // de la oportunidad —programa, valor, fechas— sí es de cada fila, porque
    // cada una es una consulta distinta de la misma persona.
    const cargaDe = (d: (typeof aImportar)[number]): FilaParaImportar => ({
      unificar_con: d.unificarCon,
      grupo: d.grupo,
      nombre: d.nombre,
      telefono: d.telefono,
      correo: d.correo,
      vendedor_id: d.fila.vendedor_id,
      producto_id: d.fila.producto_id,
      territorio_id: d.fila.territorio_id,
      canal_id: d.fila.canal_id,
      etapa_id: d.fila.etapa_id,
      estado_id: d.fila.estado_id,
      fecha_registro: d.fila.fecha_registro,
      fecha_cierre: d.fila.fecha_cierre,
      valor_oportunidad: d.fila.valor_oportunidad,
      venta_cerrada: d.fila.venta_cerrada,
      descuento_promocion: d.fila.descuento_promocion,
      // De la persona, unificados con los de sus otras filas.
      pais: d.pais,
      fecha_nacimiento: d.fecha_nacimiento,
      edad: d.edad,
      // De la fila: cada consulta dejó su propia nota.
      nota: d.fila.nota,
    });

    let creados = 0;
    /** Filas que no crearon un lead porque cayeron sobre uno que ya existía. */
    let juntados = 0;
    let primero: string | null = null;
    let ultimo: string | null = null;
    // Todos los lotes del mismo archivo cuelgan de una sola base.
    let base: number | null = null;

    for (const lote of enLotes(aImportar, LOTE).map((l) => l.map(cargaDe))) {
      // El modo viaja porque el servidor vuelve a cotejar contra la base
      // entera —ve cosas que la pantalla no ve— y tiene que saber cuándo NO
      // hacerlo: «crear» es la salida de emergencia para meter algo tal cual,
      // y si el servidor unificara igual, esa salida no existiría.
      const r = await importarClientes(lote, archivo ?? "sin nombre", base, modoDuplicados);

      if (!r.ok) {
        setProgreso(null);
        setError(
          creados === 0
            ? r.error
            : `${r.error} — se alcanzaron a importar ${creados} filas antes del corte.`,
        );
        return;
      }

      creados += r.creados;
      juntados += r.juntados ?? 0;
      primero = primero ?? r.desde;
      ultimo = r.hasta ?? ultimo;
      base = base ?? r.importacionId ?? null;
      setProgreso({ hechas: creados, total: aImportar.length });
    }

    setRevisando(false);
    setProgreso(null);
    onImportado(
      `${creados} ${creados === 1 ? "cliente importado" : "clientes importados"}` +
        (primero ? ` (${primero} a ${ultimo})` : "") +
        ".",
    );
  };

  const campo = {
    height: 30,
    padding: "0 8px",
    fontSize: 12.5,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    background: T.surface,
  } as const;

  const th = {
    textAlign: "left" as const,
    padding: "8px 10px",
    fontWeight: 500,
    fontSize: 11,
    color: T.muted,
    whiteSpace: "nowrap" as const,
    borderBottom: `1px solid ${T.border}`,
  };

  return (
    <>
      <div
        onClick={progreso ? undefined : onCerrar}
        style={{ position: "fixed", inset: 0, background: "rgba(31,29,26,0.35)", zIndex: 70 }}
      />
      <div
        role="dialog"
        aria-label="Subir base de datos"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(1000px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          background: T.paper,
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          zIndex: 80,
          boxShadow: "0 12px 40px rgba(31,29,26,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            padding: "16px 20px",
            borderBottom: `1px solid ${T.border}`,
            background: T.surface,
            borderRadius: "12px 12px 0 0",
          }}
        >
          <div>
            <p className="dsp" style={{ margin: "0 0 3px", fontSize: 17, fontWeight: 700 }}>
              Subir base de datos
            </p>
            <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
              Archivos .xlsx, .csv o .txt. Se revisa todo antes de escribir nada.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={Boolean(progreso)}
            aria-label="Cerrar"
            style={{ fontSize: 18, color: T.faint, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          <label
            style={{
              display: "block",
              padding: "18px 20px",
              marginBottom: 18,
              textAlign: "center",
              border: `1.5px dashed ${matriz ? accent : T.borderStrong}`,
              borderRadius: 10,
              background: matriz ? softer(accent) : T.surface,
              cursor: "pointer",
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt,text/csv,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) leerArchivo(f);
              }}
              style={{ display: "none" }}
            />
            <span style={{ fontSize: 13, color: matriz ? accent : T.ink }}>
              {leyendo
                ? "Leyendo…"
                : archivo
                  ? `${archivo} — ${matriz ? `${matriz.length - 1} filas` : "sin leer"}. Clic para cambiar.`
                  : "Elegí un archivo .xlsx, .csv o .txt"}
            </span>
          </label>

          {error && (
            <p
              style={{
                margin: "0 0 16px",
                padding: "10px 13px",
                fontSize: 12.5,
                borderRadius: 7,
                background: "#F7EBE9",
                color: "#8C3B2F",
              }}
            >
              {error}
            </p>
          )}

          {hoja && (
            <p
              style={{
                margin: "0 0 16px",
                padding: "10px 13px",
                fontSize: 12.5,
                borderRadius: 7,
                background: "#F6EEDC",
                color: "#7A5A12",
              }}
            >
              {hoja}
            </p>
          )}

          {matriz && (
            <>
              <p
                className="mono"
                style={{
                  margin: "0 0 9px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  color: T.faint,
                  textTransform: "uppercase",
                }}
              >
                Qué es cada columna
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                  gap: 9,
                  marginBottom: 18,
                }}
              >
                {matriz[0].map((h, i) => (
                  <label key={i} style={{ display: "block", minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        marginBottom: 3,
                        fontSize: 11.5,
                        color: T.muted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={h}
                    >
                      {h || `(columna ${i + 1})`}
                    </span>
                    <select
                      value={mapeo[i] ?? ""}
                      onChange={(e) =>
                        setMapeo((m) => ({
                          ...m,
                          [i]: e.target.value as ClaveCampo | typeof A_NOTA | "",
                        }))
                      }
                      style={{ ...campo, width: "100%" }}
                    >
                      <option value="">— no importar —</option>
                      {CAMPOS.map((c) => (
                        <option key={c.clave} value={c.clave}>
                          {c.etiqueta}
                          {c.obligatorio ? " *" : ""}
                        </option>
                      ))}
                      {/*
                        Aparte y al final: no es un campo más, es la salida
                        para todas las columnas que no tienen dónde caer. Y a
                        diferencia de los campos, se puede elegir en varias
                        columnas a la vez.
                      */}
                      <option value={A_NOTA}>↳ A las notas del lead</option>
                    </select>
                  </label>
                ))}
              </div>

              {encabezadosNota.length > 0 && (
                <p
                  style={{
                    margin: "0 0 16px",
                    padding: "10px 13px",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    borderRadius: 7,
                    background: "#EDF3EE",
                    color: "#2F5B45",
                  }}
                >
                  {encabezadosNota.length === 1
                    ? `La columna «${encabezadosNota[0]}» va a quedar como nota en la ficha de cada lead.`
                    : `Estas columnas van a quedar como nota en la ficha de cada lead: ${encabezadosNota
                        .map((h) => `«${h}»`)
                        .join(", ")}.`}{" "}
                  Si alguna dice «recuperación», el CRM agenda la llamada para dentro de una
                  semana.
                </p>
              )}

              {hayNombre && nombresQueSeAcomodan > 0 && (
                <label
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    margin: "0 0 16px",
                    padding: "10px 13px",
                    borderRadius: 7,
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={acomodarNombres}
                    onChange={(e) => setAcomodarNombres(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                    <strong>
                      Acomodar {nombresQueSeAcomodan}{" "}
                      {nombresQueSeAcomodan === 1 ? "nombre" : "nombres"}
                    </strong>{" "}
                    que vienen en MAYÚSCULAS, en minúsculas o con espacios de más.
                    Son las mismas letras, bien capitalizadas: «MARIA DEL CARMEN» queda
                    «Maria del Carmen». Las tildes no se tocan acá; ésas se proponen de a
                    una en la ficha.
                  </span>
                </label>
              )}

              {!hayNombre && (
                <p
                  style={{
                    margin: "0 0 16px",
                    padding: "10px 13px",
                    fontSize: 12.5,
                    borderRadius: 7,
                    background: "#F6EEDC",
                    color: "#7A5A12",
                  }}
                >
                  Falta asignar la columna del <strong>nombre del cliente</strong>. Sin
                  eso no se puede importar.
                </p>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 9,
                  marginBottom: 14,
                }}
              >
                {[
                  { l: "Se importan", v: String(aImportar.length), destaca: true },
                  {
                    l: modoDuplicados === "unificar" ? "Se unifican" : "Duplicados",
                    v: String(modoDuplicados === "unificar" ? seUnifican : duplicadas),
                  },
                  { l: "Con advertencia", v: String(conAviso) },
                  { l: "Con error", v: String(conError) },
                ].map((k) => (
                  <div key={k.l} style={{ background: T.surface, borderRadius: 8, padding: "10px 13px", border: `1px solid ${T.border}` }}>
                    <p style={{ margin: "0 0 4px", fontSize: 11, color: T.muted }}>{k.l}</p>
                    <p
                      className="mono dsp"
                      style={{ margin: 0, fontSize: 19, fontWeight: 500, color: k.destaca ? accent : T.ink }}
                    >
                      {k.v}
                    </p>
                  </div>
                ))}
              </div>

              {duplicadas > 0 && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: "#FFF6D6",
                    border: "1px solid #F0CE55",
                    color: "#6B5200",
                  }}
                >
                  <p style={{ margin: "0 0 9px", fontSize: 12.5, lineHeight: 1.5 }}>
                    {duplicadas} {duplicadas === 1 ? "fila coincide" : "filas coinciden"} por
                    nombre, teléfono o correo con un contacto que ya existe (o con otra
                    fila del mismo archivo). ¿Qué hacemos con ellas?
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {([
                      ["omitir", "Omitirlas", "No se importan. La base queda como está."],
                      // Antes decía «la oportunidad se agrega al contacto que ya
                      // existe», y eso era exactamente el problema: agregaba una
                      // oportunidad más y quedaban dos leads. Ahora completa el
                      // que ya está, y la frase tiene que decir eso.
                      ["unificar", "Unificarlas", "Se completa el lead que la persona ya tiene, sin crear otro. Sólo se abre uno nuevo si es de otro programa, porque ahí son dos ventas distintas."],
                      ["crear", "Crearlas igual", "Se crea un contacto nuevo. Sólo si de verdad son personas distintas."],
                    ] as const).map(([valor, titulo, detalle]) => (
                      <label
                        key={valor}
                        style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}
                      >
                        <input
                          type="radio"
                          name="duplicados"
                          checked={modoDuplicados === valor}
                          onChange={() => setModoDuplicados(valor)}
                          style={{ marginTop: 3 }}
                        />
                        <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                          <strong>{titulo}.</strong> {detalle}
                        </span>
                      </label>
                    ))}
                  </div>
                  {modoDuplicados === "unificar" && duplicadas > seUnifican && (
                    <p style={{ margin: "9px 0 0", fontSize: 12, lineHeight: 1.5 }}>
                      {duplicadas - seUnifican}{" "}
                      {duplicadas - seUnifican === 1 ? "fila se repite" : "filas se repiten"}{" "}
                      dentro del propio archivo, así que no hay con quién unificarlas: esas
                      se omiten.
                    </p>
                  )}

                  {/*
                    El aviso que faltaba.

                    Una fila de alguien que ya está pero por OTRO programa no se
                    une a su lead: le abre un segundo, y está bien que lo haga
                    —son dos ventas, con dos montos—. Pero en la lista de
                    Clientes esa persona pasa a ocupar dos filas, y eso se lee
                    como un duplicado recién importado.

                    Decirlo acá lo convierte en algo esperado en vez de una
                    sorpresa. Y con los nombres, no sólo el número: así se puede
                    mirar uno y confirmar que es lo que se quería.
                  */}
                  {modoDuplicados === "unificar" && plan.resumen.abrenOtroLead > 0 && (
                    <p style={{ margin: "9px 0 0", fontSize: 12, lineHeight: 1.5 }}>
                      Ojo: a{" "}
                      <strong>
                        {plan.resumen.abrenOtroLead}{" "}
                        {plan.resumen.abrenOtroLead === 1 ? "persona" : "personas"}
                      </strong>{" "}
                      que ya {plan.resumen.abrenOtroLead === 1 ? "está" : "están"} en el CRM
                      se le abre un lead nuevo igual, porque el programa es otro. No es un
                      duplicado —son dos ventas distintas— pero {plan.resumen.abrenOtroLead === 1
                        ? "va a aparecer"
                        : "van a aparecer"}{" "}
                      dos veces en la lista de Clientes, marcadas «1 de 2».
                      {plan.resumen.aQuienesAbrenOtro.length > 0 && (
                        <>
                          {" "}
                          {plan.resumen.aQuienesAbrenOtro.slice(0, 3).join(", ")}
                          {plan.resumen.aQuienesAbrenOtro.length > 3 &&
                            ` y ${plan.resumen.aQuienesAbrenOtro.length - 3} más`}
                          .
                        </>
                      )}
                    </p>
                  )}
                </div>
              )}

              <p
                className="mono"
                style={{
                  margin: "0 0 9px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  color: T.faint,
                  textTransform: "uppercase",
                }}
              >
                Cómo va a quedar — primeras {Math.min(filas.length, 12)} de {filas.length}
              </p>
              <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: T.paper }}>
                      <th style={th}>#</th>
                      <th style={th}>Cliente</th>
                      <th style={th}>Programa</th>
                      <th style={th}>Vendedor</th>
                      <th style={th}>Etapa</th>
                      <th style={th}>Fecha</th>
                      <th style={{ ...th, textAlign: "right" }}>{CORTO_VALOR_OPORTUNIDAD}</th>
                      <th style={th}>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, 12).map((f) => {
                      const nom = (id: number | null, items: readonly { id: number; nombre: string }[]) =>
                        items.find((x) => x.id === id)?.nombre ?? "—";
                      const malo = f.errores.length > 0;
                      const unificada =
                        !malo && f.duplicado && modoDuplicados === "unificar" && f.coincideCon != null;
                      const omitida =
                        !malo && f.duplicado && !unificada && modoDuplicados !== "crear";
                      return (
                        <tr
                          key={f.linea}
                          style={{
                            borderTop: `1px solid ${T.border}`,
                            opacity: malo || omitida ? 0.5 : 1,
                          }}
                        >
                          <td className="mono" style={{ padding: "8px 10px", color: T.faint }}>{f.linea}</td>
                          <td style={{ padding: "8px 10px" }}>{f.nombre || "—"}</td>
                          <td style={{ padding: "8px 10px", color: T.muted }}>{nom(f.producto_id, catalogo.productos)}</td>
                          <td style={{ padding: "8px 10px", color: T.muted }}>{nom(f.vendedor_id, catalogo.vendedores)}</td>
                          <td style={{ padding: "8px 10px", color: T.muted }}>{nom(f.etapa_id, catalogo.etapas)}</td>
                          <td className="mono" style={{ padding: "8px 10px", color: T.muted }}>{fechaCorta(f.fecha_registro)}</td>
                          <td className="mono" style={{ padding: "8px 10px", textAlign: "right" }}>{money(f.valor_oportunidad)}</td>
                          <td style={{ padding: "8px 10px", fontSize: 11.5, lineHeight: 1.45 }}>
                            {malo && <span style={{ color: "#B85042" }}>{f.errores.join("; ")}</span>}
                            {omitida && <span style={{ color: "#7A5A12" }}>Duplicado, se omite</span>}
                            {unificada && (
                              <span style={{ color: "#2F6B4F" }}>Se une al contacto existente</span>
                            )}
                            {!malo && f.avisos.length > 0 && (
                              <span style={{ color: T.faint, display: "block" }}>{f.avisos.join("; ")}</span>
                            )}
                            {!malo && !omitida && !unificada && f.avisos.length === 0 && (
                              <span style={{ color: "#2F6B4F" }}>Lista</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p style={{ margin: "12px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
                Las fechas tipo 03/04/2026 se leen como día/mes. Los valores de programa,
                vendedor, etapa, estado, canal y territorio que no estén en el catálogo se
                dejan vacíos: la fila se importa igual y después se completa a mano.
              </p>
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            borderTop: `1px solid ${T.border}`,
            background: T.surface,
            borderRadius: "0 0 12px 12px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: T.muted }}>
            {progreso
              ? `Importando ${progreso.hechas} de ${progreso.total}…`
              : matriz
                ? seUnifican > 0
                  ? `Se crean ${aImportar.length - seUnifican} contactos nuevos y ${seUnifican} se une${seUnifican === 1 ? "" : "n"} a contactos que ya existen.`
                  : `Se van a crear ${aImportar.length} clientes con su primera oportunidad.`
                : ""}
          </span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={onCerrar}
              disabled={Boolean(progreso)}
              style={{ fontSize: 13, color: T.muted, padding: "0 8px" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setRevisando(true)}
              disabled={Boolean(progreso) || aImportar.length === 0 || !hayNombre}
              style={{
                height: 36,
                padding: "0 18px",
                fontSize: 13,
                borderRadius: 7,
                background:
                  !progreso && aImportar.length > 0 && hayNombre ? accent : T.border,
                color: !progreso && aImportar.length > 0 && hayNombre ? "#fff" : T.faint,
              }}
            >
              {progreso ? "Importando…" : `Revisar e importar ${aImportar.length}`}
            </button>
          </div>
        </div>
      </div>

      {revisando && (
        <RevisarBase
          plan={plan}
          archivo={archivo}
          accent={accent}
          separados={separados}
          onSeparar={(clave) =>
            setSeparados((s) =>
              s.includes(clave) ? s.filter((c) => c !== clave) : [...s, clave],
            )
          }
          onVolver={() => setRevisando(false)}
          onConfirmar={() => void importar()}
          ocupado={progreso != null}
        />
      )}
    </>
  );
}
