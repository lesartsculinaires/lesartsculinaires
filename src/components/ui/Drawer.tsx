"use client";

import type { ReactNode } from "react";

import { T } from "@/lib/theme";

interface Props {
  /** Max width of the panel; it goes full-bleed on narrow screens. */
  width: number;
  onClose: () => void;
  children: ReactNode;
  /**
   * Un panel a la izquierda del cajón, del mismo alto: el chat del cliente al
   * lado de su ficha. En pantallas angostas no se dibuja (`.drawer-lateral`,
   * en globals.css): ahí la ficha manda y el chat se abre desde la bandeja.
   */
  lateral?: ReactNode;
}

/** Right-hand overlay panel shared by the client and event detail views. */
export function Drawer({ width, onClose, children, lateral }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        // Above the menu click-away layer (60) so dropdowns inside the drawer
        // stay clickable; the layer still covers everything outside it.
        zIndex: 80,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(31,29,26,0.3)",
        }}
      />
      {lateral && (
        <div
          className="drawer-lateral"
          style={{
            position: "relative",
            width: "min(620px, calc(100% - 500px))",
            height: "100%",
            padding: "20px 14px 20px 20px",
            background: T.paper,
            borderLeft: `1px solid ${T.borderStrong}`,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {lateral}
        </div>
      )}
      <aside
        style={{
          position: "relative",
          width: `min(${width}px, 100%)`,
          height: "100%",
          overflowY: "auto",
          background: T.surface,
          borderLeft: `1px solid ${T.borderStrong}`,
          padding: "20px 24px 34px",
        }}
      >
        {children}
      </aside>
    </div>
  );
}

/** Square close affordance used in both drawer headers. */
export function DrawerClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Cerrar"
      style={{
        width: 30,
        height: 30,
        flexShrink: 0,
        borderRadius: 6,
        background: T.paper,
        color: T.muted,
        fontSize: 15,
      }}
    >
      ✕
    </button>
  );
}

/** Small uppercase section heading used throughout the drawers. */
export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <p
      className="mono"
      style={{
        margin: "0 0 9px",
        fontSize: 10,
        letterSpacing: "0.1em",
        color: T.faint,
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </p>
  );
}
