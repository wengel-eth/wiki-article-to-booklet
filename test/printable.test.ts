import { describe, expect, test } from "bun:test";
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

describe("header image", () => {
  const page = (body: string) =>
    `<!DOCTYPE html><html><head><title>Eddystone Lighthouse</title></head><body><section data-mw-section-id="0">${body}</section><section><h2>History</h2><p>Text.</p></section></body></html>`;
  const pageImage = {
    file: "Eddystone_Lighthouse_-_geograph.jpg",
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Eddystone_Lighthouse_-_geograph.jpg/1280px-Eddystone_Lighthouse_-_geograph.jpg",
    width: 1280,
    height: 960,
  };
  const make = (body: string, image = pageImage) =>
    makePrintable(page(body), { lang: "en", title: "Eddystone Lighthouse" }, { paper: "a4", references: true, grayscale: false, pageImage: image });
  const lead = (html: string) => html.match(/<div class="booklet-lead">.*?<\/div>/s)?.[0];

  test("moves the infobox image to the top, with its caption", async () => {
    const { html } = await make(`<table class="infobox"><tr><td class="infobox-image"><span typeof="mw:File"><a><img resource="./File:Eddystone_Lighthouse_-_geograph.jpg" src="//upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Eddystone_Lighthouse_-_geograph.jpg/220px-Eddystone_Lighthouse_-_geograph.jpg" width="220" height="165"/></a></span><div class="infobox-caption">The current tower, &amp; its stump</div></td></tr><tr><th>Height</th><td>49 m</td></tr></table><p>Lead.</p>`);
    expect(lead(html)).toContain(`src="${pageImage.src}" width="1280" height="960"`);
    expect(lead(html)).toContain('<p class="booklet-lead-caption">The current tower, &#38; its stump</p>');
    expect(html).not.toContain("220px-Eddystone");
    expect(html.indexOf('class="booklet-lead"')).toBeLessThan(html.indexOf('class="infobox"'));
  });

  test("takes the image's figure out when the lead image is a figure", async () => {
    const { html } = await make(`<figure class="noprint"><img src="//x/hidden.jpg" width="10" height="10"/></figure><p>Lead.</p><figure typeof="mw:File/Thumb"><a><img resource="./File:Eddystone%20Lighthouse%20-%20geograph.jpg" src="//x/a.jpg" width="250" height="180"/></a><figcaption>From the sea</figcaption></figure><figure typeof="mw:File/Thumb"><img resource="./File:Other.jpg" src="//x/other.jpg" width="250" height="180"/><figcaption>Another</figcaption></figure>`);
    expect(lead(html)).toContain("From the sea");
    expect(html).not.toContain("//x/a.jpg");
    expect(html).toContain("https://x/other.jpg");
    expect(html).toContain("<figcaption>Another</figcaption>");
  });

  test("does nothing if the image isn't in the article, or is too small to print full width", async () => {
    const body = `<p>Lead.</p><figure><img resource="./File:Other.jpg" src="//x/other.jpg" width="250" height="180"/></figure>`;
    expect(lead((await make(body)).html)).toBeUndefined();
    const small = { ...pageImage, file: "Other.jpg", width: 400, height: 300 };
    expect(lead((await make(body, small)).html)).toBeUndefined();
  });
});

test("references lose their jump-back links and keep web addresses", async () => {
  const refs = `<!DOCTYPE html><html><head><title>X</title></head><body><section><p>Text.</p></section><section><h2>References</h2><div class="mw-references-wrap"><ol class="mw-references references">
<li id="cite_note-1"><span class="mw-cite-backlink"><a href="./X#cite_ref-1" rel="mw:referencedBy"><span class="mw-linkback-text">↑ </span></a></span> <span class="mw-reference-text">Smith, J. <a rel="mw:ExtLink nofollow" href="https://www.lighthouses.org/history/" class="external text">"Lights of the World"</a>. <a rel="mw:WikiLink" href="./Harbour_Press">Harbour Press</a>.</span></li>
<li id="cite_note-2"><span class="mw-cite-backlink"><span rel="mw:referencedBy"><a href="./X#cite_ref-2a"><span class="mw-linkback-text">1 </span></a><a href="./X#cite_ref-2b"><span class="mw-linkback-text">2 </span></a></span></span> <span class="mw-reference-text"><a rel="mw:ExtLink nofollow" href="http://example.com/a?b=1" class="external free">http://example.com/a?b=1</a></span></li>
</ol></div></section></body></html>`;
  const { html } = await makePrintable(refs, { lang: "en", title: "X" }, { paper: "a4", references: true, grayscale: false });
  expect(html).not.toContain("mw-cite-backlink");
  expect(html).not.toContain("mw-linkback-text");
  expect(html).toContain('<a rel="mw:ExtLink nofollow" class="external text" data-url="lighthouses.org/history">');
  expect(html).toContain('<a rel="mw:ExtLink nofollow" class="external free">http://example.com/a?b=1</a>');
  expect(html).toContain('<a rel="mw:WikiLink">Harbour Press</a>');
  expect(html).not.toContain("href=");
});

test("srcset URLs may contain commas (Wikipedia's map images)", async () => {
  const { largestCandidate } = await import("../src/worker/printable");
  const map = "https://maps.wikimedia.org/img/osm-intl,5,50.18,-4.265,270x200";
  expect(largestCandidate(`${map}@1.5x.png?lang=en 1.5x, ${map}@2x.png?lang=en 2x`)).toBe(`${map}@2x.png?lang=en`);
});
