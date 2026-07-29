import type { DayInput, ExpenseItem, PaidFrom } from "./types";

/**
 * All money maths lives here. Pure functions, no I/O — so the numbers can be
 * reasoned about and tested on their own.
 *
 * ---------------------------------------------------------------------------
 * The model
 * ---------------------------------------------------------------------------
 * Cash does not sit in a drawer overnight. Whatever is left at the end of a day
 * is handed over and goes home, so every day starts from zero. "Cash in hand"
 * is therefore a *daily* figure, exactly as the original spreadsheet had it:
 *
 *   Total collected = Offline + Uolo + Principal/Sir      (sheet column E)
 *   Cash in hand    = Total − Non-cash − Bank deposit − Cash expense   (column I)
 *
 * There is deliberately no running balance. An earlier version of this file
 * carried cash forward from one day to the next; that was wrong for how the
 * school actually works and produced an imaginary multi-lakh "cash position".
 *
 * A NEGATIVE cash-in-hand is legitimate and not an error. It means the day's
 * expenses were larger than the day's cash collection, so money was brought in
 * from outside to cover the difference — 25 Jul 2026 (₹50,200 paid against
 * ₹31,500 collected) is a real example.
 */

/**
 * The columns are numeric(14,2), so anything at or above 1e12 is rejected by
 * Postgres with "numeric field overflow" — an untranslated error the teacher
 * cannot act on. We stop it here instead, with a message in both languages.
 */
export const MAX_AMOUNT = 99_999_999.99;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const sumBy = (items: ExpenseItem[], source: PaidFrom): number =>
  round2(items.reduce((acc, e) => (e.paidFrom === source ? acc + (e.amount || 0) : acc), 0));

export interface DayTotals {
  /** Offline + Uolo + Principal. Matches column E of the sheet. */
  totalReceiving: number;
  /** The part of the day's collection that arrived as physical cash. */
  cashReceived: number;

  cashExpense: number;
  bankExpense: number;
  externalExpense: number;
  totalExpense: number;

  bankDeposit: number;
  onlineReceiving: number;

  /**
   * Cash left at the end of the day, to be handed over. The sheet's column I.
   * Negative means money had to come from outside to cover the day's spending.
   */
  cashInHand: number;
}

export function computeDay(input: DayInput): DayTotals {
  const expenses = input.expenses ?? [];

  const totalReceiving = round2(
    (input.offlineReceiving || 0) + (input.uoloReceiving || 0) + (input.principalReceiving || 0),
  );
  const onlineReceiving = round2(input.onlineReceiving || 0);
  const bankDeposit = round2(input.bankDeposit || 0);

  const cashReceived = round2(totalReceiving - onlineReceiving);

  const cashExpense = sumBy(expenses, "cash");
  const bankExpense = sumBy(expenses, "bank");
  const externalExpense = sumBy(expenses, "external");
  const totalExpense = round2(cashExpense + bankExpense + externalExpense);

  return {
    totalReceiving,
    cashReceived,
    cashExpense,
    bankExpense,
    externalExpense,
    totalExpense,
    bankDeposit,
    onlineReceiving,
    cashInHand: round2(cashReceived - bankDeposit - cashExpense),
  };
}

// ---------------------------------------------------------------------------
// Validation. Each rule below exists because the real workbook tripped over it.
// ---------------------------------------------------------------------------

export type IssueLevel = "error" | "warning";

export interface Issue {
  level: IssueLevel;
  field?: string;
  en: string;
  hi: string;
}

