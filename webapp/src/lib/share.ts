import type { DayTotals, PeriodTotals } from "./calc";
import { formatDateLong, formatMonth, money, rupees } from "./format";
import { CATEGORIES, type DayInput, type ExpenseItem, type Lang, type PaidFrom } from "./types";

const pick = (lang: Lang, en: string, hi: string) => (lang === "hi" ? hi : en);

const sourceLabel = (lang: Lang, s: PaidFrom) =>
  s === "cash"
    ? pick(lang, "cash", "नकद")
    : s === "bank"
      ? pick(lang, "bank", "बैंक")
      : pick(lang, "outside", "बाहर");

const categoryLabel = (lang: Lang, value: string) => {
  const c = CATEGORIES.find((x) => x.value === value);
  return c ? pick(lang, c.en, c.hi) : value;
};

const line = (label: string, value: number) => `${label}: ₹${money(value)}`;

/**
 * The message a teacher forwards after saving. Uses WhatsApp's own markup
 * (*bold*) and stays short enough to read on a phone without scrolling much.
 */
export function dailySummaryText(opts: {
  schoolName: string;
  date: string;
  input: DayInput;
  totals: DayTotals;
  enteredBy: string;
  lang?: Lang;
}): string {
  const { schoolName, date, input, totals, enteredBy } = opts;
  const lang: Lang = opts.lang ?? "en";
  const L = (en: string, hi: string) => pick(lang, en, hi);

  if (input.noActivity) {
    return [
      `*${schoolName}*`,
      `${formatDateLong(date)}`,
      "",
      L("_No activity today — nothing collected or spent._", "_आज कोई गतिविधि नहीं — न वसूली, न खर्च।_"),
      "",
      `${L("Cash to hand over", "देने के लिए नकद")}: *₹0*`,
      "",
      `${L("Entered by", "भरा गया")}: ${enteredBy}`,
    ].join("\n");
  }

  const out: string[] = [
    `*${schoolName}*`,
    `${formatDateLong(date)}`,
    "",
    `*${L("MONEY IN", "आमदनी")}*`,
  ];

  if (input.uoloReceiving) out.push(line(L("Uolo fees", "Uolo फीस"), input.uoloReceiving));
  if (input.offlineReceiving)
    out.push(line(L("Offline fees (receipt)", "ऑफ़लाइन फीस (रसीद)"), input.offlineReceiving));
  if (input.principalReceiving)
    out.push(line(L("Principal/Director", "प्रिंसिपल/डायरेक्टर"), input.principalReceiving));

  out.push(`${L("*Total collected*", "*कुल वसूली*")}: *₹${money(totals.totalReceiving)}*`);

  if (totals.onlineReceiving) {
    out.push(`  ${L("of which non-cash (online)", "इसमें बिना नकद (ऑनलाइन)")}: ₹${money(totals.onlineReceiving)}`);
    out.push(`  ${L("received as cash", "नकद में मिला")}: ${rupees(totals.cashReceived)}`);
  }

  const expenses = input.expenses ?? [];
  if (expenses.length) {
    out.push("", `*${L("EXPENSES", "खर्च")}*`);
    expenses.forEach((e: ExpenseItem) => {
      out.push(`• ₹${money(e.amount)} — ${e.reason} _(${sourceLabel(lang, e.paidFrom)})_`);
    });
    out.push(`${L("*Total spent*", "*कुल खर्च*")}: *₹${money(totals.totalExpense)}*`);
  }

  if (totals.bankDeposit) {
    out.push("", `${L("Bank deposit", "बैंक जमा")}: ₹${money(totals.bankDeposit)}`);
  }

  out.push("");
  if (totals.cashInHand < 0) {
    out.push(
      `${L("*Brought in from outside*", "*बाहर से लाया गया*")}: *₹${money(Math.abs(totals.cashInHand))}*`,
      L(
        "_(today's spending was more than the cash collected)_",
        "_(आज का खर्च वसूले नकद से ज़्यादा था)_",
      ),
    );
  } else {
    out.push(`${L("*Cash to hand over*", "*देने के लिए नकद*")}: *₹${money(totals.cashInHand)}*`);
  }
  out.push("", `${L("Entered by", "भरा गया")}: ${enteredBy}`);

  return out.join("\n");
}

export function monthSummaryText(opts: {
  schoolName: string;
  month: string;
  totals: PeriodTotals;
  byCategory: { category: string; total: number }[];
  missingDays: number;
  lang?: Lang;
}): string {
  const { schoolName, month, totals, byCategory, missingDays } = opts;
  const lang: Lang = opts.lang ?? "en";
  const L = (en: string, hi: string) => pick(lang, en, hi);

  const out = [
    `*${schoolName}*`,
    `${formatMonth(month)} — ${L("monthly summary", "मासिक सारांश")}`,
    "",
    `*${L("MONEY IN", "आमदनी")}*`,
    line(L("Uolo fees", "Uolo फीस"), totals.uoloReceiving),
    line(L("Offline fees", "ऑफ़लाइन फीस"), totals.offlineReceiving),
  ];

  if (totals.principalReceiving)
    out.push(line(L("Principal/Director", "प्रिंसिपल/डायरेक्टर"), totals.principalReceiving));

  out.push(
    `${L("*Total collected*", "*कुल वसूली*")}: *₹${money(totals.totalReceiving)}*`,
    `  ${L("non-cash (online)", "बिना नकद (ऑनलाइन)")}: ₹${money(totals.onlineReceiving)}`,
    `  ${L("cash", "नकद")}: ${rupees(totals.cashReceived)}`,
    "",
    `*${L("MONEY OUT", "ख़र्च")}*`,
    line(L("Bank deposit", "बैंक जमा"), totals.bankDeposit),
    line(L("Paid in cash", "नकद से दिया"), totals.cashExpense),
  );

  if (totals.bankExpense) out.push(line(L("Paid from bank", "बैंक से दिया"), totals.bankExpense));
  if (totals.externalExpense)
    out.push(line(L("Paid from outside money", "बाहर के पैसे से"), totals.externalExpense));
  out.push(`${L("*Total expenses*", "*कुल खर्च*")}: *₹${money(totals.totalExpense)}*`);

  const top = byCategory.filter((c) => c.total > 0).slice(0, 5);
  if (top.length) {
    out.push("", `*${L("TOP CATEGORIES", "सबसे बड़े खर्च")}*`);
    top.forEach((c) => out.push(`• ${categoryLabel(lang, c.category)}: ₹${money(c.total)}`));
  }

  out.push(
    "",
    `${L("*Cash handed over this month*", "*इस महीने दिया गया नकद*")}: *${rupees(totals.cashHandedOver)}*`,
    "",
    `${L("Days logged", "भरे गए दिन")}: ${totals.days}`,
  );

  if (totals.broughtInFromOutside > 0) {
    out.push(
      `${L("Brought in from outside", "बाहर से लाया गया")}: ${rupees(totals.broughtInFromOutside)} (${totals.shortDays} ${L("day(s)", "दिन")})`,
    );
  }

  if (missingDays > 0) {
    out.push(`⚠️ ${L("Days not logged", "बिना भरे दिन")}: ${missingDays}`);
  }

  return out.join("\n");
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
