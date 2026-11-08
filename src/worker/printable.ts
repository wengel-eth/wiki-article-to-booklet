import type { PaperId } from "../shared/paper";
import { printCss } from "./print-css";
import { qrSvg } from "./qr";
import { articleUrl, type ArticleRef, type PageImage } from "./wikipedia";

export interface PrintableArticle {
  title: string;
  revision: string | null;
  html: string;
}

// Things that are useful on screen but noise on paper. Wikipedia marks most of
// these with .noprint already.
const REMOVE = [
  "script",
  "noscript",
  "link",
  "base",
  "head meta",
  "head style",
  ".noprint",
  ".navbox",
  ".navbox-styles",
  ".vertical-navbox",
  ".sidebar",
  ".metadata",
  ".ambox",
  ".ombox",
  ".tmbox",
  ".mbox-small",
  ".sistersitebox",
  ".side-box",
  ".portalbox",
  ".hatnote",
  ".shortdescription",
  ".mw-editsection",
  ".Inline-Template",
  "#coordinates",
  ".penicon", // "Edit this on Wikidata" pencils in infoboxes
  ".taxobox-edit-taxonomy", // "Edit this classification" in taxoboxes
  'img[resource*="OOjs_UI_icon_edit"]', // any other edit pencil
  '[role="navigation"]',
  // In reference lists, the ↑ / "a b c" links that jump back to where a
  // source was cited. Nowhere to jump to on paper.
  ".mw-cite-backlink",
  '[rel~="mw:referencedBy"]',
].join(", ");

/**
 * Turns Parsoid HTML for an article into a standalone document ready to print
 * as booklet pages: junk removed, a cover and colophon added, print CSS applied.
 */
export interface PrintOptions {
  paper: PaperId;
  /** Keep footnote markers and reference lists. */
  references: boolean;
  /** Print in black and white: images, text, tables and borders. */
  grayscale: boolean;
  /** IANA time zone for the "generated" time, from the reader's browser. UTC if missing or unknown. */
  timeZone?: string;
  /** The article's page image, shown full width at the top like in the Wikipedia app. */
  pageImage?: PageImage | null;
}

/** Below this width the header image would print blurry, so it stays where it is. */
const MIN_LEAD_WIDTH = 600;

/** Images at least this many times wider than tall are printed full width. */
const WIDE_RATIO = 1.6;

/**
 * Width of the file used for full-width images: about 220 dpi across the
 * column. One of Wikimedia's standard thumbnail sizes.
 */
const WIDE_IMAGE_PX = 960;

/** Template image boxes at least this wide on screen (CSS px) are printed full width. */
const WIDE_BOX_PX = 300;

// Footnote markers and reference lists, for when references are left out.
const REFERENCES = ["sup.mw-ref", "sup.reference", ".mw-references-wrap", ".reflist"].join(", ");

