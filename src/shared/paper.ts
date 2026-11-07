// Sheet sizes, in millimetres, portrait orientation. The sheet is what goes
// into the printer; each booklet page is half a sheet.
export const PAPER_SIZES = {
  letter: { label: "Letter (8.5 × 11 in)", width: 215.9, height: 279.4 },
  legal: { label: "Legal (8.5 × 14 in)", width: 215.9, height: 355.6 },
  tabloid: { label: "Tabloid (11 × 17 in)", width: 279.4, height: 431.8 },
  a4: { label: "A4 (210 × 297 mm)", width: 210, height: 297 },
  a3: { label: "A3 (297 × 420 mm)", width: 297, height: 420 },
} as const;

export type PaperId = keyof typeof PAPER_SIZES;

export const PAPER_IDS = Object.keys(PAPER_SIZES) as PaperId[];

export function isPaperId(value: unknown): value is PaperId {
  return typeof value === "string" && Object.hasOwn(PAPER_SIZES, value);
}

/** Size of one booklet page (half a sheet, portrait), in millimetres. */
export function bookletPageSize(id: PaperId): { width: number; height: number } {
  const sheet = PAPER_SIZES[id];
  return { width: sheet.height / 2, height: sheet.width };
}
