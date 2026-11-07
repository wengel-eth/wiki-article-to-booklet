import { PDFDocument, type PDFEmbeddedPage } from "pdf-lib";
import { bookletSides } from "../shared/imposition";

export interface ImposedBooklet {
  bytes: Uint8Array;
  pages: number; // pages in the article PDF, before padding
  sheets: number; // sheets of paper needed
}

/**
 * Takes a PDF of booklet-sized pages in reading order and lays them out two to
 * a landscape sheet, in the order needed to fold and staple.
 */
export async function impose(source: ArrayBuffer, title: string): Promise<ImposedBooklet> {
  const src = await PDFDocument.load(source);
  const count = src.getPageCount();
  if (count === 0) throw new Error("The generated PDF has no pages.");

  const out = await PDFDocument.create();
  out.setTitle(`${title} (booklet)`);
  out.setCreator("wiki-article-to-booklet");

  // A page with no content stream can't be embedded; it's blank anyway.
  const pages: (PDFEmbeddedPage | null)[] = await Promise.all(
    src.getPages().map((page) => (page.node.Contents() ? out.embedPage(page) : null)),
  );
  const { width, height } = src.getPage(0).getSize();

  for (const [left, right] of bookletSides(count)) {
    const sheet = out.addPage([width * 2, height]);
    const l = left === null ? null : pages[left];
    const r = right === null ? null : pages[right];
    if (l) sheet.drawPage(l, { x: 0, y: 0, width, height });
    if (r) sheet.drawPage(r, { x: width, y: 0, width, height });
  }

  return {
    bytes: await out.save(),
    pages: count,
    sheets: out.getPageCount() / 2,
  };
}
