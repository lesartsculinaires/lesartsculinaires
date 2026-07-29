"use client";

import type { CSSProperties } from "react";

import { T } from "@/lib/theme";

interface Props {
  /** Renders the image when set; otherwise the empty placeholder chrome. */
  src?: string;
  alt?: string;
  width: number;
  height: number;
  radius?: number;
  placeholder?: string;
}

/**
 * Fillable image slot. The prototype used a drag-and-drop `<image-slot>` custom
 * element; here it degrades to an image when a `src` exists and to the same
 * dashed empty state when it does not.
 */
export function ImageSlot({
  src,
  alt = "",
  width,
  height,
  radius = 12,
  placeholder = "Foto",
}: Props) {
  const frame: CSSProperties = {
    position: "relative",
    width,
    height,
    flexShrink: 0,
    borderRadius: radius,
    overflow: "hidden",
    background: "rgba(127,127,127,0.08)",
  };

  if (src) {
    return (
      <span style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </span>
    );
  }

  return (
    <span style={frame}>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: 12,
          textAlign: "center",
          fontSize: 11,
          color: T.faint,
          userSelect: "none",
        }}
      >
        {placeholder}
      </span>
      <span
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          borderRadius: radius,
          border: `1.5px dashed ${T.borderStrong}`,
        }}
      />
    </span>
  );
}