export async function makePrintable(
  source: string,
  ref: ArticleRef,
  { paper, references, grayscale, timeZone, pageImage }: PrintOptions,
  now = new Date(),
): Promise<PrintableArticle> {
  let rawTitle = "";
  let revision: string | null = null;
  const lang = ref.lang;

  // The header image: find where the page image sits in the article, take it
  // out of there (with its caption), and put it full width at the top.
  const lead = pageImage && pageImage.width >= MIN_LEAD_WIDTH ? await locateImage(source, pageImage.file) : null;
  let imgCount = -1;
  let figureCount = -1;
  let leadPlaced = false;

  const title = () => decodeEntities(rawTitle).trim() || ref.title;

  let rewriter = new HTMLRewriter()
    .on("html", {
      element(el) {
        // about="https://en.wikipedia.org/wiki/Special:Redirect/revision/123"
        const about = el.getAttribute("about") ?? "";
        revision = about.match(/\/revision\/(\d+)$/)?.[1] ?? null;
      },
    })
    .on("head title", {
      text(chunk) {
        rawTitle += chunk.text;
      },
    })
    .on(REMOVE, {
      element(el) {
        el.remove();
      },
    })
    .on("head", {
      element(el) {
        el.prepend(`<meta charset="utf-8">`, { html: true });
        // At </head> the title has been read, and the running head needs it.
        el.onEndTag((end) => {
          end.before(`<style>${printCss({ paper, title: title() })}</style>`, { html: true });
        });
      },
    })
    // There's no <base> (it would break the contents page's #links), so make
    // image URLs absolute. Links aren't clickable on paper; drop them.
    //
    // Thumbnails are about 250px wide, roughly 100 dpi on paper. Wikipedia
    // also lists 1.5x and 2x versions in srcset, which Chrome ignores when
    // printing, so use the largest as the image itself. The width/height
    // attributes keep it at the same size on the page.
    .on("figure", {
      element(el) {
        figureCount++;
        if (lead && lead.figure === figureCount) el.remove();
      },
    })
    .on("img", {
      element(el) {
        imgCount++;
        if (lead && lead.figure === null && lead.img === imgCount) {
          el.remove();
          return;
        }
        const thumb = el.getAttribute("src");
        const srcset = el.getAttribute("srcset");
        const best = srcset ? largestCandidate(srcset) : null;
        const src = best ?? thumb;
        if (src) el.setAttribute("src", absolute(src, lang));
        // If the sharper file fails to load, the page falls back to the
        // thumbnail; see RETRY_IMAGES in arrange.ts.
        if (thumb && src !== thumb) el.setAttribute("data-fallback", absolute(thumb, lang));
        // Wide images are printed across the full column (see print-css.ts),
        // far bigger than on screen, so ask for a larger file.
        const width = Number(el.getAttribute("width"));
        const height = Number(el.getAttribute("height"));
        if (width > 0 && height > 0 && width / height >= WIDE_RATIO) {
          el.setAttribute("data-wide", "");
          const fileWidth = Number(el.getAttribute("data-file-width"));
          const bigger = thumb && fileWidth > WIDE_IMAGE_PX ? resizedThumb(thumb, WIDE_IMAGE_PX) : null;
          if (bigger) {
            el.setAttribute("src", absolute(bigger, lang));
            if (thumb) el.setAttribute("data-fallback", absolute(thumb, lang));
          }
        }
        el.removeAttribute("srcset");
        el.removeAttribute("loading");
        el.removeAttribute("decoding");
      },
    })
    // Image boxes made by templates ({{multiple image}} and older thumbnails)
    // are <div class="thumb"> with a fixed on-screen width. Mark the wide ones
    // (images side by side) to keep the full column width; see print-css.ts.
    .on("div.thumb > .thumbinner[style]", {
      element(el) {
        const width = Number(el.getAttribute("style")!.match(/(?:^|;)\s*width:\s*(\d+)px/)?.[1]);
        if (width >= WIDE_BOX_PX) el.setAttribute("data-wide", "");
      },
    })
    .on("source[src]", {
      element(el) {
        el.setAttribute("src", absolute(el.getAttribute("src")!, lang));
      },
    })
    .on("source[srcset]", {
      element(el) {
        const srcset = splitSrcset(el.getAttribute("srcset")!)
          .map((entry) => {
            const [url, ...descriptor] = entry.trim().split(/\s+/);
            return [absolute(url, lang), ...descriptor].join(" ");
          })
          .join(", ");
        el.setAttribute("srcset", srcset);
      },
    })
    .on("video[poster]", {
      element(el) {
        el.setAttribute("poster", absolute(el.getAttribute("poster")!, lang));
      },
    })
    .on("a[href]", {
      element(el) {
        // External links (mostly in references) keep their address, which is
        // printed after the link text; see print-css.ts. Bare links, whose
        // text already is the address, don't need it twice.
        const href = el.getAttribute("href")!;
        const external = /^https?:\/\//i.test(href) || href.startsWith("//");
        if (external && !(el.getAttribute("class") ?? "").split(/\s+/).includes("free")) {
          el.setAttribute("data-url", displayUrl(href));
        }
        el.removeAttribute("href");
      },
    })
    .on("[data-mw]", {
      element(el) {
        el.removeAttribute("data-mw");
      },
    })
    .on("body", {
      element(el) {
        const classes = [el.getAttribute("class") ?? ""];
        if (!references) classes.push("no-references");
        if (grayscale) classes.push("grayscale");
        el.setAttribute("class", classes.join(" ").trim());
        el.prepend(frontMatter(title(), ref, revision, generatedAt(now, timeZone)), { html: true });
      },
    })
    .on("section", {
      element(el) {
        if (!lead || !pageImage || leadPlaced) return;
        leadPlaced = true;
        const caption = lead.caption ? `<p class="booklet-lead-caption">${escapeHtml(lead.caption)}</p>` : "";
        el.prepend(
          `<div class="booklet-lead"><img src="${escapeHtml(pageImage.src)}" width="${pageImage.width}" height="${pageImage.height}" alt="">${caption}</div>`,
          { html: true },
        );
      },
    });

  if (!references) {
    rewriter = rewriter.on(REFERENCES, {
      element(el) {
        el.remove();
      },
    });
  }

  const html = await rewriter.transform(new Response(source)).text();
  return { title: title(), revision, html };
}

interface LocatedImage {
  /** Index of the image among all <img> elements, in document order. */
  img: number;
  /** Index of the <figure> it's in, or null (for example, in an infobox). */
  figure: number | null;
  caption: string;
}

/**
 * Finds the first <img> showing `file`, and its caption: the figure's
 * <figcaption>, or the infobox caption in the same cell. Counts elements the
 * same way makePrintable does (after removing the same junk), so the indexes
 * line up.
 */
