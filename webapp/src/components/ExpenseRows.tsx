"use client";

import { CATEGORIES, PAID_FROM, type ExpenseItem, type PaidFrom } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { money } from "@/lib/format";

/**
 * Itemised expenses, two tight lines per expense.
 *
 * The old sheet had one "Cash Expense" number plus a free-text reason, so lines
 * like "250000 naved sir, 3000 shaista ma'am" could sit against a booked
 * expense of 28,000 with nothing to catch it. Each line here carries its own
 * amount, reason and — the important bit — where the money came from.
 */
export function ExpenseRows({
  items,
  onChange,
  disabled,
}: {
  items: ExpenseItem[];
  onChange: (next: ExpenseItem[]) => void;
  disabled?: boolean;
}) {
  const t = useT();

  const update = (i: number, patch: Partial<ExpenseItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const add = () =>
    onChange([...items, { amount: 0, reason: "", category: "other", paidFrom: "cash" as PaidFrom }]);

  const total = items.reduce((a, e) => a + (e.amount || 0), 0);

  const field =
    "min-w-0 rounded-lg border border-hairline bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-600";

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg bg-slate-50 p-1">
          <div className="flex items-center gap-1.5">
            <div className="flex w-24 shrink-0 items-center rounded-lg border border-hairline bg-white focus-within:border-spend">
              <span aria-hidden className="pl-2 text-sm text-ink-soft">
                ₹
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                disabled={disabled}
                value={item.amount === 0 ? "" : item.amount}
                placeholder="0"
                aria-label={t(`Expense ${i + 1} amount`, `खर्च ${i + 1} राशि`)}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  update(i, { amount: Number.isFinite(n) && n >= 0 ? n : 0 });
                }}
                className="tnum w-full min-w-0 bg-transparent px-1 py-1.5 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-slate-300"
              />
            </div>

            <input
              type="text"
              disabled={disabled}
              value={item.reason}
              aria-label={t(`Expense ${i + 1} reason`, `खर्च ${i + 1} कारण`)}
              placeholder={t("What for? e.g. Naved sir salary", "किसलिए? जैसे नावेद सर सैलरी")}
              onChange={(e) => update(i, { reason: e.target.value })}
              className={`flex-1 ${field} placeholder:text-slate-300`}
            />

            <button
              type="button"
              disabled={disabled}
              onClick={() => remove(i)}
              aria-label={t(`Remove expense ${i + 1}`, `खर्च ${i + 1} हटाएँ`)}
              className="shrink-0 rounded-lg p-1.5 text-ink-soft transition hover:bg-spend-soft hover:text-spend"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="mt-1 flex gap-1.5 pr-8">
            <select
              disabled={disabled}
              value={item.category}
              aria-label={t(`Expense ${i + 1} category`, `खर्च ${i + 1} श्रेणी`)}
              onChange={(e) => update(i, { category: e.target.value })}
              className={`flex-1 ${field}`}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {t(c.en, c.hi)}
                </option>
              ))}
            </select>
            <select
              disabled={disabled}
              value={item.paidFrom}
              aria-label={t(`Expense ${i + 1} paid from`, `खर्च ${i + 1} कहाँ से`)}
              onChange={(e) => update(i, { paidFrom: e.target.value as PaidFrom })}
              className={`flex-1 ${field} font-medium`}
            >
              {PAID_FROM.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(`from ${p.en}`, `${p.hi} से`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className="flex items-center gap-1 rounded-lg border border-brand-600 px-2.5 py-1.5 text-[13px] font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          {items.length ? t("Add another", "और जोड़ें") : t("Add expense", "खर्च जोड़ें")}
        </button>

        {total > 0 ? (
          <p className="tnum text-[13px] font-semibold text-spend">₹{money(total)}</p>
        ) : null}
      </div>
    </div>
  );
}
