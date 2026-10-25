import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const stylesheetPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/app/globals.css",
);
const css = readFileSync(stylesheetPath, "utf8");

/** Returns the declaration block for a single selector, or null. */
function rule(selector) {
  const index = css.indexOf(`\n${selector} {`);
  if (index === -1) return null;
  const start = css.indexOf("{", index);
  const end = css.indexOf("}", start);
  return css.slice(start + 1, end);
}

function declarations(selector) {
  const block = rule(selector);
  assert.ok(block !== null, `expected a ${selector} rule in globals.css`);
  const map = new Map();
  for (const line of block.split(";")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    map.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return map;
}

/** Standalone text controls must keep a 24px minimum hit area (WCAG 2.5.8). */
const TEXT_CONTROL_SELECTORS = [
  ".text-link",
  ".insight-teaser-footer button",
  ".sidebar-tip button",
  ".app-footer button",
];

test("visually hidden labels cannot widen the document", () => {
  const srOnly = declarations(".sr-only");
  assert.equal(srOnly.get("position"), "absolute");
  assert.equal(srOnly.get("left"), "0", "an unanchored absolute box escapes its scroll container");
  assert.equal(srOnly.get("overflow"), "hidden");
  assert.equal(srOnly.get("clip-path"), "inset(50%)");

  const scroll = declarations(".table-scroll");
  assert.equal(scroll.get("overflow-x"), "auto");
  assert.equal(scroll.get("position"), "relative", "the scroller must clip absolute descendants");
});

test("standalone text controls declare a 24px minimum hit area", () => {
  for (const selector of TEXT_CONTROL_SELECTORS) {
    const block = declarations(selector);
    const minHeight = Number.parseFloat(block.get("min-height") ?? "");
    assert.ok(
      minHeight >= 24,
      `${selector} needs min-height >= 24px, found ${block.get("min-height") ?? "none"}`,
    );
  }
});

test("focus scrolling keeps controls clear of the sticky top bar (WCAG 2.4.11)", () => {
  const topbar = Number.parseFloat(declarations(".topbar").get("min-height") ?? "");
  const padding = Number.parseFloat(declarations("html").get("scroll-padding-top") ?? "");
  assert.equal(declarations(".topbar").get("position"), "sticky");
  assert.ok(
    padding > topbar,
    `html scroll-padding-top (${padding}px) must exceed the ${topbar}px sticky top bar`,
  );
});

test("the stylesheet keeps a single skip link and reduced-motion guard", () => {
  assert.ok(css.includes(".skip-link:focus"), "keyboard users need a visible skip link");
  assert.ok(
    css.includes("@media (prefers-reduced-motion: reduce)"),
    "reduced-motion users need the animation guard",
  );
});
