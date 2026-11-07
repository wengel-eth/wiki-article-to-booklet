import { Hono } from "hono";
import { isPaperId } from "../shared/paper";
import type { ServerEvent } from "../shared/progress";
import { makePrintable } from "./printable";
import { renderPdf } from "./render";
import { fetchArticleHtml, parseArticleUrl, UserError } from "./wikipedia";

const app = new Hono<{ Bindings: Env }>();

app.post("/api/booklet", async (c) => {
  // Problems with the request itself are answered straight away, as JSON.
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
  if (!success) throw new UserError(429, "Too many booklets in a short time. Wait a minute and try again.");

  const body = await c.req
    .json<{ url?: unknown; paper?: unknown; references?: unknown; grayscale?: unknown; timeZone?: unknown }>()
    .catch(() => ({}) as Record<string, unknown>);
  const ref = typeof body.url === "string" ? parseArticleUrl(body.url) : null;
  if (!ref) throw new UserError(400, "That doesn't look like a link to a Wikipedia article.");
  const paper = body.paper;
  if (!isPaperId(paper)) throw new UserError(400, "Pick a paper size.");
  const references = body.references !== false;
  const grayscale = body.grayscale === true;
  const timeZone = typeof body.timeZone === "string" ? body.timeZone.slice(0, 64) : undefined;

  // From here on the answer is a stream of progress events, then the PDF.
  // See src/shared/progress.ts.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  // If the browser has gone away, writes fail; the work just finishes unseen.
  const send = (event: ServerEvent) => writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {});

  const work = (async () => {
    try {
      send({ stage: "fetching" });
      const source = await fetchArticleHtml(ref);
      send({ stage: "preparing" });
      const article = await makePrintable(source, ref, { paper, references, grayscale, timeZone });
      const pdf = await renderPdf(c.env.BROWSER, c.env.ASSETS, article.html, paper, send);
      send({ stage: "pdf", bytes: pdf.byteLength, title: article.title });
      await writer.write(pdf).catch(() => {});
    } catch (err) {
      if (!(err instanceof UserError)) console.error(err);
      const message = err instanceof UserError ? err.message : "Something went wrong making the booklet. Try again.";
      send({ stage: "error", message });
    } finally {
      await writer.close().catch(() => {});
    }
  })();
  c.executionCtx.waitUntil(work);

  return new Response(readable, {
    headers: {
      // Not a text type, so nothing along the way compresses or buffers it.
      "content-type": "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
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
