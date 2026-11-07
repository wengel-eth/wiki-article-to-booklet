import { describe, expect, test } from "bun:test";
import { articleUrl, parseArticleUrl } from "../src/shared/article-url";

describe("parseArticleUrl", () => {
  test.each([
    ["https://en.wikipedia.org/wiki/Ada_Lovelace", "en", "Ada Lovelace"],
    ["https://en.wikipedia.org/wiki/AC/DC", "en", "AC/DC"],
    ["https://fr.m.wikipedia.org/wiki/Montr%C3%A9al#Histoire", "fr", "Montréal"],
    ["https://en.wikipedia.org/w/index.php?title=Ada_Lovelace&oldid=1", "en", "Ada Lovelace"],
    ["  http://de.wikipedia.org/wiki/Berlin?foo=bar  ", "de", "Berlin"],
    ["https://simple.wikipedia.org/wiki/Moon", "simple", "Moon"],
    ["https://zh-yue.wikipedia.org/wiki/香港", "zh-yue", "香港"],
    ["https://en.wikipedia.org/wiki/100%25_(album)", "en", "100% (album)"],
  ])("%s", (input, lang, title) => {
    expect(parseArticleUrl(input)).toEqual({ lang, title });
  });

  test.each([
    "",
    "not a url",
    "ftp://en.wikipedia.org/wiki/Moon",
    "https://en.wikipedia.org.evil.com/wiki/Moon",
    "https://evil.com/en.wikipedia.org/wiki/Moon",
    "https://www.wikipedia.org/wiki/Moon",
    "https://en.wikipedia.org/",
    "https://en.wikipedia.org/wiki/",
    "https://en.wikipedia.org/wiki/Special:Random",
    "https://en.wikipedia.org/wiki/File:Moon.jpg",
    "https://en.wikipedia.org/wiki/Talk:Moon",
    "https://en.wikipedia.org:8443/wiki/Moon",
    "https://user:pw@en.wikipedia.org/wiki/Moon",
    "https://en.wiktionary.org/wiki/moon",
    "https://en.wikipedia.org/wiki/%E0%A4%A",
  ])("rejects %p", (input) => {
    expect(parseArticleUrl(input)).toBeNull();
  });
});

test("articleUrl keeps slashes and colons readable", () => {
  expect(articleUrl({ lang: "en", title: "AC/DC" })).toBe("https://en.wikipedia.org/wiki/AC/DC");
  expect(articleUrl({ lang: "en", title: "Star Wars: Andor" })).toBe(
    "https://en.wikipedia.org/wiki/Star_Wars:_Andor",
  );
});
