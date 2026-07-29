/** Neutral palette shared by every module. */
export const T = {
  ink: "#1F1D1A",
  paper: "#F5F4F1",
  surface: "#FFFFFF",
  border: "#E3E0D9",
  borderStrong: "#CFCAC0",
  muted: "#75706A",
  faint: "#9A948C",
  warn: "#C8811E",
} as const;

/** Sales accent. The design exposes this as a prop; it is the only hue that varies. */
export const ACCENT = "#028090";

/**
 * Accent tints. The design appends 8-bit alpha suffixes to the accent hex, so
 * these stay in sync automatically when the accent changes.
 */
export const soft = (accent: string) => `${accent}1A`;
/** Menu/chip fill — slightly lighter than `soft`. */
export const softer = (accent: string) => `${accent}14`;
/** "In pipeline" bar segments, sitting behind the solid won segment. */
export const openTone = (accent: string) => `${accent}3D`;
