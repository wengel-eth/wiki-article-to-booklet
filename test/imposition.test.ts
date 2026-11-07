import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { impose } from "../src/app/impose";
import { bookletSides } from "../src/shared/imposition";

describe("bookletSides", () => {
  test("8 pages on 2 sheets", () => {
    expect(bookletSides(8)).toEqual([
      [7, 0],
      [1, 6],
      [5, 2],
      [3, 4],
    ]);
  });

  test("pads to a multiple of 4 with blanks at the back", () => {
    expect(bookletSides(5)).toEqual([
      [null, 0],
      [1, null],
      [null, 2],
      [3, 4],
    ]);
  });

  test("a single page still makes one sheet", () => {
    expect(bookletSides(1)).toEqual([
      [null, 0],
      [null, null],
    ]);
  });

  test("every page appears exactly once", () => {
    for (let n = 1; n <= 40; n++) {
      const used = bookletSides(n).flat().filter((p) => p !== null).sort((a, b) => a! - b!);
      expect(used).toEqual([...Array(n).keys()]);
    }
  });

  test("pages printed side by side become a spread when folded", () => {
    // On a saddle-stitched booklet, the two pages on one side of a sheet
    // always add up to (padded page count - 1).
    const sides = bookletSides(12);
    for (const [l, r] of sides) expect(l! + r!).toBe(11);
  });

  test("rejects nonsense", () => {
    expect(bookletSides(0)).toEqual([]);
    expect(bookletSides(-3)).toEqual([]);
    expect(bookletSides(2.5)).toEqual([]);
  });
});

test("impose puts two pages side by side on landscape sheets", async () => {
  const src = await PDFDocument.create();
  for (let i = 0; i < 6; i++) src.addPage([420, 595]).drawText(`Page ${i + 1}`, { x: 50, y: 500 });
  src.addPage([420, 595]); // empty page, no content stream
  const result = await impose((await src.save()).buffer as ArrayBuffer, "Test");

  expect(result.pages).toBe(7);
  expect(result.sheets).toBe(2);

  const out = await PDFDocument.load(result.bytes);
  expect(out.getPageCount()).toBe(4);
  for (const page of out.getPages()) expect(page.getSize()).toEqual({ width: 840, height: 595 });
});
