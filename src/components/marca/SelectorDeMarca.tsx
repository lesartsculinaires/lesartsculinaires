"use client";

import { useEffect, useRef, useState } from "react";

import { useMarca } from "@/components/marca/MarcaContexto";
import { cambiarDeMarca } from "@/lib/marca/navegador";
import { CLAVES_DE_MARCA, MARCAS, type ClaveMarca } from "@/lib/marcas";
import { T } from "@/lib/theme";

/**
 * El selector de marca de crm-peñagroup (12/11/2026), arriba de la barra.
 *
 * Muestra el logo de la marca en uso y, al tocarlo, las dos marcas y —para
 * quien tiene el permiso— «Ambas marcas», la vista de Dirección. Elegir una
 * marca recarga la página contra la base de esa marca: nada de la otra queda
 * en memoria. Ver `cambiarDeMarca`.
 */
export function SelectorDeMarca({ veAmbas, enAmbas = false }: { veAmbas: boolean; enAmbas?: boolean }) {
  const marca = useMarca();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Se cierra al tocar afuera o con Escape, como cualquier menú.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const elegir = (k: ClaveMarca) => {
    setAbierto(false);
    if (k === marca.clave && !enAmbas) return;
    try {
      // Para el aviso de «Cambiaste a…» después de recargar.
      sessionStorage.setItem("crm.marca.anterior", enAmbas ? "ambas" : marca.clave);
    } catch {
      // Sin almacenamiento no hay aviso, y nada más.
    }
    cambiarDeMarca(k, "/");
  };

  return (
    <div ref={caja} style={{ position: "relative", margin: "0 0 14px" }}>
      <p
        className="mono"
        style={{ margin: "0 0 8px", fontSize: 10, letterSpacing: "0.12em", color: T.faint, textTransform: "uppercase" }}
      >
        CRM Peñagroup
      </p>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label="Cambiar de marca"
        data-selector-de-marca
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 9,
          width: "100%",
          padding: 11,
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: T.surface,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {enAmbas ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8, height: 34 }}>
            {CLAVES_DE_MARCA.map((k) => (
              <Simbolo key={k} clave={k} medida={30} />
            ))}
            <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Ambas marcas</span>
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={marca.logo}
            alt={marca.nombre}
            style={{ width: "100%", height: 34, objectFit: "contain", objectPosition: "left center" }}
          />
        )}
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            paddingTop: 8,
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.muted }}>Cambiar de marca</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={abierto ? "M7 14l5-5 5 5" : "M7 10l5 5 5-5"} />
          </svg>
        </span>
      </button>

      {abierto && (
        <div
          role="menu"
          aria-label="Marcas"
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 6px)",
            width: "min(320px, 86vw)",
            zIndex: 140,
            background: "#ffffff",
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.18)",
            padding: 8,
          }}
        >
          <p className="mono" style={{ margin: 0, padding: "6px 10px 8px", fontSize: 10, letterSpacing: "0.08em", color: T.faint }}>
            CAMBIAR DE MARCA
          </p>
          {CLAVES_DE_MARCA.map((k) => {
            const m = MARCAS[k];
            const actual = !enAmbas && k === marca.clave;
            return (
              <button
                key={k}
                type="button"
                role="menuitemradio"
                aria-checked={actual}
                onClick={() => elegir(k)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: 10,
                  borderRadius: 9,
                  border: "none",
                  background: actual ? "#F3F5F9" : "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Simbolo clave={k} medida={42} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#141826" }}>{m.nombre}</span>
                  <span style={{ display: "block", fontSize: 12, color: "#5B6478" }}>{m.instituto}</span>
                </span>
                {actual && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E7A46" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Marca actual">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                )}
              </button>
            );
          })}
          {veAmbas && (
            <a
              href="/ambas"
              role="menuitemradio"
              aria-checked={enAmbas}
              onClick={() => setAbierto(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 10,
                marginTop: 4,
                borderTop: "1px solid #ECEEF2",
                borderRadius: 9,
                textDecoration: "none",
                color: "#141826",
                background: enAmbas ? "#F3F5F9" : "#ffffff",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 42,
                  height: 42,
                  flexShrink: 0,
                  borderRadius: 9,
                  border: "1px solid #DADFE8",
                  display: "flex",
                  overflow: "hidden",
                }}
              >
                <span style={{ flex: 1, background: MARCAS.lac.paleta.ink }} />
                <span style={{ flex: 1, background: "#141414" }} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>Ambas marcas</span>
                <span style={{ display: "block", fontSize: 12, color: "#5B6478" }}>Vista de Dirección · solo lectura</span>
              </span>
            </a>
          )}
          <p
            style={{
              margin: "6px 4px 2px",
              padding: 10,
              borderRadius: 9,
              background: "#F3F5F9",
              fontSize: 12,
              lineHeight: 1.5,
              color: "#39425A",
            }}
          >
            Cada marca tiene su propia base de datos. Clientes, chats y ventas nunca se mezclan: solo cambias de
            ventana.
          </p>
        </div>
      )}
    </div>
  );
}

function Simbolo({ clave, medida }: { clave: ClaveMarca; medida: number }) {
  const m = MARCAS[clave];
  return (
    <span
      style={{
        width: medida,
        height: medida,
        flexShrink: 0,
        boxSizing: "border-box",
        padding: Math.round(medida / 7),
        borderRadius: 9,
        background: "#ffffff",
        border: "1px solid #DADFE8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.simbolo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </span>
  );
}
