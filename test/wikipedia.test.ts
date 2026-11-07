import { afterEach, expect, test } from "bun:test";
import { wikiFetch } from "../src/worker/wikipedia";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answer(...responses: Response[]) {
  const calls: RequestInit[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    return responses.shift()!;
  }) as typeof fetch;
  return calls;
}

test("waits as long as Retry-After asks, then tries again", async () => {
  const calls = answer(new Response("slow down", { status: 429, headers: { "retry-after": "2" } }), new Response("ok"));
  const waits: number[] = [];
  const res = await wikiFetch("https://en.wikipedia.org/x", {}, async (ms) => void waits.push(ms));
  expect(await res.text()).toBe("ok");
  expect(waits).toEqual([2000]);
  expect((calls[0].headers as Record<string, string>)["user-agent"]).toContain("wiki-article-to-booklet");
});

test("gives up after two retries, or when asked to wait too long", async () => {
  answer(...Array.from({ length: 3 }, () => new Response("", { status: 429, headers: { "retry-after": "1" } })));
  expect((await wikiFetch("https://x", {}, async () => {})).status).toBe(429);

  answer(new Response("", { status: 429, headers: { "retry-after": "60" } }), new Response("ok"));
  expect((await wikiFetch("https://x", {}, async () => {})).status).toBe(429);
});
