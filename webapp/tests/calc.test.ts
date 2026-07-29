import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDay,
  expensesByCategory,
  hasErrors,
  MAX_AMOUNT,
  sumPeriod,
  validateDay,
  withTotals,
} from "../src/lib/calc";
import type { DayInput } from "../src/lib/types";

const day = (over: Partial<DayInput> = {}): DayInput => ({
  offlineReceiving: 0,
  uoloReceiving: 0,
  principalReceiving: 0,
  onlineReceiving: 0,
  bankDeposit: 0,
  expenses: [],
  ...over,
});

// ---------------------------------------------------------------------------
// Rows lifted straight from "Expense Manager - Higher Secondary.xlsx".
//
// Cash is handed over at the end of every day, so each day stands alone and
// `cashInHand` must reproduce the sheet's column I exactly. If the arithmetic
// ever drifts from the workbook everyone already trusts, these fail.
// ---------------------------------------------------------------------------

test("matches the sheet: 1 Jul 2026", () => {
  const t = computeDay(
    day({
      offlineReceiving: 23500,
      uoloReceiving: 60200,
      onlineReceiving: 6450,
      bankDeposit: 35000,
      expenses: [
        { amount: 7750, reason: "belder", category: "labour", paidFrom: "cash" },
        { amount: 100, reason: "tea", category: "tea", paidFrom: "cash" },
      ],
    }),
  );
  assert.equal(t.totalReceiving, 83700);
  assert.equal(t.cashExpense, 7850);
  assert.equal(t.cashInHand, 34400); // sheet column I
});

test("matches the sheet: 17 Apr 2026, with a principal receipt", () => {
  const t = computeDay(
    day({
      offlineReceiving: 42340,
      principalReceiving: 11500,
      onlineReceiving: 15025,
      expenses: [{ amount: 8750, reason: "20 aunti, 130 tea, 8000 naved sir", category: "other", paidFrom: "cash" }],
    }),
  );
  assert.equal(t.totalReceiving, 53840);
  assert.equal(t.cashInHand, 30065);
});

test("matches the sheet: 18 Apr 2026 — a negative day is real, not an error", () => {
  const input = day({
    offlineReceiving: 54855,
    onlineReceiving: 7745,
    bankDeposit: 50000,
    expenses: [{ amount: 500, reason: "pani ka kantener", category: "supplies", paidFrom: "cash" }],
  });

  assert.equal(computeDay(input).cashInHand, -3390);

  // Money simply came from outside that day. Worth flagging, never blocking.
  const issues = validateDay(input);
  assert.equal(hasErrors(issues), false);
  assert.ok(issues.some((i) => i.level === "warning" && i.field === "cashInHand"));
});

test("matches the sheet: 25 Jul 2026 — ₹50,200 spent against ₹31,500 collected", () => {
  const input = day({
    offlineReceiving: 3000,
    uoloReceiving: 28500,
    onlineReceiving: 5000,
    expenses: [
      { amount: 50000, reason: "senting", category: "construction", paidFrom: "cash" },
      { amount: 200, reason: "prabha aunti", category: "salary", paidFrom: "cash" },
    ],
  });

  assert.equal(computeDay(input).cashInHand, -23700);
  // ₹23,700 had to be brought in. Allowed, and called out.
  assert.equal(hasErrors(validateDay(input)), false);
});

test("nothing carries between days — each day stands alone", () => {
  const spendBig = day({
    uoloReceiving: 1000,
    expenses: [{ amount: 5000, reason: "repair", category: "maintenance", paidFrom: "cash" }],
  });

  // Same input, same answer, regardless of what any other day looked like.
  assert.equal(computeDay(spendBig).cashInHand, -4000);
  const rows = withTotals([day({ uoloReceiving: 90000 }), spendBig]);
  assert.equal(rows[1].totals.cashInHand, -4000);
});

// ---------------------------------------------------------------------------
// Payment source — the column the old sheet did not have
// ---------------------------------------------------------------------------

