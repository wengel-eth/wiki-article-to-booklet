import type { PaperId } from "../shared/paper";
import { printCss } from "./print-css";
import { articleUrl, type ArticleRef } from "./wikipedia";

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
  ".mw-empty-elt",
  ".Inline-Template",
  "#coordinates",
  '[role="navigation"]',
].join(", ");

/**
 * Turns Parsoid HTML for an article into a standalone document ready to print
 * as booklet pages: junk removed, a cover and colophon added, print CSS applied.
 */
export async function makePrintable(
  source: string,
  ref: ArticleRef,
  paper: PaperId,
  now = new Date(),
): Promise<PrintableArticle> {
  let rawTitle = "";
  let revision: string | null = null;
  const lang = ref.lang;

  const rewriter = new HTMLRewriter()
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
        el.append(`<style>${printCss(paper)}</style>`, { html: true });
      },
    })
    // There's no <base> (it would break the contents page's #links), so make
    // image URLs absolute. Links aren't clickable on paper; drop them.
    .on("img[src], source[src]", {
      element(el) {
        el.setAttribute("src", absolute(el.getAttribute("src")!, lang));
      },
    })
    .on("img[srcset], source[srcset]", {
      element(el) {
        const srcset = el.getAttribute("srcset")!
          .split(",")
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
        el.removeAttribute("href");
      },
    })
    .on("[data-mw]", {
      element(el) {
        el.removeAttribute("data-mw");
      },
    })
    .on("img", {
      element(el) {
        el.removeAttribute("loading");
        el.removeAttribute("decoding");
      },
    })
    .on("body", {
      element(el) {
        const title = decodeEntities(rawTitle).trim() || ref.title;
        el.prepend(frontMatter(title, ref, revision, now), { html: true });
      },
    });

  const html = await rewriter.transform(new Response(source)).text();
  const title = decodeEntities(rawTitle).trim() || ref.title;
  return { title, revision, html };
}

function frontMatter(title: string, ref: ArticleRef, revision: string | null, now: Date): string {
  const url = articleUrl({ ...ref, title });
  const host = `https://${ref.lang}.wikipedia.org`;
  const permalink = revision ? `${host}/w/index.php?oldid=${revision}` : null;
  const history = `${host}/w/index.php?title=${encodeURIComponent(title.replace(/ /g, "_"))}&action=history`;
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return `
<header class="booklet-cover">
  <h1>${escapeHtml(title)}</h1>
  <p>From Wikipedia, the free encyclopedia</p>
</header>
<aside class="booklet-colophon">
  <p><strong>${escapeHtml(title)}</strong></p>
  <p>Source: ${escapeHtml(url)}</p>
  ${permalink ? `<p>This copy: revision ${revision}, ${escapeHtml(permalink)}</p>` : ""}
  <p>Retrieved ${escapeHtml(date)}.</p>
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
