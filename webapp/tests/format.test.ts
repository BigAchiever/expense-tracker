import test from "node:test";
import assert from "node:assert/strict";
import { isValidISODate, isValidISOMonth, shiftDays } from "../src/lib/format";

/**
 * `/?date=2026-02-31` used to pass a shape-only regex, reach Postgres, and
 * crash the whole page with "date/time field value out of range".
 */
test("impossible dates are rejected, real ones accepted", () => {
  for (const bad of ["2026-02-31", "2026-00-00", "2026-13-01", "2026-07-32", "not-a-date", ""]) {
    assert.equal(isValidISODate(bad), false, `${bad} should be rejected`);
  }
  for (const good of ["2026-07-28", "2024-02-29", "2025-12-01"]) {
    assert.equal(isValidISODate(good), true, `${good} should be accepted`);
  }
  assert.equal(isValidISODate("2026-02-29"), false, "2026 is not a leap year");
});

test("month params are calendar-checked too", () => {
  assert.equal(isValidISOMonth("2026-13"), false);
  assert.equal(isValidISOMonth("2026-00"), false);
  assert.equal(isValidISOMonth("2026-07"), true);
});

test("shiftDays crosses month and year boundaries", () => {
  assert.equal(shiftDays("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDays("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftDays("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDays("2026-12-31", 1), "2027-01-01");
});
