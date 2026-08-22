"use client";

import { useState } from "react";

import { posponerRecordatorio, retomarRecordatorio } from "@/app/recordatorios-actions";
import { ListaSeguimientos } from "@/components/modules/ListaSeguimientos";
import { TONO } from "@/components/ui/tonoRecordatorio";
import { cuando, money } from "@/lib/format";
import { PLAZO_DIAS, comoSeLee, porAtender, type Recordatorio, type Urgencia } from "@/lib/recordatorios";
import { seguimientosPorAtender, type SeguimientoPendiente } from "@/lib/seguimientos";
import { T } from "@/lib/theme";
import { SIN_DUENO, activos } from "@/lib/types";
import { useCatalogo } from "@/lib/catalog";

/**
 * El módulo: todas las reservas con plazo corriendo.
 *
 * Existe además del reloj de la cabecera porque contestan preguntas
 * distintas. El reloj dice «¿a quién llamo hoy?» y por eso muestra poco. Acá
 * se viene a otra cosa: ver el estado completo de las reservas, incluidas las
 * que todavía tienen plazo y las que alguien pospuso, y repasar la cartera de
 * un asesor. Un panel desplegable con cuarenta filas no sirve para eso.
 *
 * DOS LISTAS Y NO UNA
 *
 * Arriba, las reservas con plazo corriendo. Abajo, los seguimientos que
 * salieron de lo que se escribió en las fichas. Las dos son «cosas que hay que
 * hacer», pero se miran distinto: una reserva se atiende para no perder el
 * cupo y tiene monto y cuenta regresiva; un seguimiento es una llamada que se
 * prometió y lo que importa es qué se había quedado con el cliente.
 *
 * QUÉ VE CADA QUIEN
 *
 * Un asesor, las suyas. La gerencia, las de todos, con el filtro por persona.
 * No lo decide esta pantalla: llegan filtradas de la base, igual que en todo
 * el resto del CRM.
 */
