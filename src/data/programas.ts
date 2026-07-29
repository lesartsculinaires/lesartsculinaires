import type { Programa } from "@/lib/types";

/** Course catalogue. `nombre` is the join key against `Cliente.producto`. */
export const PROGRAMAS: readonly Programa[] = [
  { nombre: "Diplomado de Cocina", tipo: "Diplomado", duracion: "9 meses", precio: 1850, cuposLlenos: 22, cuposTotal: 24, inicio: "12 ago" },
  { nombre: "Diplomado de Pastelería", tipo: "Diplomado", duracion: "8 meses", precio: 1750, cuposLlenos: 18, cuposTotal: 24, inicio: "12 ago" },
  { nombre: "Diplomado de Mixología", tipo: "Diplomado", duracion: "5 meses", precio: 1180, cuposLlenos: 11, cuposTotal: 20, inicio: "19 ago" },
  { nombre: "Diplomado de Barismo y Extracción de Café", tipo: "Diplomado", duracion: "4 meses", precio: 980, cuposLlenos: 9, cuposTotal: 18, inicio: "26 ago" },
  { nombre: "Diplomado Management Gastronómico", tipo: "Diplomado", duracion: "6 meses", precio: 1420, cuposLlenos: 7, cuposTotal: 20, inicio: "2 sep" },
  { nombre: "Suprême Diplôme", tipo: "Diplomado", duracion: "18 meses", precio: 4600, cuposLlenos: 12, cuposTotal: 16, inicio: "1 sep" },
  { nombre: "Les Petits Chefs", tipo: "Curso corto", duracion: "6 sesiones", precio: 220, cuposLlenos: 24, cuposTotal: 24, inicio: "3 ago" },
  { nombre: "Cocina Nikkei", tipo: "Curso corto", duracion: "4 sesiones", precio: 260, cuposLlenos: 13, cuposTotal: 18, inicio: "9 ago" },
  { nombre: "Bowl Fusion", tipo: "Curso corto", duracion: "3 sesiones", precio: 180, cuposLlenos: 8, cuposTotal: 18, inicio: "16 ago" },
  { nombre: "Mixología 360", tipo: "Curso corto", duracion: "4 sesiones", precio: 240, cuposLlenos: 15, cuposTotal: 20, inicio: "23 ago" },
  { nombre: "Bollería Francesa", tipo: "Curso corto", duracion: "4 sesiones", precio: 280, cuposLlenos: 17, cuposTotal: 18, inicio: "30 ago" },
  { nombre: "Pastelería Saludable", tipo: "Curso corto", duracion: "3 sesiones", precio: 195, cuposLlenos: 6, cuposTotal: 18, inicio: "6 sep" },
  { nombre: "Certificación Profesional", tipo: "Certificación", duracion: "Examen + práctica", precio: 340, cuposLlenos: 14, cuposTotal: 30, inicio: "Todo el mes" },
];

/** Filter tabs: catalogue value → plural label shown on the tab. */
export const PROGRAMA_TABS = [
  ["Todos", "Todos"],
  ["Diplomado", "Diplomados"],
  ["Curso corto", "Cursos cortos"],
  ["Certificación", "Certificaciones"],
] as const;
