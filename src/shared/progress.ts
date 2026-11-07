/*
 * Progress reporting for booklet generation.
 *
 * POST /api/booklet answers (once the request is valid) with a stream:
 * newline-terminated JSON events as the Worker goes, then a "pdf" event giving
 * the PDF's size in bytes, followed directly by exactly that many bytes of
 * PDF. A failure partway through is reported as an "error" event.
 */

export type ServerEvent =
  | { stage: "fetching" }
  | { stage: "preparing" }
  | { stage: "launching" }
  | { stage: "loading"; done: number; total: number }
  | { stage: "layout" }
  | { stage: "printing"; pass: number }
  | { stage: "pdf"; bytes: number; title: string }
  | { stage: "error"; message: string };

/** Stages the page goes through, including the ones that happen in the browser. */
export type Stage =
  | "sending"
  | "fetching"
  | "preparing"
  | "launching"
  | "loading"
  | "layout"
  | "printing"
  | "downloading"
  | "arranging"
  | "saving";

/**
 * Where each stage sits on the progress bar, in percent. Rough proportions of
 * the time each takes; loading images and printing dominate.
 */
export const STAGES: Record<Stage, { from: number; to: number; label: string }> = {
  sending: { from: 0, to: 2, label: "Sending" },
  fetching: { from: 2, to: 8, label: "Fetching the article" },
  preparing: { from: 8, to: 10, label: "Preparing the pages" },
  launching: { from: 10, to: 18, label: "Starting the print browser" },
  loading: { from: 18, to: 45, label: "Loading images" },
  layout: { from: 45, to: 50, label: "Laying out tables and contents" },
  printing: { from: 50, to: 85, label: "Printing" },
  downloading: { from: 85, to: 95, label: "Downloading" },
  arranging: { from: 95, to: 99, label: "Arranging pages for folding" },
  saving: { from: 99, to: 100, label: "Saving" },
};
