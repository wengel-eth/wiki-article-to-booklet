import { describe, expect, test } from "bun:test";
import { breakLines, INFINITE_PENALTY, type Item } from "../src/worker/linebreak";

const SPACE = 1;

/** A paragraph as items: words of the given widths, spaces between, a fill and a forced break at the end. */
function paragraph(words: (number | number[])[]): Item[] {
  const items: Item[] = [];
  words.forEach((word, i) => {
    if (i > 0) items.push({ type: "glue", width: SPACE, stretch: SPACE / 2, shrink: SPACE / 3 });
    // A word given as parts can be hyphenated between them.
    const parts = Array.isArray(word) ? word : [word];
    parts.forEach((part, j) => {
      if (j > 0) items.push({ type: "penalty", width: 0.5, penalty: 50, flagged: true });
      items.push({ type: "box", width: part });
    });
  });
  items.push({ type: "glue", width: 0, stretch: 1e6, shrink: 0 });
  items.push({ type: "penalty", width: 0, penalty: -INFINITE_PENALTY, flagged: true });
  return items;
}

/** Each line's adjustment ratio, for given breaks (the last line is free). */
function ratios(items: Item[], breaks: number[], lineWidth: (n: number) => number): number[] {
  const out: number[] = [];
  let start = 0;
  breaks.forEach((b, line) => {
    let natural = 0, stretch = 0, shrink = 0;
    for (let i = start; i < b; i++) {
      const it = items[i];
      if (it.type === "box") natural += it.width;
      if (it.type === "glue") { natural += it.width; stretch += it.stretch; shrink += it.shrink; }
    }
    const end = items[b];
    if (end.type === "penalty") natural += end.width;
    const L = lineWidth(line);
    if (line < breaks.length - 1) out.push(natural <= L ? (L - natural) / stretch : (L - natural) / shrink);
    start = b + 1;
    while (start < items.length && items[start].type !== "box") start++;
  });
  return out;
}

/** The browser's way: fill each line as far as it goes. */
function greedy(items: Item[], lineWidth: (n: number) => number): number[] {
  const breaks: number[] = [];
  let line = 0, used = 0, lastBreak = -1, start = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === "box") {
      if (used + it.width > lineWidth(line) && lastBreak >= start) {
        breaks.push(lastBreak);
        line++;
        used = 0;
        start = lastBreak + 1;
        i = lastBreak;
        continue;
      }
      used += it.width;
    } else if (it.type === "glue") {
      lastBreak = i;
      used += it.width;
    }
  }
  breaks.push(items.length - 1);
  return breaks;
}

/** Deterministic word widths, like English words in a narrow column. */
function words(count: number, seed: number): number[] {
  let x = seed;
  return Array.from({ length: count }, () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return 2 + (x % 9);
  });
}

describe("breakLines", () => {
  test("every line stays within the tolerance and the last break is the end", () => {
    const items = paragraph(words(80, 7));
    const width = () => 40;
    const breaks = breakLines(items, width, { tolerance: 10 })!;
    expect(breaks).not.toBeNull();
    expect(breaks.at(-1)).toBe(items.length - 1);
    for (const r of ratios(items, breaks, width)) {
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(10);
    }
  });

  test("spacing is more even than filling each line as far as it goes", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const items = paragraph(words(120, seed));
      const width = () => 30;
      const optimal = ratios(items, breakLines(items, width, { tolerance: 10 })!, width);
      const browser = ratios(items, greedy(items, width), width);
      const worst = (rs: number[]) => Math.max(...rs.map(Math.abs));
      expect(worst(optimal)).toBeLessThanOrEqual(worst(browser));
    }
  });

  test("lines can have different widths, as beside a picture", () => {
    const items = paragraph(words(60, 9));
    const width = (line: number) => (line < 4 ? 18 : 40);
    // A narrow line may hold a single word, with no space to stretch: only the
    // last-resort tolerance accepts that.
    const breaks = breakLines(items, width, { tolerance: 1e4 })!;
    expect(breaks).not.toBeNull();
    for (const r of ratios(items, breaks, width)) expect(r).toBeGreaterThanOrEqual(-1);
    // The narrow lines really are narrow.
    expect(ratios(items, breaks, () => 18).slice(0, 4).every((r) => r >= -1)).toBe(true);
  });

  test("hyphenation points help a narrow column", () => {
    const long = [[4, 3, 4], [3, 5], [4, 4, 3], [5, 3]];
    const plain = paragraph(long.map((w) => w.reduce((a, b) => a + b)).concat(words(10, 3)));
    const hyphenated = paragraph([...long, ...words(10, 3)]);
    const width = () => 14;
    // Lines stretched past 3 (spaces at 2.5 times), or holding one unstretchable word.
    const loose = (items: Item[]) =>
      ratios(items, breakLines(items, width, { tolerance: 1e4 })!, width).filter((r) => r > 3).length;
    expect(loose(hyphenated)).toBeLessThan(loose(plain));
  });

  test("with a high enough tolerance there is always a solution", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const items = paragraph(words(100, seed));
      expect(breakLines(items, () => 14, { tolerance: 1e4 })).not.toBeNull();
    }
  });

  test("no breaks when a word is wider than the line", () => {
    expect(breakLines(paragraph([3, 50, 3]), () => 20, { tolerance: 10 })).toBeNull();
  });

  test("its source runs on its own, as it does in the rendering page", () => {
    const source = breakLines.toString();
    expect(source).not.toContain("__name");
    const rebuilt = new Function(`return ${source}`)() as typeof breakLines;
    const items = paragraph(words(40, 11));
    expect(rebuilt(items, () => 25, { tolerance: 3 })).toEqual(breakLines(items, () => 25, { tolerance: 3 }));
  });
});
