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

/** Fetches the article as Parsoid HTML (follows redirects). */
export async function fetchArticleHtml(ref: ArticleRef): Promise<string> {
  const title = encodeURIComponent(ref.title.replace(/ /g, "_"));
  const endpoint = `https://${ref.lang}.wikipedia.org/w/rest.php/v1/page/${title}/html`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      redirect: "follow",
    });
  } catch {
    throw new UserError(502, "Couldn't reach Wikipedia. Try again in a moment.");
  }

  if (res.status === 404) throw new UserError(404, "That article doesn't exist.");
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
    const res = await fetch(`https://${ref.lang}.wikipedia.org/w/api.php?${params}`, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
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
