import { breakLines, INFINITE_PENALTY } from "./linebreak";

/*
 * Runs in the rendering browser, once fonts, pictures and tables are in
 * place: re-breaks justified paragraphs with Knuth-Plass (linebreak.ts) so
 * the spacing between words is even, instead of the browser's
 * one-line-at-a-time breaking, which leaves some lines with wide gaps.
 *
 * For each paragraph (or list item):
 *   1. Its words are measured in their own fonts on a canvas, and split at
 *      the hyphenation points Chrome itself uses for the language (found by
 *      laying each word out in a box of no width and seeing where it breaks).
 *   2. breakLines() picks the breaks. Tolerance passes loosen until a
 *      solution is found, as in TeX.
 *   3. The paragraph gets explicit line breaks (with a hyphen where a word
 *      is split) and each line its own word spacing, so each fills the width.
 *   4. If the browser then lays it out in a different number of lines than
 *      planned, the original paragraph is put back.
 *
 * Pictures: this runs on the page laid out for the screen, at the column's
 * width, but printing can move a floated picture to the next page when it
 * doesn't fit at the bottom of this one. So lines next to a picture can't be
 * planned reliably. Paragraphs beside a picture are set ragged right instead
 * (narrow lines justified get wide gaps anyway), and paragraphs a picture
 * could move beside when printed (up to the picture's own height below it)
 * keep the browser's justification.
 *
 * Skipped, keeping the browser's justification: paragraphs with nested
 * blocks, tables or line breaks, right-to-left text, and scripts written
 * without spaces between words.
 *
 * Evaluates to a summary: how many paragraphs were re-broken, put back,
 * set ragged, or skipped, and how long it took.
 */
