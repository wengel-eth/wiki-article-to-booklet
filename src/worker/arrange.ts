/**
 * Runs in the rendering browser. Removes infobox rows for sound and video
 * files, and sizes groups of pictures so each row comes
 * out at one height, by giving every picture a share of the width in
 * proportion to its shape (width / height).
 *
 * - Infobox map switchers (side by side, see print-css.ts): the maps share
 *   one row.
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
    for (const item of box.children) {
      const ratio = item.tagName === "DIV" ? shape(item.querySelector(".locmap") ?? item) : null;
      if (ratio) item.style.flexGrow = String(ratio);
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
