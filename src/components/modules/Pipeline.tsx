"use client";

import { useState } from "react";

import { FilterMenu } from "@/components/ui/FilterMenu";
import { useCatalogo } from "@/lib/catalog";
import { cuantosPuestos, definirFiltros, pasa } from "@/lib/filtros";
import { leadCount, money } from "@/lib/format";
import { T, soft } from "@/lib/theme";
import { SIN_DUENO, activos } from "@/lib/types";
import type { Importacion, Oportunidad, OportunidadPatch } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  /** Las bases subidas, para poder filtrar por la tanda que entró junta. */
  importaciones: Importacion[];
  accent: string;
  drag: number | null;
  over: number | null;
  onSetDrag: (id: number | null) => void;
  onSetOver: (etapaId: number | null) => void;
  onEditar: (
    id: number,
    patch: OportunidadPatch,
    display: Partial<Oportunidad>,
  ) => void;
  onOpen: (id: number) => void;

  /**
   * Quién ve las oportunidades de todo el equipo: dirección, o un rol con el
   * alcance puesto. Sólo a esa gente se le ofrece elegir de quién es el
   * tablero; para un asesor el selector sería una trampa, porque elegir a un
   * compañero le mostraría un tablero vacío.
   */
  puedeElegirAsesor: boolean;
  /** De quién es el tablero. Null = todo el equipo junto. */
  vendedorId: number | null;
  onVendedor: (id: number | null) => void;

  /** Los filtros de la barra, propios del tablero. */
  filtros: Record<string, number | null>;
  onFiltro: (key: string, value: number | null) => void;
  onLimpiar: () => void;
  menu: string | null;
  onToggleMenu: (key: string) => void;
}