export function validateDay(input: DayInput): Issue[] {
  const issues: Issue[] = [];
  const t = computeDay(input);
  const expenses = input.expenses ?? [];

  if (input.noActivity) {
    const anyMoney =
      t.totalReceiving > 0 || t.onlineReceiving > 0 || t.bankDeposit > 0 || expenses.length > 0;
    if (anyMoney) {
      issues.push({
        level: "error",
        field: "noActivity",
        en: "This day is marked 'no activity' but has amounts filled in. Clear the amounts or untick it.",
        hi: "यह दिन 'कोई गतिविधि नहीं' चुना गया है लेकिन राशि भरी है। राशि हटाएँ या टिक हटाएँ।",
      });
    }
    return issues;
  }

  // Jan 6 2026 in the real sheet: Uolo 3,200 but online 4,000 → cash in hand −800.
  // Online can only ever be a slice of what was booked.
  if (t.onlineReceiving > t.totalReceiving) {
    issues.push({
      level: "error",
      field: "onlineReceiving",
      en: `Non-cash fees (${t.onlineReceiving}) are more than total fees collected (${t.totalReceiving}). Non-cash is part of the total, not extra.`,
      hi: `बिना नकद फीस (${t.onlineReceiving}) कुल फीस (${t.totalReceiving}) से ज़्यादा है। यह कुल का हिस्सा है, अलग नहीं।`,
    });
  }

  const tooBig = (v: number) => v > MAX_AMOUNT;
  const overflowFields: [string, number, string, string][] = [
    ["uoloReceiving", input.uoloReceiving || 0, "Uolo fees", "Uolo फीस"],
    ["offlineReceiving", input.offlineReceiving || 0, "Offline fees", "ऑफ़लाइन फीस"],
    ["principalReceiving", input.principalReceiving || 0, "Principal / Sir", "प्रिंसिपल / सर"],
    ["onlineReceiving", input.onlineReceiving || 0, "Non-cash fees", "बिना नकद फीस"],
    ["bankDeposit", input.bankDeposit || 0, "Bank deposit", "बैंक जमा"],
  ];
  for (const [field, value, en, hi] of overflowFields) {
    if (tooBig(value)) {
      issues.push({
        level: "error",
        field,
        en: `${en} is too large. The most that can be entered is ${MAX_AMOUNT}.`,
        hi: `${hi} बहुत बड़ी है। ज़्यादा से ज़्यादा ${MAX_AMOUNT} भर सकते हैं।`,
      });
    }
  }

  expenses.forEach((e, i) => {
    if (tooBig(e.amount || 0)) {
      issues.push({
        level: "error",
        field: `expenses.${i}.amount`,
        en: `Expense ${i + 1} is too large. The most that can be entered is ${MAX_AMOUNT}.`,
        hi: `खर्च ${i + 1} बहुत बड़ा है। ज़्यादा से ज़्यादा ${MAX_AMOUNT} भर सकते हैं।`,
      });
    }
    if (!e.amount || e.amount <= 0) {
      issues.push({
        level: "error",
        field: `expenses.${i}.amount`,
        en: `Expense ${i + 1} needs an amount.`,
        hi: `खर्च ${i + 1} की राशि भरें।`,
      });
    }
    // The Apr 21 row listed reasons adding to 7,200 against 8,700 booked; the
    // Apr 27 row said "250000 naved sir" against a 28,000 expense. Forcing a
    // reason per line item is what stops that.
    if (!e.reason || !e.reason.trim()) {
      issues.push({
        level: "error",
        field: `expenses.${i}.reason`,
        en: `Expense ${i + 1} needs a reason.`,
        hi: `खर्च ${i + 1} का कारण लिखें।`,
      });
    }
  });

  // A deposit larger than the cash actually received is almost always a typo
  // (an extra zero on a phone keypad), and it is a different mistake from
  // overspending — so it gets its own message rather than being blamed on
  // expenses that may not exist.
  if (t.bankDeposit > t.cashReceived) {
    issues.push({
      level: "warning",
      field: "bankDeposit",
      en: `Bank deposit (${t.bankDeposit}) is more than the cash received today (${t.cashReceived}). Check for a typing mistake.`,
      hi: `बैंक जमा (${t.bankDeposit}) आज मिले नकद (${t.cashReceived}) से ज़्यादा है। टाइपिंग की गलती जाँचें।`,
    });
  }

  // Spending more than came in today is allowed — the difference simply came
  // from outside. Only say "spending" when something was actually spent.
  if (t.cashInHand < 0) {
    const short = Math.abs(t.cashInHand);
    issues.push(
      t.cashExpense > 0
        ? {
            level: "warning",
            field: "cashInHand",
            en: `Today's spending is ${short} more than the cash collected, so that much had to come from outside. Check that is right.`,
            hi: `आज का खर्च वसूले गए नकद से ${short} ज़्यादा है, यानी इतना बाहर से आया। पुष्टि कर लें।`,
          }
        : {
            level: "warning",
            field: "cashInHand",
            en: `This day comes out ${short} short even though nothing was spent in cash. Check the bank deposit and the non-cash figure.`,
            hi: `कुछ भी नकद खर्च नहीं हुआ फिर भी यह दिन ${short} कम पड़ रहा है। बैंक जमा और बिना-नकद राशि जाँचें।`,
          },
    );
  }

  // Two lines with the same amount, reason, category and source are almost
  // always a double-tap or two people adding the same handover.
  const seen = new Set<string>();
  for (const e of expenses) {
    const key = `${e.amount}|${(e.reason ?? "").trim().toLowerCase()}|${e.category}|${e.paidFrom}`;
    if (seen.has(key) && e.amount > 0) {
      issues.push({
        level: "warning",
        field: "expenses",
        en: `There are two identical expense lines of ${e.amount} for "${e.reason}". Remove one if it was added twice.`,
        hi: `"${e.reason}" के लिए ${e.amount} की दो एक जैसी लाइनें हैं। अगर दो बार जुड़ गई है तो एक हटाएँ।`,
      });
      break;
    }
    seen.add(key);
  }

  const nothingAtAll =
    t.totalReceiving === 0 && t.bankDeposit === 0 && expenses.length === 0 && t.onlineReceiving === 0;
  if (nothingAtAll) {
    issues.push({
      level: "error",
      en: "Nothing has been filled in. Enter the day's amounts, or tick 'No activity today'.",
      hi: "कुछ भी नहीं भरा गया। राशि भरें, या 'आज कोई गतिविधि नहीं' चुनें।",
    });
  }

  return issues;
}

