"use client";

import { useMemo, useState } from "react";

import { BorrarBases } from "@/components/modules/BorrarBases";
import { ImportarClientes } from "@/components/modules/ImportarClientes";
import { agruparBases, repetidas, resumirBase } from "@/lib/bases";
import { fechaCorta, horaDe, money } from "@/lib/format";
import { T, softer } from "@/lib/theme";
import { ROTULO_VENTA_CERRADA } from "@/lib/montosDelLead";
import type { Importacion, Oportunidad } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  importaciones: Importacion[];
  /** La tabla de importaciones todavía no existe. */
  faltaMigracion: boolean;
  /**
   * Abrir una base y ver los registros que trajo. Casilla «editar» del rol.
   *
   * Es una restricción de esta pantalla, no del acceso a los datos: los
   * mismos nombres siguen estando en Clientes, que ventas necesita para
   * trabajar. Sirve para que el módulo de Bases no sea un atajo para
   * exportar la cartera entera, no para ocultarle datos a nadie.
   */
  puedeAbrir: boolean;
  /**
   * Subir una base nueva. Casilla «crear» del rol.
   *
   * La política de `importaciones` lo hace cumplir aparte; esto sólo evita
   * ofrecer un botón que iba a fallar. Un botón que siempre falla se lee como
   * que el CRM está roto, no como que no te corresponde.
   */
  puedeSubir: boolean;
  /**
   * Seleccionar bases y borrarlas, con las fichas que trajeron.
   *
   * Sólo dirección, y no una casilla del rol: no es «editar bases», es
   * destruir datos que no vuelven. La función de la base lo hace cumplir
   * aparte; esto sólo evita ofrecer un botón que iba a fallar.
   */
  esAdmin: boolean;
  accent: string;
  /** Abre una oportunidad en Clientes. */
  onAbrir: (id: number) => void;
  /** Para volver a pedir los datos cuando termina una importación. */
  onRefrescar: () => void;
}

