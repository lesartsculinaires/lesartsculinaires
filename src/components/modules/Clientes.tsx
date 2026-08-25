"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { ImportarClientes } from "@/components/modules/ImportarClientes";
import { NuevoClienteForm } from "@/components/modules/NuevoClienteForm";
import { Buscador } from "@/components/ui/Buscador";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useCatalogo } from "@/lib/catalog";
import { fechaCorta, money } from "@/lib/format";
import { estadoTone, totalCerrado, valorPipeline } from "@/lib/selectors";
import { T, softer } from "@/lib/theme";
import { actualizarVarias, borrarLeads } from "@/app/actions";
import { AccionesEnLote } from "@/components/modules/AccionesEnLote";
import { ConfirmarBorrado } from "@/components/modules/ConfirmarBorrado";
import { CeldaEnLote } from "@/components/modules/CeldaEnLote";
import { ordenar, siguienteOrden, type Columna, type Orden } from "@/lib/orden";
import { definirFiltros, pasa } from "@/lib/filtros";
import { SIN_ASIGNAR, SIN_DUENO, activos as soloActivos } from "@/lib/types";
import type { Importacion, Oportunidad } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  /** Si quien está mirando puede borrar leads. Sólo dirección. */
  esAdmin: boolean;
  /** Las bases subidas, para poder filtrar por la tanda que entró junta. */
  importaciones: Importacion[];
  accent: string;
  query: string;
  filtros: Record<string, number | null>;
  selected: number | null;
  menu: string | null;
  onQuery: (q: string) => void;
  onFiltro: (key: string, value: number | null) => void;
  onToggleMenu: (key: string) => void;
  onSelect: (id: number) => void;
  onLimpiar: () => void;
  /** Recarga los datos del servidor tras dar de alta un cliente. */
  onRefresh: () => void;
}