export const hasErrors = (issues: Issue[]): boolean => issues.some((i) => i.level === "error");

// ---------------------------------------------------------------------------
// Aggregating a range of days
// ---------------------------------------------------------------------------

export interface DayWithTotals<T extends DayInput> {
  entry: T;
  totals: DayTotals;
}

/** Pairs each day with its own figures. Days are independent — nothing carries. */
export function withTotals<T extends DayInput>(entries: T[]): DayWithTotals<T>[] {
  return entries.map((entry) => ({ entry, totals: computeDay(entry) }));
}

export interface PeriodTotals {
  offlineReceiving: number;
  uoloReceiving: number;
  principalReceiving: number;
  onlineReceiving: number;
  totalReceiving: number;
  cashReceived: number;
  bankDeposit: number;
  cashExpense: number;
  bankExpense: number;
  externalExpense: number;
  totalExpense: number;
  /**
   * Cash actually handed over: the positive days only.
   *
   * Kept separate from `broughtInFromOutside` on purpose. Netting the two
   * hides money: a month with ₹50,000 handed over and one ₹50,000 outside-funded
   * expense would otherwise report ₹0 and look like nothing happened.
   */
  cashHandedOver: number;
  /** Money that had to come from outside, as a positive number. */
  broughtInFromOutside: number;
  /** cashHandedOver − broughtInFromOutside. The net, when you genuinely want it. */
  cashInHand: number;
  /** How many days needed outside money. */
  shortDays: number;
  days: number;
}

export function sumPeriod<T extends DayInput>(rows: DayWithTotals<T>[]): PeriodTotals {
  const acc: PeriodTotals = {
    offlineReceiving: 0,
    uoloReceiving: 0,
    principalReceiving: 0,
    onlineReceiving: 0,
    totalReceiving: 0,
    cashReceived: 0,
    bankDeposit: 0,
    cashExpense: 0,
    bankExpense: 0,
    externalExpense: 0,
    totalExpense: 0,
    cashHandedOver: 0,
    broughtInFromOutside: 0,
    cashInHand: 0,
    shortDays: 0,
    days: rows.length,
  };

  for (const { entry, totals } of rows) {
    acc.offlineReceiving += entry.offlineReceiving || 0;
    acc.uoloReceiving += entry.uoloReceiving || 0;
    acc.principalReceiving += entry.principalReceiving || 0;
    acc.onlineReceiving += totals.onlineReceiving;
    acc.totalReceiving += totals.totalReceiving;
    acc.cashReceived += totals.cashReceived;
    acc.bankDeposit += totals.bankDeposit;
    acc.cashExpense += totals.cashExpense;
    acc.bankExpense += totals.bankExpense;
    acc.externalExpense += totals.externalExpense;
    acc.totalExpense += totals.totalExpense;
    acc.cashInHand += totals.cashInHand;
    if (totals.cashInHand >= 0) {
      acc.cashHandedOver += totals.cashInHand;
    } else {
      acc.broughtInFromOutside += -totals.cashInHand;
      acc.shortDays += 1;
    }
  }

  for (const k of Object.keys(acc) as (keyof PeriodTotals)[]) {
    acc[k] = round2(acc[k]);
  }
  acc.days = rows.length;
  acc.shortDays = rows.filter((r) => r.totals.cashInHand < 0).length;
  return acc;
}

export function expensesByCategory<T extends DayInput>(
  entries: T[],
): { category: string; cash: number; bank: number; external: number; total: number }[] {
  const map = new Map<string, { cash: number; bank: number; external: number; total: number }>();
  for (const entry of entries) {
    for (const e of entry.expenses ?? []) {
      const key = e.category || "other";
      const row = map.get(key) ?? { cash: 0, bank: 0, external: 0, total: 0 };
      row[e.paidFrom] += e.amount || 0;
      row.total += e.amount || 0;
      map.set(key, row);
    }
  }
  return [...map.entries()]
    .map(([category, v]) => ({
      category,
      cash: round2(v.cash),
      bank: round2(v.bank),
      external: round2(v.external),
      total: round2(v.total),
    }))
    .sort((a, b) => b.total - a.total);
}
