import { expect, test } from "bun:test";
import { largestCandidate, makePrintable } from "../src/worker/printable";

// A cut-down version of what Wikipedia's REST API returns.
const PARSOID = `<!DOCTYPE html>
<html prefix="dc: http://purl.org/dc/terms/" about="https://en.wikipedia.org/wiki/Special:Redirect/revision/1234567"><head>
<meta charset="utf-8"/><meta property="mw:pageId" content="1"/>
<base href="//en.wikipedia.org/wiki/"/><title>AC/DC &amp; friends</title>
<link rel="stylesheet" href="/w/load.php?modules=mediawiki.skinning.content.parsoid"/>
<script>alert(1)</script>
</head><body lang="en" dir="ltr" class="mw-content-ltr">
<section data-mw-section-id="0">
<div class="shortdescription noprint" style="display:none">Rock band</div>
<div role="note" class="hatnote">For the album, see …</div>
<table class="infobox"><tr><th>Origin</th><td>Sydney</td></tr></table>
<p data-mw='{"x":1}'>AC/DC are a rock band.<sup class="mw-ref reference" typeof="mw:Extension/ref"><a href="./AC/DC#cite_note-1">[1]</a></sup><sup class="noprint Inline-Template">[citation needed]</sup></p>
<figure typeof="mw:File/Thumb"><a href="./File:X.jpg"><img src="//upload.wikimedia.org/x.jpg" srcset="//upload.wikimedia.org/x2.jpg 2x, /w/y.png 1.5x" loading="lazy" width="250" height="200"/></a><figcaption>Band</figcaption></figure>
</section>
<section data-mw-section-id="4"><h2 id="References">References</h2><div class="mw-references-wrap"><ol class="mw-references references"><li id="cite_note-1">A reference.</li></ol></div></section>
<section data-mw-section-id="5"><h2 id="External_links">External links</h2><div role="navigation" class="navbox">nav</div></section>
</body></html>`;

test("makePrintable cleans up and adds front matter", async () => {
  const out = await makePrintable(PARSOID, { lang: "en", title: "AC/DC" }, { paper: "a4", references: true, grayscale: false }, new Date("2026-11-07T12:00:00Z"));

  expect(out.title).toBe("AC/DC & friends");
  expect(out.revision).toBe("1234567");

  const html = out.html;
  // No <base>: image URLs are made absolute instead, and links are dropped.
  expect(html).not.toContain("<base");
  // The 2x image from srcset becomes the image; srcset is dropped.
  expect(html).toContain('<img src="https://upload.wikimedia.org/x2.jpg" width="250" height="200" />');
  expect(html).not.toContain("srcset");
  expect(html).not.toContain('href="./File:X.jpg"');
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
  expect(html).toContain("Generated 7 November 2026 at 12:00 UTC");
  expect(html).toContain('<svg class="booklet-qr"');
  expect(html).toContain("Creative Commons Attribution-ShareAlike 4.0");

  // Booklet page for A4 paper is A5
  expect(html).toContain("size: 148.5mm 210mm");

  // Running head
  expect(html).toContain('content: "AC/DC & friends";');

  // Fonts, and references kept
  expect(html).toContain('font-family: "Literata"');
  expect(html).toContain('class="mw-ref reference"');
  expect(html).toContain('<div class="mw-references-wrap">');
  expect(html).toContain('<body lang="en" dir="ltr" class="mw-content-ltr">');
});

test("makePrintable can leave references out", async () => {
  const out = await makePrintable(PARSOID, { lang: "en", title: "AC/DC" }, { paper: "a4", references: false, grayscale: false });
  expect(out.html).not.toContain('class="mw-ref');
  expect(out.html).not.toContain('<div class="mw-references-wrap">');
  expect(out.html).not.toContain("A reference.");
  expect(out.html).toContain('class="mw-content-ltr no-references"');
  expect(out.html).toContain("AC/DC are a rock band.");
});

test("makePrintable can print images in black and white", async () => {
  const out = await makePrintable(PARSOID, { lang: "en", title: "AC/DC" }, { paper: "a4", references: true, grayscale: true });
  expect(out.html).toContain('<body lang="en" dir="ltr" class="mw-content-ltr grayscale">');
  expect(out.html).toContain("body.grayscale img");
});

test("largestCandidate picks the highest density", () => {
  expect(largestCandidate("//a/1.5x.jpg 1.5x, //a/2x.jpg 2x")).toBe("//a/2x.jpg");
  expect(largestCandidate("//a/2x.jpg 2x, //a/1.5x.jpg 1.5x")).toBe("//a/2x.jpg");
  expect(largestCandidate("//a/500.jpg 500w")).toBeNull();
  expect(largestCandidate("")).toBeNull();
});

test("running heads escape quotes and shorten long titles", async () => {
  const long = PARSOID.replace("AC/DC &amp; friends", `The "Long" Title ${"x".repeat(80)}`);
  const out = await makePrintable(long, { lang: "en", title: "X" }, { paper: "a4", references: true, grayscale: false });
  expect(out.html).toContain('content: "The \\22 Long\\22  Title xxxx');
  expect(out.html).toMatch(/xxx\\2026 ";/);
});

test("wide images are marked to keep the full width", async () => {
  const src = PARSOID.replace(
    "</section>\n<section data-mw-section-id=\"4\">",
    `<figure><img src="//upload.wikimedia.org/pano.jpg" width="500" height="200"/></figure></section>\n<section data-mw-section-id="4">`,
  );
  const { html } = await makePrintable(src, { lang: "en", title: "X" }, { paper: "a4", references: true, grayscale: false });
  expect(html).toContain('<img src="https://upload.wikimedia.org/pano.jpg" width="500" height="200" data-wide="" />');
  expect(html).toContain('<img src="https://upload.wikimedia.org/x2.jpg" width="250" height="200" />');
});

test("fitTables embeds the page layout and its stylesheet is in the print CSS", async () => {
  const { fitTables, TABLE_CSS } = await import("../src/worker/tables");
  expect(fitTables({ columnPx: 425, pageHeightPx: 694 })).toContain('({"columnPx":425,"pageHeightPx":694}, 0.7, 1.3)');
  const { html } = await makePrintable(PARSOID, { lang: "en", title: "X" }, { paper: "a4", references: true, grayscale: false });
  expect(html).toContain(TABLE_CSS.trim().split("\n")[0]);
});

test("generatedAt uses the reader's time zone, falling back to UTC", async () => {
  const { generatedAt } = await import("../src/worker/printable");
  const when = new Date("2026-11-07T19:32:00Z");
  expect(generatedAt(when, "America/Toronto")).toBe("7 November 2026 at 14:32 EST");
  expect(generatedAt(when, "Europe/Paris")).toBe("7 November 2026 at 20:32 GMT+1");
  expect(generatedAt(when, "Not/AZone")).toBe("7 November 2026 at 19:32 UTC");
  expect(generatedAt(when)).toBe("7 November 2026 at 19:32 UTC");
});

test("QR codes grow for long links so the squares stay printable", async () => {
  const { qrSvg } = await import("../src/worker/qr");
  expect(qrSvg("https://en.wikipedia.org/wiki/Moon", 18)).toContain('width="18mm"');
  const long = `https://zh.wikipedia.org/wiki/${encodeURIComponent("中華人民共和國香港特別行政區立法會選舉")}`;
  const width = Number(qrSvg(long, 18).match(/width="(\d+)mm"/)![1]);
  expect(width).toBeGreaterThan(18);
});
