"use client";

import { useEffect, useState } from "react";

import { borrarBase, revisarBase, type Revision } from "@/app/bases-actions";
import type { Base } from "@/lib/bases";
import { T } from "@/lib/theme";

interface Props {
  /** Las bases marcadas, en el orden en que se ven. */
  elegidas: readonly Base[];
  accent: string;
  onCerrar: () => void;
  /** Terminó: hay que releer los datos. Recibe el resumen para mostrarlo. */
  onBorrado: (resumen: string) => void;
}

/**
 * El cartel que hay que leer antes de borrar bases.
 *
 * ==========================================================================
 * POR QUÉ NO ES UN «¿SEGURO?»
 * ==========================================================================
 *
 * Porque un «¿seguro?» sin números se aprueba sin leer, y esto no se puede
 * deshacer: borra los leads de la base y los contactos que quedan sin ningún
 * otro. Lo único que hace que la decisión sea una decisión es ver cuántos son
 * antes, y por eso se consulta la base al abrir en vez de al confirmar.
 *
 * ==========================================================================
 * Y POR QUÉ EL FRENO NO ES UN ERROR
 * ==========================================================================
 *
 * Si una base tiene leads trabajados —con notas, con dinero anotado, o que
 * avanzaron de etapa— el borrado se detiene y lo dice. No falló nada: hay algo
 * que mirar. Se puede seguir igual, porque hay casos legítimos —se trabajó la
 * copia por error y hay que quedarse con la otra—, pero apretando otro botón
 * que dice lo que se va a perder.
 */
