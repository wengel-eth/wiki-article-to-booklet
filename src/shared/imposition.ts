/**
 * Saddle-stitch imposition.
 *
 * Pages are printed two to a landscape sheet, double-sided. When the stack of
 * sheets is folded in half and stapled on the fold, the pages read in order.
 *
 * Returns the printed sides in print order (front of sheet 1, back of sheet 1,
 * front of sheet 2, ...). Each side is [left, right], as 0-based page indexes
 * into the original document; null means a blank page.
 */
export type Side = [left: number | null, right: number | null];

export function bookletSides(pageCount: number): Side[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) return [];

  const padded = Math.ceil(pageCount / 4) * 4;
  const page = (i: number) => (i < pageCount ? i : null);
  const sides: Side[] = [];

  for (let sheet = 0; sheet < padded / 4; sheet++) {
    const outer = padded - 1 - 2 * sheet;
    const inner = 2 * sheet;
    sides.push([page(outer), page(inner)]); // front
    sides.push([page(inner + 1), page(outer - 1)]); // back
  }
  return sides;
}
