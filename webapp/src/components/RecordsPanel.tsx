"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DayTotals, PeriodTotals } from "@/lib/calc";
import { addMonths, formatDate, formatMonth, formatWeekday, rupees } from "@/lib/format";
import { useLang, useT } from "@/lib/i18n";
import { monthSummaryText, whatsappUrl } from "@/lib/share";
import { lockRecordsAction, unlockRecordsAction, type ActionResult } from "@/lib/actions";
import { CATEGORIES, PAID_FROM, type DayEntry, type School } from "@/lib/types";

export interface RecordsData {
  month: string;
  schoolId: string;
  rows: { entry: DayEntry; totals: DayTotals }[];
  totals: PeriodTotals;
  missingDays: string[];
  byCategory: { category: string; cash: number; bank: number; external: number; total: number }[];
}

const catLabel = (v: string, hi: boolean) => {
  const c = CATEGORIES.find((x) => x.value === v);
  return c ? (hi ? c.hi : c.en) : v;
};

export function RecordsPanel({
  school,
  schools,
  date,
  records,
  configured,
}: {
  school: School;
  schools?: School[];
  date: string;
  records: RecordsData | null;
  configured: boolean;
}) {
  return (
    <section id="records" className="space-y-4">
      {records ? (
        <Unlocked school={school} schools={schools} date={date} records={records} />
      ) : (
        <Locked date={date} schoolId={school.id} schools={schools} configured={configured} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Locked({
  date,
  schoolId,
  schools,
  configured,
}: {
  date: string;
  schoolId: string;
  schools?: School[];
  configured: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    unlockRecordsAction,
    null,
  );

  if (!configured) {
    return (
      <div className="rounded-2xl border border-warn/30 bg-warn-soft p-5">
        <p className="text-sm font-semibold text-warn">
          {t("Records are switched off", "रिकॉर्ड बंद हैं")}
        </p>
        <p className="mt-1 text-sm text-warn/90">
          {t(
            "Set RECORDS_PASSWORD in .env.local (and in your hosting environment variables) to turn this section on.",
            "इस हिस्से को चालू करने के लिए .env.local में RECORDS_PASSWORD सेट करें।",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-hairline bg-white p-5 shadow-sm sm:p-6">
      {schools && schools.length > 1 ? (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-100 p-1">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft pl-2">
            {t("School", "स्कूल")}
          </span>
          <div className="flex rounded-lg bg-white/60 p-0.5">
            {schools.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => router.push(`/records?date=${date}&school=${s.id}`)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                  s.id === schoolId ? "bg-white text-brand-700 shadow-sm" : "text-ink-soft"
                }`}
              >
                {s.code === "higher" ? t("Higher", "उच्च") : t("Senior", "वरिष्ठ")}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-sm text-ink-soft">
        {t(
          "Past entries, totals and the cash position are kept private. Enter the password to look at them.",
          "पिछली एंट्री, कुल जोड़ और नकद की स्थिति निजी हैं। देखने के लिए पासवर्ड भरें।",
        )}
      </p>

      <form action={formAction} className="mt-4 flex max-w-sm flex-col gap-2 sm:flex-row">
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="school" value={schoolId} />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder={t("Password", "पासवर्ड")}
          aria-label={t("Records password", "रिकॉर्ड पासवर्ड")}
          className="flex-1 rounded-xl border border-hairline px-3.5 py-3 outline-none focus:border-brand-600 placeholder:text-slate-300"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t("Checking…", "जाँच रहे हैं…") : t("Unlock", "खोलें")}
        </button>
      </form>

      {state?.error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-spend">
          {lang === "hi" && state.errorHi ? state.errorHi : state.error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Unlocked({
  school,
  schools,
  date,
  records,
}: {
  school: School;
  schools?: School[];
  date: string;
  records: RecordsData;
}) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const schoolName = lang === "hi" ? school.name_hi : school.name;

  const goMonth = (month: string) =>
    startTransition(() => {
      router.push(`/records?date=${date}&school=${school.id}&month=${month}`);
    });

  const goSchool = (schoolId: string) =>
    startTransition(() => {
      router.push(`/records?date=${date}&school=${schoolId}&month=${records.month}`);
    });

  const shareText = useMemo(
    () =>
      monthSummaryText({
        schoolName,
        month: records.month,
        totals: records.totals,
        byCategory: records.byCategory,
        missingDays: records.missingDays.length,
        lang,
      }),
    [schoolName, records, lang],
  );

  return (
    <div className="space-y-4">
      {/* School switcher if schools is provided */}
      {schools && schools.length > 1 ? (
        <div className="flex items-center justify-between rounded-2xl border border-hairline bg-white p-2.5 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft pl-2">
            {t("School", "स्कूल")}
          </span>
          <div className="flex rounded-xl bg-slate-100 p-1">
            {schools.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={pending}
                onClick={() => goSchool(s.id)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  s.id === school.id ? "bg-white text-brand-700 shadow-sm" : "text-ink-soft hover:text-ink"
                } ${pending ? "cursor-not-allowed" : ""}`}
              >
                {s.code === "higher" ? t("Higher Secondary", "उच्चतर माध्यमिक") : t("Senior Secondary", "वरिष्ठ माध्यमिक")}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* The month's collection — the number worth knowing */}
      <div className="rounded-2xl bg-brand-600 p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              {t("Collected this month", "इस महीने की वसूली")}
            </p>
            <p className="tnum mt-1 text-4xl font-bold">{rupees(records.totals.totalReceiving)}</p>
            <p className="mt-1 text-xs text-white/70">
              {schoolName} · {formatMonth(records.month)}
            </p>
          </div>
          <form action={lockRecordsAction}>
            <button
              type="submit"
              className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/15"
            >
              {t("Lock", "बंद करें")}
            </button>
          </form>
        </div>
      </div>

      {/* Month picker */}
      <div className={`flex items-center gap-2 rounded-2xl border border-hairline bg-white p-3 shadow-sm transition-opacity duration-250 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
        <button
          type="button"
          disabled={pending}
          onClick={() => goMonth(addMonths(records.month, -1))}
          aria-label={t("Previous month", "पिछला महीना")}
          className="rounded-lg border border-hairline px-3 py-2 text-ink-soft transition hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ‹
        </button>
        <p className="flex-1 text-center text-base font-bold text-ink">{formatMonth(records.month)}</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => goMonth(addMonths(records.month, 1))}
          aria-label={t("Next month", "अगला महीना")}
          className="rounded-lg border border-hairline px-3 py-2 text-ink-soft transition hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ›
        </button>
      </div>

      {records.missingDays.length ? (
        <div className="rounded-2xl border border-warn/30 bg-warn-soft p-4">
          <p className="text-sm font-bold text-warn">
            {t(`${records.missingDays.length} day(s) not filled in`, `${records.missingDays.length} दिन नहीं भरे गए`)}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {records.missingDays.map((d) => (
              <a
                key={d}
                href={`/?date=${d}&school=${records.schoolId}`}
                className="tnum rounded-lg border border-warn/40 bg-white px-2.5 py-1 text-xs font-semibold text-warn transition hover:bg-warn/10"
              >
                {formatDate(d)}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Collected", "कुल वसूली")} value={records.totals.totalReceiving} tone="in" />
        <Stat label={t("Spent", "कुल खर्च")} value={records.totals.totalExpense} tone="out" />
        <Stat label={t("Deposited in bank", "बैंक जमा")} value={records.totals.bankDeposit} />
        <Stat label={t("Cash handed over", "दिया गया नकद")} value={records.totals.cashHandedOver} tone="in" />
      </div>

      {records.totals.broughtInFromOutside > 0 ? (
        <div className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3">
          <p className="text-sm font-bold text-warn">
            {t(
              `Brought in from outside: ${rupees(records.totals.broughtInFromOutside)}`,
              `बाहर से लाया गया: ${rupees(records.totals.broughtInFromOutside)}`,
            )}
          </p>
          <p className="mt-0.5 text-xs text-warn/90">
            {t(
              `On ${records.totals.shortDays} day(s) the spending was more than the cash collected. This is money in, not out — it is kept separate from the figure above.`,
              `${records.totals.shortDays} दिन खर्च वसूले नकद से ज़्यादा था। यह पैसा आया है, गया नहीं — इसलिए ऊपर वाले आँकड़े से अलग रखा है।`,
            )}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-hairline bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            {t("Monthly Cash Reconciliation", "मासिक नकद मिलान")}
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            {t("How the cash handed over figure is calculated from collections, online payments, and expenses.", "वसूली, ऑनलाइन भुगतान और खर्चों से हाथ में बचे नकद की गणना कैसे की जाती है।")}
          </p>

          <div className="mt-4 space-y-3.5">
            {/* Step 1: Total Received */}
            <div className="border-b border-hairline/60 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{t("1. Total Fees Collected", "1. कुल फीस वसूली")}</p>
                <span className="tnum text-sm font-bold text-income">
                  +{rupees(records.totals.totalReceiving)}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 pl-4 text-xs text-ink-soft">
                <div>
                  <span>{t("Uolo", "Uolo")}</span>
                  <p className="tnum font-semibold text-ink">{rupees(records.totals.uoloReceiving)}</p>
                </div>
                <div>
                  <span>{t("Offline", "ऑफ़लाइन")}</span>
                  <p className="tnum font-semibold text-ink">{rupees(records.totals.offlineReceiving)}</p>
                </div>
                {records.totals.principalReceiving > 0 ? (
                  <div>
                    <span>{t("Principal", "प्रिंसिपल")}</span>
                    <p className="tnum font-semibold text-ink">{rupees(records.totals.principalReceiving)}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Step 2: Minus Online */}
            <div className="flex items-center justify-between border-b border-hairline/60 pb-3">
              <div>
                <p className="text-sm font-semibold text-ink">{t("2. Minus Online Payments", "2. घटाएं: ऑनलाइन भुगतान")}</p>
                <p className="text-[11px] text-ink-soft">
                  {t("Paytm, UPI, online (never became cash)", "Paytm, UPI, ऑनलाइन (जो नकद नहीं बना)")}
                </p>
              </div>
              <span className="tnum text-sm font-bold text-spend">
                −{rupees(records.totals.onlineReceiving)}
              </span>
            </div>

            {/* Subtotal: Physical Cash Received */}
            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-hairline/40">
              <div>
                <p className="text-xs font-bold text-brand-700">{t("= Physical Cash Collected", "= प्राप्त कुल नकद")}</p>
                <p className="text-[10px] text-ink-soft">{t("Cash box income", "कैश बॉक्स में आया पैसा")}</p>
              </div>
              <span className="tnum text-sm font-bold text-brand-700">
                {rupees(records.totals.cashReceived)}
              </span>
            </div>

            {/* Step 3: Outflow (Expenses + Bank Deposit) */}
            <div className="space-y-2 border-b border-hairline/60 pb-3 pt-1">
              <p className="text-[11px] font-bold uppercase text-ink-soft tracking-wider">{t("Minus Outflow from Cash Box", "कैश बॉक्स से गया पैसा")}</p>
              
              <div className="flex items-center justify-between text-sm pl-4">
                <span className="text-ink-soft">{t("Bank Deposits", "बैंक जमा")}</span>
                <span className="tnum font-semibold text-ink-soft">−{rupees(records.totals.bankDeposit)}</span>
              </div>

              <div className="flex items-center justify-between text-sm pl-4">
                <span className="text-ink-soft">{t("Cash Expenses", "नकद खर्च")}</span>
                <span className="tnum font-semibold text-ink-soft">−{rupees(records.totals.cashExpense)}</span>
              </div>
            </div>

            {/* Final Total: Cash Handed Over */}
            <div className="flex items-center justify-between bg-brand-50 p-3 rounded-xl border border-brand-100">
              <div>
                <p className="text-xs font-bold text-brand-800">{t("= Net Cash Position", "= कुल नकद स्थिति")}</p>
                <p className="text-[10px] text-brand-650">{t("Net cash from all days combined", "सभी दिनों का मिलाकर कुल नकद")}</p>
              </div>
              <span className={`tnum text-base font-bold ${records.totals.cashInHand < 0 ? "text-spend" : "text-brand-700"}`}>
                {rupees(records.totals.cashInHand)}
              </span>
            </div>

            {/* Handed Over vs Brought In breakdown */}
            {records.totals.broughtInFromOutside > 0 ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-xl border border-income/20 bg-income-soft/50 p-2.5 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-income">{t("Cash Handed Over", "दिया गया नकद")}</span>
                  <p className="tnum mt-0.5 text-sm font-bold text-income">+{rupees(records.totals.cashHandedOver)}</p>
                  <p className="text-[9px] text-income/80">{t("Surplus days total", "बचत वाले दिन")}</p>
                </div>
                <div className="rounded-xl border border-spend/20 bg-spend-soft/50 p-2.5 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-spend">{t("Brought In", "लाया गया नकद")}</span>
                  <p className="tnum mt-0.5 text-sm font-bold text-spend">−{rupees(records.totals.broughtInFromOutside)}</p>
                  <p className="text-[9px] text-spend/80">{t("To cover deficit days", "घाटे वाले दिन")}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {records.byCategory.length ? (
          <div className="rounded-2xl border border-hairline bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
              {t("What the money went on", "पैसा किस चीज़ पर गया")}
            </h3>
            <div className="mt-2 space-y-1">
              {records.byCategory.map((c) => (
                <Line key={c.category} label={catLabel(c.category, lang === "hi")} value={c.total} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-hairline pt-3">
              {PAID_FROM.map((p) => {
                const v =
                  p.value === "cash"
                    ? records.totals.cashExpense
                    : p.value === "bank"
                      ? records.totals.bankExpense
                      : records.totals.externalExpense;
                return (
                  <div key={p.value} className="rounded-lg bg-slate-50 px-2 py-2 text-center">
                    <p className="text-[11px] font-medium text-ink-soft">{lang === "hi" ? p.hi : p.en}</p>
                    <p className="tnum text-sm font-bold text-ink">{rupees(v)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Day-by-day ledger */}
      <div className="rounded-2xl border border-hairline bg-white shadow-sm">
        <div className="flex items-baseline justify-between border-b border-hairline px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            {t("Day by day", "दिन-प्रतिदिन")}
          </h3>
          <p className="tnum text-xs text-ink-soft">
            {records.totals.days} {t("days", "दिन")}
          </p>
        </div>

        {records.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-soft">
            {t("Nothing logged this month yet.", "इस महीने अभी कुछ नहीं भरा गया।")}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {records.rows.map(({ entry, totals }) => {
              const open = expanded === entry.entryDate;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : entry.entryDate)}
                    aria-expanded={open}
                    className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="flex items-center justify-between sm:w-20 sm:shrink-0 sm:flex-col sm:items-start">
                      <p className="tnum text-sm font-bold text-ink">{formatDate(entry.entryDate).slice(0, 6)}</p>
                      <p className="text-[11px] text-ink-soft">{formatWeekday(entry.entryDate)}</p>
                    </div>

                    {entry.noActivity ? (
                      <p className="flex-1 text-sm italic text-ink-soft">{t("No activity (Holiday)", "कोई गतिविधि नहीं (छुट्टी)")}</p>
                    ) : (
                      <div className="flex flex-1 flex-wrap items-center gap-1.5 text-xs">
                        <span className="tnum font-bold text-income bg-income-soft/60 px-2 py-0.5 rounded-md border border-income/20">
                          +{rupees(totals.totalReceiving)} {t("Total", "कुल")}
                        </span>

                        {totals.onlineReceiving > 0 ? (
                          <span className="tnum text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            {t("Online", "ऑनलाइन")}: {rupees(totals.onlineReceiving)}
                          </span>
                        ) : null}

                        {totals.bankDeposit > 0 ? (
                          <span className="tnum text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100">
                            {t("Bank", "बैंक")}: −{rupees(totals.bankDeposit)}
                          </span>
                        ) : null}

                        {totals.cashExpense > 0 ? (
                          <span className="tnum text-spend bg-spend-soft/60 px-2 py-0.5 rounded-md border border-spend/20">
                            {t("Expense", "खर्च")}: −{rupees(totals.cashExpense)}
                          </span>
                        ) : null}
                      </div>
                    )}

                    <div className="shrink-0 text-right">
                      <p className={`tnum text-base font-black ${totals.cashInHand < 0 ? "text-spend" : "text-brand-700"}`}>
                        {rupees(totals.cashInHand)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-soft">
                        {totals.cashInHand < 0 ? t("from outside", "बाहर से") : t("handed over", "दिया गया नकद")}
                      </p>
                    </div>
                  </button>

                  {open ? (
                    <div className="space-y-3 bg-slate-50 px-4 pb-4 pt-3 border-t border-hairline/60">
                      {/* Breakdown header */}
                      <div className="rounded-xl border border-hairline bg-white p-3.5 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                          {t("Day Cash Flow Calculation", "दैनिक नकद मिलान")}
                        </p>

                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between border-b border-hairline/40 pb-1.5">
                            <span className="text-ink-soft">{t("Total Collection (Uolo + Offline)", "कुल वसूली (Uolo + ऑफ़लाइन)")}</span>
                            <span className="tnum font-bold text-income">+{rupees(totals.totalReceiving)}</span>
                          </div>

                          {entry.onlineReceiving > 0 ? (
                            <div className="flex justify-between border-b border-hairline/40 pb-1.5">
                              <span className="text-ink-soft">{t("Minus Online (Paytm / UPI)", "घटाएं: ऑनलाइन (Paytm / UPI)")}</span>
                              <span className="tnum font-bold text-spend">−{rupees(entry.onlineReceiving)}</span>
                            </div>
                          ) : null}

                          <div className="flex justify-between bg-slate-50 px-2 py-1 rounded font-semibold text-brand-700">
                            <span>{t("= Cash in Box", "= प्राप्त नकद")}</span>
                            <span className="tnum">{rupees(totals.cashReceived)}</span>
                          </div>

                          {entry.bankDeposit > 0 ? (
                            <div className="flex justify-between border-b border-hairline/40 pb-1.5">
                              <span className="text-ink-soft">
                                {t("Minus Bank Deposit", "घटाएं: बैंक जमा")}
                                {entry.bankReference ? ` (${entry.bankReference})` : ""}
                              </span>
                              <span className="tnum font-semibold text-ink-soft">−{rupees(entry.bankDeposit)}</span>
                            </div>
                          ) : null}

                          {totals.cashExpense > 0 ? (
                            <div className="flex justify-between border-b border-hairline/40 pb-1.5">
                              <span className="text-ink-soft">{t("Minus Cash Expenses", "घटाएं: नकद खर्च")}</span>
                              <span className="tnum font-semibold text-spend">−{rupees(totals.cashExpense)}</span>
                            </div>
                          ) : null}

                          <div className="flex justify-between bg-brand-50 p-2 rounded-lg font-bold text-brand-800 border border-brand-100">
                            <span>{totals.cashInHand < 0 ? t("= Outside Money Needed", "= बाहर से लाया गया") : t("= Final Cash Handed Over", "= दिया गया कुल नकद")}</span>
                            <span className={`tnum text-sm ${totals.cashInHand < 0 ? "text-spend" : "text-brand-700"}`}>{rupees(totals.cashInHand)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Fee sources detail */}
                      <div className="rounded-xl border border-hairline bg-white p-3 space-y-1.5 text-xs">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{t("Fee Details", "फीस विवरण")}</p>
                        {entry.uoloReceiving > 0 ? <Line label={t("Uolo fees", "Uolo फीस")} value={entry.uoloReceiving} /> : null}
                        {entry.offlineReceiving > 0 ? <Line label={t("Offline fees", "ऑफ़लाइन फीस")} value={entry.offlineReceiving} /> : null}
                        {entry.principalReceiving > 0 ? (
                          <Line label={t("Principal / Director", "प्रिंसिपल / डायरेक्टर")} value={entry.principalReceiving} />
                        ) : null}
                      </div>

                      {entry.expenses.length ? (
                        <div className="rounded-xl border border-hairline bg-white p-3">
                          <p className="text-xs font-bold uppercase text-ink-soft">{t("Expenses", "खर्च")}</p>
                          <ul className="mt-2 space-y-1.5">
                            {entry.expenses.map((e, i) => (
                              <li key={i} className="flex items-baseline justify-between gap-3 text-xs border-b border-hairline/40 pb-1 last:border-0 last:pb-0">
                                <span className="text-ink">
                                  {e.reason}
                                  <span className="ml-1.5 text-[11px] text-ink-soft">
                                    ({catLabel(e.category, lang === "hi")} ·{" "}
                                    {lang === "hi"
                                      ? PAID_FROM.find((p) => p.value === e.paidFrom)?.hi
                                      : PAID_FROM.find((p) => p.value === e.paidFrom)?.en}
                                    )
                                  </span>
                                </span>
                                <span className="tnum shrink-0 font-semibold text-spend">{rupees(e.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {entry.note ? (
                        <p className="!mt-3 rounded-lg bg-white px-3 py-2 text-sm text-ink-soft">{entry.note}</p>
                      ) : null}

                      <div className="!mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-2">
                        <p className="text-[11px] text-ink-soft">
                          {entry.enteredBy ? `${t("Filled in by", "भरा गया")} ${entry.enteredBy}` : ""}
                        </p>
                        <a
                          href={`/?date=${entry.entryDate}&school=${records.schoolId}`}
                          className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
                        >
                          {t("Edit", "बदलें")}
                        </a>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={whatsappUrl(shareText)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-[#25D366] py-3.5 text-center font-semibold text-white transition hover:brightness-95"
        >
          {t("Share month", "महीना भेजें")}
        </a>
        <a
          href={`/api/export?month=${records.month}&school=${records.schoolId}`}
          className="rounded-xl border border-hairline bg-white py-3.5 text-center font-semibold text-ink transition hover:bg-slate-50"
        >
          {t("Download Excel", "Excel डाउनलोड")}
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "plain" }: { label: string; value: number; tone?: "in" | "out" | "plain" }) {
  const color = tone === "in" ? "text-income" : tone === "out" ? "text-spend" : "text-ink";
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className={`tnum mt-1 text-xl font-bold ${color}`}>{rupees(value)}</p>
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-sm ${muted ? "text-ink-soft" : "text-ink"}`}>{label}</span>
      <span className={`tnum text-sm font-semibold ${muted ? "text-ink-soft" : "text-ink"}`}>{rupees(value)}</span>
    </div>
  );
}
