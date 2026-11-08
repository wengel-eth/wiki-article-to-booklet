import { LITERATA_COVERAGE } from "./fonts";

/*
 * Fonts for scripts Literata doesn't cover.
 *
 * Literata covers Latin, Greek, Cyrillic and Vietnamese. Articles can contain
 * any script (Manchu in Forbidden City's infobox, Tibetan, Ethiopic, ...), so
 * Noto fonts for the rest come from Google Fonts. Google serves each font in
 * slices by character range, and Chrome downloads only the slices for
 * characters on the page.
 *
 * But Google also includes Latin, Greek, Cyrillic, punctuation and symbol
 * slices in every script font. For the few characters Literata lacks, Chrome
 * would try font after font down the list, downloading each one's Latin
 * slice. So the rendering browser's request for Google's CSS is answered by
 * the Worker with those slices removed from every script font
 * (ownSlicesOnly): each then downloads only for its own script. Noto Serif
 * keeps everything, as the general fallback, and so do the math and symbol
 * fonts, whose purpose is those ranges.
 */

// Noto Sans comes last: it has phonetic symbols (such as tone letters) that
// the serifs lack.
const GENERAL = ["Noto Serif", "Noto Sans Math", "Noto Sans Symbols", "Noto Sans Symbols 2", "Noto Sans"];

const SCRIPTS = [
  "Noto Sans Mongolian",
  "Noto Naskh Arabic",
  "Noto Serif Hebrew",
  "Noto Serif Devanagari",
  "Noto Serif Bengali",
  "Noto Serif Gujarati",
  "Noto Serif Gurmukhi",
  "Noto Serif Oriya",
  "Noto Serif Tamil",
  "Noto Serif Telugu",
  "Noto Serif Kannada",
  "Noto Serif Malayalam",
  "Noto Serif Sinhala",
  "Noto Serif Thai",
  "Noto Serif Lao",
  "Noto Serif Khmer",
  "Noto Serif Myanmar",
  "Noto Serif Tibetan",
  "Noto Serif Georgian",
  "Noto Serif Armenian",
  "Noto Serif Ethiopic",
  "Noto Sans Syriac",
  "Noto Sans Thaana",
  "Noto Sans Javanese",
  "Noto Sans Balinese",
  "Noto Sans Yi",
  "Noto Sans Canadian Aboriginal",
  "Noto Sans Cherokee",
  "Noto Sans Tifinagh",
  "Noto Sans NKo",
  "Noto Sans Vai",
  "Noto Sans Runic",
  "Noto Sans Ogham",
  "Noto Sans Gothic",
  "Noto Sans Old Italic",
  "Noto Sans Glagolitic",
  "Noto Sans Coptic",
  "Noto Sans Phoenician",
  "Noto Sans Cuneiform",
  "Noto Sans Egyptian Hieroglyphs",
];

/** Han characters are drawn differently in each language; text marked with one gets its font first. */
export const CJK = { sc: "Noto Serif SC", tc: "Noto Serif TC", jp: "Noto Serif JP", kr: "Noto Serif KR" };

export const SCRIPT_FONTS_URL = `https://fonts.googleapis.com/css2?${[...GENERAL, ...SCRIPTS, ...Object.values(CJK)]
  .map((family) => `family=${family.replace(/ /g, "+")}`)
  .join("&")}&display=block`;

const quoted = (families: string[]) => families.map((f) => `"${f}"`).join(", ");

/** The font-family list for body text, with the given CJK order. */
export function fontStack(cjk: string[] = [CJK.sc, CJK.tc, CJK.jp, CJK.kr]): string {
  return `"Literata", "Noto Serif Extra", "Noto Serif", ${quoted(cjk)}, ${quoted(SCRIPTS)}, ${quoted(GENERAL.slice(1))}, "DejaVu Serif", serif`;
}

/**
 * Character ranges shared across fonts: Latin, Greek, Cyrillic, phonetic
 * extensions, general punctuation, symbols, arrows, math operators, shapes.
 * Literata, Noto Serif and the symbol fonts cover these.
 */
const SHARED: [number, number][] = [
  [0x0000, 0x052f],
  [0x1d00, 0x1fff],
  [0x2000, 0x2bff],
  [0x2c60, 0x2c7f],
  [0xa720, 0xa7ff],
  [0xfb00, 0xfb06],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

/** A range minus the shared ranges: what's left of it, as zero or more ranges. */
function ownPart([from, to]: [number, number]): [number, number][] {
  let parts: [number, number][] = [[from, to]];
  for (const [a, b] of SHARED) {
    parts = parts.flatMap(([x, y]): [number, number][] => {
      if (b < x || a > y) return [[x, y]];
      const left: [number, number][] = x < a ? [[x, a - 1]] : [];
      const right: [number, number][] = y > b ? [[b + 1, y]] : [];
      return [...left, ...right];
    });
  }
  return parts;
}

const hex = (n: number) => n.toString(16).toUpperCase();
const formatRange = ([from, to]: [number, number]) => (from === to ? `U+${hex(from)}` : `U+${hex(from)}-${hex(to)}`);

/** U+XXXX, U+XXXX-YYYY or U+4?? as [from, to]. */
function parseRange(range: string): [number, number] | null {
  const m = range.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
  if (!m) return null;
  const from = parseInt(m[1].replace(/\?/g, "0"), 16);
  const to = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, "f"), 16);
  return [from, to];
}

