import { expect, test } from "bun:test";
import { makePrintable } from "../src/worker/printable";

// A cut-down version of what Wikipedia's REST API returns.
const PARSOID = `<!DOCTYPE html>
<html prefix="dc: http://purl.org/dc/terms/" about="https://en.wikipedia.org/wiki/Special:Redirect/revision/1234567"><head>
<meta charset="utf-8"/><meta property="mw:pageId" content="1"/>
<base href="//en.wikipedia.org/wiki/"/><title>AC/DC &amp; friends</title>
<link rel="stylesheet" href="/w/load.php?modules=mediawiki.skinning.content.parsoid"/>
<script>alert(1)</script>
</head><body lang="en" dir="ltr" class="mw-parser-output">
<section data-mw-section-id="0">
<div class="shortdescription noprint" style="display:none">Rock band</div>
<div role="note" class="hatnote">For the album, see …</div>
<table class="infobox"><tr><th>Origin</th><td>Sydney</td></tr></table>
<p data-mw='{"x":1}'>AC/DC are a rock band.<sup class="noprint Inline-Template">[citation needed]</sup></p>
<figure typeof="mw:File/Thumb"><a href="./File:X.jpg"><img src="//upload.wikimedia.org/x.jpg" loading="lazy" width="250" height="200"/></a><figcaption>Band</figcaption></figure>
</section>
<section data-mw-section-id="5"><h2 id="External_links">External links</h2><div role="navigation" class="navbox">nav</div></section>
</body></html>`;

test("makePrintable cleans up and adds front matter", async () => {
  const out = await makePrintable(PARSOID, { lang: "en", title: "AC/DC" }, "a4", new Date("2026-11-07T12:00:00Z"));

  expect(out.title).toBe("AC/DC & friends");
  expect(out.revision).toBe("1234567");

  const html = out.html;
  expect(html).toContain('<base href="https://en.wikipedia.org/wiki/">');
  expect(html).not.toContain("//en.wikipedia.org/wiki/\"/>");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("load.php");
  expect(html).not.toContain("citation needed");
  expect(html).not.toContain("hatnote");
  expect(html).not.toContain("navbox");
  expect(html).not.toContain("data-mw=");
  expect(html).not.toContain('loading="lazy"');
  expect(html).toContain("AC/DC are a rock band.");
  expect(html).toContain('class="infobox"');

  // Cover and colophon
  expect(html).toContain("<h1>AC/DC &#38; friends</h1>");
  expect(html).toContain("revision 1234567");
  expect(html).toContain("https://en.wikipedia.org/w/index.php?oldid=1234567");
  expect(html).toContain("Retrieved 7 November 2026.");
  expect(html).toContain("Creative Commons Attribution-ShareAlike 4.0");

  // Booklet page for A4 paper is A5
  expect(html).toContain("size: 148.5mm 210mm");
});