async function locateImage(source: string, file: string): Promise<LocatedImage | null> {
  const wanted = normaliseFile(file);
  let img = -1;
  let figure = -1;
  const figures: number[] = [];
  let found: LocatedImage | null = null;
  let capturing = false;
  let rawCaption = "";

  await new HTMLRewriter()
    .on(REMOVE, {
      element(el) {
        el.remove();
      },
    })
    .on("figure", {
      element(el) {
        const index = ++figure;
        figures.push(index);
        el.onEndTag(() => {
          figures.pop();
          if (found?.figure === index) capturing = false;
        });
      },
    })
    .on("td, th", {
      element(el) {
        el.onEndTag(() => {
          if (found && found.figure === null) capturing = false;
        });
      },
    })
    .on("img", {
      element(el) {
        img++;
        if (found) {
          capturing = false;
          return;
        }
        if (imageFile(el.getAttribute("resource"), el.getAttribute("src")) === wanted) {
          found = { img, figure: figures.at(-1) ?? null, caption: "" };
          capturing = true;
        }
      },
    })
    .on("figcaption, .infobox-caption", {
      text(chunk) {
        if (capturing) rawCaption += chunk.text;
      },
    })
    .transform(new Response(source))
    .text();

  const result = found as LocatedImage | null;
  if (!result) return null;
  return { ...result, caption: decodeEntities(rawCaption).replace(/\s+/g, " ").trim() };
}

/** The file name an <img> shows, from Parsoid's resource="./File:X.jpg", or its thumbnail URL. */
function imageFile(resource: string | null, src: string | null): string | null {
  if (resource) return normaliseFile(resource.replace(/^\.\//, "").replace(/^[^:]+:/, ""));
  // .../commons/thumb/a/ab/X.jpg/440px-X.jpg or .../commons/a/ab/X.jpg
  const m = src?.match(/\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
  return m ? normaliseFile(m[1]) : null;
}

function normaliseFile(name: string): string {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {}
  decoded = decoded.replace(/ /g, "_");
  return decoded.charAt(0).toUpperCase() + decoded.slice(1);
}

/** An address as printed: without https:// or www., and without a trailing slash. */
export function displayUrl(href: string): string {
  return href
    .replace(/^(https?:)?\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

/**
 * The candidates in a srcset. They're separated by a comma and a space; a
 * bare comma can be part of a URL (Wikipedia's map images have them).
 */
export function splitSrcset(srcset: string): string[] {
  return srcset.split(/,\s+/).map((c) => c.trim()).filter(Boolean);
}

/**
 * The same Wikimedia thumbnail at another width:
 * .../thumb/a/ab/X.jpg/250px-X.jpg?q  ->  .../thumb/a/ab/X.jpg/960px-X.jpg?q
 * Null for anything else, or if it wouldn't be bigger.
 */
export function resizedThumb(url: string, width: number): string | null {
  const m = url.match(/^(.*\/thumb\/.+\/)(\d+)px-([^/?]+)(\?.*)?$/);
  if (!m || Number(m[2]) >= width) return null;
  return `${m[1]}${width}px-${m[3]}${m[4] ?? ""}`;
}

/** The URL with the highest density (2x, 1.5x, ...) in a srcset. */
export function largestCandidate(srcset: string): string | null {
  let best: { url: string; density: number } | null = null;
  for (const entry of splitSrcset(srcset)) {
    const [url, descriptor = "1x"] = entry.trim().split(/\s+/);
    const density = descriptor.endsWith("x") ? Number.parseFloat(descriptor) : Number.NaN;
    if (!url || !Number.isFinite(density)) continue;
    if (!best || density > best.density) best = { url, density };
  }
  return best?.url ?? null;
}

/** "7 November 2026 at 14:32 EST", in the given time zone (UTC if it isn't a real one). */
export function generatedAt(now: Date, timeZone = "UTC"): string {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: zone });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: zone });
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? zone;
  return `${date} at ${time} ${name}`;
}

function frontMatter(title: string, ref: ArticleRef, revision: string | null, generated: string): string {
  const url = articleUrl({ ...ref, title });
  const host = `https://${ref.lang}.wikipedia.org`;
  const permalink = revision ? `${host}/w/index.php?oldid=${revision}` : null;
  const history = `${host}/w/index.php?title=${encodeURIComponent(title.replace(/ /g, "_"))}&action=history`;

  return `
<header class="booklet-cover">
  <h1>${escapeHtml(title)}</h1>
  <p>From Wikipedia, the free encyclopedia</p>
</header>
<aside class="booklet-colophon">
  <div class="booklet-qr-block">
    ${qrSvg(url, 26)}
    <div>
      <p>${escapeHtml(url)}</p>
      <p>Generated ${escapeHtml(generated)}</p>
    </div>
  </div>
  <p><strong>${escapeHtml(title)}</strong></p>
  ${permalink ? `<p>This copy: revision ${revision}, ${escapeHtml(permalink)}</p>` : ""}
  <p>Text is available under the Creative Commons Attribution-ShareAlike 4.0 License
  (https://creativecommons.org/licenses/by-sa/4.0/); additional terms may apply.
  Images may be under other licences; see each file's page on Wikipedia.
  Authors are listed in the article's history: ${escapeHtml(history)}</p>
</aside>`;
}

function absolute(url: string, lang: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  try {
    return new URL(url, `https://${lang}.wikipedia.org/wiki/`).href;
  } catch {
    return url;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => ENTITIES[n]);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