export function Bases({
  oportunidades,
  importaciones,
  faltaMigracion,
  puedeAbrir,
  puedeSubir,
  esAdmin,
  accent,
  onAbrir,
  onRefrescar,
}: Props) {
  const bases = useMemo(
    () => agruparBases(oportunidades, importaciones),
    [oportunidades, importaciones],
  );
  const [abierta, setAbierta] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  /**
   * Las bases marcadas, por clave.
   *
   * Sólo se pueden marcar las registradas: las agrupadas por día no son una
   * carga, son una fecha, y no hay nada que borrar del otro lado.
   */
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [borrando, setBorrando] = useState(false);

  const repes = useMemo(() => repetidas(bases), [bases]);
  const elegidas = bases.filter((b) => marcadas.includes(b.clave));

  const marcar = (clave: string) =>
    setMarcadas((m) => (m.includes(clave) ? m.filter((c) => c !== clave) : [...m, clave]));
  /** El resumen de la última importación hecha desde acá. */
  const [recien, setRecien] = useState<string | null>(null);

  const th = {
    textAlign: "left" as const,
    padding: "9px 14px",
    fontWeight: 500,
    fontSize: 11.5,
    color: T.muted,
    whiteSpace: "nowrap" as const,
    borderBottom: `1px solid ${T.border}`,
  };
  const td = { padding: "11px 14px", whiteSpace: "nowrap" as const };

  const totalFilas = bases.reduce((a, b) => a + b.oportunidades.length, 0);

  return (
    <div>
      {faltaMigracion && (
        <p
          style={{
            margin: "0 0 14px",
            padding: "11px 14px",
            fontSize: 12.5,
            lineHeight: 1.55,
            borderRadius: 9,
            background: "#F6EEDC",
            color: "#7A5A12",
          }}
        >
          Las cargas de abajo están agrupadas por el día en que entraron, que es
          todo lo que se puede saber por ahora. Para que cada base quede
          registrada con el nombre del archivo y quién la subió, corré{" "}
          <code>supabase/migrations/20260731120000_bases_importadas.sql</code> en
          Supabase → SQL Editor. Aplica de ahí en adelante: las cargas
          anteriores seguirán agrupadas por fecha.
        </p>
      )}

      {/*
        Subir una base, desde el módulo que las lista.

        Hasta ahora el botón vivía sólo en Clientes, que es donde se termina
        mirando el resultado. Pero quien viene a subir una base entra a Bases:
        es el nombre de lo que quiere hacer. Los dos botones abren la misma
        pantalla y respetan la misma casilla del rol.
      */}
      {puedeSubir && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setSubiendo(true)}
            style={{
              height: 34,
              padding: "0 15px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 7,
              background: accent,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ↑ Subir base
          </button>
        </div>
      )}

      {/*
        Las repetidas, dichas antes de la tabla.

        Aparece sólo cuando las hay y sólo para dirección: al resto no le sirve
        —no puede borrarlas— y sería un cartel rojo permanente sobre algo que
        no puede resolver.
      */}
      {esAdmin && repes.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            margin: "0 0 12px",
            padding: "11px 14px",
            borderRadius: 8,
            background: "#FFF6D6",
            border: "1px solid #F0CE55",
            color: "#6B5200",
          }}
        >
          <span style={{ fontSize: 12.5, lineHeight: 1.5, flex: 1, minWidth: 240 }}>
            {repes.length === 1
              ? "Hay 1 base repetida: el mismo archivo se subió dos veces el mismo día."
              : `Hay ${repes.length} bases repetidas: el mismo archivo se subió más de una vez el mismo día.`}{" "}
            Están marcadas abajo con «copia».
          </span>
          <button
            type="button"
            onClick={() => setMarcadas(repes.map((b) => b.clave))}
            style={{
              height: 30,
              padding: "0 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: "1px solid #C9A227",
              background: "transparent",
              color: "#6B5200",
            }}
          >
            Seleccionar las copias
          </button>
        </div>
      )}

      {/* Lo que hay marcado, con el botón de borrar. Sólo dirección. */}
      {esAdmin && marcadas.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            margin: "0 0 12px",
            padding: "10px 14px",
            borderRadius: 8,
            background: softer(accent),
          }}
        >
          <span style={{ fontSize: 12.5, flex: 1, minWidth: 200 }}>
            {marcadas.length} {marcadas.length === 1 ? "base marcada" : "bases marcadas"}
          </span>
          <button
            type="button"
            onClick={() => setMarcadas([])}
            style={{ fontSize: 12, color: T.muted, padding: "0 6px" }}
          >
            Quitar la selección
          </button>
          <button
            type="button"
            onClick={() => setBorrando(true)}
            style={{
              height: 30,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              background: "#B85042",
              color: "#fff",
            }}
          >
            Borrar {marcadas.length === 1 ? "la base" : "las bases"}
          </button>
        </div>
      )}

      {borrando && (
        <BorrarBases
          elegidas={elegidas}
          accent={accent}
          onCerrar={() => setBorrando(false)}
          onBorrado={(resumen) => {
            setBorrando(false);
            setMarcadas([]);
            setRecien(resumen);
            onRefrescar();
          }}
        />
      )}

      {subiendo && (
        <ImportarClientes
          accent={accent}
          oportunidades={oportunidades}
          onCerrar={() => setSubiendo(false)}
          onImportado={(resumen) => {
            setSubiendo(false);
            setRecien(resumen);
            onRefrescar();
          }}
        />
      )}

      {/* Lo que acaba de entrar, dicho una vez. La tabla de abajo ya lo muestra
          en su primera fila, pero recién después del refresco. */}
      {recien && (
        <p
          style={{
            margin: "0 0 12px",
            padding: "10px 13px",
            fontSize: 12.5,
            lineHeight: 1.5,
            borderRadius: 8,
            background: softer(accent),
            color: T.ink,
          }}
        >
          {recien}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {[
          { l: "Bases", v: String(bases.length) },
          { l: "Registros cargados", v: String(totalFilas) },
          {
            l: "Última carga",
            v: bases[0]?.fecha ? fechaCorta(bases[0].fecha) : "—",
          },
        ].map((k) => (
          <div
            key={k.l}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: "12px 15px",
            }}
          >
            <p style={{ margin: "0 0 5px", fontSize: 11, color: T.muted }}>{k.l}</p>
            <p className="mono dsp" style={{ margin: 0, fontSize: 21, fontWeight: 500 }}>
              {k.v}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <p className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
            Bases subidas
          </p>
          <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
            De la más reciente a la más antigua.{" "}
            {puedeAbrir
              ? "Clic en una para ver sus registros."
              : "El detalle de cada base es solo para administradores."}
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.paper }}>
                {esAdmin && <th style={{ ...th, width: 34, paddingRight: 0 }} />}
                <th style={th}>Base</th>
                <th style={th}>Ingresada</th>
                <th style={{ ...th, textAlign: "right" }}>Registros</th>
                {puedeAbrir && <th style={{ ...th, textAlign: "right" }}>Clientes</th>}
                {puedeAbrir && <th style={{ ...th, textAlign: "right" }}>Ganados</th>}
                {puedeAbrir && <th style={{ ...th, textAlign: "right" }}>{ROTULO_VENTA_CERRADA}</th>}
                <th style={{ width: 34, borderBottom: `1px solid ${T.border}` }} />
              </tr>
            </thead>
            <tbody>
              {bases.map((b, i) => {
                const r = resumirBase(b);
                const expandida = abierta === b.clave;
                return (
                  <>
                    <tr
                      key={b.clave}
                      className={puedeAbrir ? "row" : undefined}
                      onClick={
                        puedeAbrir ? () => setAbierta(expandida ? null : b.clave) : undefined
                      }
                      style={{
                        borderTop: i ? `1px solid ${T.border}` : "none",
                        cursor: puedeAbrir ? "pointer" : "default",
                        background: expandida ? softer(accent) : "transparent",
                      }}
                    >
                      {esAdmin && (
                        <td
                          style={{ ...td, width: 34, paddingRight: 0 }}
                          // El clic de la casilla no tiene que abrir la base:
                          // marcar y abrir son dos intenciones distintas y en
                          // la misma fila se pisan.
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={marcadas.includes(b.clave)}
                            onChange={() => marcar(b.clave)}
                            // Las agrupadas por día no son una carga sino una
                            // fecha: no hay registro que borrar.
                            disabled={b.importacionId == null}
                            title={
                              b.importacionId == null
                                ? "Esta carga no quedó registrada como base; no se puede borrar desde acá"
                                : "Marcar para borrar"
                            }
                            aria-label={`Marcar ${b.titulo}`}
                          />
                        </td>
                      )}
                      <td style={{ ...td, whiteSpace: "normal", color: T.ink }}>
                        <span style={{ display: "block", fontSize: 13 }}>{b.titulo}</span>
                        {!b.registrada && (
                          <span style={{ display: "block", marginTop: 2, fontSize: 11, color: T.faint }}>
                            Sin archivo registrado
                          </span>
                        )}
                        {b.duplicadaDe && (
                          <span
                            style={{
                              display: "inline-block",
                              marginTop: 3,
                              padding: "2px 8px",
                              fontSize: 10.5,
                              borderRadius: 20,
                              background: "#FFF6D6",
                              border: "1px solid #F0CE55",
                              color: "#6B5200",
                            }}
                            title="El mismo archivo se subió más de una vez el mismo día. Ésta es la copia; la otra se conserva."
                          >
                            copia
                          </span>
                        )}
                      </td>
                      <td className="mono" style={{ ...td, color: T.muted }}>
                        {b.fecha ? fechaCorta(b.fecha) : "—"}
                        {b.momento && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: T.faint }}>
                            {horaDe(b.momento)}
                          </span>
                        )}
                      </td>
                      <td className="mono" style={{ ...td, textAlign: "right" }}>
                        {b.oportunidades.length}
                        {b.filasDeclaradas != null &&
                          b.filasDeclaradas !== b.oportunidades.length && (
                            <span
                              style={{ marginLeft: 6, fontSize: 11, color: T.warn }}
                              title={`Se cargaron ${b.filasDeclaradas}; el resto se eliminó después`}
                            >
                              de {b.filasDeclaradas}
                            </span>
                          )}
                      </td>
                      {puedeAbrir && (
                        <td className="mono" style={{ ...td, textAlign: "right", color: T.muted }}>
                          {r.clientes}
                        </td>
                      )}
                      {puedeAbrir && (
                        <td className="mono" style={{ ...td, textAlign: "right", color: T.muted }}>
                          {r.ganados}
                        </td>
                      )}
                      {puedeAbrir && (
                        <td className="mono" style={{ ...td, textAlign: "right" }}>
                          {money(r.cerrado || null)}
                        </td>
                      )}
                      <td style={{ ...td, textAlign: "right", color: T.borderStrong }}>
                        {puedeAbrir ? (expandida ? "▾" : "›") : ""}
                      </td>
                    </tr>

                    {puedeAbrir && expandida && (
                      <tr key={`${b.clave}-detalle`}>
                        <td colSpan={(puedeAbrir ? 7 : 4) + (esAdmin ? 1 : 0)} style={{ padding: 0, background: T.paper }}>
                          {b.oportunidades.length === 0 ? (
                            <p style={{ margin: 0, padding: "18px 20px", fontSize: 12.5, color: T.faint }}>
                              Esta base no tiene registros vivos. Se subió, pero sus
                              clientes fueron eliminados después.
                            </p>
                          ) : (
                            <div style={{ maxHeight: 380, overflowY: "auto" }}>
                              {b.oportunidades.slice(0, 200).map((o, j) => (
                                <div
                                  key={o.id}
                                  className="row"
                                  onClick={() => onAbrir(o.id)}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "90px minmax(0, 1fr) minmax(0, 1fr) 90px",
                                    alignItems: "center",
                                    gap: 12,
                                    padding: "9px 20px",
                                    cursor: "pointer",
                                    fontSize: 12.5,
                                    borderTop: j ? `1px solid ${T.border}` : "none",
                                  }}
                                >
                                  <span className="mono" style={{ color: T.muted }}>{o.codigo}</span>
                                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {o.cliente}
                                  </span>
                                  <span style={{ color: T.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {o.producto}
                                  </span>
                                  <span className="mono" style={{ textAlign: "right" }}>
                                    {money(o.valor)}
                                  </span>
                                </div>
                              ))}
                              {b.oportunidades.length > 200 && (
                                <p style={{ margin: 0, padding: "10px 20px", fontSize: 12, color: T.faint }}>
                                  Mostrando 200 de {b.oportunidades.length}. Usá Clientes
                                  para ver la lista completa.
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}

              {bases.length === 0 && (
                <tr>
                  <td colSpan={(puedeAbrir ? 7 : 4) + (esAdmin ? 1 : 0)} style={{ padding: "26px 18px", fontSize: 12.5, color: T.faint }}>
                    Todavía no hay bases cargadas. Subí una desde Clientes → Subir
                    base de datos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
