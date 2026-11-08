/**
 * Runs in the rendering browser. Infobox map switchers are printed with
 * their maps side by side (see print-css.ts). Maps are different shapes, so
 * give each a share of the width in proportion to its aspect ratio: then all
 * come out the same height and their captions line up.
 */
export const ARRANGE_MAPS = `(() => {
  let arranged = 0;
  for (const box of document.querySelectorAll(".switcher-container")) {
    for (const item of box.children) {
      if (item.tagName !== "DIV") continue;
      const img = item.querySelector(".locmap img");
      const w = Number(img?.getAttribute("width"));
      const h = Number(img?.getAttribute("height"));
      if (w > 0 && h > 0) item.style.flexGrow = String(w / h);
    }
    arranged++;
  }
  return arranged;
})()`;
