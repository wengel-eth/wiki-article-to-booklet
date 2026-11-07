import { expect, test } from "bun:test";
import { PDFArray, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { fillContents, headingPages } from "../src/worker/contents";

// Builds a PDF shaped like Chrome's output: a /Dests dictionary in the catalog
// mapping each link target id to [pageRef /XYZ x y zoom].
async function pdfWithDests(pageCount: number, dests: Record<string, number>) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([100, 100]);
  const pages = doc.getPages();
  const dict = doc.context.obj({});
  for (const [name, index] of Object.entries(dests)) {
    const dest = PDFArray.withContext(doc.context);
    dest.push(pages[index].ref);
    dest.push(PDFName.of("XYZ"));
    dest.push(PDFNumber.of(0));
    dest.push(PDFNumber.of(100));
    dest.push(PDFNumber.of(0));
    dict.set(PDFName.of(name), dest);
  }
  doc.catalog.set(PDFName.of("Dests"), doc.context.register(dict));
  return doc.save();
}

test("headingPages maps toc destinations to 1-based page numbers", async () => {
  const pdf = await pdfWithDests(6, { "toc-0": 3, "toc-1": 3, "toc-2": 5, cite_note: 1 });
  expect(await headingPages(pdf)).toEqual({ "toc-0": 4, "toc-1": 4, "toc-2": 6 });
});

test("headingPages copes with a PDF that has no destinations", async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  expect(await headingPages(await doc.save())).toEqual({});
});

test("fillContents embeds the numbers as data", () => {
  const script = fillContents({ "toc-0": 4, "toc-1": 9 });
  expect(script).toContain('({"toc-0":4,"toc-1":9})');
});
