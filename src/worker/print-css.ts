import { bookletPageSize, type PaperId } from "../shared/paper";

// Margins in mm. The inner margin (along the fold) is a little wider than the
// outer one so text doesn't disappear into the spine.
const MARGIN = { top: 14, bottom: 16, inner: 15, outer: 12 };

export function printCss(paper: PaperId): string {
  const page = bookletPageSize(paper);
  const coverHeight = page.height - MARGIN.top - MARGIN.bottom - 1;

  return `
@page {
  size: ${page.width}mm ${page.height}mm;
  margin: ${MARGIN.top}mm ${MARGIN.outer}mm ${MARGIN.bottom}mm ${MARGIN.inner}mm;
  @bottom-center {
    content: counter(page);
    font: 8pt "Noto Serif", "DejaVu Serif", "Liberation Serif", Georgia, serif;
  }
}
@page :left { margin-left: ${MARGIN.outer}mm; margin-right: ${MARGIN.inner}mm; }
@page :right { margin-left: ${MARGIN.inner}mm; margin-right: ${MARGIN.outer}mm; }
@page cover { @bottom-center { content: none; } }

html {
  font: 9.5pt/1.42 "Noto Serif", "DejaVu Serif", "Liberation Serif", Georgia, serif;
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
.booklet-contents { break-after: page; }
.booklet-contents-title { font-size: 13pt; margin: 0 0 4mm; text-align: left; }
.booklet-contents ol { list-style: none; padding: 0; margin: 0; }
.booklet-contents li { margin: 0 0 1.2mm; break-inside: avoid; }
.booklet-contents li.sub { padding-left: 5mm; font-size: 8.5pt; }
.booklet-contents a { display: flex; align-items: baseline; gap: 3mm; }
.booklet-contents .t { flex: 1; }
.booklet-contents .num { margin-right: 1.5mm; }
.booklet-contents .n { flex: none; width: 8mm; text-align: right; font-variant-numeric: tabular-nums; }

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
figure img, .thumb img {
  width: auto !important;
  height: auto !important;
  max-width: 100%;
  max-height: ${Math.round(page.height * 0.45)}mm;
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
.mw-references-wrap, .references, .reflist { font-size: 7pt; line-height: 1.35; columns: auto !important; }
ol.references { padding-left: 5mm; }
.references li { text-align: left; hyphens: none; overflow-wrap: anywhere; }

/* Lists */
ul, ol { padding-left: 5mm; margin: 0 0 2mm; }
dl { margin: 0 0 2mm; }
blockquote { margin: 2mm 5mm; font-size: 9pt; }
pre, code { font-family: "Noto Sans Mono", "DejaVu Sans Mono", monospace; font-size: 8pt; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }

/* Sections that don't belong on paper */
section:has(> h2#External_links, > .mw-heading > h2#External_links),
section:has(> h2#See_also, > .mw-heading > h2#See_also) { display: none; }
`;
}
