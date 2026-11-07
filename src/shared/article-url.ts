export interface ArticleRef {
  lang: string;
  title: string; // human form, spaces not underscores
}

const HOST = /^([a-z][a-z0-9-]{0,19})(?:\.m)?\.wikipedia\.org$/;
const NOT_LANGS = new Set(["www", "m", "meta", "test", "test2"]);
const BLOCKED_NAMESPACES = /^(special|media|file|image|user|talk|user talk|template|category|portal|help|module|mediawiki|wikipedia|draft):/i;

/**
 * Accepts article links like
 *   https://en.wikipedia.org/wiki/AC/DC
 *   https://fr.m.wikipedia.org/wiki/Montr%C3%A9al#Histoire
 *   https://en.wikipedia.org/w/index.php?title=Ada_Lovelace&oldid=123
 * Returns null for anything that isn't a Wikipedia article.
 */
export function parseArticleUrl(input: string): ArticleRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase().match(HOST);
  if (!host || NOT_LANGS.has(host[1])) return null;

  let title: string | null = null;
  if (url.pathname.startsWith("/wiki/")) {
    try {
      title = decodeURIComponent(url.pathname.slice("/wiki/".length));
    } catch {
      return null;
    }
  } else if (url.pathname === "/w/index.php") {
    title = url.searchParams.get("title");
  }
  if (!title) return null;

  title = title.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!title || title.length > 255 || BLOCKED_NAMESPACES.test(title)) return null;

  return { lang: host[1], title };
}

export function articleUrl(ref: ArticleRef): string {
  const path = encodeURIComponent(ref.title.replace(/ /g, "_"))
    .replace(/%2F/g, "/")
    .replace(/%3A/g, ":");
  return `https://${ref.lang}.wikipedia.org/wiki/${path}`;
}
