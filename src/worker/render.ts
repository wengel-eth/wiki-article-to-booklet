import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";

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

/** Renders a print-ready HTML document to PDF using Cloudflare Browser Run. */
export async function renderPdf(endpoint: BrowserWorker, html: string): Promise<Uint8Array> {
  const browser = await puppeteer.launch(endpoint);
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (allowed(req.url())) req.continue();
      else req.abort();
    });

    try {
      await page.setContent(html, { waitUntil: "networkidle0", timeout: LOAD_TIMEOUT_MS });
    } catch (err) {
      // A slow image shouldn't sink the whole booklet. Print what has loaded.
      if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
    }

    return await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      timeout: PDF_TIMEOUT_MS,
    });
  } finally {
    await browser.close();
  }
}
