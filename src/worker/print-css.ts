import { bookletPageSize, type PaperId } from "../shared/paper";
import { FONT_FACES } from "./fonts";
import { CJK, fontStack, SCRIPT_FONTS_URL } from "./script-fonts";
import { TABLE_CSS } from "./tables";

/** Fonts are requested from this made-up host and answered by the Worker. */
export const FONT_ORIGIN = "https://fonts.booklet.invalid";

const SERIF = fontStack();
const SERIF_BY_LANG: [string, string][] = [
  [":lang(ja)", fontStack([CJK.jp, CJK.sc, CJK.tc, CJK.kr])],
  [":lang(ko)", fontStack([CJK.kr, CJK.sc, CJK.tc, CJK.jp])],
  [":lang(zh-Hant), :lang(zh-TW), :lang(zh-HK), :lang(zh-MO), :lang(yue)", fontStack([CJK.tc, CJK.sc, CJK.jp, CJK.kr])],
];

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
@import url("${SCRIPT_FONTS_URL}");
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
/* Anything wider than the column is cut off at the page's edge. Otherwise
   Chrome shrinks every page to fit it, and the whole booklet prints small.
   (Not on body itself: that would apply to the window, which doesn't clip.) */
body > * { overflow-x: clip; }
/* Justified. Paragraphs are re-broken with Knuth-Plass for even spacing in
   the rendering page (justify.ts); these settings apply where they aren't. */
p, li, dd {
  text-align: justify;
  hyphens: auto;
  text-wrap: pretty;
  orphans: 3;
  widows: 3;
}
a { color: inherit; text-decoration: none; }

/* Chinese, Japanese and Korean text marked with its language */
${SERIF_BY_LANG.map(([selector, fonts]) => `${selector} { font-family: ${fonts}; }`).join("\n")}

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
.booklet-qr-block { margin-bottom: 8mm; }
.booklet-qr { display: block; margin: 0 0 2.5mm -0.8mm; }
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
/* Tighter steps for long contents lists; see fitContents() in contents.ts. */
.booklet-contents.compact-1 li { margin-bottom: 0.4mm; font-size: 8.5pt; }
.booklet-contents.compact-1 li.sub { font-size: 7.5pt; }
.booklet-contents.compact-2 { line-height: 1.25; }
.booklet-contents.compact-2 li { margin-bottom: 0; font-size: 7.5pt; }
.booklet-contents.compact-2 li.sub { font-size: 7pt; }
.booklet-contents.compact-2 .booklet-contents-title { margin-bottom: 2mm; }
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
figure img[data-wide] { width: 100%; }

/* Videos and sound files can't play on paper. */
figure:has(video, audio), div.thumb:has(video, audio), video, audio { display: none !important; }

/* Static maps (Kartographer mapframes) are inline links; as a block, their
   caption goes underneath instead of beside them. */
a.mw-kartographer-map {
  display: block;
  width: fit-content;
  max-width: 100%;
  min-width: 0 !important;
  min-height: 0 !important;
  margin: 0 auto 1mm;
}
a.mw-kartographer-map img { display: block; }
/* In an infobox, a map's cell is padded and its caption centred like the
   infobox's other pictures. */
.infobox td:has(> a.mw-kartographer-map) { padding: 2mm 2mm 1.5mm !important; text-align: center; }

/* Image boxes made by templates ({{multiple image}}, older thumbnails):
   <div class="thumb"> with fixed on-screen widths. Wikipedia's own stylesheet
   floats them, and it isn't loaded here, so float them like figures and let
   the images inside scale to fit. Boxes of images side by side stay full
   width (printable.ts marks them). */