export function Recordatorios({
  lista,
  seguimientos,
  faltaMigracion,
  faltaMigracionSeguimientos,
  puedeElegirAsesor,
  accent,
  onAbrirFicha,
  onRefrescar,
}: {
  lista: readonly Recordatorio[];
  /** Los que salieron de las notas, ya ordenados. */
  seguimientos: readonly SeguimientoPendiente[];
  /** La tabla de pospuestos no existe todavía. */
  faltaMigracion: boolean;
  /** La tabla de seguimientos no existe todavía. */
  faltaMigracionSeguimientos: boolean;
  puedeElegirAsesor: boolean;
  accent: string;
  onAbrirFicha: (oportunidadId: number) => void;
  onRefrescar: () => void;
}) {
  const { vendedores } = useCatalogo();
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suyas = (r: Recordatorio) =>
    vendedorId == null ||
    (vendedorId === SIN_DUENO
      ? r.oportunidad.vendedorId == null
      : r.oportunidad.vendedorId === vendedorId);

  const visibles = lista.filter(suyas);
  const urgentes = porAtender(visibles);

  // El mismo filtro de persona vale para las dos listas: el botón dice «lo de
  // Ale», y lo de Ale son sus reservas y sus llamadas prometidas.
  const misSeguimientos = seguimientos.filter(
    (p) =>
      vendedorId == null ||
      (vendedorId === SIN_DUENO
        ? p.seguimiento.vendedorId == null
        : p.seguimiento.vendedorId === vendedorId),
  );
  const totalReservado = visibles.reduce((s, r) => s + (r.oportunidad.reserva ?? 0), 0);

  const mover = async (id: number, accion: "posponer" | "retomar") => {
    setOcupado(id);
    setError(null);
    const r =
      accion === "posponer"
        ? await posponerRecordatorio(id, 7)
        : await retomarRecordatorio(id);
    setOcupado(null);
    if (!r.ok) setError(r.error);
    else onRefrescar();
  };

  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: T.muted, lineHeight: 1.55, maxWidth: 640 }}>
        Dos cosas que hay que hacer: cobrar las reservas antes de que se libere
        el cupo, y devolver las llamadas que quedaron prometidas en las notas.
        Las más urgentes primero.
      </p>

      {faltaMigracion && (
        <p
          style={{
            margin: "0 0 14px",
            padding: "11px 14px",
            fontSize: 12.5,
            lineHeight: 1.5,
            borderRadius: 9,
            background: "#F6EEDC",
            color: "#7A5A12",
          }}
        >
          Para poder posponer avisos falta correr la migración{" "}
          <code>supabase/migrations/20260905120000_recordatorio_reserva.sql</code>{" "}
          en Supabase → SQL Editor. Mientras tanto la lista se ve igual, pero los
          botones de «recordar más adelante» no guardan nada.
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Resumen lista={visibles} />
        <span className="mono" style={{ fontSize: 11.5, color: T.faint }}>
          {money(totalReservado)} en anticipos ·{" "}
          {urgentes.length + seguimientosPorAtender(misSeguimientos).length} por
          atender
        </span>
      </div>

      {puedeElegirAsesor && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
          {[
            { id: null as number | null, nombre: "Todo el equipo" },
            ...activos(vendedores).map((v) => ({ id: v.id as number | null, nombre: v.nombre })),
            ...(lista.some((r) => r.oportunidad.vendedorId == null)
              ? [{ id: SIN_DUENO as number | null, nombre: "Sin asignar" }]
              : []),
          ].map((b) => {
            const puesto = vendedorId === b.id;
            return (
              <button
                key={b.id ?? "todos"}
                type="button"
                onClick={() => setVendedorId(b.id)}
                aria-pressed={puesto}
                style={{
                  height: 30,
                  padding: "0 12px",
                  fontSize: 12.5,
                  fontWeight: puesto ? 600 : 400,
                  border: `1px solid ${puesto ? accent : T.border}`,
                  borderRadius: 15,
                  background: puesto ? accent : T.surface,
                  color: puesto ? "#fff" : T.ink,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {b.nombre}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}

      <Titulo
        texto="Reservas por cobrar"
        aclara={`Quien deja un anticipo tiene ${PLAZO_DIAS} días para completar el pago; pasado eso el cupo se libera. El aviso se apaga solo cuando la venta queda registrada.`}
      />

      {visibles.length === 0 ? (
        <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          No hay reservas con plazo corriendo. Cuando alguien registre un
          anticipo en una ficha, aparece acá con su cuenta regresiva.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visibles.map((r) => {
            const o = r.oportunidad;
            const tono = TONO[r.urgencia];
            return (
              <div
                key={o.id}
                className="card"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${T.border}`,
                  // El borde de color va sólo a la izquierda: pintar la ficha
                  // entera de rojo con diez vencidas deja una pantalla que no
                  // se puede leer.
                  borderLeft: `4px solid ${tono.fuerte}`,
                  background: r.pospuesto ? T.paper : T.surface,
                  opacity: r.pospuesto ? 0.72 : 1,
                }}
              >
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => onAbrirFicha(o.id)}
                    style={{
                      padding: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: T.ink,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {o.cliente}
                  </button>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                    {o.codigo} · {o.producto} · {o.vendedor}
                    {o.telefono && ` · ${o.telefono}`}
                  </p>
                </div>

                <div style={{ flex: "0 0 auto", textAlign: "right" }}>
                  <span
                    className="pill"
                    style={{
                      display: "inline-block",
                      padding: "2px 9px",
                      borderRadius: 20,
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: tono.suave,
                      color: tono.fuerte,
                    }}
                  >
                    {comoSeLee(r)}
                  </span>
                  <p className="mono" style={{ margin: "3px 0 0", fontSize: 11, color: T.faint }}>
                    {o.reservaEn
                      ? `Reservó el ${cuando(o.reservaEn)}`
                      : "No se sabe cuándo reservó"}
                  </p>
                </div>

                <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 92 }}>
                  <p className="mono" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.ink }}>
                    {money(o.reserva ?? 0)}
                  </p>
                  <p className="mono" style={{ margin: 0, fontSize: 10.5, color: T.faint }}>
                    de {money(o.valor ?? 0)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void mover(o.id, r.pospuesto ? "retomar" : "posponer")}
                  disabled={ocupado === o.id}
                  style={{
                    flex: "0 0 auto",
                    height: 30,
                    padding: "0 11px",
                    fontSize: 12,
                    borderRadius: 7,
                    border: `1px solid ${T.border}`,
                    background: T.surface,
                    color: T.muted,
                    cursor: ocupado === o.id ? "wait" : "pointer",
                  }}
                >
                  {ocupado === o.id
                    ? "…"
                    : r.pospuesto
                      ? "Volver a avisarme"
                      : "Recordar en una semana"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Titulo
        texto="Seguimientos anotados en las fichas"
        aclara="Salen solos de la bitácora: cuando una nota dice «seguimiento de pago» o «seguimiento de cierre», el CRM saca la fecha del propio texto y lo deja acá."
      />

      <ListaSeguimientos
        lista={misSeguimientos}
        faltaMigracion={faltaMigracionSeguimientos}
        accent={accent}
        onAbrirFicha={onAbrirFicha}
        onRefrescar={onRefrescar}
      />
    </div>
  );
}

/**
 * El encabezado de cada lista.
 *
 * La aclaración va acá abajo y no en un párrafo suelto arriba de la pantalla:
 * la regla de las reservas y la de los seguimientos son distintas, y leídas
 * juntas al principio se mezclan. Cada una al lado de lo que explica.
 */
function Titulo({ texto, aclara }: { texto: string; aclara: string }) {
  return (
    <div style={{ margin: "22px 0 12px" }}>
      <h3 className="dsp" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink }}>
        {texto}
      </h3>
      <p style={{ margin: "3px 0 0", fontSize: 12, color: T.muted, lineHeight: 1.5, maxWidth: 640 }}>
        {aclara}
      </p>
    </div>
  );
}

/**
 * Cuántas hay de cada urgencia.
 *
 * Es la primera lectura de la pantalla: antes de mirar nombre por nombre, uno
 * quiere saber si hay tres vencidas o ninguna.
 */
function Resumen({ lista }: { lista: readonly Recordatorio[] }) {
  const orden: Urgencia[] = ["vencido", "hoy", "pronto", "en curso", "sin fecha"];
  const cuenta = (u: Urgencia) => lista.filter((r) => r.urgencia === u).length;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {orden
        // Las que no tienen ninguna no se muestran: un «0 vencidas» ocupa el
        // mismo lugar que un «3 vencidas» y hace que el número importante se
        // busque en vez de saltar a la vista.
        .filter((u) => cuenta(u) > 0)
        .map((u) => (
          <span
            key={u}
            style={{
              padding: "4px 10px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              background: TONO[u].suave,
              color: TONO[u].fuerte,
            }}
          >
            {cuenta(u)} {TONO[u].rotulo.toLowerCase()}
          </span>
        ))}
    </div>
  );
}
