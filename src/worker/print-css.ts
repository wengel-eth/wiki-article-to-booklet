import { bookletPageSize, type PaperId } from "../shared/paper";
import { FONT_FACES } from "./fonts";

/** Fonts are requested from this made-up host and answered by the Worker. */
export const FONT_ORIGIN = "https://fonts.booklet.invalid";

const SERIF = `"Source Serif 4", "Noto Serif", "DejaVu Serif", "Liberation Serif", Georgia, serif`;

// Margins in mm. The inner margin (along the fold) is a little wider than the
// outer one so text doesn't disappear into the spine.
const MARGIN = { top: 14, bottom: 16, inner: 15, outer: 12 };

export interface PrintCssOptions {
  paper: PaperId;
  /** Article title, for the running head. */
  title: string;
}

export function printCss({ paper, title }: PrintCssOptions): string {
  const page = bookletPageSize(paper);
  const fontFaces = FONT_FACES.map(
    (f) => `@font-face {
  font-family: "Source Serif 4";
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
h2 { font-size: 13pt; margin: 6mm 0 2mm; border-bottom: 0.4pt solid #000; padding-bottom: 0.5mm; }
h3 { font-size: 11pt; margin: 4mm 0 1.5mm; font-style: italic; }
h4, h5, h6 { font-size: 9.5pt; margin: 3mm 0 1mm; font-weight: bold; }
p { margin: 0 0 2mm; }

/* Media */
img { max-width: 100%; height: auto; }
figure, .thumb {
  margin: 3mm 0;
  break-inside: avoid;
  text-align: center;
}
/* Images keep their on-screen size (from the width/height attributes) but use
   the high-resolution file; see printable.ts. */
figure img, .thumb img {
  height: auto;
  max-width: 100%;
  max-height: ${Math.round(page.height * 0.45)}mm;
  object-fit: contain;
}
figcaption, .thumbcaption { font-size: 7.5pt; line-height: 1.35; text-align: left; margin-top: 1mm; }
ul.gallery { list-style: none; padding: 0; margin: 3mm 0; display: flex; flex-wrap: wrap; gap: 3mm; justify-content: center; }
ul.gallery li { break-inside: avoid; max-width: 45%; }
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
  break-inside: avoid;
}
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

/* Black and white images, to save colour ink. Chrome keeps filtered images at
   print resolution. */
body.grayscale img, body.grayscale svg, body.grayscale video { filter: grayscale(1); }

/* With references left out, hide sections that only held them. */
body.no-references section:not(:has(> :not(h2, h3, .mw-heading, style, link, meta))) { display: none; }

/* Lists */
ul, ol { padding-left: 5mm; margin: 0 0 2mm; }
dl { margin: 0 0 2mm; }
blockquote { margin: 2mm 5mm; font-size: 9pt; }
pre, code { font-family: "Noto Sans Mono", "DejaVu Sans Mono", monospace; font-size: 0.85em; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }

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
