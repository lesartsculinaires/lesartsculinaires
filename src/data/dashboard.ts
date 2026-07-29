/** Monthly sales target in USD, used by both the year chart and the goal panel. */
export const GOAL = 4000;

/**
 * Year series. `null` means "derive from the leads data" (June and July are
 * live months); `0` means the month has not been recorded yet and renders as a
 * flat future stub.
 */
export const YEAR: readonly (readonly [string, number | null])[] = [
  ["Ene", 2860],
  ["Feb", 3420],
  ["Mar", 4100],
  ["Abr", 3680],
  ["May", 4950],
  ["Jun", null],
  ["Jul", null],
  ["Ago", 0],
  ["Sep", 0],
  ["Oct", 0],
  ["Nov", 0],
  ["Dic", 0],
];

/** Short month label → the `Cliente.mes` value it aggregates. */
export const MES_LARGO: Record<string, string> = {
  Jun: "Junio",
  Jul: "Julio",
};

/**
 * Trailing months in the goal panel. A `null` amount is derived from the leads
 * data the same way the year series is.
 */
export const GOAL_HISTORY: readonly (readonly [string, number | null])[] = [
  ["Jun", null],
  ["May", 4950],
  ["Abr", 3680],
];
