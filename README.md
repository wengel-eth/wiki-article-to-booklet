# wiki-article-to-booklet

Paste a link to a Wikipedia article and get back a PDF you can print
double-sided, fold in half, and staple into a booklet.

The PDF's pages look out of order on screen. That's on purpose: they're laid
out for **saddle-stitch** binding, so once the printed stack is folded the
pages read 1, 2, 3, … The paper size you pick is the sheet you put in the
printer; each booklet page is half of it (Letter gives 5.5 × 8.5 in pages, A4
gives A5).

## Printing

1. Print at actual size (100%), not "fit to page".
2. Print on both sides, flipping on the **short** edge.
3. Keep the sheets in order, fold the stack in half, and staple on the two
   marks printed along the fold on the outside.

## How it works

A single Cloudflare Worker serves the Vue app and one API route.

```
Browser                      Worker (Hono)                   Cloudflare Browser Run
───────                      ─────────────                   ──────────────────────
POST /api/booklet  ───────►  check the link is a Wikipedia
{ url, paper }               article, fetch its HTML from
                             Wikipedia's REST API, strip
                             navboxes etc., add a cover and
                             print CSS for the page size  ──►  render to PDF (reading order)
                    ◄──────  application/pdf             ◄──
rearrange pages two-up for
folding (pdf-lib), save in
IndexedDB, offer download
```

- Nothing is stored server-side: no R2, KV or database. Finished booklets live
  in the browser's IndexedDB.
- Page imposition happens in the browser, so the Worker only pays for one
  Browser Run render per booklet.
- The rendering browser may only load from `*.wikipedia.org` and
  `*.wikimedia.org`.
- Requests are limited per IP with the Workers rate limiting binding
  (5 a minute, set in `wrangler.jsonc`).

## Layout

```
src/app/        Vue 3 SPA: App.vue, impose.ts (pdf-lib), store.ts (IndexedDB)
src/worker/     Worker: index.ts (Hono routes), wikipedia.ts, printable.ts,
                print-css.ts, render.ts (Browser Run)
src/shared/     Code used by both: paper sizes, URL parsing, page ordering
test/           bun test
```

## Development

Needs [Bun](https://bun.sh) and a Cloudflare account with Browser Run enabled.

```sh
bun install
bun run dev        # Vite + the Worker in workerd, http://localhost:5173
bun test
bun run build      # type-check and build
bun run deploy     # build and deploy with wrangler
```

### Deploying from GitHub (Workers Builds)

In the Worker's **Settings → Build**, set:

| Setting         | Value                  |
| --------------- | ---------------------- |
| Build command   | `bun run build`        |
| Deploy command  | `npx wrangler deploy`  |

The build step is required. The Vite build writes the deployable Worker
config (with the static assets directory) to `dist/`, and `wrangler deploy`
picks it up from there. Without it, deploy fails with "The `assets` property
in your configuration is missing the required `directory` property".

### Local Browser Run

If the `BROWSER` binding doesn't work in local dev, point it at the real
Browser Run service: add `"remote": true` to the `browser` block in
`wrangler.jsonc` and run `bunx wrangler login` first.

After changing bindings in `wrangler.jsonc`, run `bun run typegen` to
regenerate `worker-configuration.d.ts`.

## Licence

Code: see [LICENSE](LICENSE). Article text comes from Wikipedia under
CC BY-SA 4.0; each booklet's second page says where it came from and links to
the article history.
