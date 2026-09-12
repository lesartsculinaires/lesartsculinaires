"use client";

import type { OrigenDelLead } from "@/lib/whatsapp/mensajes";
import { T } from "@/lib/theme";

/**
 * La tarjeta de «este mensaje vino de un anuncio», como la dibuja WhatsApp.
 *
 * ============================================================================
 * PARA QUÉ SIRVE
 * ============================================================================
 *
 * Lo pidió la escuela: «que vean de dónde viene esa información cuando entra el
 * lead», por ventas y por marketing.
 *
 * Para quien atiende cambia la primera frase. No es lo mismo contestarle a
 * alguien que escribió de la nada que a alguien que acaba de ver un anuncio de
 * Pastelería: el segundo ya sabe de qué quiere hablar, y arrancar preguntándole
 * «¿en qué te puedo ayudar?» desperdicia lo que la pauta ya hizo.
 *
 * Para marketing es la otra mitad: qué campaña trae gente de verdad, no sólo
 * clics. Eso vive en `conversaciones.origen` y se pregunta con SQL; esto es lo
 * que se ve en el hilo.
 *
 * ============================================================================
 * POR QUÉ VA ARRIBA DE LA BURBUJA Y NO ADENTRO
 * ============================================================================
 *
 * Porque no es parte del mensaje. Lo que la persona escribió es una cosa y de
 * dónde venía es otra, y mezclarlas haría parecer que dijo algo que no dijo.
 * WhatsApp la dibuja así por lo mismo, y la idea era parecerse a WhatsApp.
 */
export function DeDondeVino({ origen, mio }: { origen: OrigenDelLead; mio: boolean }) {
  const titulo = origen.titular ?? origen.cuerpo;

  return (
    <a
      href={origen.url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      /*
       * Se abre en otra pestaña y con `noopener`.
       *
       * La dirección la puso quien armó la pauta, no el CRM, así que la pestaña
       * nueva no tiene por qué poder tocar ésta.
       */
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        maxWidth: "100%",
        marginBottom: 4,
        padding: "6px 8px",
        borderRadius: 9,
        background: mio ? "rgba(255,255,255,0.16)" : T.paper,
        border: `1px solid ${mio ? "rgba(255,255,255,0.28)" : T.border}`,
        textDecoration: "none",
        // Sin dirección no hay a dónde ir: la tarjeta se ve igual pero no
        // parece un enlace que no lleva a ningún lado.
        cursor: origen.url ? "pointer" : "default",
      }}
    >
      {/*
        La miniatura del anuncio, cuando Meta la manda.
        Va con `referrerPolicy` para no contarle a Meta quién abrió el CRM.
      */}
      {origen.imagen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={origen.imagen}
          alt=""
          referrerPolicy="no-referrer"
          style={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: 6,
            objectFit: "cover",
            background: T.border,
          }}
        />
      )}

      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: mio ? "rgba(255,255,255,0.85)" : T.muted,
          }}
        >
          {COMO_SE_LEE[origen.red] ?? "Vino de un enlace"}
        </span>

        {/*
          El titular en UNA línea, cortado con puntos suspensivos.
          Un anuncio puede tener un titular larguísimo, y dejarlo crecer haría
          que la tarjeta tape el mensaje que de verdad hay que leer.
        */}
        {titulo && (
          <span
            title={titulo}
            style={{
              display: "block",
              fontSize: 12,
              lineHeight: 1.35,
              marginTop: 1,
              color: mio ? "#fff" : T.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {titulo}
          </span>
        )}
      </span>
    </a>
  );
}

/** Cómo se anuncia cada clase de origen, arriba de la tarjeta. */
const COMO_SE_LEE: Record<string, string> = {
  anuncio: "Vino de un anuncio",
  publicacion: "Vino de una publicación",
  enlace: "Vino de un enlace",
};
