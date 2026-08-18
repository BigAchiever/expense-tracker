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
  date,
  records,
  configured,
}: {
  school: School;
  date: string;
  records: RecordsData | null;
  configured: boolean;
}) {
  const t = useT();

  return (
    <section id="records" className="mt-8 scroll-mt-14 border-t border-hairline pt-6">
      <div className="mb-4 flex items-center gap-2">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-ink-soft"
          aria-hidden
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <h2 className="text-lg font-bold text-ink">{t("Records", "रिकॉर्ड")}</h2>
      </div>

      {records ? (
        <Unlocked school={school} date={date} records={records} />
      ) : (
        <Locked date={date} schoolId={school.id} configured={configured} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Locked({
  date,
  schoolId,
  configured,
}: {
  date: string;
  schoolId: string;
  configured: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
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

function Unlocked({ school, date, records }: { school: School; date: string; records: RecordsData }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const schoolName = lang === "hi" ? school.name_hi : school.name;

  // `date` must be carried through. Dropping it made page.tsx fall back to
  // today, which flipped the OnePage remount key: the teacher's half-filled
  // form was wiped and silently repointed at a different day.
  const goMonth = (month: string) =>
    startTransition(() => {
      router.push(`/?date=${date}&school=${school.id}&month=${month}#records`);
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
        <div className="rounded-2xl border border-hairline bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            {t("Where the money came from", "पैसा कहाँ से आया")}
          </h3>
          <div className="mt-2 space-y-1">
            <Line label={t("Uolo fees", "Uolo फीस")} value={records.totals.uoloReceiving} />
            <Line label={t("Offline fees (receipt)", "ऑफ़लाइन फीस (रसीद)")} value={records.totals.offlineReceiving} />
            {records.totals.principalReceiving > 0 ? (
              <Line label={t("Principal / Director", "प्रिंसिपल / डायरेक्टर")} value={records.totals.principalReceiving} />
            ) : null}
            <div className="!mt-2 border-t border-hairline pt-2">
              <Line label={t("Online (Paytm / UPI)", "ऑनलाइन (Paytm / UPI)")} value={records.totals.onlineReceiving} muted />
              <Line label={t("Cash", "नकद")} value={records.totals.cashReceived} muted />
            </div>
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
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <div className="w-14 shrink-0">
                      <p className="tnum text-sm font-bold text-ink">{formatDate(entry.entryDate).slice(0, 6)}</p>
                      <p className="text-[11px] text-ink-soft">{formatWeekday(entry.entryDate)}</p>
                    </div>

                    {entry.noActivity ? (
                      <p className="flex-1 text-sm italic text-ink-soft">{t("No activity", "कोई गतिविधि नहीं")}</p>
                    ) : (
                      <div className="flex flex-1 items-baseline gap-3">
                        <span className="tnum text-sm font-semibold text-income">
                          +{rupees(totals.totalReceiving)}
                        </span>
                        {totals.totalExpense > 0 ? (
                          <span className="tnum text-sm text-spend">−{rupees(totals.totalExpense)}</span>
                        ) : null}
                      </div>
                    )}

                    <div className="shrink-0 text-right">
                      <p className={`tnum text-sm font-bold ${totals.cashInHand < 0 ? "text-spend" : "text-ink"}`}>
                        {rupees(totals.cashInHand)}
                      </p>
                      <p className="text-[11px] text-ink-soft">
                        {totals.cashInHand < 0 ? t("from outside", "बाहर से") : t("handed over", "दिया गया")}
                      </p>
                    </div>
                  </button>

                  {open ? (
                    <div className="space-y-2 bg-slate-50 px-4 pb-4 pt-1">
                      <Line label={t("Uolo fees", "Uolo फीस")} value={entry.uoloReceiving} />
                      <Line label={t("Offline fees", "ऑफ़लाइन फीस")} value={entry.offlineReceiving} />
                      {entry.principalReceiving > 0 ? (
                        <Line label={t("Principal / Director", "प्रिंसिपल / डायरेक्टर")} value={entry.principalReceiving} />
                      ) : null}
                      {entry.onlineReceiving > 0 ? (
                        <Line label={t("Online (Paytm / UPI)", "ऑनलाइन (Paytm / UPI)")} value={entry.onlineReceiving} muted />
                      ) : null}
                      {entry.bankDeposit > 0 ? (
                        <Line
                          label={`${t("Bank deposit", "बैंक जमा")}${entry.bankReference ? ` (${entry.bankReference})` : ""}`}
                          value={entry.bankDeposit}
                        />
                      ) : null}

                      {entry.expenses.length ? (
                        <div className="!mt-3 border-t border-hairline pt-2">
                          <p className="text-xs font-bold uppercase text-ink-soft">{t("Expenses", "खर्च")}</p>
                          <ul className="mt-1 space-y-1">
                            {entry.expenses.map((e, i) => (
                              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="text-ink">
                                  {e.reason}
                                  <span className="ml-1.5 text-xs text-ink-soft">
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