export function Pipeline({
  oportunidades,
  importaciones,
  accent,
  drag,
  over,
  onSetDrag,
  onSetOver,
  onEditar,
  onOpen,
  puedeElegirAsesor,
  vendedorId,
  onVendedor,
  filtros,
  onFiltro,
  onLimpiar,
  menu,
  onToggleMenu,
}: Props) {
  const cat = useCatalogo();
  const { etapas, vendedores } = cat;

  /**
   * Si la lista de personas está desplegada.
   *
   * Es estado de esta pantalla y no del CRM: al volver a Pipeline se quiere el
   * tablero, no la lista abierta esperando que la cierren. De quién es el
   * tablero sí se recuerda, que es lo que importa conservar.
   */
  const [abierto, setAbierto] = useState(false);

  /**
   * La barra de filtros, sin dos de los siete que tiene Clientes.
   *
   * **Etapa** no está porque las columnas del tablero YA son las etapas.
   * Filtrar por una dejaría una columna con fichas y las otras cinco vacías:
   * la misma información que ver esa columna, pero con el embudo roto.
   *
   * **Vendedor** tampoco, porque es el plegable de acá arriba, que además dice
   * cuántas tiene cada quien. Dos controles para lo mismo terminan
   * contradiciéndose y hay que adivinar cuál manda.
   *
   * Los otros cinco sí: son maneras de mirar el mismo embudo —el de un
   * programa, el de una feria, el de un territorio— y ésa es justo la pregunta
   * que el tablero contesta bien y una tabla no.
   */
  const defs = definirFiltros(cat, importaciones, ["etapa", "vendedor"]);
  const puestos = cuantosPuestos(defs, filtros);

  const filtradas = puestos === 0 ? oportunidades : oportunidades.filter((o) => pasa(o, defs, filtros));

  /**
   * El tablero de una sola persona.
   *
   * `SIN_DUENO` pide lo contrario que un id: las que no son de nadie. Están
   * ahí a propósito —el reparto se hace desde este tablero— y sin poder
   * aislarlas habría que buscarlas de a una entre las de todos.
   */
  const enTablero = !puedeElegirAsesor || vendedorId == null
    ? filtradas
    : filtradas.filter((o) =>
        vendedorId === SIN_DUENO ? o.vendedorId == null : o.vendedorId === vendedorId,
      );

  /**
   * Cuántas tiene cada quien, contadas sobre lo filtrado.
   *
   * A propósito: con «Programa: Cocina Profesional» puesto, los números de la
   * lista contestan quién tiene cuántas de ese programa, que es lo que se está
   * mirando. Contarlas sobre todo daría un número que no se corresponde con
   * ninguna pantalla.
   */
  const cuantas = (id: number | null) =>
    id == null
      ? filtradas.length
      : filtradas.filter((o) =>
          id === SIN_DUENO ? o.vendedorId == null : o.vendedorId === id,
        ).length;

  /**
   * Un botón por persona, en fila.
   *
   * Sale del catálogo de vendedores, que es la lista de a quién se le pueden
   * asignar oportunidades: si un gerente o un jefe atiende clientes, tiene su
   * ficha ahí y aparece con los demás. No hay una lista aparte de «asesores»
   * porque llevar dos listas de la misma gente termina con una de las dos
   * desactualizada.
   *
   * Los dados de baja quedan afuera: sus fichas ya no le tocan a nadie, y
   * mirar su tablero no lleva a ninguna decisión.
   *
   * «Sin asignar» sólo aparece cuando hay alguna. Un botón que lleva a un
   * tablero vacío es una promesa que no se cumple.
   */
  const botones: { id: number | null; nombre: string }[] = [
    { id: null, nombre: "Todo el equipo" },
    ...activos(vendedores).map((v) => ({ id: v.id, nombre: v.nombre })),
    ...(cuantas(SIN_DUENO) > 0 ? [{ id: SIN_DUENO, nombre: "Sin asignar" }] : []),
  ];

  const elegido = botones.find((b) => b.id === vendedorId) ?? botones[0];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {/*
            Plegado, el elegir persona es una sola línea que dice de quién es
            el tablero.

            Con cuatro o cinco asesores la fila entera cabía, pero crece con el
            equipo y empuja el embudo hacia abajo: en una laptop, las columnas
            arrancaban ya cortadas. Y se usa de a ratos —se elige a alguien y
            después se trabaja un rato ahí— así que estar abierta todo el
            tiempo cuesta espacio casi siempre para servir casi nunca.
          */}
          {puedeElegirAsesor && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 32,
                padding: "0 11px",
                fontSize: 12.5,
                border: `1px solid ${abierto ? accent : T.border}`,
                borderRadius: 7,
                background: T.surface,
                color: T.ink,
                cursor: "pointer",
              }}
            >
              <span style={{ color: T.faint }}>Tablero de</span>
              <strong style={{ fontWeight: 600 }}>{elegido.nombre}</strong>
              <span className="mono" style={{ fontSize: 11, color: T.muted }}>
                {cuantas(vendedorId)}
              </span>
              <span style={{ color: T.faint, marginLeft: 1 }}>{abierto ? "▴" : "▾"}</span>
            </button>
          )}

          {/*
            Los mismos filtros que Clientes, con el mismo componente y la misma
            definición. Clasificar acá no es una función nueva: es la de
            siempre, disponible donde también hace falta.
          */}
          {defs.map((f) => {
            const clave = `pf:${f.key}`;
            return (
              <FilterMenu
                key={clave}
                menuKey={clave}
                label={f.label}
                options={[
                  { label: "Todos", value: null },
                  ...f.items.map((i) => ({ label: i.nombre, value: i.id })),
                ]}
                current={filtros[f.key] ?? null}
                valueText={
                  filtros[f.key] == null
                    ? "Todos"
                    : (f.items.find((i) => i.id === filtros[f.key])?.nombre ?? "Todos")
                }
                open={menu === clave}
                accent={accent}
                onToggle={() => onToggleMenu(clave)}
                onPick={(v) => onFiltro(f.key, v as number | null)}
              />
            );
          })}

          {/*
            El botón de limpiar y la cuenta aparecen sólo cuando hay algo
            puesto. Un «Limpiar» permanente sobre una lista sin filtrar es un
            botón que no hace nada, y la cuenta «639 de 639» tampoco dice nada.
          */}
          {(puestos > 0 || vendedorId != null) && (
            <>
              <button
                type="button"
                onClick={onLimpiar}
                style={{
                  height: 32,
                  padding: "0 11px",
                  fontSize: 12.5,
                  border: `1px solid ${T.border}`,
                  borderRadius: 7,
                  background: T.surface,
                  color: T.muted,
                  cursor: "pointer",
                }}
              >
                Limpiar
              </button>
              <span className="mono" style={{ fontSize: 11.5, color: T.faint }}>
                {leadCount(enTablero.length)} de {oportunidades.length}
              </span>
            </>
          )}
        </div>

          {abierto && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
              {botones.map((b) => {
                const puesto = vendedorId === b.id;
                const n = cuantas(b.id);
                return (
                  <button
                    key={b.id ?? "todos"}
                    type="button"
                    onClick={() => {
                      onVendedor(b.id);
                      // Se pliega sola al elegir: lo que se venía a hacer ya
                      // está hecho, y dejarla abierta tapando el embudo obliga a
                      // un segundo clic que nadie pidió.
                      setAbierto(false);
                    }}
                    aria-pressed={puesto}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      height: 32,
                      padding: "0 12px",
                      fontSize: 12.5,
                      fontWeight: puesto ? 600 : 400,
                      border: `1px solid ${puesto ? accent : T.border}`,
                      borderRadius: 16,
                      // El elegido va pintado entero y no con un tinte suave.
                      // Son seis botones parejos y uno es «acá estoy»: con un
                      // fondo al ocho por ciento hay que buscar cuál está
                      // puesto, y entonces el botón deja de contestar la
                      // pregunta que vino a contestar.
                      background: puesto ? accent : T.surface,
                      color: puesto ? "#fff" : T.ink,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.nombre}
                    {/*
                      El número al lado del nombre.

                      Es la mitad de para qué se abre esta fila: quién tiene
                      mucho y quién no tiene nada se ve sin apretar cada botón
                      uno por uno. Sigue a los filtros de la barra pero no a la
                      persona elegida, así que se puede comparar carteras sin
                      que los números se muevan bajo el dedo.
                    */}
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        // En el elegido hereda el color en vez de traer el
                        // suyo: así el amarillo del hover, que se fuerza sobre
                        // el botón, también le llega al número. Con un color
                        // propio quedaría blanco sobre amarillo.
                        color: puesto ? "inherit" : n === 0 ? T.faint : T.muted,
                        opacity: puesto ? 0.75 : 1,
                      }}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
      </div>
      <div
        style={{
          display: "grid",
          gridAutoFlow: "column",
          // El mínimo baja de 200 a 164 desde que el embudo tiene seis etapas:
          // con 200 el tablero se pasaba del ancho de una laptop de 1366 y
          // había que desplazarlo de costado para ver el cierre, que es justo
          // la columna que más se mira. Sigue pudiendo desplazarse, pero ahora
          // sólo en pantallas de verdad chicas.
          gridAutoColumns: "minmax(164px, 1fr)",
          gap: 10,
          alignItems: "start",
          overflowX: "auto",
          paddingBottom: 6,
        }}
      >
      {etapas.map((etapa) => {
        const enEtapa = enTablero.filter((o) => o.etapaId === etapa.id);
        const isOver = over === etapa.id;
        // The last stage in the funnel is the close.
        const esCierre = etapa.orden === Math.max(...etapas.map((e) => e.orden));
        const tone = esCierre ? "#2F6B4F" : accent;

        return (
          <div key={etapa.id}>
            <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${tone}` }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>
                {etapa.nombre}
              </span>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: T.muted }}>
                  {leadCount(enEtapa.length)}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: enEtapa.length ? T.ink : T.faint,
                  }}
                >
                  {money(enEtapa.reduce((a, o) => a + (o.valor ?? 0), 0) || null)}
                </span>
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (over !== etapa.id) onSetOver(etapa.id);
              }}
              onDragLeave={() => {
                if (over === etapa.id) onSetOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const raw = drag ?? Number(e.dataTransfer.getData("text/plain"));
                if (raw) {
                  onEditar(
                    raw,
                    { etapa_id: etapa.id },
                    { etapa: etapa.nombre, etapaId: etapa.id, etapaOrden: etapa.orden },
                  );
                }
                onSetDrag(null);
                onSetOver(null);
              }}
              style={{
                minHeight: 120,
                maxHeight: "62vh",
                overflowY: "auto",
                borderRadius: 9,
                padding: 5,
                margin: -5,
                background: isOver ? soft(accent) : "transparent",
                outline: isOver ? `1px dashed ${accent}` : "1px dashed transparent",
              }}
            >
              {enEtapa.map((o) => (
                <div
                  key={o.id}
                  className="card"
                  draggable
                  onClick={() => onOpen(o.id)}
                  onDragStart={(e) => {
                    // `dataTransfer` está siempre en un arrastre de verdad,
                    // pero no en un `dragstart` disparado por código —una
                    // extensión, una prueba—, y ahí esto tiraba una excepción
                    // que se llevaba puesta la pantalla entera.
                    if (e.dataTransfer) {
                      e.dataTransfer.effectAllowed = "move";
                      try {
                        e.dataTransfer.setData("text/plain", String(o.id));
                      } catch {
                        // Algunos navegadores no dejan `setData` fuera de un
                        // gesto del usuario; el id que queda en el estado
                        // cubre ese caso.
                      }
                    }
                    onSetDrag(o.id);
                  }}
                  onDragEnd={() => {
                    onSetDrag(null);
                    onSetOver(null);
                  }}
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: 11,
                    marginBottom: 8,
                    cursor: "grab",
                    opacity: drag === o.id ? 0.4 : 1,
                  }}
                >
                  <p style={{ margin: "0 0 3px", fontSize: 12.5 }}>{o.cliente}</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>{o.producto}</p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <span className="mono" style={{ fontSize: 10.5, color: T.faint }}>
                      {o.vendedor}
                    </span>
                    <span className="mono" style={{ fontSize: 12 }}>{money(o.valor)}</span>
                  </div>
                </div>
              ))}

              {enEtapa.length === 0 && (
                <p
                  style={{
                    margin: 0,
                    padding: "26px 8px",
                    textAlign: "center",
                    fontSize: 12,
                    color: isOver ? accent : T.faint,
                  }}
                >
                  Soltá una tarjeta acá
                </p>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}
