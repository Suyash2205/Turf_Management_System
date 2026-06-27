export const TURF_OPTIONS = [
  "Brabourne Turf",
  "Perth Turf",
  "Centurian Turf",
] as const;

export type TurfName = (typeof TURF_OPTIONS)[number];
