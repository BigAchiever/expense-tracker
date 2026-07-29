"use client";

import type { DayTotals } from "@/lib/calc";
import { rupees } from "@/lib/format";
import { useT } from "@/lib/i18n";

function Row({
  label,
  value,
  tone = "plain",
  indent,
}: {
  label: string;
  value: number;
  tone?: "plain" | "in" | "out" | "muted";
  indent?: boolean;
}) {
  const color =
    tone === "in"
      ? "text-income"
      : tone === "out"
        ? "text-spend"
        : tone === "muted"
          ? "text-ink-soft"
          : "text-ink";
  return (
    <div className={`flex items-baseline justify-between gap-2 ${indent ? "pl-3" : ""}`}>
      <span className="truncate text-[13px] text-ink-soft">{label}</span>
      <span className={`tnum shrink-0 text-[13px] font-semibold ${color}`}>{rupees(value)}</span>
    </div>
  );
}

/**
 * One day's figures. Nothing carries over from yesterday — the cash is handed
 * over at the end of each day, so every day starts from zero.
 */
export function DaySummary({ totals }: { totals: DayTotals }) {
  const t = useT();
  const short = totals.cashInHand < 0;

  return (
    <div className="rounded-xl border border-hairline bg-white p-3 shadow-sm">
      <div className="space-y-0.5">
        <Row label={t("Total collected", "कुल वसूली")} value={totals.totalReceiving} tone="in" />
        {totals.onlineReceiving > 0 ? (
          <>
            <Row label={t("non-cash", "बिना नकद")} value={totals.onlineReceiving} tone="muted" indent />
            <Row label={t("as cash", "नकद में")} value={totals.cashReceived} tone="muted" indent />
          </>
        ) : null}
        {totals.bankDeposit > 0 ? (
          <Row label={t("To bank", "बैंक जमा")} value={totals.bankDeposit} />
        ) : null}
        {totals.cashExpense > 0 ? (
          <Row label={t("Spent from cash", "नकद से खर्च")} value={totals.cashExpense} tone="out" />
        ) : null}
        {totals.bankExpense > 0 ? (
          <Row label={t("Spent from bank", "बैंक से खर्च")} value={totals.bankExpense} tone="out" />
        ) : null}
        {totals.externalExpense > 0 ? (
          <Row label={t("Outside money", "बाहर के पैसे")} value={totals.externalExpense} tone="muted" />
        ) : null}
      </div>

      <div
        className={`mt-2 flex items-baseline justify-between gap-2 rounded-lg px-2.5 py-2 ${
          short ? "bg-spend-soft" : "bg-income-soft"
        }`}
      >
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-ink-soft">
          {short ? t("Needed from outside", "बाहर से चाहिए") : t("Cash to hand over", "देने के लिए नकद")}
        </span>
        <span className={`tnum shrink-0 text-lg font-bold ${short ? "text-spend" : "text-income"}`}>
          {rupees(totals.cashInHand)}
        </span>
      </div>

      {short ? (
        <p className="mt-1 text-[11px] text-ink-soft">
          {t(
            "Today's spending was more than the cash collected, so the difference came from outside.",
            "आज का खर्च वसूले नकद से ज़्यादा था, बाक़ी बाहर से आया।",
          )}
        </p>
      ) : null}
    </div>
  );
}
