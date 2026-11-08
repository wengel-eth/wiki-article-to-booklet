/**
 * Runs in the rendering browser, before the black and white step.
 *
 * Infobox headers come in each template's own colours: backgrounds, and
 * sometimes thick coloured frames. On paper those are loud, but plain grey
 * loses the infobox's character. So each header gets a pale, muted tint of
 * its own colour:
 *   - a header with a colour (background, or a visible border) uses it;
 *   - a header without one uses the infobox's first header colour, so the
 *     box stays consistent;
 *   - an infobox with no colour at all keeps light grey (from print-css.ts).
 * Titles (above the box, or its first row) are tinted only if they have a
 * colour of their own. Then body.tinted switches on the CSS that removes the
 * frames and inner backgrounds (see print-css.ts), which had to stay in
 * place until the colours were read.
 */
export const TINT_INFOBOXES = `(() => {
  // Older templates (taxoboxes, for one) mark headers only as a header cell
  // spanning the whole row.
  const HEADERS = ".infobox-header, .infobox-subheader, tr > th[colspan]:only-child:not(.infobox-above, .infobox-title)";
  const TITLES = ".infobox-above, .infobox-title, caption";

  const rgb = (value) => {
    const m = value.match(/^rgba?\\(([^)]*)\\)$/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
    if (a < 0.5) return null;
    // White, greys and black carry no colour.
    if (Math.max(r, g, b) - Math.min(r, g, b) < 16) return null;
    return [r, g, b];
  };

  // The first colour in a cell: a background, or a border that shows.
  const colourOf = (cell) => {
    for (const el of [cell, ...cell.querySelectorAll("*")]) {
      const style = getComputedStyle(el);
      const background = rgb(style.backgroundColor);
      if (background) return background;
      for (const side of ["Top", "Right", "Bottom", "Left"]) {
        if (parseFloat(style["border" + side + "Width"]) > 0 && style["border" + side + "Style"] !== "none") {
          const border = rgb(style["border" + side + "Color"]);
          if (border) return border;
        }
      }
    }
    return null;
  };

  // A pale, muted version: the same hue, lightness 92%, saturation at most 45%.
  const tint = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const l = (max + min) / 2;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return "hsl(" + Math.round(h) + " " + Math.round(Math.min(s, 0.45) * 100) + "% 92%)";
  };

  let tinted = 0;
  for (const box of document.querySelectorAll(".infobox")) {
    if (box.parentElement.closest(".infobox")) continue; // nested boxes follow their parent
    const headers = [...box.querySelectorAll(HEADERS)];
    const titles = [...box.querySelectorAll(TITLES)];
    const colours = new Map([...headers, ...titles].map((cell) => [cell, colourOf(cell)]));
    const brand = headers.map((cell) => colours.get(cell)).find(Boolean) ?? null;
    for (const cell of headers) {
      const colour = colours.get(cell) ?? brand;
      if (colour) { cell.style.setProperty("background", tint(colour), "important"); tinted++; }
    }
    for (const cell of titles) {
      const colour = colours.get(cell);
      if (colour) { cell.style.setProperty("background", tint(colour), "important"); tinted++; }
    }
  }
  document.body.classList.add("tinted");
  return tinted;
})()`;
