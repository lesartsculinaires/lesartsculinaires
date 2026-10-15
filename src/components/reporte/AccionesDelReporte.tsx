"use client";

import type { TipoReporte } from "@/lib/reporte";

/**
 * Lo que se puede hacer con el reporte: imprimirlo (o guardarlo en PDF desde
 * la misma ventana de impresión), bajarlo para Excel, y pedir otro día u otro
 * mes sin volver al Dashboard.
 */
export function AccionesDelReporte({
  tipo,
  desde,
  csv,
  archivo,
}: {
  tipo: TipoReporte;
  desde: string;
  csv: string;
  archivo: string;
}) {
  const descargar = () => {
    // La marca de UTF-8 (BOM) es lo que hace que Excel lea bien los acentos.
    // Se pone acá: en el viaje del servidor al navegador se puede perder.
    const conMarca = csv.startsWith("\uFEFF") ? csv : `\uFEFF${csv}`;
    const blob = new Blob([conMarca], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="rp-acciones" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <form method="get" action="/reporte" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <label htmlFor="rp-periodo" style={{ fontSize: 12.5, color: "#4C5A7A" }}>
          {tipo === "dia" ? "Otro día" : "Otro mes"}
        </label>
        <input
          id="rp-periodo"
          type={tipo === "dia" ? "date" : "month"}
          name={tipo === "dia" ? "dia" : "mes"}
          defaultValue={tipo === "dia" ? desde : desde.slice(0, 7)}
          style={{ font: "inherit", fontSize: 13, padding: "8px 10px", border: "1px solid #B4BFD8", borderRadius: 8, color: "#031B4F" }}
        />
        <button type="submit" className="rp-boton">Ver</button>
      </form>
      <button type="button" className="rp-boton" onClick={() => window.print()}>
        Imprimir o guardar PDF
      </button>
      <button type="button" className="rp-boton rp-principal" onClick={descargar}>
        Descargar para Excel
      </button>
      <a href="/" className="rp-boton" style={{ textDecoration: "none" }}>
        Volver al CRM
      </a>
    </div>
  );
}
