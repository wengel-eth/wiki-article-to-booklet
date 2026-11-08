/*
 * Paragraph-wide line breaking (Knuth & Plass, "Breaking paragraphs into
 * lines", 1981; the method TeX uses), for justified text.
 *
 * The browser breaks lines one at a time: it fills a line, then stretches its
 * spaces to the width, so a line of a few short words can end up with wide
 * gaps. Knuth-Plass chooses all of a paragraph's breaks together, so the
 * spacing is as even as possible across every line.
 *
 * breakLines() is pure, so it can be tested here; JUSTIFY_PARAGRAPHS (in
 * justify.ts) runs it in the rendering page, where the words are measured.
 */

export type Item =
  /** A word or part of one, or an inline object: can't be broken. */
  | { type: "box"; width: number }
  /** A space: a line can break here. It can stretch and shrink. */
  | { type: "glue"; width: number; stretch: number; shrink: number }
  /** A possible break that isn't a space, such as a hyphenation point. */
  | { type: "penalty"; width: number; penalty: number; flagged: boolean };

export interface BreakOptions {
  /** The largest adjustment ratio allowed: how far spaces may stretch, in units of their stretchability. */
  tolerance: number;
  /** Charged per line, so fewer lines are preferred. */
  linePenalty?: number;
  /** Charged for two hyphenated lines in a row. */
  flaggedDemerits?: number;
  /** Charged when a tight line follows a loose one, or the other way round. */
  fitnessDemerits?: number;
}

/** A penalty this large forbids a break; this negative forces one. */
export const INFINITE_PENALTY = 10000;

/**
 * The best set of breaks for a paragraph, as the indexes of the items the
 * lines end at (glue or penalties; the last is the paragraph's end, which
 * must be a forced break). `lineWidth(n)` is the width available to line n
 * (from 0), which can vary, for lines beside a picture. Null if no set of
 * breaks keeps every line within the tolerance.
 *
 * Self-contained (it uses nothing from outside), as it's also run in the
 * rendering page from its source text.
 */
export function breakLines(items: Item[], lineWidth: (line: number) => number, options: BreakOptions): number[] | null {
  const INF = 10000;
  const tolerance = options.tolerance;
  const linePenalty = options.linePenalty ?? 10;
  const flaggedDemerits = options.flaggedDemerits ?? 3000;
  const fitnessDemerits = options.fitnessDemerits ?? 3000;
  const n = items.length;

  // Running totals of width, stretch and shrink, so any line's are a subtraction.
  const width = new Float64Array(n + 1);
  const stretch = new Float64Array(n + 1);
  const shrink = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const item = items[i];
    width[i + 1] = width[i] + (item.type === "penalty" ? 0 : item.width);
    stretch[i + 1] = stretch[i] + (item.type === "glue" ? item.stretch : 0);
    shrink[i + 1] = shrink[i] + (item.type === "glue" ? item.shrink : 0);
  }

  // Where a line starts after a break: the next box (spaces and penalties at
  // the start of a line are dropped).
  const lineStart = (breakAt: number) => {
    let i = breakAt + 1;
    while (i < n && items[i].type !== "box") i++;
    return i;
  };

  interface Node {
    position: number; // the item the previous line ended at; -1 for the paragraph's start
    start: number; // the first item of the next line
    line: number; // how many lines end before this point
    fitness: number;
    demerits: number;
    previous: Node | null;
  }

  let active: Node[] = [{ position: -1, start: 0, line: 0, fitness: 1, demerits: 0, previous: null }];

  for (let b = 0; b < n; b++) {
    const item = items[b];
    const isBreak =
      (item.type === "glue" && b > 0 && items[b - 1].type === "box") ||
      (item.type === "penalty" && item.penalty < INF);
    if (!isBreak) continue;

    const penalty = item.type === "penalty" ? item.penalty : 0;
    const flagged = item.type === "penalty" && item.flagged;
    const forced = item.type === "penalty" && penalty <= -INF;
    const best: (Node | null)[] = [null, null, null, null];
    const stillActive: Node[] = [];

    for (const a of active) {
      const available = lineWidth(a.line);
      const natural = width[b] - width[a.start] + (item.type === "penalty" ? item.width : 0);
      let ratio: number;
      if (natural < available) {
        const s = stretch[b] - stretch[a.start];
        ratio = s > 0 ? (available - natural) / s : INF;
      } else if (natural > available) {
        const s = shrink[b] - shrink[a.start];
        ratio = s > 0 ? (available - natural) / s : -INF;
      } else {
        ratio = 0;
      }

      // A line that's already too full won't fit more; a forced break ends every line.
      if (ratio >= -1 && !forced) stillActive.push(a);

      if (ratio >= -1 && ratio <= tolerance) {
        const badness = 100 * Math.abs(ratio) ** 3;
        let demerits = (linePenalty + badness) ** 2;
        if (penalty >= 0) demerits += penalty ** 2;
        else if (penalty > -INF) demerits -= penalty ** 2;
        const previousItem = a.position >= 0 ? items[a.position] : null;
        if (flagged && previousItem?.type === "penalty" && previousItem.flagged) demerits += flaggedDemerits;
        const fitness = ratio < -0.5 ? 0 : ratio <= 0.5 ? 1 : ratio <= 1 ? 2 : 3;
        if (a.position >= 0 && Math.abs(fitness - a.fitness) > 1) demerits += fitnessDemerits;
        demerits += a.demerits;
        const current = best[fitness];
        if (!current || demerits < current.demerits) {
          best[fitness] = { position: b, start: lineStart(b), line: a.line + 1, fitness, demerits, previous: a };
        }
      }
    }

    active = stillActive;
    for (const node of best) if (node) active.push(node);
    if (active.length === 0) return null;
  }

  let end: Node | null = null;
  for (const node of active) {
    if (node.position === n - 1 && (!end || node.demerits < end.demerits)) end = node;
  }
  if (!end) return null;

  const breaks: number[] = [];
  for (let node: Node | null = end; node && node.position >= 0; node = node.previous) breaks.unshift(node.position);
  return breaks;
}
