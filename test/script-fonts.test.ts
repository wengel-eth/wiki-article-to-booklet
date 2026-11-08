import { expect, test } from "bun:test";
import { extraCharacters, extraFontUrl, fontStack, ownSlicesOnly, SCRIPT_FONTS_URL } from "../src/worker/script-fonts";

const face = (family: string, range: string, comment = "") =>
  `${comment ? `/* ${comment} */\n` : ""}@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/x/${family.replace(/ /g, "")}-${range.length}.woff2) format('woff2');
  unicode-range: ${range};
}
`;

test("script fonts keep only the slices for their own script", () => {
  const css = [
    face("Noto Sans Mongolian", "U+1800-18AF, U+202F", "mongolian"),
    face("Noto Sans Mongolian", "U+0000-00FF, U+0131, U+2000-206F", "latin"),
    face("Noto Sans Mongolian", "U+207C-2083, U+2194, U+2200", "[90]"),
    face("Noto Serif", "U+0000-00FF, U+2000-206F", "latin"),
    face("Noto Sans Symbols 2", "U+2190-21FF", "symbols"),
    face("Noto Serif SC", "U+4E00-4E3F", "[0]"),
    face("Noto Serif SC", "U+0020-007E", "[119]"),
  ].join("");
  const out = ownSlicesOnly(css);
  expect(out).toContain("U+1800-18AF"); // Mongolian script itself
  expect(out).not.toContain("U+0000-00FF, U+0131"); // Mongolian font's Latin slice
  expect(out).not.toContain("U+207C-2083"); // Mongolian font's symbol slice
  expect(out).toContain("font-family: 'Noto Serif'"); // the general fallback keeps all
  expect(out).toContain("U+2190-21FF"); // symbol fonts keep their symbols
  expect(out).toContain("U+4E00-4E3F"); // Han characters
  expect(out).not.toContain("U+0020-007E"); // CJK font's Latin slice
});

test("a slice mixing a script with shared characters keeps only the script", () => {
  const out = ownSlicesOnly(face("Noto Sans Cherokee", "U+0300-0302, U+0304, U+13A0-13FF, U+AB70-ABBF"));
  expect(out).toContain("unicode-range: U+13A0-13FF, U+AB70-ABBF;");
  const split = ownSlicesOnly(face("Noto Serif Myanmar", "U+0000-00FF, U+1000-109F, U+2000-2C10"));
  expect(split).toContain("unicode-range: U+1000-109F, U+2C00-2C10;");
});

test("unreadable ranges are left alone", () => {
  const css = face("Noto Sans Yi", "U+A000-A48F, garbage");
  expect(ownSlicesOnly(css)).toBe(css);
});

test("the stack puts Literata first and every requested family is listed", () => {
  const stack = fontStack();
  expect(stack.startsWith('"Literata", "Noto Serif Extra", "Noto Serif", "Noto Serif SC"')).toBe(true);
  for (const family of decodeURIComponent(SCRIPT_FONTS_URL).match(/family=([^&]+)/g)!) {
    expect(stack).toContain(`"${family.slice(7).replace(/\+/g, " ")}"`);
  }
});

test("characters Literata lacks are collected for one Noto Serif file, with any accented letters", () => {
  // IPA from a pronunciation: ɐ and ɹ are missing from Literata; ɹ̩ carries a mark.
  const chars = extraCharacters("Cantonese [tsi˥.kɐm˥.sɪŋ˩], Mandarin [tsɹ̩] and plain café, 紫禁城");
  for (const c of ["ɐ", "ɹ", "̩", "˥", "˩", "ɪ"]) expect(chars).toContain(c);
  for (const c of ["é", "a", "紫"]) expect(chars).not.toContain(c); // Literata has é; Han is the CJK fonts' job
  expect(extraCharacters("Plain English text.")).toBe("");
  expect(extraFontUrl("ɐɹ")).toContain("text=%C9%90%C9%B9");
});