export function Clientes({
  oportunidades,
  esAdmin,
  importaciones,
  accent,
  query,
  filtros,
  selected,
  menu,
  onQuery,
  onFiltro,
  onToggleMenu,
  onSelect,
  onLimpiar,
  onRefresh,
}: Props) {
  const cat = useCatalogo();
  const [alta, setAlta] = useState(false);
  const [importando, setImportando] = useState(false);
  const [creado, setCreado] = useState<string | null>(null);
  /**
   * Las fichas marcadas para cambiarles algo a todas juntas.
   *
   * Se guardan por id y no por posición porque la lista cambia sola: al
   * filtrar, al buscar, o cuando llega un lead nuevo. Con posiciones, cambiar
   * el filtro movería la selección a otras fichas sin que nadie lo pida.
   */
  const [marcadas, setMarcadas] = useState<number[]>([]);

  /**
   * Selección con teclado.
   *
   * `foco` es la fila donde está parado el cursor —la que se mueve con las
   * flechas— y `ancla` es desde dónde se mide un rango con Shift. Son dos cosas
   * distintas: al extender con Shift el cursor avanza pero el ancla se queda
   * quieta, que es lo que hace que volver hacia atrás achique la selección en
   * vez de agrandarla del otro lado.
   *
   * Se guardan como posición y no como id porque son posiciones de verdad: lo
   * que significan es «la fila de arriba» y «la de abajo», y eso depende de
   * cómo esté ordenada la lista en este momento.
   */
  /** Por qué columna está ordenada la tabla. Null = como viene del servidor. */
  const [orden, setOrden] = useState<Orden | null>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const [ancla, setAncla] = useState<number | null>(null);
  const soft = softer(accent);
  const q = query.trim().toLowerCase();

  const filtros_def = definirFiltros(cat, importaciones);

  const filtradas = oportunidades.filter(
    (o) =>
      pasa(o, filtros_def, filtros) &&
      (!q ||
        [o.cliente, o.codigo, o.telefono ?? "", o.correo ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );


  /**
   * Se ordena después de filtrar, no antes.
   *
   * Ordenar la lista entera y filtrar encima daría lo mismo, pero cuesta más:
   * con seiscientas fichas y un filtro que deja cinco, ordenar primero es
   * ordenar quinientas noventa y cinco que nadie va a ver.
   */
  const list = useMemo(() => ordenar(filtradas, orden), [filtradas, orden]);

  const cambiarOrden = (columna: Columna) => {
    setOrden((antes) => siguienteOrden(antes, columna));
    // El cursor del teclado apunta a una posición, y al reordenar esa posición
    // pasa a ser otra ficha. Se suelta en vez de dejarlo señalando a alguien
    // que nadie eligió. Las marcas se quedan: van por id, no por lugar.
    setFoco(null);
    setAncla(null);
  };

  const activos = filtros_def.filter((f) => filtros[f.key] != null).length;

  // «Todas» quiere decir todas las que se están viendo, no todas las que hay:
  // marcar una casilla no puede alcanzar fichas que quien la marca no vio.
  /** Los ids de un tramo de la lista, de una punta a la otra. */
  const tramo = (a: number, b: number): number[] =>
    list.slice(Math.min(a, b), Math.max(a, b) + 1).map((o) => o.id);

  /**
   * El teclado sobre la tabla.
   *
   *   ↑ ↓            mueven el cursor y dejan marcada sólo esa fila
   *   Shift + ↑ ↓    extienden desde donde se empezó
   *   Espacio        marca o desmarca la del cursor, sin perder el resto
   *   Escape         suelta todo
   *
   * Es lo que hace cualquier lista de archivos, y por eso no hace falta
   * explicarlo. Lo único que se agrega es que las flechas también sirven para
   * mirar: mover el cursor no abre ninguna ficha.
   */
  const teclas = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (list.length === 0) return;

    const abajo = e.key === "ArrowDown";
    const arriba = e.key === "ArrowUp";

    if (abajo || arriba) {
      e.preventDefault();
      const desde = foco ?? (abajo ? -1 : list.length);
      const nuevo = Math.max(0, Math.min(list.length - 1, desde + (abajo ? 1 : -1)));
      setFoco(nuevo);

      if (e.shiftKey) {
        const base = ancla ?? desde;
        setAncla(base);
        setMarcadas(tramo(base, nuevo));
      } else {
        setAncla(nuevo);
        setMarcadas([list[nuevo].id]);
      }
      return;
    }

    if (e.key === " " && foco != null) {
      e.preventDefault();
      const id = list[foco].id;
      setMarcadas((antes) =>
        antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id],
      );
      return;
    }

    if (e.key === "Escape") {
      setMarcadas([]);
      setFoco(null);
      setAncla(null);
    }
  };

  /**
   * El cambio en masa, en un solo lugar.
   *
   * Lo llaman la barra de arriba y las celdas de cada fila marcada. Tiene que
   * ser el mismo camino: dos copias de esto terminarían discrepando el día que
   * a una se le agregue una comprobación y a la otra no.
   */
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [avisoLote, setAvisoLote] = useState<{ texto: string; malo: boolean } | null>(null);

  /**
   * Los leads que se van a borrar, esperando confirmación.
   *
   * Null mientras no haya nada pendiente. Se guardan las fichas enteras y no
   * los ids: la ventana muestra código, nombre y etapa, y si sólo tuviera los
   * ids tendría que volver a buscarlos justo cuando la lista puede estar
   * cambiando debajo.
   */
  const [porBorrar, setPorBorrar] = useState<Oportunidad[] | null>(null);
  const [borrando, setBorrando] = useState(false);

  const confirmarBorrado = async () => {
    if (!porBorrar) return;
    setBorrando(true);
    setAvisoLote(null);

    const r = await borrarLeads(porBorrar.map((o) => o.id));

    setBorrando(false);
    setPorBorrar(null);

    if (r.ok) {
      setMarcadas([]);
      setAvisoLote({
        texto: `${r.cuantos} ${r.cuantos === 1 ? "lead borrado" : "leads borrados"}.`,
        malo: false,
      });
      onRefresh();
    } else {
      setAvisoLote({ texto: r.error ?? "No se pudo borrar.", malo: true });
    }
  };

  const aplicarALasMarcadas = async (
    campo: "vendedor_id" | "etapa_id" | "producto_id" | "estado_id",
    valorId: number,
    etiqueta: string,
    nombre: string,
  ) => {
    setCambiando(campo);
    setAvisoLote(null);

    const r = await actualizarVarias(marcadas, { [campo]: valorId });
    setCambiando(null);

    if (!r.ok || r.error) {
      setAvisoLote({ texto: r.error ?? "No se pudo cambiar.", malo: true });
      if (!r.ok) return;
    } else {
      setAvisoLote({
        texto: `${etiqueta}: ${r.cuantas} ${r.cuantas === 1 ? "ficha" : "fichas"} a «${nombre}».`,
        malo: false,
      });
    }
    onRefresh();
  };

  const algunaMarcada = list.some((o) => marcadas.includes(o.id));
  const todasMarcadas = list.length > 0 && list.every((o) => marcadas.includes(o.id));

  const resumen = [
    { label: "Oportunidades", value: String(list.length) },
    { label: "Valor en pipeline", value: money(valorPipeline(list) || null) },
    { label: "Venta cerrada", value: money(totalCerrado(list) || null) },
    {
      label: "Ticket promedio",
      value: (() => {
        const conValor = list.filter((o) => o.valor != null);
        return conValor.length
          ? money(
              Math.round(
                conValor.reduce((a, o) => a + (o.valor ?? 0), 0) / conValor.length,
              ),
            )
          : "—";
      })(),
    },
  ];

  const th: CSSProperties = {
    textAlign: "left",
    padding: "9px 14px",
    fontWeight: 500,
    fontSize: 11.5,
    color: T.muted,
    whiteSpace: "nowrap",
    borderBottom: `1px solid ${T.border}`,
  };
  const td: CSSProperties = {
    padding: "11px 14px",
    whiteSpace: "nowrap",
    color: T.muted,
  };

  return (
    <div>
      {/* La barra aparece sólo cuando hay algo marcado: una fila de controles
          siempre presente para una acción que casi nunca se usa es ruido. */}
      {/*
        Pegada arriba, y esto no es cosmético.
        
        Con seiscientas fichas se marca a mitad de la lista. Una barra en el
        principio del módulo queda fuera de pantalla justo cuando hace falta:
        se elige un vendedor, no se ve ninguna confirmación, y la conclusión
        razonable es que la función no anda.
      */}
      {porBorrar && porBorrar.length > 0 && (
        <ConfirmarBorrado
          leads={porBorrar}
          borrando={borrando}
          onCancelar={() => setPorBorrar(null)}
          onConfirmar={confirmarBorrado}
        />
      )}

      {/*
        El resultado, cuando ya no hay nada seleccionado.

        El aviso vive dentro de la barra de acciones, y esa barra sólo existe
        mientras haya filas marcadas. Al borrar se limpia la selección —que es
        lo correcto: esas filas ya no están— y con ella desaparecía el
        «1 lead borrado» en el mismo instante en que se escribía. Se borraba y
        no había forma de saber si había pasado algo.
      */}
      {marcadas.length === 0 && avisoLote && (
        <p
          style={{
            margin: "0 0 12px",
            padding: "9px 13px",
            borderRadius: 9,
            fontSize: 12.5,
            lineHeight: 1.45,
            background: avisoLote.malo ? "#FDF1EF" : "#EEF6F1",
            color: avisoLote.malo ? "#B85042" : "#2F6B4F",
            fontWeight: avisoLote.malo ? 600 : 400,
          }}
        >
          {avisoLote.malo ? "⚠ " : "✓ "}
          {avisoLote.texto}
        </p>
      )}

      {marcadas.length > 0 && (
        <div style={{ position: "sticky", top: 0, zIndex: 20 }}>
          <AccionesEnLote
            ids={marcadas}
            accent={accent}
            cambiando={cambiando}
            aviso={avisoLote}
            esAdmin={esAdmin}
            onAplicar={aplicarALasMarcadas}
            onBorrar={() =>
              setPorBorrar(oportunidades.filter((o) => marcadas.includes(o.id)))
            }
            onLimpiar={() => {
              setMarcadas([]);
              setAvisoLote(null);
            }}
          />
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {resumen.map((s) => (
          <div
            key={s.label}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: "12px 15px",
            }}
          >
            <p style={{ margin: "0 0 5px", fontSize: 11, color: T.muted }}>{s.label}</p>
            <p className="mono dsp" style={{ margin: 0, fontSize: 21, fontWeight: 500 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            padding: 14,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <Buscador
            valor={query}
            onCambio={onQuery}
            placeholder="Buscar nombre, código, teléfono o correo"
            style={{ flex: 1, minWidth: 220 }}
          />

          {filtros_def.map((f) => {
            const key = `f:${f.key}`;
            return (
              <FilterMenu
                key={key}
                menuKey={key}
                label={f.label}
                options={[
                  { label: "Todos", value: null },
                  // Sólo para vendedor: es el único campo donde estar vacío es
                  // un problema que alguien tiene que ir a resolver.
                  ...(f.key === "vendedor"
                    ? [{ label: SIN_ASIGNAR, value: SIN_DUENO }]
                    : []),
                  ...f.items.map((i) => ({ label: i.nombre, value: i.id })),
                ]}
                current={filtros[f.key] ?? null}
                valueText={
                  filtros[f.key] == null
                    ? "Todos"
                    : filtros[f.key] === SIN_DUENO
                      ? SIN_ASIGNAR
                      : (f.items.find((i) => i.id === filtros[f.key])?.nombre ?? "Todos")
                }
                open={menu === key}
                accent={accent}
                onToggle={() => onToggleMenu(key)}
                onPick={(v) => onFiltro(f.key, v as number | null)}
              />
            );
          })}

          {(activos > 0 || q) && (
            <button
              type="button"
              onClick={onLimpiar}
              style={{ fontSize: 12.5, color: accent, padding: "0 6px" }}
            >
              Limpiar
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setCreado(null);
              setAlta(true);
            }}
            style={{
              height: 32,
              padding: "0 14px",
              fontSize: 12.5,
              borderRadius: 6,
              background: accent,
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            + Nuevo cliente
          </button>

          <button
            type="button"
            onClick={() => {
              setCreado(null);
              setImportando(true);
            }}
            style={{
              height: 32,
              padding: "0 14px",
              fontSize: 12.5,
              borderRadius: 6,
              border: `1px solid ${accent}`,
              color: accent,
              background: "transparent",
              whiteSpace: "nowrap",
            }}
          >
            ↑ Subir base de datos
          </button>
        </div>

        {creado && (
          <p
            style={{
              margin: 0,
              padding: "10px 16px",
              fontSize: 12.5,
              borderBottom: `1px solid ${T.border}`,
              background: "#E6F0E9",
              color: "#2F6B4F",
            }}
          >
            {creado}
          </p>
        )}

        {/* El contenedor recibe el foco para poder escuchar el teclado. Sin
            `tabIndex` no hay flechas: los eventos de teclado van al elemento
            enfocado, y una tabla no lo es por sí sola. */}
        <div
          tabIndex={0}
          onKeyDown={teclas}
          style={{ overflowX: "auto", outline: "none" }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.paper }}>
                <th style={{ ...th, width: 30, paddingRight: 0 }}>
                  <input
                    type="checkbox"
                    aria-label="Marcar todas las de esta lista"
                    checked={todasMarcadas}
                    ref={(el) => {
                      // El estado intermedio importa: con 3 de 40 marcadas, una
                      // casilla vacía haría creer que no hay nada elegido.
                      if (el) el.indeterminate = algunaMarcada && !todasMarcadas;
                    }}
                    onChange={(e) => {
                      const visibles = list.map((o) => o.id);
                      setMarcadas((antes) =>
                        e.target.checked
                          ? [...new Set([...antes, ...visibles])]
                          : antes.filter((id) => !visibles.includes(id)),
                      );
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <Encabezado columna="codigo" orden={orden} onOrdenar={cambiarOrden}>Código</Encabezado>
                <Encabezado columna="fechaRegistro" orden={orden} onOrdenar={cambiarOrden}>Fecha</Encabezado>
                <Encabezado columna="cliente" orden={orden} onOrdenar={cambiarOrden}>Cliente</Encabezado>
                <Encabezado columna="producto" orden={orden} onOrdenar={cambiarOrden}>Programa</Encabezado>
                <Encabezado columna="vendedor" orden={orden} onOrdenar={cambiarOrden}>Vendedor</Encabezado>
                <Encabezado columna="etapa" orden={orden} onOrdenar={cambiarOrden}>Etapa</Encabezado>
                <Encabezado columna="estado" orden={orden} onOrdenar={cambiarOrden}>Estado</Encabezado>
                <Encabezado columna="valor" orden={orden} onOrdenar={cambiarOrden} derecha>Valor</Encabezado>
                <Encabezado columna="cerrada" orden={orden} onOrdenar={cambiarOrden} derecha>Cerrada</Encabezado>
                <th style={{ width: 34, borderBottom: `1px solid ${T.border}` }} />
              </tr>
            </thead>
            <tbody>
              {list.map((o, i) => {
                const [fg, bg] = estadoTone(o.estado, accent);
                const enFoco = foco === i;
                return (
                  <tr
                    key={o.id}
                    className="row"
                    onClick={(e) => {
                      // Shift+clic marca un tramo, como en cualquier lista.
                      // No abre la ficha: quien lo hace está eligiendo, no
                      // yendo a mirar a alguien.
                      if (e.shiftKey && ancla != null) {
                        e.preventDefault();
                        setFoco(i);
                        setMarcadas(tramo(ancla, i));
                        return;
                      }
                      setFoco(i);
                      setAncla(i);
                      onSelect(o.id);
                    }}
                    style={{
                      borderTop: `1px solid ${T.border}`,
                      cursor: "pointer",
                      background: marcadas.includes(o.id)
                        ? soft
                        : selected === o.id
                          ? T.paper
                          : "transparent",
                      // El cursor se ve: sin esto, mover con las flechas no
                      // muestra dónde se está parado y Shift+↓ es a ciegas.
                      boxShadow: enFoco ? `inset 3px 0 0 ${accent}` : "none",
                    }}
                  >
                    <td
                      style={{ ...td, width: 30, paddingRight: 0 }}
                      // El clic en la casilla no tiene que abrir la ficha: son
                      // dos intenciones distintas sobre la misma fila.
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Marcar ${o.cliente}`}
                        checked={marcadas.includes(o.id)}
                        /*
                         * Todo se resuelve en el clic, y `onChange` queda vacío
                         * a propósito.
                         *
                         * React emula el `change` de una casilla a partir del
                         * mismo clic, así que teniendo los dos manejadores se
                         * ejecutaban ambos: el clic marcaba el tramo y el
                         * cambio le sacaba enseguida el último, porque su
                         * `checked` todavía decía que no. Con un solo lugar no
                         * hay dos versiones de la misma decisión.
                         */
                        onChange={() => {}}
                        onClick={(e) => {
                          setFoco(i);

                          // Shift marca desde la última casilla tocada hasta
                          // ésta. Va acá y no en la fila porque el clic en la
                          // fila abre la ficha: para elegir un tramo con el
                          // mouse habría que abrirla primero.
                          if (e.shiftKey && ancla != null) {
                            setMarcadas(tramo(ancla, i));
                            return;
                          }

                          setAncla(i);
                          setMarcadas((antes) =>
                            antes.includes(o.id)
                              ? antes.filter((id) => id !== o.id)
                              : [...antes, o.id],
                          );
                        }}
                      />
                    </td>
                    <td className="mono" style={td}>{o.codigo}</td>
                    <td className="mono" style={td}>{fechaCorta(o.fechaRegistro)}</td>
                    <td style={{ ...td, padding: "9px 14px", color: T.ink }}>
                      <span style={{ display: "block", fontSize: 13 }}>{o.cliente}</span>
                      <span style={{ display: "block", marginTop: 2, fontSize: 11, color: T.faint }}>
                        {o.correo ?? o.telefono ?? "—"}
                      </span>
                    </td>
                    <td style={td}>
                      {marcadas.includes(o.id) ? (
                        <CeldaEnLote
                          valorActual={o.producto}
                          items={cat.productos}
                          cuantas={marcadas.length}
                          campo="el programa"
                          ocupado={cambiando === "producto_id"}
                          onElegir={(id) =>
                            void aplicarALasMarcadas(
                              "producto_id",
                              id,
                              "Cambiar programa",
                              cat.productos.find((x) => x.id === id)?.nombre ?? "",
                            )
                          }
                        />
                      ) : (
                        o.producto
                      )}
                    </td>
                    <td style={td}>
                      {marcadas.includes(o.id) ? (
                        <CeldaEnLote
                          valorActual={o.vendedor}
                          items={soloActivos(cat.vendedores)}
                          cuantas={marcadas.length}
                          campo="el vendedor"
                          ocupado={cambiando === "vendedor_id"}
                          onElegir={(id) =>
                            void aplicarALasMarcadas(
                              "vendedor_id",
                              id,
                              "Asignar vendedor",
                              cat.vendedores.find((x) => x.id === id)?.nombre ?? "",
                            )
                          }
                        />
                      ) : (
                        o.vendedor
                      )}
                    </td>
                    <td style={{ ...td, padding: "9px 14px" }}>
                      {marcadas.includes(o.id) ? (
                        <CeldaEnLote
                          valorActual={o.etapa}
                          items={cat.etapas}
                          cuantas={marcadas.length}
                          campo="la etapa"
                          ocupado={cambiando === "etapa_id"}
                          onElegir={(id) =>
                            void aplicarALasMarcadas(
                              "etapa_id",
                              id,
                              "Cambiar etapa",
                              cat.etapas.find((x) => x.id === id)?.nombre ?? "",
                            )
                          }
                        />
                      ) : (
                        <span className="pill"
                          style={{
                            display: "inline-block",
                            fontSize: 12,
                            padding: "3px 10px",
                            borderRadius: 20,
                            background: soft,
                            color: accent,
                          }}
                        >
                          {o.etapa}
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, padding: "9px 14px" }}>
                      {marcadas.includes(o.id) ? (
                        <CeldaEnLote
                          valorActual={o.estado}
                          items={cat.estados}
                          cuantas={marcadas.length}
                          campo="el estado"
                          ocupado={cambiando === "estado_id"}
                          onElegir={(id) =>
                            void aplicarALasMarcadas(
                              "estado_id",
                              id,
                              "Cambiar estado",
                              cat.estados.find((x) => x.id === id)?.nombre ?? "",
                            )
                          }
                        />
                      ) : (
                        <span className="pill"
                          style={{
                            display: "inline-block",
                            fontSize: 12,
                            padding: "3px 10px",
                            borderRadius: 20,
                            background: bg,
                            color: fg,
                          }}
                        >
                          {o.estado}
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ ...td, textAlign: "right" }}>
                      {money(o.valor)}
                    </td>
                    <td className="mono" style={{ ...td, textAlign: "right" }}>
                      {money(o.cerrada)}
                    </td>
                    <td style={{ padding: "10px 14px 10px 0", textAlign: "right", color: T.borderStrong }}>
                      ›
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            padding: "11px 16px",
            borderTop: `1px solid ${T.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: T.muted,
          }}
        >
          <span>
            Mostrando {list.length} de {oportunidades.length} oportunidades
          </span>
          {/* La ayuda del teclado va acá y no en un cartel: se descubre al
              mirar la tabla, que es cuando hace falta. */}
          <span>
            Clic para ver la ficha · ↑↓ para moverse · Shift+↑↓ o Shift+clic para
            elegir varias · Espacio marca
          </span>
        </div>
      </div>

      {alta && (
        <NuevoClienteForm
          accent={accent}
          oportunidades={oportunidades}
          onCerrar={() => setAlta(false)}
          onCreado={(mensaje) => {
            setAlta(false);
            setCreado(mensaje);
            onRefresh();
          }}
        />
      )}

      {importando && (
        <ImportarClientes
          accent={accent}
          oportunidades={oportunidades}
          onCerrar={() => setImportando(false)}
          onImportado={(resumen) => {
            setImportando(false);
            setCreado(resumen);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Un encabezado por el que se puede ordenar.
 *
 * La flecha se muestra sólo en la columna activa. Ponerla en las nueve
 * llenaría la fila de símbolos y ninguno diría nada; en la que está ordenando
 * dice además hacia dónde. Las demás se descubren al pasar el mouse, que es
 * cuando importa saber que se puede.
 */
function Encabezado({
  columna,
  orden,
  onOrdenar,
  derecha,
  children,
}: {
  columna: Columna;
  orden: Orden | null;
  onOrdenar: (c: Columna) => void;
  derecha?: boolean;
  children: React.ReactNode;
}) {
  const activa = orden?.columna === columna;

  return (
    <th
      style={{
        textAlign: derecha ? "right" : "left",
        padding: 0,
        fontWeight: 500,
        fontSize: 11.5,
        color: T.muted,
        borderBottom: `1px solid ${T.border}`,
        whiteSpace: "nowrap",
      }}
    >
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        title="Ordenar por esta columna"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          justifyContent: derecha ? "flex-end" : "flex-start",
          width: "100%",
          padding: "9px 14px",
          fontSize: 11.5,
          fontWeight: activa ? 700 : 500,
          color: activa ? T.ink : T.muted,
        }}
      >
        {children}
        <span aria-hidden style={{ fontSize: 9, opacity: activa ? 1 : 0.3 }}>
          {activa ? (orden.asc ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </th>
  );
}