div.thumb:not(.gallerybox .thumb) {
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
/* An infobox's main pictures fill its width, centred; tall ones are capped
   at 30% of the page height and narrowed to keep their shape (--ar is the
   aspect ratio, set in printable.ts). */
.infobox img[data-fill] {
  display: block;
  margin: 0 auto;
  width: min(100%, calc(var(--ar) * ${Math.round(page.height * 0.3)}mm));
  height: auto;
  max-height: none;
}
/* Galleries: rows of pictures at the same height, filling the width.
   arrange.ts sizes each picture by its shape. */
ul.gallery { list-style: none; padding: 0; margin: 3mm 0; display: flex; flex-wrap: wrap; gap: 2mm; clear: both; }
ul.gallery li.gallerybox {
  break-inside: avoid;
  width: auto !important;
  margin: 0;
  font-size: 7pt;
  line-height: 1.3;
}
ul.gallery .gallerybox .thumb { width: auto !important; height: auto !important; margin: 0; padding: 0; border: 0; }
ul.gallery .gallerybox img { display: block; width: 100%; height: auto; }
ul.gallery .gallerytext { margin-top: 0.8mm; text-align: left; hyphens: auto; }
li.gallerycaption { flex-basis: 100%; font-weight: bold; }
.mwe-math-mathml-a11y { display: none; }

/* Tables and infoboxes */
/* Article tables start below any floated picture: beside one, they were
   squeezed to half the column, with words wrapping a few letters a line. */
table:not(.infobox, .vcard, .sidebar, .clade) { clear: both; }
table { border-collapse: collapse; max-width: 100%; font-size: 7.5pt; line-height: 1.3; margin: 3mm 0; }
/* Pictures in article tables at thumbnail size, so a photo column doesn't force
   the table wider than the page. Infoboxes keep theirs. */
:is(td, th) img { max-width: 25mm; height: auto; }
:is(.infobox, .vcard, .sidebar) :is(td, th) img { max-width: 100%; }
/* break-word, not anywhere: a word is still split if it can't fit on a line
   at all, but columns are sized to their longest word, so a column of short
   names isn't squeezed to a few letters wide. */
th, td { padding: 0.6mm 1.2mm; vertical-align: top; text-align: left; overflow-wrap: break-word; }
:is(.infobox, .vcard, .sidebar) :is(th, td) { overflow-wrap: anywhere; }
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
/* Cladograms (family trees built from nested tables) overlap where a page
   break cuts through them; they nearly always fit on a page, so keep each one
   whole. */
table.clade { break-inside: avoid; }
/* A header row stays with the row after it, rather than being left alone at
   the bottom of a page. */
tr:has(> th[colspan]:only-child), tr:has(> .infobox-header), tr:has(> .infobox-above),
thead tr:last-child, caption { break-after: avoid; }
/* Map switchers in infoboxes show one map at a time, with buttons that need
   Wikipedia's scripts. Print the maps side by side instead. arrange.ts gives
   each a share of the width in proportion to its shape, so they come out
   the same height with captions in line. The location markers are placed
   in percentages, so they stay put as the maps shrink. */
.switcher-container { display: flex; gap: 3mm; justify-content: center; align-items: flex-start; }
.switcher-container > div { flex: 1 1 0; min-width: 0; }
/* The map's own boxes, not the place labels on it (.od), which have a width
   of their own, in ems. */
.switcher-container .locmap,
.switcher-container .locmap div[style*="width"]:not(.od, .od *) { width: 100% !important; max-width: 100%; }
.switcher-container .locmap img { width: 100%; height: auto; }
.switcher-container .locmap > div > div:last-of-type:not([style*="position"]) { text-align: center; }
.switcher-label { display: none !important; }
/* Location map markers are small icons (often a dot, sometimes a symbol
   such as a mine's hammer and pick) that print as a 3mm smudge. Replace them
   with a crisp dot: a white ring and thin outline keep it visible on any map. */
.locmap .od .id img { visibility: hidden; }
.locmap .od .id::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1.6mm;
  height: 1.6mm;
  margin: -1.3mm 0 0 -1.3mm;
  border: 0.5mm solid #fff;
  border-radius: 50%;
  background: #b00;
  box-shadow: 0 0 0 0.3pt #000;
}
body.grayscale .locmap .od .id::after { background: #000; }
.infobox th, .infobox td { border-top: 0.3pt solid #ccc; }
/* Infobox header rows: no decorative frames (templates add things like thick
   red and blue borders), and a pale tint of the template's own colour instead
   of its full-strength one, set by tint.ts. Grey where a box has no colour.
   These apply once tint.ts has read the original colours (body.tinted).
   Colours in the data cells, such as party colours, stay. */
body.tinted .infobox :is(.infobox-header, .infobox-subheader, tr > th[colspan]:only-child:not(.infobox-above, .infobox-title)) {
  background: #eee !important;
  color: #000 !important;
}
body.tinted .infobox :is(.infobox-above, .infobox-title, caption) { background: transparent !important; color: #000 !important; }
body.tinted .infobox :is(.infobox-header, .infobox-subheader, tr > th[colspan]:only-child, .infobox-above, .infobox-title, caption) * {
  border: 0 !important;
  background: transparent !important;
  color: inherit !important;
}
/* Tables nested in an infobox (such as a box of transcriptions) read as part
   of it: edge to edge in their cell, without a frame of their own, and with
   the same label column width, so values line up with the box's own rows. */
.infobox table {
  display: table !important;
  width: 100% !important;
  margin: 0 !important;
  border: 0 !important;
}
.infobox td:has(> table) { padding: 0 !important; }
.infobox th.infobox-label { width: 36%; }
/* Images and maps in an infobox get room around them; the 0.6mm of an
   ordinary row looks cramped against the border. */
.infobox td.infobox-image { padding: 2mm 2mm 1.5mm; }
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
/* Bibliographies ("Sources", "Further reading") made with {{refbegin}}, or
   any list of citations: set like the references, small, in two columns,
   left-aligned so long addresses don't stretch the word spacing. */
:is(.refbegin, ul:has(> li > cite.citation)) {
  font-size: 6.5pt;
  line-height: 1.3;
  columns: 2 !important;
  column-gap: 5mm;
}
:is(.refbegin, ul:has(> li > cite.citation)) ul { margin: 0; }
/* Only the outer box splits into columns, not the list inside it too. */
.refbegin :is(ul, ul:has(> li > cite.citation)) { columns: auto !important; font-size: inherit; }
:is(.refbegin, ul:has(> li > cite.citation)) li {
  text-align: left;
  hyphens: none;
  overflow-wrap: anywhere;
  margin-bottom: 0.6mm;
  break-inside: avoid;
}
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

/* Parsoid's empty placeholders. Hidden rather than removed: some hold the
   template styles that other parts of the page need. */
.mw-empty-elt { display: none !important; }

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
