import type { ServerEvent } from "../shared/progress";

/** Something the Worker reported along the way, or the PDF arriving. */
export type StreamUpdate =
  | Exclude<ServerEvent, { stage: "pdf" } | { stage: "error" }>
  | { stage: "downloading"; received: number; total: number };

export interface StreamResult {
  title: string;
  pdf: Uint8Array;
}

/**
 * Reads a /api/booklet response: newline-terminated JSON events, then a "pdf"
 * event and that many bytes of PDF (see src/shared/progress.ts).
 */
export async function readBookletStream(res: Response, onUpdate: (u: StreamUpdate) => void): Promise<StreamResult> {
  if (!res.body) throw new Error("The server sent an empty response.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let pending: Uint8Array = new Uint8Array(0); // bytes not yet parsed as events
  let pdf: Uint8Array | null = null;
  let title = "";
  let received = 0;

  const take = (chunk: Uint8Array) => {
    if (pdf) {
      const n = Math.min(chunk.length, pdf.length - received);
      pdf.set(chunk.subarray(0, n), received);
      received += n;
      onUpdate({ stage: "downloading", received, total: pdf.length });
      return;
    }
    pending = concat(pending, chunk);
    let newline: number;
    while (!pdf && (newline = pending.indexOf(10)) !== -1) {
      const line = decoder.decode(pending.subarray(0, newline)).trim();
      pending = pending.subarray(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as ServerEvent;
      if (event.stage === "error") throw new Error(event.message);
      if (event.stage === "pdf") {
        pdf = new Uint8Array(event.bytes);
        title = event.title;
        const rest = pending;
        pending = new Uint8Array(0);
        onUpdate({ stage: "downloading", received: 0, total: event.bytes });
        if (rest.length) take(rest);
      } else {
        onUpdate(event);
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    take(value);
  }

  // TypeScript can't see that take() sets pdf.
  const result = pdf as Uint8Array | null;
  if (!result || received < result.length) {
    throw new Error("The connection dropped before the booklet arrived. Try again.");
  }
  return { title, pdf: result };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