/**
 * Narrows every script font in Google's CSS to its own characters: the
 * shared ranges are taken out of each slice's unicode-range, and slices left
 * with nothing are removed. Chrome then only turns to a script font for that
 * script. Noto Serif, the math and symbol fonts keep everything.
 */
export function ownSlicesOnly(css: string): string {
  return css.replace(/(?:\/\*[^*]*\*\/\s*)?@font-face\s*\{[^}]*\}\s*/g, (block) => {
    const family = block.match(/font-family:\s*['"]?([^;'"]+)['"]?;/)?.[1];
    if (!family || GENERAL.includes(family)) return block;
    const declared = block.match(/unicode-range:\s*([^;]+);/);
    const ranges = declared?.[1].split(",").map(parseRange);
    if (!declared || !ranges || ranges.some((r) => r === null)) return block;
    const own = (ranges as [number, number][]).flatMap(ownPart);
    if (own.length === 0) return "";
    return block.replace(declared[0], `unicode-range: ${own.map(formatRange).join(", ")};`);
  });
}

const cache = new Map<string, string>();

/**
 * Fetches Google's CSS for the rendering browser, with its own headers (so
 * Google picks the format that browser supports), and trims it. Cached in
 * memory for later booklets.
 */
export async function scriptFontsCss(url: string, headers: Record<string, string>): Promise<string | null> {
  const cached = cache.get(url);
  if (cached) return cached;
  const res = await fetch(url, {
    headers: { "user-agent": headers["user-agent"] ?? "", accept: headers["accept"] ?? "text/css" },
  });
  if (!res.ok) return null;
  const text = await res.text();
  // A text= request is Noto Serif Extra; anything else, the script fonts.
  const css = new URL(url).searchParams.has("text")
    ? text.replace(/font-family:\s*['"]Noto Serif['"]/g, `font-family: '${EXTRA_FAMILY}'`)
    : ownSlicesOnly(text);
  cache.set(url, css);
  return css;
}

/**
 * Runs in the rendering browser. Wikipedia's language templates set their own
 * font lists for some scripts (Urdu-style Arabic, Mongolian, ...), naming
 * fonts that often aren't installed, so the text would fall back to whatever
 * the system has, or nothing. Every element whose font list the article set
 * gets the booklet's list appended, so its own choices still come first and
 * anything else falls through to the right Noto font. Evaluates to the number
 * of elements changed.
 */
export const APPEND_FONT_FALLBACKS = `(() => {
  const stack = ${JSON.stringify(fontStack())};
  let changed = 0;
  for (const el of document.body.querySelectorAll("*")) {
    const own = getComputedStyle(el).fontFamily;
    if (!own || own.includes("Literata") || !el.parentElement) continue;
    if (own === getComputedStyle(el.parentElement).fontFamily) continue;
    el.style.setProperty("font-family", own + ", " + stack, "important");
    changed++;
  }
  // Lay the page out now, so any fonts this needs start loading before the
  // renderer waits on document.fonts.ready.
  void document.body.offsetHeight;
  return changed;
})()`;

/*
 * Characters Literata lacks in the Latin, Greek and Cyrillic areas (IPA
 * letters in pronunciations, for one) are filled in from Noto Serif. Chrome
 * needs a letter and the accent marks on it from the same font file, but
 * Google's slices put IPA letters and accent marks in different files, so
 * "ɹ̩" or "ə̌" would fall back to a system font, or to nothing. So the
 * article's own such characters are requested as one small Noto Serif file
 * (Google Fonts' text= option), named "Noto Serif Extra" and placed right
 * after Literata.
 */

/** Where Noto Serif can fill in for Literata. */
const LATINISH: [number, number][] = [
  [0x0000, 0x052f],
  [0x1ab0, 0x1aff],
  [0x1d00, 0x1fff],
  [0x2000, 0x2bff],
  [0x2c60, 0x2c7f],
  [0xa720, 0xa7ff],
  [0xfb00, 0xfb06],
];

const COMBINING: [number, number][] = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
];

const within = (code: number, ranges: [number, number][]) => ranges.some(([a, b]) => code >= a && code <= b);

/** The longest list of characters asked for; beyond this the slices take over. */
const MAX_EXTRA = 400;

/**
 * The article's characters that need Noto Serif Extra: those in the Latin,
 * Greek and Cyrillic areas Literata lacks, and any letter that carries an
 * accent mark, with the mark.
 */
export function extraCharacters(text: string): string {
  const needed = new Set<string>();
  const chars = [...text];
  chars.forEach((char, i) => {
    const code = char.codePointAt(0)!;
    if (code < 0x80) return;
    if (within(code, COMBINING)) {
      needed.add(char);
      const base = chars[i - 1];
      if (base && base.trim()) needed.add(base);
    } else if (within(code, LATINISH) && !within(code, LITERATA_COVERAGE)) {
      needed.add(char);
    }
  });
  return [...needed].sort().join("").slice(0, MAX_EXTRA);
}

export const EXTRA_FAMILY = "Noto Serif Extra";

export function extraFontUrl(chars: string): string {
  return `https://fonts.googleapis.com/css2?family=Noto+Serif:ital@0;1&text=${encodeURIComponent(chars)}&display=block`;
}