export const JUSTIFY_PARAGRAPHS = `(() => {
  const started = performance.now();
  const breakLines = ${breakLines.toString()};
  const FORCED = ${-INFINITE_PENALTY};
  const HYPHEN_PENALTY = 50;
  const PASSES = [1.5, 3, 10000];
  const NO_SPACES = /^(zh|ja|ko|th|lo|km|my|bo)(-|$)/i;
  const report = { justified: 0, restored: 0, ragged: 0, nearPicture: 0, skipped: 0, ms: 0 };

  const ctx = document.createElement("canvas").getContext("2d");
  const widths = new Map();
  const measure = (font, text) => {
    const key = font + "|" + text;
    let w = widths.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(text).width;
      widths.set(key, w);
    }
    return w;
  };
  const fontOf = (el) => {
    const s = getComputedStyle(el);
    return [s.fontStyle, s.fontVariantCaps === "small-caps" ? "small-caps" : "", s.fontWeight, s.fontSize, s.fontFamily]
      .filter(Boolean).join(" ");
  };
  const px = (v) => parseFloat(v) || 0;

  // Floated pictures and boxes, with their margins: lines beside them are
  // shorter. Which elements float is fixed; where they are is read afresh for
  // each paragraph, as re-breaking the ones before can move them.
  const floating = [...document.querySelectorAll("figure, div.thumb, table, div")]
    .filter((el) => getComputedStyle(el).float !== "none" && el.getClientRects().length);
  const floatBoxes = () => floating
    .map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { side: s.float, top: r.top - px(s.marginTop), bottom: r.bottom + px(s.marginBottom),
        left: r.left - px(s.marginLeft), right: r.right + px(s.marginRight) };
    });

  // 1. Which paragraphs, and their words.
  const blocks = [...document.querySelectorAll("p, li, dd")].filter((el) => {
    const s = getComputedStyle(el);
    if (s.textAlign !== "justify" || s.direction !== "ltr" || !el.getClientRects().length) return false;
    if (el.closest("table, figure, .gallery, .references, .refbegin, .infobox, .booklet-cover, .booklet-colophon, .booklet-contents")) return false;
    const lang = el.closest("[lang]")?.getAttribute("lang") || "en";
    if (NO_SPACES.test(lang)) return false;
    if (el.querySelector("br, p, div, ul, ol, dl, table, figure, li, blockquote, pre")) return false;
    return el.textContent.trim().length > 0;
  });

  // Tokens: words, spaces and atoms (inline pictures and boxes), in order.
  const tokenize = (block) => {
    const tokens = [];
    const visit = (node) => {
      if (node.nodeType === 3) {
        const font = fontOf(node.parentElement);
        for (const m of node.data.matchAll(/(\\s+)|(\\S+)/g)) {
          const start = m.index, end = start + m[0].length;
          if (m[1]) {
            const last = tokens[tokens.length - 1];
            if (last && last.kind === "space") last.ranges.push({ node, start, end });
            else tokens.push({ kind: "space", font, ranges: [{ node, start, end }] });
          } else {
            tokens.push({ kind: "word", font, node, start, end, text: m[0] });
          }
        }
        return;
      }
      if (node.nodeType !== 1) return;
      const s = getComputedStyle(node);
      if (s.display === "none" || s.position === "absolute" || s.position === "fixed") return;
      if (node !== block && (s.display !== "inline" || /^(IMG|SVG|MATH|VIDEO|CANVAS|INPUT)$/i.test(node.tagName))) {
        tokens.push({ kind: "atom", el: node, width: node.getBoundingClientRect().width });
        return;
      }
      for (const child of node.childNodes) visit(child);
    };
    visit(block);
    return tokens;
  };

  const work = blocks.map((block) => ({ block, tokens: tokenize(block), lang: block.closest("[lang]")?.getAttribute("lang") || "en" }));

  // Hyphenation points, from Chrome's own rules for each language: lay every
  // word out in a box of no width, with hyphens: auto, and see where it breaks.
  const LETTERS = /\\p{L}+(?:['’]\\p{L}+)*/gu;
  const points = new Map();
  const byLang = new Map();
  for (const { tokens, lang } of work) {
    for (const t of tokens) {
      if (t.kind !== "word") continue;
      // Each run of letters, so the parts of "well-known" are hyphenated too.
      for (const m of t.text.matchAll(LETTERS)) {
        if (m[0].length < 5) continue;
        if (!byLang.has(lang)) byLang.set(lang, new Map());
        byLang.get(lang).set(lang + "|" + m[0], { word: m[0], font: t.font });
      }
    }
  }
  for (const [lang, words] of byLang) {
    const box = document.createElement("div");
    box.lang = lang;
    box.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden;hyphens:auto;-webkit-hyphens:auto;text-align:left;white-space:normal";
    const cells = [];
    for (const [key, { word, font }] of words) {
      const cell = document.createElement("div");
      cell.style.cssText = "width:0;font:" + font.replace(/;/g, "");
      cell.textContent = word;
      box.append(cell);
      cells.push([key, cell]);
    }
    document.body.append(box);
    const range = document.createRange();
    for (const [key, cell] of cells) {
      const text = cell.firstChild;
      const cuts = [];
      let top = null;
      for (let i = 0; i < text.length; i++) {
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        const r = range.getClientRects();
        const y = r.length ? Math.round(r[r.length - 1].top) : top;
        if (top !== null && y !== top) cuts.push(i);
        top = y;
      }
      points.set(key, cuts);
    }
    box.remove();
  }

  // 2. Items for the line breaker.
  const itemsFor = ({ tokens, lang }) => {
    const items = [];
    let seenBox = false;
    for (const t of tokens) {
      if (t.kind === "space") {
        if (!seenBox) continue;
        const w = measure(t.font, " ");
        items.push({ type: "glue", width: w, stretch: w / 2, shrink: w / 3, token: t });
      } else if (t.kind === "atom") {
        items.push({ type: "box", width: t.width, token: t });
        seenBox = true;
      } else {
        // A word: split at its hyphenation points and after any hyphens or dashes in it.
        const cuts = new Map();
        for (const m of t.text.matchAll(LETTERS)) {
          for (const c of points.get(lang + "|" + m[0]) || []) cuts.set(m.index + c, "auto");
        }
        for (const m of t.text.matchAll(/[-‐–—]/g)) if (m.index + 1 < t.text.length && m.index > 0) cuts.set(m.index + 1, "hard");
        const offsets = [...cuts.keys()].sort((a, b) => a - b);
        let from = 0;
        for (const at of [...offsets, t.text.length]) {
          if (at <= from) continue;
          items.push({ type: "box", width: measure(t.font, t.text.slice(from, at)), token: t, from, to: at });
          if (at < t.text.length) {
            const kind = cuts.get(at);
            items.push({ type: "penalty", width: kind === "auto" ? measure(t.font, "-") : 0, penalty: HYPHEN_PENALTY,
              flagged: true, token: t, at, kind });
          }
          from = at;
        }
        seenBox = true;
      }
    }
    while (items.length && items[items.length - 1].type !== "box") items.pop();
    items.push({ type: "glue", width: 0, stretch: 1e6, shrink: 0 });
    items.push({ type: "penalty", width: 0, penalty: FORCED, flagged: true });
    return items;
  };

  // Lines in these paragraphs are all one height (footnote markers don't add
  // any), so the paragraph's height says how many there are.
  const lineCount = (block, lh) => {
    const s = getComputedStyle(block);
    const h = block.getBoundingClientRect().height - px(s.paddingTop) - px(s.paddingBottom)
      - px(s.borderTopWidth) - px(s.borderBottomWidth);
    return Math.round(h / lh);
  };

  for (const job of work) {
    const { block } = job;
    const s = getComputedStyle(block);
    const lh = px(s.lineHeight);
    if (!lh) { report.skipped++; continue; }
    const r = block.getBoundingClientRect();
    const left = r.left + px(s.paddingLeft) + px(s.borderLeftWidth);
    const right = r.right - px(s.paddingRight) - px(s.borderRightWidth);
    const top = r.top + px(s.paddingTop) + px(s.borderTopWidth);
    const indent = px(s.textIndent);
    const floats = floatBoxes().filter((f) => f.left < right && f.right > left);
    if (floats.some((f) => f.top < r.bottom && f.bottom > r.top)) {
      block.style.textAlign = "left";
      report.ragged++;
      continue;
    }
    if (floats.some((f) => f.top < r.bottom && f.bottom + (f.bottom - f.top) > r.top)) {
      report.nearPicture++;
      continue;
    }
    // Every line has the column's full width (less 1px, so rounding can't push a word over).
    const lineWidth = (k) => right - left - (k === 0 ? indent : 0) - 1;

    const items = itemsFor(job);
    if (items.length < 4) { report.skipped++; continue; }
    let breaks = null;
    for (const tolerance of PASSES) {
      breaks = breakLines(items, lineWidth, { tolerance });
      if (breaks) break;
    }
    if (!breaks) { report.restored++; continue; }
    if (breaks.length < 2) { report.skipped++; continue; }

    // Each line's adjustment ratio, as breakLines() computed it.
    const ratioOf = [];
    let start = 0;
    breaks.forEach((b, line) => {
      let natural = 0, stretch = 0, shrink = 0;
      for (let i = start; i < b; i++) {
        const it = items[i];
        if (it.type === "penalty") continue;
        natural += it.width;
        if (it.type === "glue") { stretch += it.stretch; shrink += it.shrink; }
      }
      if (items[b].type === "penalty") natural += items[b].width;
      const L = lineWidth(line);
      ratioOf.push(line === breaks.length - 1 ? 0
        : natural <= L ? (stretch ? (L - natural) / stretch : 0) : (shrink ? (L - natural) / shrink : 0));
      start = b + 1;
      while (start < items.length && items[start].type !== "box") start++;
    });

    // 3. Rewrite the text: each text node into pieces by line, with line breaks.
    const original = block.cloneNode(true);
    const pieces = new Map(); // node -> [{ text, line } | { br: true }]
    const add = (node, piece) => {
      if (!pieces.has(node)) pieces.set(node, []);
      const list = pieces.get(node);
      const last = list[list.length - 1];
      if (piece.text !== undefined && last && last.text !== undefined && last.line === piece.line) last.text += piece.text;
      else list.push(piece);
    };
    const breakSet = new Set(breaks);
    let line = 0;
    const covered = new Map(); // node -> next uncovered offset
    const keepUpTo = (node, offset, l) => {
      const from = covered.get(node) || 0;
      if (offset > from) add(node, { text: node.data.slice(from, offset), line: l });
      covered.set(node, Math.max(from, offset));
    };
    items.forEach((it, i) => {
      const t = it.token;
      const isBreak = breakSet.has(i);
      if (t && t.kind === "word" && it.type === "box") {
        keepUpTo(t.node, t.start + it.to, line);
      } else if (t && t.kind === "word" && it.type === "penalty" && isBreak) {
        keepUpTo(t.node, t.start + it.at, line);
        if (it.kind === "auto") add(t.node, { text: "-", line });
        add(t.node, { br: true });
      } else if (t && t.kind === "space") {
        for (const rg of t.ranges) {
          keepUpTo(rg.node, rg.start, line);
          if (isBreak) covered.set(rg.node, rg.end);
          else keepUpTo(rg.node, rg.end, line);
        }
        if (isBreak) add(t.ranges[0].node, { br: true });
      } else if (t && t.kind === "atom" && isBreak) {
        // never: breaks are only at spaces and penalties
      }
      if (isBreak) line++;
    });
    // Text not covered by items (leading or trailing spaces) stays as it is.
    for (const node of pieces.keys()) keepUpTo(node, node.data.length, Math.min(line, breaks.length - 1));

    const spacing = (font, l) => {
      const rr = ratioOf[l] || 0;
      const w = measure(font, " ");
      return rr >= 0 ? rr * w / 2 : rr * w / 3;
    };
    for (const [node, list] of pieces) {
      const font = fontOf(node.parentElement);
      const fragment = document.createDocumentFragment();
      for (const p of list) {
        if (p.br) { fragment.append(document.createElement("br")); continue; }
        if (!p.text) continue;
        const ws = spacing(font, p.line);
        if (Math.abs(ws) < 0.01) { fragment.append(p.text); continue; }
        const span = document.createElement("span");
        span.style.wordSpacing = ws.toFixed(3) + "px";
        span.textContent = p.text;
        fragment.append(span);
      }
      node.replaceWith(fragment);
    }
    block.style.textAlign = "left";
    block.style.hyphens = "manual";
    block.style.textWrap = "wrap";

    // 4. Did it come out as planned?
    if (lineCount(block, lh) !== breaks.length) {
      block.replaceWith(original);
      job.block = original;
      report.restored++;
      continue;
    }
    report.justified++;
  }

  report.ms = Math.round(performance.now() - started);
  return report;
})()`;
