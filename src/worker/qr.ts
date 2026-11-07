import { encode } from "uqr";

/**
 * A plain QR code as inline SVG: black squares, no styling, with a two-module
 * quiet zone. Horizontal runs of modules are drawn as single rectangles to
 * keep the markup small. It is at least `minSizeMm` across, and larger when
 * the text needs a denser code, so each square stays big enough to print
 * cleanly.
 */
const MIN_MODULE_MM = 0.4;

export function qrSvg(text: string, minSizeMm: number): string {
  const { size, data } = encode(text, { ecc: "M", border: 0 });
  let path = "";
  data.forEach((row, y) => {
    for (let x = 0; x < size; x++) {
      if (!row[x]) continue;
      let run = 1;
      while (x + run < size && row[x + run]) run++;
      path += `M${x} ${y}h${run}v1h-${run}z`;
      x += run - 1;
    }
  });
  const quiet = 2;
  const sizeMm = Math.max(minSizeMm, Math.ceil((size + quiet * 2) * MIN_MODULE_MM));
  return (
    `<svg class="booklet-qr" xmlns="http://www.w3.org/2000/svg" viewBox="${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}" ` +
    `width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges" role="img" aria-label="QR code linking to the article">` +
    `<path fill="#000" d="${path}"/></svg>`
  );
}
