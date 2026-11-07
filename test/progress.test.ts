import { describe, expect, test } from "bun:test";
import { readBookletStream, type StreamUpdate } from "../src/app/booklet-stream";
import { describe as describeStage, formatElapsed, percent } from "../src/app/progress";

const enc = new TextEncoder();

/** A response whose body arrives in the given chunks. */
function streamed(...chunks: (string | Uint8Array)[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(typeof c === "string" ? enc.encode(c) : c);
        controller.close();
      },
    }),
  );
}

describe("readBookletStream", () => {
  test("reads events, then exactly the PDF bytes, across awkward chunk boundaries", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70, 10, 0, 255, 10, 1, 2]); // includes newline bytes
    const header = '{"stage":"pdf","bytes":10,"title":"Moon"}\n';
    const events: StreamUpdate[] = [];
    const result = await readBookletStream(
      streamed(
        '{"stage":"fetching"}\n{"stage":"load',
        'ing","done":1,"total":3}\n',
        new Uint8Array([...enc.encode(header), ...pdf.subarray(0, 4)]),
        pdf.subarray(4),
      ),
      (u) => events.push(u),
    );
    expect(result.title).toBe("Moon");
    expect([...result.pdf]).toEqual([...pdf]);
    expect(events[0]).toEqual({ stage: "fetching" });
    expect(events[1]).toEqual({ stage: "loading", done: 1, total: 3 });
    expect(events.at(-1)).toEqual({ stage: "downloading", received: 10, total: 10 });
  });

  test("an error event becomes an Error with its message", async () => {
    const res = streamed('{"stage":"fetching"}\n{"stage":"error","message":"That article doesn\'t exist."}\n');
    expect(readBookletStream(res, () => {})).rejects.toThrow("That article doesn't exist.");
  });

  test("a stream that ends early is an error", async () => {
    const res = streamed('{"stage":"pdf","bytes":10,"title":"Moon"}\n', new Uint8Array([1, 2, 3]));
    expect(readBookletStream(res, () => {})).rejects.toThrow("connection dropped");
  });
});

describe("progress", () => {
  test("counting stages fill their share exactly", () => {
    expect(percent({ stage: "loading", since: 0, done: 0, total: 10 }, 0)).toBe(18);
    expect(percent({ stage: "loading", since: 0, done: 5, total: 10 }, 0)).toBe(31.5);
    expect(percent({ stage: "downloading", since: 0, done: 10, total: 10 }, 0)).toBe(95);
  });

  test("other stages creep towards the end of their share but never reach it", () => {
    const early = percent({ stage: "launching", since: 0 }, 1000);
    const late = percent({ stage: "launching", since: 0 }, 60_000);
    expect(early).toBeGreaterThan(10);
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(18);
  });

  test("later print passes come after the first", () => {
    const first = percent({ stage: "printing", since: 0, pass: 1 }, 60_000);
    const second = percent({ stage: "printing", since: 0, pass: 2 }, 0);
    expect(second).toBeGreaterThanOrEqual(first);
    expect(percent({ stage: "printing", since: 0, pass: 3 }, 60_000)).toBeLessThanOrEqual(85);
  });

  test("labels and timers", () => {
    expect(describeStage({ stage: "loading", since: 0, done: 4, total: 12 })).toBe("Loading images (4 of 12)");
    expect(describeStage({ stage: "printing", since: 0, pass: 2 })).toBe("Printing, adding page numbers");
    expect(formatElapsed(7_400)).toBe("7s");
    expect(formatElapsed(65_000)).toBe("1:05");
  });
});
