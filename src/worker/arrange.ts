/**
 * Runs in the rendering browser. Removes infobox rows for sound and video
 * files, and sizes groups of pictures so each row comes
 * out at one height, by giving every picture a share of the width in
 * proportion to its shape (width / height).
 *
 * - Infobox map switchers (side by side, see print-css.ts): the maps share
 *   one row.
 * - Image boxes ({{multiple image}}): pictures side by side share one
 *   row; a stack of pictures taller than the text beside it becomes a row.
 *   Photo montages (pictures cropped to set frames) keep the template's
 *   layout, scaled as a whole.
 * - Galleries: pictures wrap into rows about GALLERY_ROW_MM tall that fill
 *   the width; none is drawn taller than GALLERY_MAX_MM, so a lone picture on
 *   the last row doesn't blow up.
 */
const GALLERY_ROW_MM = 30;
const GALLERY_MAX_MM = 45;

export const ARRANGE_IMAGES = `(() => {
  // Infobox rows for a sound or video file (hidden, as they can't play on
  // paper), with the header row above and a one-cell caption row below.
  for (const media of document.querySelectorAll(".infobox audio, .infobox video")) {
    const row = media.closest("tr");
    if (!row) continue;
    const before = row.previousElementSibling;
    const after = row.nextElementSibling;
    if (before?.cells.length === 1 && before.cells[0].tagName === "TH") before.remove();
    if (after?.cells.length === 1 && after.cells[0].tagName === "TD" && !after.querySelector("img, table")
        && after.textContent.trim().length < 80) after.remove();
    row.remove();
  }

  const shape = (el) => {
    const img = el.querySelector("img");
    const w = Number(img?.getAttribute("width"));
    const h = Number(img?.getAttribute("height"));
    return w > 0 && h > 0 ? w / h : null;
  };

  for (const box of document.querySelectorAll(".switcher-container")) {
    let total = 0;
    let count = 0;
    for (const item of box.children) {
      const ratio = item.tagName === "DIV" ? shape(item.querySelector(".locmap") ?? item) : null;
      if (!ratio) continue;
      item.style.flexGrow = String(ratio);
      total += ratio;
      count++;
    }
    // Infobox images have a height cap. If the maps would reach it, narrow
    // the row so they fill their shares exactly at that height, centred,
    // rather than each floating in a wider share with uneven gaps.
    const img = box.querySelector(".locmap img");
    const cap = img ? parseFloat(getComputedStyle(img).maxHeight) : NaN;
    if (count && Number.isFinite(cap)) {
      const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
      box.style.maxWidth = total * cap + gap * (count - 1) + "px";
      box.style.marginInline = "auto";
    }
  }

  // Boxes of pictures stacked one above another ({{multiple image}} with
  // direction vertical) float beside the text, at under half the column's
  // width. Taller than the text beside them, they hang past the end of their
  // section, and what follows can't always go beside them (a wide picture or
  // a table), which leaves the column next to them empty. Those are set as one
  // full-width row instead.
  const isFloat = (el) => getComputedStyle(el).float !== "none";
  for (const box of document.querySelectorAll("div.thumb.tmulti")) {
    const inner = box.querySelector(":scope > .thumbinner");
    // Rows of pictures (the box's caption can have a row of its own).
    const rows = [...box.querySelectorAll(".trow")].filter((row) => row.querySelector(".tsingle"));
    if (!inner || !isFloat(box) || rows.length < 2) continue;
    if (rows.some((row) => row.querySelectorAll(":scope > .tsingle").length !== 1)) continue;
    const top = box.getBoundingClientRect().top;
    let textBottom = top;
    for (let el = box.nextElementSibling; el; el = el.nextElementSibling) {
      if (el.matches("section, h1, h2, h3, h4, h5, h6, .mw-heading") || isFloat(el)) break;
      textBottom = Math.max(textBottom, el.getBoundingClientRect().bottom);
    }
    if (box.getBoundingClientRect().bottom <= textBottom) continue;
    for (const row of rows.slice(1)) {
      rows[0].append(...row.children);
      row.remove();
    }
    inner.setAttribute("data-wide", "");
  }

  // Photo montages: image boxes whose pictures are cropped to fit frames of a
  // set size (as at the top of a city's infobox). The template has already
  // laid them out exactly, in pixels, so that layout is kept, and the whole
  // montage scaled to the width it has.
  const px = (el, prop) => Number(el.getAttribute("style")?.match(new RegExp("(?:^|;)\\\\s*" + prop + ":\\\\s*([\\\\d.]+)px"))?.[1]);
  const fix = (el, prop, value) => el.style.setProperty(prop, value, "important");
  for (const box of document.querySelectorAll(".tmulti")) {
    if (!box.querySelector(".tsingle > div[style*='overflow']")) continue;
    const inner = box.querySelector(".multiimageinner");
    const width = inner && px(inner, "width");
    const parent = box.parentElement;
    const ps = parent && getComputedStyle(parent);
    const room = parent && parent.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
    if (!width || !room) continue;
    // At most twice as tall as an infobox picture may be: under half a page.
    const firstImg = inner.querySelector("img");
    const cap = firstImg ? 2 * parseFloat(getComputedStyle(firstImg).maxHeight) : NaN;
    box.dataset.montage = "";
    // Across the full width, not floated beside the text like other image boxes.
    fix(box, "float", "none");
    fix(box, "width", "auto");
    fix(box, "max-width", "none");
    fix(box, "margin", "0");
    for (const el of [inner, ...inner.querySelectorAll(".trow")]) el.style.gap = "0";
    fix(inner, "width", width + "px");
    fix(inner, "max-width", "none");
    inner.style.marginInline = "auto";
    for (const single of inner.querySelectorAll(".tsingle")) {
      const w = px(single, "width");
      if (!w) continue;
      fix(single, "width", w + "px");
      fix(single, "max-width", w + "px");
      fix(single, "flex", "none");
      fix(single, "margin", "1px");
    }
    for (const img of inner.querySelectorAll("img")) {
      const w = Number(img.getAttribute("width")), h = Number(img.getAttribute("height"));
      if (!w || !h) continue;
      fix(img, "width", w + "px");
      fix(img, "height", h + "px");
      fix(img, "max-width", "none");
      fix(img, "max-height", "none");
    }
    const height = inner.getBoundingClientRect().height;
    inner.style.zoom = String(Math.min(room / width, Number.isFinite(cap) && height ? cap / height : Infinity));
  }

  // Pictures side by side in an image box come out at one height.
  for (const row of document.querySelectorAll(".tmulti:not([data-montage]) .trow")) {
    for (const single of row.querySelectorAll(":scope > .tsingle")) {
      const ratio = shape(single);
      if (ratio) single.style.flexGrow = String(ratio);
    }
  }

  for (const item of document.querySelectorAll("ul.gallery > li.gallerybox")) {
    const ratio = shape(item);
    if (!ratio) continue;
    item.style.flex = ratio + " 1 " + (ratio * ${GALLERY_ROW_MM}) + "mm";
    item.style.maxWidth = (ratio * ${GALLERY_MAX_MM}) + "mm";
  }
})()`;

