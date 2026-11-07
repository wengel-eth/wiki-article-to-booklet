import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";

/*
 * The contents page needs page numbers, and Chrome can't print the page a
 * link points to. So:
 *   1. BUILD_CONTENTS adds a contents page whose entries link to each
 *      heading (#toc-0, #toc-1, ...) with empty, fixed-width number boxes.
 *   2. The page is printed. Chrome records each link target as a named
 *      destination pointing at the page the heading landed on.
 *   3. headingPages() reads those destinations from the PDF.
 *   4. fillContents() writes the numbers in, and the page is printed again.
 *      The number boxes don't change size, so nothing moves.
 */

// The in-page parts are plain script strings: they run inside the rendering
// browser, not the Worker, and must survive bundling untouched.

/** Adds the contents page after the colophon. Evaluates to the number of entries. */
export const BUILD_CONTENTS = `(() => {
  const colophon = document.querySelector(".booklet-colophon");
  if (!colophon) return 0;

  // Wikipedia's rule: a contents box once an article has 4 or more headings,
  // unless the article says __NOTOC__ (never) or __FORCETOC__ (always).
  const inArticle = (h) => !h.closest("table, figure, .booklet-cover, .booklet-colophon");
  const notoc = document.querySelector('meta[property="mw:PageProp/notoc"]');
  const forcetoc = document.querySelector('meta[property="mw:PageProp/forcetoc"]');
  const headingCount = [...document.querySelectorAll("h2, h3, h4, h5, h6")].filter(inArticle).length;
  if (notoc || (headingCount < 4 && !forcetoc)) return 0;

  const visible = (h) => inArticle(h) && h.getClientRects().length > 0;
  const sections = [...document.querySelectorAll("h2")].filter(visible);
  if (sections.length === 0) return 0;

  // Include subsections unless that makes the list too long.
  const all = [...document.querySelectorAll("h2, h3")].filter(visible);
  const headings = all.length <= 45 ? all : sections;

  const nav = document.createElement("nav");
  nav.className = "booklet-contents";
  const title = document.createElement("p");
  title.className = "booklet-contents-title";
  title.textContent = "Contents";
  const list = document.createElement("ol");

  // Numbered like Wikipedia's own contents: 1, 1.1, 1.2, 2, ...
  let section = 0;
  let subsection = 0;

  headings.forEach((heading, i) => {
    const id = "toc-" + i;
    heading.id = id;
    const isSub = heading.tagName === "H3" && section > 0;
    if (isSub) subsection++;
    else { section++; subsection = 0; }

    const item = document.createElement("li");
    if (isSub) item.className = "sub";
    const link = document.createElement("a");
    link.href = "#" + id;
    const text = document.createElement("span");
    text.className = "t";
    const label = document.createElement("span");
    label.className = "num";
    label.textContent = isSub ? section + "." + subsection : String(section);
    text.append(label, (heading.textContent || "").replace(/\\s+/g, " ").trim());
    const number = document.createElement("span");
    number.className = "n";
    number.dataset.target = id;
    const dots = document.createElement("span");
    dots.className = "dots";
    link.append(text, dots, number);
    item.append(link);
    list.append(item);
  });

  nav.append(title, list);
  colophon.after(nav);
  return headings.length;
})()`;

/** Writes page numbers into the contents page. Evaluates to true if any changed. */
export function fillContents(pages: Record<string, number>): string {
  return `((pages) => {
  let changed = false;
  for (const el of document.querySelectorAll(".booklet-contents .n")) {
    const value = String(pages[el.dataset.target] ?? "");
    if (el.textContent !== value) {
      el.textContent = value;
      changed = true;
    }
  }
  return changed;
})(${JSON.stringify(pages)})`;
}

export const REMOVE_CONTENTS = `document.querySelector(".booklet-contents")?.remove()`;

/** Maps each toc-N destination in a Chrome-printed PDF to its 1-based page number. */
export async function headingPages(pdf: Uint8Array): Promise<Record<string, number>> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const pageNumbers = new Map<string, number>();
  doc.getPages().forEach((page, i) => pageNumbers.set(page.ref.toString(), i + 1));

  const dests = doc.catalog.lookupMaybe(PDFName.of("Dests"), PDFDict);
  const result: Record<string, number> = {};
  if (!dests) return result;

  for (const [name, value] of dests.entries()) {
    const key = name.decodeText();
    if (!/^toc-\d+$/.test(key)) continue;
    const dest = value instanceof PDFRef ? doc.context.lookup(value) : value;
    if (!(dest instanceof PDFArray)) continue;
    const pageRef = dest.get(0);
    const page = pageRef instanceof PDFRef ? pageNumbers.get(pageRef.toString()) : undefined;
    if (page) result[key] = page;
  }
  return result;
}
