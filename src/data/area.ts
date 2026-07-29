import { ACCENT } from "@/lib/theme";

/**
 * A login gate / workspace. Only Ventas exists today; the structure is kept so
 * further areas (Académico, Administración) can be added without reshaping the
 * shell.
 */
export interface Area {
  key: string;
  label: string;
  email: string;
  scope: string;
  accent: string;
  /** Nav label for the leads table module. */
  people: string;
  /** Nav label for the kanban module. */
  pipeline: string;
}

export const AREAS: readonly Area[] = [
  {
    key: "ventas",
    label: "Ventas",
    email: "ventas@lesarts.com",
    scope: "Leads, seguimiento telefónico y cierre de matrículas.",
    accent: ACCENT,
    people: "Clientes",
    pipeline: "Pipeline",
  },
];

/** Modules in sidebar order. `people` and `pipeline` are area-specific labels. */
export const modulesFor = (area: Area): string[] => [
  "Dashboard",
  area.people,
  area.pipeline,
  "Calendario",
  "Equipos",
  "Diplomados y cursos",
];
