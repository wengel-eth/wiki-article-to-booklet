import puppeteer, { type BrowserWorker, type Page } from "@cloudflare/puppeteer";
import type { PaperId } from "../shared/paper";
import type { ServerEvent } from "../shared/progress";
import { BUILD_CONTENTS, fillContents, headingPages, REMOVE_CONTENTS } from "./contents";
import { GRAYSCALE_COLORS } from "./grayscale";
import { ARRANGE_MAPS } from "./maps";
import { contentBox, FONT_ORIGIN } from "./print-css";
import { fitTables } from "./tables";

const PX_PER_MM = 96 / 25.4;

const LOAD_TIMEOUT_MS = 40_000;
const PDF_TIMEOUT_MS = 60_000;

// The page only needs Wikipedia's own images (upload.wikimedia.org) and math
// renderings (wikimedia.org). Everything else is refused.
function allowed(url: string): boolean {
  if (url.startsWith("data:") || url === "about:blank") return true;
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === "wikimedia.org" ||
        hostname.endsWith(".wikimedia.org") ||
        hostname.endsWith(".wikipedia.org"))
    );
  } catch {
    return false;
  }
}

/**
 * Renders a print-ready HTML document to PDF using Cloudflare Browser Run.
 * `assets` is the Worker's static assets binding, which serves the fonts.
 */
export async function renderPdf(
  endpoint: BrowserWorker,
  assets: Fetcher,
  html: string,
  paper: PaperId,
  progress: (event: ServerEvent) => void = () => {},
): Promise<Uint8Array> {
  const box = contentBox(paper);
  const layout = {
    columnPx: Math.floor(box.width * PX_PER_MM),
    // A little short of the full height, so a sideways page never spills over.
    pageHeightPx: Math.floor((box.height - 2) * PX_PER_MM),
  };

  progress({ stage: "launching" });
  const browser = await puppeteer.launch(endpoint);
  try {
    const page = await browser.newPage();
    // Lay the page out at the width of the printed text column, so tables
    // can be measured as they will print.
    await page.setViewport({ width: layout.columnPx, height: 1000 });
    await page.emulateMediaType("print");
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith(`${FONT_ORIGIN}/`)) {
        serveFont(assets, url).then(
          (body) => (body ? req.respond({ status: 200, headers: {}, contentType: "font/woff2", body }) : req.abort()),
          () => req.abort(),
        );
      } else if (allowed(url)) req.continue();
      else req.abort();
    });

    // Count images as they arrive, for the progress bar.
    const total = html.match(/<img\b/g)?.length ?? 0;
    let done = 0;
    const counted = (req: { resourceType(): string }) => {
      if (req.resourceType() !== "image" || done >= total) return;
      done++;
      progress({ stage: "loading", done, total });
    };
    page.on("requestfinished", counted);
    page.on("requestfailed", counted);

    progress({ stage: "loading", done: 0, total });
    try {
      await page.setContent(html, { waitUntil: "networkidle0", timeout: LOAD_TIMEOUT_MS });
    } catch (err) {
      // A slow image shouldn't sink the whole booklet. Print what has loaded.
      if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
    }

    progress({ stage: "layout" });
    await page.evaluate(GRAYSCALE_COLORS);
    await page.evaluate(ARRANGE_MAPS);
    await page.evaluate(fitTables(layout));
    const entries = (await page.evaluate(BUILD_CONTENTS)) as number;
    let passes = 1;
    progress({ stage: "printing", pass: passes });
    let pdf = await print(page);
    if (entries === 0) return pdf;

    // Print, read where each heading landed, fill in the numbers, print again.
    // The second pass normally confirms nothing moved; stop there.
    try {
      for (let pass = 0; pass < 2; pass++) {
        const pages = await headingPages(pdf);
        if (Object.keys(pages).length < entries) throw new Error("Missing heading destinations");
        const changed = (await page.evaluate(fillContents(pages))) as boolean;
        if (!changed) break;
        progress({ stage: "printing", pass: ++passes });
        pdf = await print(page);
      }
    } catch (err) {
      // Better no contents page than one with missing or wrong numbers.
      console.error("Contents page dropped:", err);
      await page.evaluate(REMOVE_CONTENTS);
      progress({ stage: "printing", pass: ++passes });
      pdf = await print(page);
    }
    return pdf;
  } finally {
    await browser.close();
  }
}

function print(page: Page): Promise<Uint8Array> {
  return page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    timeout: PDF_TIMEOUT_MS,
  });
}

const fontCache = new Map<string, Uint8Array>();

/** Fetches a font file from the Worker's static assets (kept in memory after the first time). */
async function serveFont(assets: Fetcher, url: string): Promise<Uint8Array | null> {
  const path = new URL(url).pathname;
  if (!/^\/fonts\/[\w.-]+\.woff2$/.test(path)) return null;
  const cached = fontCache.get(path);
  if (cached) return cached;
  const res = await assets.fetch(new Request(`https://assets.local${path}`));
  if (!res.ok) return null;
  const body = new Uint8Array(await res.arrayBuffer());
  fontCache.set(path, body);
  return body;
}
