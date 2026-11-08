import { bookletPageSize, type PaperId } from "../shared/paper";
import { FONT_FACES } from "./fonts";
import { TABLE_CSS } from "./tables";

/** Fonts are requested from this made-up host and answered by the Worker. */
export const FONT_ORIGIN = "https://fonts.booklet.invalid";

const SERIF = `"Literata", "Noto Serif", "DejaVu Serif", "Liberation Serif", Georgia, serif`;

// Margins in mm. The inner margin (along the fold) is a little wider than the
// outer one so text doesn't disappear into the spine.
const MARGIN = { top: 14, bottom: 16, inner: 15, outer: 12 };

/** The text area of a booklet page, in millimetres. */
export function contentBox(paper: PaperId): { width: number; height: number } {
  const page = bookletPageSize(paper);
  return {
    width: page.width - MARGIN.inner - MARGIN.outer,
    height: page.height - MARGIN.top - MARGIN.bottom,
  };
}

export interface PrintCssOptions {
  paper: PaperId;
  /** Article title, for the running head. */
  title: string;
}

export function printCss({ paper, title }: PrintCssOptions): string {
  const page = bookletPageSize(paper);
  const fontFaces = FONT_FACES.map(
    (f) => `@font-face {
  font-family: "Literata";
  font-style: ${f.style};
  font-weight: ${f.weight};
  src: url("${FONT_ORIGIN}/fonts/${f.file}") format("woff2");
  unicode-range: ${f.unicodeRange};
}`,
  ).join("\n");
  const coverHeight = page.height - MARGIN.top - MARGIN.bottom - 1;

  return `
${fontFaces}

@page {
  size: ${page.width}mm ${page.height}mm;
  margin: ${MARGIN.top}mm ${MARGIN.outer}mm ${MARGIN.bottom}mm ${MARGIN.inner}mm;
  @top-center {
    content: ${cssString(runningHead(title))};
    font: italic 7.5pt ${SERIF};
    color: #444;
    vertical-align: bottom;
    padding-bottom: 3mm;
  }
  @bottom-center {
    content: counter(page);
    font: 8pt ${SERIF};
  }
}
@page :left { margin-left: ${MARGIN.outer}mm; margin-right: ${MARGIN.inner}mm; }
@page :right { margin-left: ${MARGIN.inner}mm; margin-right: ${MARGIN.outer}mm; }
@page cover { @top-center { content: none; } @bottom-center { content: none; } }
@page contents { @top-center { content: none; } }

html {
  font: 9.5pt/1.42 ${SERIF};
  font-kerning: normal;
  font-variant-ligatures: common-ligatures;
  color: #000;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body { margin: 0; }
p, li, dd { text-align: justify; hyphens: auto; orphans: 3; widows: 3; }
a { color: inherit; text-decoration: none; }

/* Cover and colophon */
.booklet-cover {
  page: cover;
  height: ${coverHeight}mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
  break-after: page;
}
.booklet-cover h1 {
  font-size: 22pt;
  font-weight: normal;
  line-height: 1.2;
  margin: 0 0 4mm;
  border: 0;
  hyphens: manual;
}
.booklet-cover p { text-align: center; margin: 0; font-style: italic; }
.booklet-colophon {
  page: cover;
  height: ${coverHeight}mm;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  font-size: 7.5pt;
  line-height: 1.4;
  break-after: page;
}
.booklet-colophon p { text-align: left; hyphens: none; margin: 0 0 2mm; overflow-wrap: anywhere; }
.booklet-qr-block { display: flex; align-items: flex-end; gap: 4mm; margin-bottom: 8mm; }
.booklet-qr { flex: none; }
.booklet-qr-block p { margin: 0 0 1mm; font-size: 8pt; }

/* Contents */
.booklet-contents { page: contents; break-after: page; }
.booklet-contents-title { font-size: 13pt; margin: 0 0 4mm; text-align: left; }
.booklet-contents ol { list-style: none; padding: 0; margin: 0; }
.booklet-contents li { margin: 0 0 1.2mm; break-inside: avoid; }
.booklet-contents li.sub { padding-left: 5mm; font-size: 8.5pt; }
.booklet-contents a { display: flex; align-items: baseline; }
.booklet-contents .t { flex: 0 1 auto; text-align: left; }
.booklet-contents .dots {
  flex: 1 0 6mm;
  overflow: hidden;
  white-space: nowrap;
  margin: 0 1mm 0 1.5mm;
  color: #555;
}
.booklet-contents .dots::before { content: "${". ".repeat(300)}"; }
.booklet-contents .num { margin-right: 1.5mm; }
.booklet-contents .n { flex: none; width: 6mm; text-align: right; font-variant-numeric: tabular-nums; }

/* Headings */
h1, h2, h3, h4, h5, h6 { font-weight: normal; break-after: avoid; line-height: 1.25; }
/* Headings may sit beside a picture from the section before, narrowing to fit
   (flow-root keeps the underline from running under the picture), rather
   than leaving a gap beside it. */
h2 { display: flow-root; font-size: 13pt; margin: 6mm 0 2mm; border-bottom: 0.4pt solid #000; padding-bottom: 0.5mm; }
h3 { font-size: 11pt; margin: 4mm 0 1.5mm; font-style: italic; }
h4, h5, h6 { font-size: 9.5pt; margin: 3mm 0 1mm; font-weight: bold; }
p { margin: 0 0 2mm; }

/* Media
   Images keep their on-screen size (from the width/height attributes) but use
   the high-resolution file; see printable.ts.
   To save space, figures sit beside the text, floated right at under half the
   column width with text wrapping round them. Wide images (panoramas, maps,
   diagrams), which printable.ts marks with data-wide, keep the full width so
   their detail stays readable. */
img { max-width: 100%; height: auto; }
figure, .thumb { margin: 0 0 2.5mm; break-inside: avoid; }
figure:not(:has(img[data-wide])) {
  float: right;
  clear: right;
  width: fit-content;
  max-width: 46%;
  margin: 0.8mm 0 2mm 4mm;
}
figure:has(img[data-wide]) { margin: 3mm 0; text-align: center; }

/* Image boxes made by templates ({{multiple image}}, older thumbnails):
   <div class="thumb"> with fixed on-screen widths. Wikipedia's own stylesheet
   floats them, and it isn't loaded here, so float them like figures and let
   the images inside scale to fit. Boxes of images side by side stay full
   width (printable.ts marks them). */
div.thumb {
  float: right;
  clear: right;
  width: fit-content;
  max-width: 46%;
  margin: 0.8mm 0 2mm 4mm;
}
div.thumb:has(> .thumbinner[data-wide]) { float: none; width: auto; max-width: none; margin: 3mm 0; }
div.thumb .thumbinner { width: auto !important; max-width: 100% !important; }
.tmulti .multiimageinner { display: flex; flex-direction: column; gap: 1.5mm; }
.tmulti .trow { display: flex; gap: 1.5mm; }
.tmulti .tsingle {
  float: none;
  flex: 1 1 0;
  min-width: 0;
  width: auto !important;
  max-width: none !important;
  margin: 0;
}
.tmulti .tsingle img, div.thumb .thumbimage img { width: 100%; height: auto; }
.tmulti .theader { font-weight: bold; text-align: center; font-size: 7.5pt; }
figure img, .thumb img {
  display: block;
  margin: 0 auto;
  height: auto;
  max-width: 100%;
  max-height: ${Math.round(page.height * 0.4)}mm;
  object-fit: contain;
}
/* The page image, full width at the top like the Wikipedia app's header.
   Tall images are cropped, keeping the upper part, where faces usually are. */
.booklet-lead { margin: 0 0 4mm; break-inside: avoid; }
.booklet-lead img {
  display: block;
  width: 100%;
  height: auto;
  max-height: ${Math.round(page.height * 0.4)}mm;
  object-fit: cover;
  object-position: 50% 30%;
}
.booklet-lead-caption { font-size: 7pt; line-height: 1.3; text-align: left; margin: 1mm 0 0; }
/* The infobox row the image came from, now empty. */
.infobox tr:has(> .infobox-image):not(:has(img)) { display: none; }
figcaption, .thumbcaption { font-size: 7pt; line-height: 1.3; text-align: left; hyphens: auto; margin-top: 1mm; }
.infobox img { max-height: ${Math.round(page.height * 0.22)}mm; object-fit: contain; }
ul.gallery { list-style: none; padding: 0; margin: 3mm 0; display: flex; flex-wrap: wrap; gap: 2mm; justify-content: center; clear: both; }
ul.gallery li { break-inside: avoid; max-width: 31%; font-size: 7pt; line-height: 1.3; }
.mwe-math-mathml-a11y { display: none; }

/* Tables and infoboxes */
table { border-collapse: collapse; max-width: 100%; font-size: 7.5pt; line-height: 1.3; margin: 3mm 0; }
th, td { padding: 0.6mm 1.2mm; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
.wikitable th, .wikitable td { border: 0.4pt solid #888; }
.wikitable th { background: #eee; }
table.infobox, table.vcard, table.sidebar {
  float: none !important;
  width: 100% !important;
  margin: 0 0 4mm !important;
  border: 0.4pt solid #888;
}
/* Infoboxes may continue onto the next page (a tall one would otherwise
   leave the page before it nearly empty), but rows stay whole. */
.infobox tr { break-inside: avoid; }
/* Map switchers in infoboxes show one map at a time, with buttons that need
   Wikipedia's scripts. Print the maps side by side instead. maps.ts gives
   each a share of the width in proportion to its shape, so they come out
   the same height with captions in line. The location markers are placed
   in percentages, so they stay put as the maps shrink. */
.switcher-container { display: flex; gap: 3mm; justify-content: center; align-items: flex-start; }
.switcher-container > div { flex: 1 1 0; min-width: 0; }
.switcher-container .locmap,
.switcher-container .locmap div[style*="width"] { width: 100% !important; max-width: 100%; }
.switcher-container .locmap img { width: 100%; height: auto; }
.switcher-container .locmap > div > div:last-of-type:not([style*="position"]) { text-align: center; }
.switcher-label { display: none !important; }
.infobox th, .infobox td { border-top: 0.3pt solid #ccc; }
.infobox-above, .infobox-title { font-size: 10pt; text-align: center !important; }
caption { font-weight: bold; padding-bottom: 1mm; }

/* References */
sup.reference, .mw-ref { font-size: 0.7em; line-height: 0; }
.mw-references-wrap, .reflist { font-size: 6.5pt; line-height: 1.3; }
ol.references {
  columns: 2 !important;
  column-gap: 5mm;
  padding-left: 4mm;
  margin: 0;
}
.mw-references-wrap ol.references, .reflist ol.references { font-size: inherit; }
.references li { text-align: left; hyphens: none; overflow-wrap: anywhere; margin-bottom: 0.6mm; break-inside: avoid; }
.reflist .mw-references-wrap { columns: auto !important; }
/* Web addresses in references and citations, printed after the link text
   since nothing on paper is clickable. */
.references a[data-url]::after, cite a[data-url]::after {
  content: " (" attr(data-url) ")";
  overflow-wrap: anywhere;
  hyphens: none;
}

/* Black and white, to save colour ink. Chrome keeps filtered images at print
   resolution. Text, background and border colours are turned grey by a script
   in the page; see grayscale.ts. */
body.grayscale img, body.grayscale svg, body.grayscale video { filter: grayscale(1); }

/* References and notes start on a new page. Where several reference
   sections follow each other (Notes, then References), or are nested in one
   section, only the first starts a new page. */
section:has(.mw-references-wrap, .reflist):not(
  section:has(.mw-references-wrap, .reflist) section,
  section:has(.mw-references-wrap, .reflist) + section
) { break-before: page; }

/* With references left out, hide sections that only held them. */
body.no-references section:not(:has(> :not(h2, h3, .mw-heading, style, link, meta))) { display: none; }

/* Lists */
ul, ol { padding-left: 5mm; margin: 0 0 2mm; }
dl { margin: 0 0 2mm; }
blockquote { margin: 2mm 5mm; font-size: 9pt; }
pre, code { font-family: "Noto Sans Mono", "DejaVu Sans Mono", monospace; font-size: 0.85em; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }

/* Wide and long tables; see tables.ts */
${TABLE_CSS}

/* Sections that don't belong on paper */
section:has(> h2#External_links, > .mw-heading > h2#External_links),
section:has(> h2#See_also, > .mw-heading > h2#See_also) { display: none; }
`;
}

function runningHead(title: string): string {
  return title.length > 60 ? `${title.slice(0, 57).trimEnd()}…` : title;
}

/** A CSS string literal, with anything unusual escaped. */
function cssString(text: string): string {
  return `"${text.replace(/[^\p{L}\p{N} .,:;!?'()&/-]/gu, (c) => `\\${c.codePointAt(0)!.toString(16)} `)}"`;
}
