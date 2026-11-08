import type { ArticleRef } from "../shared/article-url";

export { articleUrl, parseArticleUrl, type ArticleRef } from "../shared/article-url";

export class UserError extends Error {
  constructor(
    readonly status: 400 | 404 | 413 | 429 | 502,
    message: string,
  ) {
    super(message);
  }
}

const USER_AGENT =
  "wiki-article-to-booklet/0.1 (https://github.com/wengel-eth/wiki-article-to-booklet)";
const MAX_HTML_BYTES = 6 * 1024 * 1024;

/** How many times to retry when Wikipedia says to slow down, and the longest wait we'll accept. */
const RETRIES = 2;
const MAX_RETRY_WAIT_MS = 5000;

/**
 * fetch() for Wikipedia. When Wikipedia answers 429 (too many requests from
 * this address) or 503, wait as long as its Retry-After header asks, up to
 * MAX_RETRY_WAIT_MS, and try again, as Wikimedia's API etiquette asks.
 */
export async function wikiFetch(
  url: string,
  init: RequestInit = {},
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Response> {
  const headers = { "user-agent": USER_AGENT, "api-user-agent": USER_AGENT, ...init.headers };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers });
    if ((res.status !== 429 && res.status !== 503) || attempt >= RETRIES) return res;
    const asked = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(asked) && asked > 0 ? asked * 1000 : 1000 * (attempt + 1);
    if (wait > MAX_RETRY_WAIT_MS) return res;
    await res.body?.cancel();
    await sleep(wait);
  }
}

/** Fetches the article as Parsoid HTML (follows redirects). */
export async function fetchArticleHtml(ref: ArticleRef): Promise<string> {
  const title = encodeURIComponent(ref.title.replace(/ /g, "_"));
  const endpoint = `https://${ref.lang}.wikipedia.org/w/rest.php/v1/page/${title}/html`;

  let res: Response;
  try {
    res = await wikiFetch(endpoint, { headers: { accept: "text/html" }, redirect: "follow" });
  } catch {
    throw new UserError(502, "Couldn't reach Wikipedia. Try again in a moment.");
  }

  if (res.status === 404) throw new UserError(404, "That article doesn't exist.");
  if (res.status === 429) throw new UserError(502, "Wikipedia is limiting requests right now. Try again in a minute.");
  if (!res.ok) throw new UserError(502, `Wikipedia returned an error (${res.status}). Try again in a moment.`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_HTML_BYTES) throw tooLong();

  const html = await res.text();
  if (html.length > MAX_HTML_BYTES) throw tooLong();
  return html;
}

function tooLong() {
  return new UserError(413, "That article is too long to make into a booklet.");
}

/** The article's main image, as the Wikipedia app shows it at the top. */
export interface PageImage {
  /** File name without the namespace, e.g. "Eddystone_Lighthouse.jpg". */
  file: string;
  src: string;
  width: number;
  height: number;
}

/** Width of the header image file: about 290 dpi across a booklet column. */
const PAGE_IMAGE_WIDTH = 1280;

/**
 * Asks Wikipedia for the article's page image (the PageImages extension: the
 * image the apps and link previews use). Only freely licensed images are
 * returned. Any failure just means no header image.
 */
export async function fetchPageImage(ref: ArticleRef): Promise<PageImage | null> {
  const params = new URLSearchParams({
    action: "query",
    prop: "pageimages",
    piprop: "thumbnail|name",
    pithumbsize: String(PAGE_IMAGE_WIDTH),
    titles: ref.title,
    redirects: "1",
    format: "json",
    formatversion: "2",
  });
  try {
    const res = await wikiFetch(`https://${ref.lang}.wikipedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      query?: { pages?: { pageimage?: string; thumbnail?: { source: string; width: number; height: number } }[] };
    };
    const page = body.query?.pages?.[0];
    if (!page?.pageimage || !page.thumbnail) return null;
    const { source, width, height } = page.thumbnail;
    return { file: page.pageimage, src: source, width, height };
  } catch {
    return null;
  }
}
