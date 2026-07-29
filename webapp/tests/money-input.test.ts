import test from "node:test";
import assert from "node:assert/strict";
import { parseAmount } from "../src/components/MoneyInput";

/**
 * Pasting "31,500" from the school WhatsApp group used to become 0 and render
 * the field empty — indistinguishable from never having typed it.
 */
test("amounts pasted with separators are understood", () => {
  assert.equal(parseAmount("31,500"), 31500);
  assert.equal(parseAmount("31 500"), 31500);
  assert.equal(parseAmount("₹31,500"), 31500);
  assert.equal(parseAmount("12.50"), 12.5);
  assert.equal(parseAmount(""), 0);
});

test("genuinely unparseable text is reported, never silently zeroed", () => {
  for (const bad of ["abc", "-5", "1e5", "12..5"]) {
    assert.equal(parseAmount(bad), null, `${bad} should be null, not 0`);
  }
});
