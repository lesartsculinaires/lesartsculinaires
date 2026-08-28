import type { Metadata } from "next";

import { leerRecibo, type Recibo } from "@/lib/supabase/recibo";

/** Cada apertura se cuenta y el detalle puede haber cambiado: nunca de caché. */
export const dynamic = "force-dynamic";

/**
 * Que ningún buscador lo indexe.
 *
 * Un enlace con el teléfono y el monto de una persona no tiene por qué
 * aparecer en Google. El token ya lo hace imposible de adivinar, pero basta con
 * que alguien lo pegue en un lugar público para que un rastreador lo siga.
 */
export const metadata: Metadata = {
  title: "Detalle de inscripción",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * El recibo que abre el área académica.
 *
 * Es texto plano a propósito: se lee en el celular, se copia a mano al sistema
 * de cobro y se imprime sin que se descuadre. No hay botones ni nada que
 * apretar; lo único que tiene que hacer esta página es decir a quién cobrarle
 * y cuánto, sin ambigüedad.
 */
export default async function PaginaRegistro({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { estado, recibo } = await leerRecibo(token);

  if (estado !== "ok" || !recibo) {
    return <Aviso estado={estado} />;
  }

  return <ReciboImpreso recibo={recibo} />;
}

const HOJA: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: "32px 20px 60px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 14,
  lineHeight: 1.65,
  color: "#111",
  background: "#fff",
};

function ReciboImpreso({ recibo: r }: { recibo: Recibo }) {
  // Menor de 18: los datos del responsable son parte de lo que académica
  // necesita para inscribir, no un adorno.
  const esMenor = r.edad != null && r.edad < 18;

  return (
    <main style={HOJA}>
      <Titulo>LES ARTS CULINAIRES</Titulo>
      <p style={{ margin: "0 0 18px", textAlign: "center" }}>DETALLE DE INSCRIPCIÓN</p>

      <Regla />
      <Linea etiqueta="Código" valor={r.codigo} />
      <Linea etiqueta="Fecha" valor={fecha(r.fecha)} />
      {r.asesor && <Linea etiqueta="Asesor" valor={r.asesor} />}

      <Regla />
      <Bloque>ALUMNO</Bloque>
      <Linea etiqueta="Nombre" valor={r.cliente} />
      {r.telefono && <Linea etiqueta="Teléfono" valor={r.telefono} />}
      {r.correo && <Linea etiqueta="Correo" valor={r.correo} />}
      {r.edad != null && <Linea etiqueta="Edad" valor={`${r.edad} años`} />}

      {esMenor && (
        <>
          <Regla />
          <Bloque>RESPONSABLE (el alumno es menor de edad)</Bloque>
          <Linea etiqueta="Nombre" valor={r.responsableNombre ?? "— falta —"} />
          <Linea etiqueta="Celular" valor={r.responsableTelefono ?? "— falta —"} />
          <Linea etiqueta="Correo" valor={r.responsableCorreo ?? "— falta —"} />
        </>
      )}

      <Regla />
      <Bloque>PROGRAMA</Bloque>
      <Linea etiqueta="Programa" valor={r.programa ?? "—"} />
      {/* El horario sólo cuando lo hay. Una línea «Horario —» en cada recibo se
          vuelve invisible de tanto repetirse, igual que pasaba con la reserva.
          Cuando falta, quien lo lea nota el hueco y lo pregunta; cuando está,
          es lo que se le prometió a esta persona y no lo que el programa diga
          hoy. */}
      {r.horario && <Linea etiqueta="Horario" valor={r.horario} />}
      {r.territorio && <Linea etiqueta="Territorio" valor={r.territorio} />}
      {/* El país va debajo del territorio y sólo cuando lo hay. «Territorio:
          Extranjero» solo no le sirve a quien inscribe: no distingue a alguien
          de Guatemala de alguien de España, y de eso dependen el trámite y los
          papeles que hay que pedirle. */}
      {r.pais && <Linea etiqueta="País" valor={r.pais} />}

      <Regla />
      <Bloque>MONTO</Bloque>
      <Linea etiqueta="Valor" valor={dinero(r.valor)} />
      {r.descuento && <Linea etiqueta="Descuento" valor={r.descuento} />}
      {/* La reserva sólo aparece cuando la hay. Una línea «Reserva —» en cada
          recibo se vuelve invisible de tanto repetirse, y justo cuando dijera
          un monto nadie la miraría. */}
      {r.reserva != null && r.reserva > 0 && (
        <>
          <Linea etiqueta="Reserva" valor={`${dinero(r.reserva)} ya pagados`} />
          {/* Lo que hay que cobrar, hecha la resta. Es el número sobre el que
              actúa quien recibe esto, y dejar la cuenta en manos de cada quien
              es la forma más barata de cobrar de más. */}
          {r.valor != null && (
            <Linea etiqueta="Queda" valor={dinero(Math.max(r.valor - r.reserva, 0))} />
          )}
        </>
      )}

      <Regla />
      <p style={{ margin: "14px 0 0", fontSize: 11, color: "#666", lineHeight: 1.6 }}>
        Emitido el {fechaHora(r.emitidoEn)}. Este detalle es informativo: no es
        una factura ni un comprobante de pago.
      </p>
    </main>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h1
      style={{
        margin: "0 0 2px",
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textAlign: "center",
      }}
    >
      {children}
    </h1>
  );
}

function Regla() {
  return (
    <div
      aria-hidden
      style={{ margin: "12px 0", borderTop: "1px dashed #999", height: 0 }}
    />
  );
}

function Bloque({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 6px", fontWeight: 700, letterSpacing: "0.06em" }}>{children}</p>
  );
}

/**
 * Una línea del recibo.
 *
 * La etiqueta va con ancho fijo para que los valores queden alineados en
 * columna, que es lo que hace que un recibo se lea de un vistazo. En pantalla
 * angosta se apilan en vez de apretarse.
 */
function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p style={{ margin: "0 0 2px", display: "flex", gap: 10, flexWrap: "wrap" }}>
      <span style={{ minWidth: 96, color: "#555" }}>{etiqueta}</span>
      <span style={{ fontWeight: 600, wordBreak: "break-word" }}>{valor}</span>
    </p>
  );
}

function Aviso({ estado }: { estado: string }) {
  const texto: Record<string, string> = {
    "no-existe": "Este enlace no existe. Puede estar mal copiado: revisá que no le falte el final.",
    vencido: "Este enlace venció. Pedile uno nuevo al asesor.",
    anulado: "Este enlace fue anulado. Pedile uno nuevo al asesor.",
    "sin-configurar": "El servidor no está configurado para abrir estos enlaces.",
  };

  return (
    <main style={{ ...HOJA, textAlign: "center" }}>
      <Titulo>LES ARTS CULINAIRES</Titulo>
      <p style={{ marginTop: 24, lineHeight: 1.7 }}>
        {texto[estado] ?? "No se pudo abrir este enlace."}
      </p>
    </main>
  );
}

/** "2026-08-18" → "18/08/2026". Se parte el texto para no correr un día por la zona horaria. */
function fecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} a las ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dinero(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
