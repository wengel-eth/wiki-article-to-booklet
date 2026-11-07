/**
 * Runs in the rendering browser. When the black and white option is on (the
 * body has class "grayscale"), turns every text, background and border colour
 * into the grey of the same brightness, so different colours (party colours in
 * election tables, say) stay distinguishable as different greys.
 *
 * Images are handled separately with a CSS filter. Filtering whole elements
 * would turn their text into images, so colours are rewritten instead.
 */
export const GRAYSCALE_COLORS = `(() => {
  if (!document.body.classList.contains("grayscale")) return 0;
  const props = [
    "color",
    "background-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "outline-color",
    "text-decoration-color",
  ];
  const toGray = (value) => {
    const m = value.match(/^rgba?\\(([^)]*)\\)$/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
    if (r === g && g === b) return null;
    const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    return "rgba(" + y + ", " + y + ", " + y + ", " + a + ")";
  };
  let changed = 0;
  for (const el of document.body.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    for (const prop of props) {
      const gray = toGray(style.getPropertyValue(prop));
      if (gray) {
        el.style.setProperty(prop, gray, "important");
        changed++;
      }
    }
  }
  return changed;
})()`;
