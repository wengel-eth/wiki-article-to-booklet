/*
 * Making tables fit the booklet page. Runs in the rendering browser, with the
 * viewport set to the width of the text column so measurements match print.
 *
 * For each article table (not infoboxes):
 *   1. Leading rows made only of header cells move into <thead>, so Chrome
 *      repeats them at the top of every page the table runs onto.
 *   2. If the table doesn't fit the column at a comfortable width, it is
 *      shrunk, down to MIN_SCALE.
 *   3. If it would need to shrink further, it goes on a page of its own,
 *      turned sideways, where the page height is the available width. Tables
 *      too long for one sideways page are split across several, each with
 *      the header rows repeated.
 */

/** The smallest a table is shrunk to: about 5pt type. */
const MIN_SCALE = 0.7;

/** How much wider than its narrowest possible layout a table should be, to look comfortable. */
const COMFORT = 1.3;

/**
 * Sideways pages pay off for tables that are wide from many short columns.
 * A text-heavy table would fit only a row or two per turned page; below this
 * many rows per page it is shrunk instead, as far as FALLBACK_SCALE, with
 * long words allowed to wrap.
 */
const MIN_SIDEWAYS_ROWS = 4;
const FALLBACK_SCALE = 0.55;

export interface TableLayout {
  /** Width of the text column, in CSS px. */
  columnPx: number;
  /** Height of the text area on a page, in CSS px. */
  pageHeightPx: number;
}

export const TABLE_CSS = `
table.bk-measure-min { width: min-content !important; max-width: none !important; zoom: 1 !important; }
table.bk-measure-max { width: max-content !important; max-width: none !important; zoom: 1 !important; }
:is(table.bk-measure-min, table.bk-measure-max, table.bk-shrunk, .bk-sideways table) :is(th, td) {
  overflow-wrap: normal;
  hyphens: manual;
}
table.bk-shrunk, .bk-sideways table { max-width: none; }
table.bk-squeezed :is(th, td) { overflow-wrap: anywhere; hyphens: auto; }
.bk-sideways {
  break-before: page;
  break-after: page;
  position: relative;
  clear: both;
  /* Without this, a sliver of the turned table shows on the page before. */
  overflow: hidden;
}
.bk-sideways-inner {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.bk-sideways-inner table { margin: 0; }
.bk-staging { position: absolute; top: 0; left: -100000px; visibility: hidden; }
`;

/** Script for page.evaluate(). Evaluates to a short report of what it did. */
export function fitTables(layout: TableLayout): string {
  return `((layout, MIN_SCALE, COMFORT) => {
  const { columnPx, pageHeightPx } = layout;
  const report = { fits: 0, shrunk: 0, sideways: 0, pages: 0, headers: 0 };

  const tables = [...document.querySelectorAll("table")].filter(
    (t) => !t.matches(".infobox, .vcard, .sidebar, .metadata") && !t.parentElement.closest("table, .booklet-contents"),
  );

  // 1. Header rows into <thead>.
  for (const table of tables) {
    const body = table.tBodies[0];
    if (table.tHead || !body) continue;
    const head = [];
    for (const row of body.rows) {
      if (row.cells.length && [...row.cells].every((c) => c.tagName === "TH")) head.push(row);
      else break;
    }
    if (head.length && head.length < body.rows.length) {
      const thead = table.createTHead();
      head.forEach((row) => thead.append(row));
      report.headers++;
    }
  }

  const measure = (table, cls) => {
    table.classList.add(cls);
    const width = table.getBoundingClientRect().width;
    table.classList.remove(cls);
    return width;
  };

  const staging = document.createElement("div");
  staging.className = "bk-staging";
  staging.style.width = pageHeightPx + "px";
  document.body.append(staging);

  for (const table of tables) {
    if (!table.isConnected || table.getClientRects().length === 0) continue;
    const min = measure(table, "bk-measure-min");
    const max = measure(table, "bk-measure-max");
    const comfortable = Math.min(max, min * COMFORT);
    if (comfortable <= columnPx) { report.fits++; continue; }

    // 2. Shrink to fit.
    let scale = columnPx / comfortable;
    if (scale < MIN_SCALE) scale = columnPx / min;
    if (scale >= MIN_SCALE) {
      table.style.zoom = String(scale);
      table.classList.add("bk-shrunk");
      report.shrunk++;
      continue;
    }

    // 3. Sideways, on pages of its own. Across the turned page there is
    // pageHeightPx of width, and down it columnPx of height.
    const sideScale = Math.max(MIN_SCALE, Math.min(1, pageHeightPx / Math.min(max, min * COMFORT)));

    // Would it fit enough rows per turned page? Lay a copy out to find out.
    const probe = table.cloneNode(true);
    probe.style.zoom = String(sideScale);
    staging.append(probe);
    const sidewaysPages = probe.getBoundingClientRect().height / columnPx;
    probe.remove();
    const rowCount = table.rows.length;
    if (rowCount / Math.max(1, sidewaysPages) < ${MIN_SIDEWAYS_ROWS}) {
      table.style.zoom = String(Math.max(${FALLBACK_SCALE}, columnPx / min));
      table.classList.add("bk-shrunk", "bk-squeezed");
      report.shrunk++;
      continue;
    }

    const placeholder = document.createComment("sideways table");
    table.replaceWith(placeholder);
    table.style.zoom = String(sideScale);

    // Split the rows into pieces that each fit one sideways page.
    const pieces = [];
    const thead = table.tHead;
    const rows = [...table.tBodies].flatMap((b) => [...b.rows]);
    const start = () => {
      const piece = table.cloneNode(false);
      piece.style.zoom = String(sideScale);
      if (thead) piece.append(thead.cloneNode(true));
      piece.append(document.createElement("tbody"));
      staging.append(piece);
      pieces.push(piece);
      return piece;
    };
    let piece = start();
    for (const row of rows) {
      piece.tBodies[0].append(row);
      if (piece.getBoundingClientRect().height > columnPx && piece.tBodies[0].rows.length > 1) {
        row.remove();
        piece = start();
        piece.tBodies[0].append(row);
      }
    }
    if (table.caption) pieces[0].prepend(table.caption);

    const pages = pieces.map((p) => {
      const page = document.createElement("div");
      page.className = "bk-sideways";
      page.style.height = pageHeightPx + "px";
      const inner = document.createElement("div");
      inner.className = "bk-sideways-inner";
      inner.style.width = pageHeightPx + "px";
      // Turn a quarter anticlockwise: the table's top ends up on the left
      // edge, so the reader turns the booklet clockwise to read it.
      inner.style.transform = "translateY(" + pageHeightPx + "px) rotate(-90deg)";
      inner.append(p);
      page.append(inner);
      return page;
    });
    placeholder.replaceWith(...pages);
    report.sideways++;
    report.pages += pages.length;
  }

  staging.remove();
  return report;
})(${JSON.stringify(layout)}, ${MIN_SCALE}, ${COMFORT})`;
}