export function BorrarBases({ elegidas, accent, onCerrar, onBorrado }: Props) {
  const [revisiones, setRevisiones] = useState<Map<number, Revision>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Se pidió forzar: ya se vio cuánto trabajo se va a perder. */
  const [forzar, setForzar] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const pares = await Promise.all(
        elegidas
          .filter((b) => b.importacionId != null)
          .map(async (b) => [b.importacionId as number, await revisarBase(b.importacionId as number)] as const),
      );
      if (!vivo) return;
      setRevisiones(new Map(pares));
      setCargando(false);
      const falla = pares.find(([, r]) => !r.ok || r.faltaMigracion);
      if (falla) {
        setError(
          falla[1].faltaMigracion
            ? "Falta correr la migración 20261010120000_borrar_base_duplicada.sql en Supabase."
            : falla[1].error,
        );
      }
    })();
    return () => {
      vivo = false;
    };
  }, [elegidas]);

  const total = (campo: keyof Revision) =>
    [...revisiones.values()].reduce((a, r) => a + (Number(r[campo]) || 0), 0);

  const leads = total("leads");
  const contactos = total("contactos");
  const trabajados = total("trabajados");
  const conNotas = total("conNotas");
  const conDinero = total("conDinero");
  const conCierre = total("conCierre");
  const conEtapa = total("conEtapa");

  const confirmar = async () => {
    setBorrando(true);
    setError(null);

    let leadsIdos = 0;
    let contactosIdos = 0;
    let bases = 0;

    for (const b of elegidas) {
      if (b.importacionId == null) continue;
      const r = await borrarBase(b.importacionId, forzar || trabajados > 0);

      if (!r.ok) {
        setBorrando(false);
        setError(
          bases === 0
            ? r.error
            : `${r.error} — antes de eso se borraron ${bases} bases.`,
        );
        // Lo ya borrado no vuelve: se avisa igual para que la pantalla se
        // refresque y no siga mostrando bases que ya no están.
        if (bases > 0) onBorrado(`Se borraron ${bases} bases antes del corte.`);
        return;
      }

      bases += 1;
      leadsIdos += r.leadsBorrados ?? 0;
      contactosIdos += r.contactosBorrados ?? 0;
    }

    onBorrado(
      `${bases} ${bases === 1 ? "base borrada" : "bases borradas"}: ` +
        `${leadsIdos} ${leadsIdos === 1 ? "lead" : "leads"} y ` +
        `${contactosIdos} ${contactosIdos === 1 ? "contacto" : "contactos"}.`,
    );
  };

  const fila = (etiqueta: string, valor: string) => (
    <p style={{ margin: "0 0 3px", display: "flex", gap: 10, fontSize: 12.5 }}>
      <span style={{ minWidth: 150, color: T.muted }}>{etiqueta}</span>
      <span className="mono" style={{ fontWeight: 600 }}>{valor}</span>
    </p>
  );

  return (
    <>
      <div
        onClick={borrando ? undefined : onCerrar}
        style={{ position: "fixed", inset: 0, background: "rgba(31,29,26,0.35)", zIndex: 90 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Borrar bases"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          padding: 22,
          background: T.paper,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          zIndex: 100,
          boxShadow: "0 12px 40px rgba(31,29,26,0.18)",
        }}
      >
        <p className="dsp" style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>
          Borrar {elegidas.length} {elegidas.length === 1 ? "base" : "bases"}
        </p>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
          Esto no se puede deshacer.
        </p>

        <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
          {elegidas.map((b) => (
            <li key={b.clave}>
              {b.titulo}
              {b.duplicadaDe && (
                <span style={{ color: T.faint }}> — copia de otra del mismo día</span>
              )}
            </li>
          ))}
        </ul>

        {cargando ? (
          <p style={{ fontSize: 12.5, color: T.muted }}>Contando qué se va a llevar…</p>
        ) : (
          <div
            style={{
              padding: "12px 14px",
              marginBottom: 14,
              borderRadius: 8,
              background: T.surface,
              border: `1px solid ${T.border}`,
            }}
          >
            {fila("Leads que se borran", String(leads))}
            {fila("Contactos que se borran", String(contactos))}
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
              Sólo se borran los contactos que quedarían sin ningún lead. Quien
              también tenga leads de otra base se queda, con esos leads.
            </p>
          </div>
        )}

        {!cargando && trabajados > 0 && (
          <div
            style={{
              padding: "12px 14px",
              marginBottom: 14,
              borderRadius: 8,
              background: "#FFF6D6",
              border: "1px solid #F0CE55",
              color: "#6B5200",
            }}
          >
            <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.55 }}>
              <strong>
                {trabajados} de esos leads ya se trabajaron.
              </strong>{" "}
              Si borrás, ese trabajo se pierde.
            </p>

            {/*
              El desglose, que es lo que vuelve útil el aviso.

              Sin él decía «325 de 325 ya se trabajaron» y no había forma de
              saber si eran 325 leads con notas y dinero —que sería gravísimo—
              o 325 leads que la planilla cargó directamente en una etapa que
              no es la primera, que no es trabajo de nadie. Son decisiones
              opuestas y el número solo no las distingue.
            */}
            <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
              {conNotas > 0 && <li>{conNotas} con notas escritas</li>}
              {conDinero > 0 && <li>{conDinero} con dinero anotado (reserva o venta)</li>}
              {conCierre > 0 && <li>{conCierre} ya cerrados, ganados o perdidos</li>}
              {conEtapa > 0 && (
                <li>
                  {conEtapa} sólo por estar en una etapa distinta de la primera
                  {conNotas === 0 && conDinero === 0 && conCierre === 0 && (
                    <span style={{ display: "block", color: "#8A7020" }}>
                      No tienen notas, ni dinero, ni cierre. Si la planilla traía
                      una columna de etapa, esto no es trabajo de nadie: es el
                      dato que venía adentro del archivo.
                    </span>
                  )}
                </li>
              )}
              {conNotas === 0 && conDinero === 0 && conCierre === 0 && conEtapa === 0 && (
                <li>
                  El detalle no está disponible: falta correr
                  20261013120000_borrar_base_sin_tabla_temporal.sql.
                </li>
              )}
            </ul>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={forzar}
                onChange={(e) => setForzar(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                Entiendo y quiero borrarlas igual.
              </span>
            </label>
          </div>
        )}

        {error && (
          <p
            style={{
              margin: "0 0 14px",
              padding: "10px 13px",
              fontSize: 12.5,
              lineHeight: 1.5,
              borderRadius: 7,
              background: "#F7EBE9",
              color: "#8C3B2F",
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onCerrar}
            disabled={borrando}
            style={{ fontSize: 13, color: T.muted, padding: "0 8px" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={cargando || borrando || (trabajados > 0 && !forzar)}
            style={{
              height: 36,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 7,
              background: cargando || borrando || (trabajados > 0 && !forzar) ? T.border : "#B85042",
              color: cargando || borrando || (trabajados > 0 && !forzar) ? T.faint : "#fff",
            }}
          >
            {borrando ? "Borrando…" : `Borrar ${leads} leads`}
          </button>
        </div>
      </div>
    </>
  );
}
