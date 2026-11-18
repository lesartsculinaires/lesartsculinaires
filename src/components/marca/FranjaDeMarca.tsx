"use client";

import { useEffect, useState } from "react";

import { useMarca } from "@/components/marca/MarcaContexto";
import { cambiarDeMarca } from "@/lib/marca/navegador";
import { MARCAS, esClaveDeMarca, type ClaveMarca } from "@/lib/marcas";

/**
 * La franja de arriba de crm-peñagroup (12/11/2026): en qué marca se está
 * trabajando, para que nadie conteste a un cliente de HC creyendo que está en
 * LAC. Lleva el color de la marca, que es lo primero que se ve.
 *
 * Después de cambiar de marca, avisa una vez «Cambiaste a…» con el atajo para
 * volver.
 */
export function FranjaDeMarca() {
  const marca = useMarca();
  const [anterior, setAnterior] = useState<ClaveMarca | null>(null);

  useEffect(() => {
    try {
      const a = sessionStorage.getItem("crm.marca.anterior");
      sessionStorage.removeItem("crm.marca.anterior");
      if (esClaveDeMarca(a) && a !== marca.clave) setAnterior(a);
    } catch {
      // Sin almacenamiento, sin aviso.
    }
  }, [marca.clave]);

  useEffect(() => {
    if (!anterior) return;
    const t = window.setTimeout(() => setAnterior(null), 12_000);
    return () => window.clearTimeout(t);
  }, [anterior]);

  return (
    <>
      <div
        className="lac solo-escritorio franja-de-marca"
        role="status"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "7px 20px",
          background: "var(--crm-ink)",
          color: "#ffffff",
          fontSize: 12.5,
        }}
      >
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--crm-resalte)" }} />
        <span>
          Estás trabajando en <strong>{marca.nombre}</strong>
        </span>
        <span style={{ opacity: 0.75 }}>Base de datos: {marca.prefijo} (separada)</span>
        <span style={{ opacity: 0.75 }}>crm-peñagroup</span>
        <span style={{ flex: 1 }} />
        <span style={{ opacity: 0.85 }}>Todo lo que guardes aquí queda solo en {marca.prefijo}</span>
      </div>

      {anterior && (
        <div
          className="lac"
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 22,
            transform: "translateX(-50%)",
            zIndex: 150,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            maxWidth: "calc(100vw - 32px)",
            padding: "11px 16px",
            borderRadius: 10,
            background: "#141826",
            color: "#ffffff",
            fontSize: 13,
            boxShadow: "0 12px 30px rgba(0,0,0,.25)",
          }}
        >
          <span>
            Cambiaste a <strong>{marca.nombre}</strong>. Lo que escribías en {MARCAS[anterior].prefijo} quedó
            guardado como borrador.
          </span>
          <button
            type="button"
            onClick={() => cambiarDeMarca(anterior, "/")}
            style={{ color: "var(--crm-resalte)", fontWeight: 600, fontSize: 13, textDecoration: "underline" }}
          >
            Volver a {MARCAS[anterior].prefijo}
          </button>
          <button type="button" onClick={() => setAnterior(null)} aria-label="Cerrar aviso" style={{ color: "#fff", opacity: 0.7 }}>
            ✕
          </button>
        </div>
      )}
    </>
  );
}
