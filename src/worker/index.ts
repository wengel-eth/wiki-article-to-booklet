import { Hono } from "hono";
import { isPaperId } from "../shared/paper";
import { makePrintable } from "./printable";
import { renderPdf } from "./render";
import { fetchArticleHtml, parseArticleUrl, UserError } from "./wikipedia";

const app = new Hono<{ Bindings: Env }>();

app.post("/api/booklet", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
  if (!success) throw new UserError(429, "Too many booklets in a short time. Wait a minute and try again.");

  const body = await c.req.json<{ url?: unknown; paper?: unknown; references?: unknown; grayscale?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const ref = typeof body.url === "string" ? parseArticleUrl(body.url) : null;
  if (!ref) throw new UserError(400, "That doesn't look like a link to a Wikipedia article.");
  if (!isPaperId(body.paper)) throw new UserError(400, "Pick a paper size.");

  const source = await fetchArticleHtml(ref);
  const references = body.references !== false;
  const grayscale = body.grayscale === true;
  const article = await makePrintable(source, ref, { paper: body.paper, references, grayscale });
  const pdf = await renderPdf(c.env.BROWSER, c.env.ASSETS, article.html, body.paper);

  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "no-store",
      "x-article-title": encodeURIComponent(article.title),
    },
  });
});

app.notFound((c) => c.json({ error: "Not found." }, 404));

app.onError((err, c) => {
  if (err instanceof UserError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong making the booklet. Try again." }, 500);
});

export default app;