test("only cash-paid expenses reduce the cash handed over", () => {
  const t = computeDay(
    day({
      uoloReceiving: 10000,
      expenses: [
        { amount: 1000, reason: "tea", category: "tea", paidFrom: "cash" },
        { amount: 5000, reason: "electricity", category: "utilities", paidFrom: "bank" },
        { amount: 2000, reason: "paid by Sir personally", category: "other", paidFrom: "external" },
      ],
    }),
  );

  assert.equal(t.totalExpense, 8000);
  assert.equal(t.cashExpense, 1000);
  assert.equal(t.bankExpense, 5000);
  assert.equal(t.externalExpense, 2000);
  assert.equal(t.cashInHand, 9000); // 10000 − 1000
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("6 Jan 2026: non-cash cannot exceed what was collected", () => {
  const issues = validateDay(day({ uoloReceiving: 3200, onlineReceiving: 4000 }));
  assert.ok(issues.some((i) => i.level === "error" && i.field === "onlineReceiving"));
});

test("an expense line with no reason is rejected", () => {
  const issues = validateDay(
    day({
      uoloReceiving: 5000,
      expenses: [{ amount: 500, reason: "  ", category: "other", paidFrom: "cash" }],
    }),
  );
  assert.ok(issues.some((i) => i.field === "expenses.0.reason"));
});

test("an expense line with no amount is rejected", () => {
  const issues = validateDay(
    day({ uoloReceiving: 5000, expenses: [{ amount: 0, reason: "tea", category: "tea", paidFrom: "cash" }] }),
  );
  assert.ok(issues.some((i) => i.field === "expenses.0.amount"));
});

test("an empty day must be marked as no-activity", () => {
  assert.equal(hasErrors(validateDay(day())), true);
  assert.equal(hasErrors(validateDay(day({ noActivity: true }))), false);
});

test("a no-activity day cannot also carry amounts", () => {
  assert.equal(hasErrors(validateDay(day({ noActivity: true, uoloReceiving: 100 }))), true);
});

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

test("period totals add up, including cash handed over", () => {
  const rows = withTotals([
    day({ uoloReceiving: 1000 }),
    day({ offlineReceiving: 2000, bankDeposit: 500 }),
    day({
      uoloReceiving: 500,
      expenses: [{ amount: 200, reason: "tea", category: "tea", paidFrom: "cash" }],
    }),
  ]);
  const t = sumPeriod(rows);

  assert.equal(t.totalReceiving, 3500);
  assert.equal(t.bankDeposit, 500);
  assert.equal(t.cashExpense, 200);
  assert.equal(t.cashInHand, 2800); // 1000 + 1500 + 300
  assert.equal(t.days, 3);
});

test("a negative day pulls the month's handed-over total down", () => {
  const rows = withTotals([
    day({ uoloReceiving: 10000 }),
    day({ expenses: [{ amount: 4000, reason: "repair", category: "maintenance", paidFrom: "cash" }] }),
  ]);
  assert.equal(sumPeriod(rows).cashInHand, 6000);
});

test("category breakdown splits by payment source", () => {
  const rows = expensesByCategory([
    day({
      expenses: [
        { amount: 300, reason: "chai", category: "tea", paidFrom: "cash" },
        { amount: 100, reason: "chai", category: "tea", paidFrom: "bank" },
        { amount: 9000, reason: "naved sir", category: "salary", paidFrom: "cash" },
      ],
    }),
  ]);

  assert.equal(rows[0].category, "salary"); // sorted by total, biggest first
  assert.equal(rows[0].total, 9000);
  assert.deepEqual(rows[1], { category: "tea", cash: 300, bank: 100, external: 0, total: 400 });
});

test("rounding stays at two decimals", () => {
  assert.equal(computeDay(day({ uoloReceiving: 0.1, offlineReceiving: 0.2 })).totalReceiving, 0.3);
});

// ---------------------------------------------------------------------------
// Regressions from the code review
// ---------------------------------------------------------------------------

test("a deposit typo is blamed on the deposit, not on spending", () => {
  // ₹6,000 collected, ₹60,000 typed as the deposit, nothing spent.
  const issues = validateDay(day({ uoloReceiving: 6000, bankDeposit: 60000 }));
  assert.ok(issues.some((i) => i.field === "bankDeposit"));
  const shortfall = issues.find((i) => i.field === "cashInHand");
  assert.ok(shortfall, "should still flag the shortfall");
  assert.ok(
    !shortfall!.en.includes("spending is"),
    "must not blame spending when the expense list is empty",
  );
  assert.ok(shortfall!.en.includes("nothing was spent in cash"));
});

test("a genuine overspend still says spending", () => {
  const issues = validateDay(
    day({
      uoloReceiving: 31500,
      expenses: [{ amount: 50000, reason: "senting", category: "construction", paidFrom: "cash" }],
    }),
  );
  assert.ok(issues.find((i) => i.field === "cashInHand")!.en.includes("spending is"));
});

test("amounts above the column's ceiling are rejected before Postgres sees them", () => {
  assert.equal(hasErrors(validateDay(day({ uoloReceiving: 5_555_555_555_555 }))), true);
  assert.equal(hasErrors(validateDay(day({ uoloReceiving: MAX_AMOUNT }))), false);
  const expensive = validateDay(
    day({
      uoloReceiving: 100,
      expenses: [{ amount: 1e13, reason: "typo", category: "other", paidFrom: "cash" }],
    }),
  );
  assert.ok(expensive.some((i) => i.field === "expenses.0.amount" && i.level === "error"));
});

test("two identical expense lines are flagged", () => {
  const issues = validateDay(
    day({
      uoloReceiving: 20000,
      expenses: [
        { amount: 9000, reason: "naved sir", category: "salary", paidFrom: "cash" },
        { amount: 9000, reason: "Naved Sir", category: "salary", paidFrom: "cash" },
      ],
    }),
  );
  assert.ok(issues.some((i) => i.field === "expenses" && i.level === "warning"));
  assert.equal(hasErrors(issues), false, "a duplicate is a warning, not a block");
});

test("a month keeps money-in and money-out apart instead of netting them", () => {
  // The real July 2026 shape: several positive days plus 25 Jul at -23,700.
  const rows = withTotals([
    day({ uoloReceiving: 60200, offlineReceiving: 23500, onlineReceiving: 6450, bankDeposit: 35000,
          expenses: [{ amount: 7850, reason: "belder", category: "labour", paidFrom: "cash" }] }),
    day({ uoloReceiving: 44100, offlineReceiving: 9500, onlineReceiving: 18300 }),
    day({ uoloReceiving: 28500, offlineReceiving: 3000, onlineReceiving: 5000,
          expenses: [{ amount: 50200, reason: "senting", category: "construction", paidFrom: "cash" }] }),
  ]);
  const t = sumPeriod(rows);

  assert.equal(t.cashHandedOver, 69700); // 34,400 + 35,300
  assert.equal(t.broughtInFromOutside, 23700);
  assert.equal(t.shortDays, 1);
  // The net is still available, but it is no longer what the UI calls "handed over".
  assert.equal(t.cashInHand, 46000);
  assert.notEqual(t.cashHandedOver, t.cashInHand);
});