/**
 * Images are printed from sharper files than the article's thumbnails. If one
 * of those failed to load (Wikimedia's image servers sometimes turn requests
 * away), go back to the thumbnail, which is usually cached and loads: a
 * softer picture beats a broken box. Waits for the retries, up to
 * RETRY_WAIT_MS. Images still broken after that are hidden, with their frame.
 * Evaluates to the number retried plus the number hidden.
 */
const RETRY_WAIT_MS = 10_000;

export const RETRY_IMAGES = `(async () => {
  const failed = [...document.querySelectorAll("img[data-fallback]")]
    .filter((img) => img.complete && img.naturalWidth === 0);
  await Promise.race([
    Promise.all(failed.map((img) => new Promise((done) => {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      img.src = img.dataset.fallback;
    }))),
    new Promise((done) => setTimeout(done, ${RETRY_WAIT_MS})),
  ]);
  // Anything still broken is left out, with its frame, rather than printed
  // as an empty box.
  let hidden = 0;
  for (const img of document.querySelectorAll("img")) {
    if (!img.complete || img.naturalWidth > 0) continue;
    const frame = img.closest("figure, .gallerybox, .mw-kartographer-map, .thumb, .booklet-lead") ?? img;
    frame.style.display = "none";
    // A table row (an infobox image row, say) left with nothing to show goes too.
    const cell = frame.closest("td, th");
    const showsSomething = (el) => el.innerText.trim() || [...el.querySelectorAll("img")].some((i) => i.getClientRects().length);
    if (cell && !showsSomething(cell)) {
      cell.closest("tr").style.display = "none";
    }
    hidden++;
  }
  return failed.length + hidden;
})()`;

