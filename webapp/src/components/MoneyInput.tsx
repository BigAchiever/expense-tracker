"use client";

import { useId, useState } from "react";

/**
 * A compact rupee field. `inputMode="decimal"` gets the numeric keypad on
 * phones, which is most of what makes this usable for staff.
 *
 * Deliberately small: the whole form is meant to fit one screen, so every field
 * is one label line plus one input line and nothing else.
 */
/** Accepts "31,500", "31 500" and "₹31,500"; returns null when it is not a number. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s\u00a0₹]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function MoneyInput({
  label,
  hint,
  value,
  onChange,
  accent = "neutral",
  disabled,
  invalid,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  accent?: "income" | "spend" | "neutral";
  disabled?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  // The text the teacher actually typed, so a half-finished or rejected entry
  // stays on screen instead of vanishing.
  const [text, setText] = useState(value === 0 ? "" : String(value));
  const unparseable = parseAmount(text) === null;

  // When the value is changed from outside (date switch, reset), follow it.
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    if (parseAmount(text) !== value) setText(value === 0 ? "" : String(value));
  }

  const focus =
    accent === "income"
      ? "focus-within:border-income"
      : accent === "spend"
        ? "focus-within:border-spend"
        : "focus-within:border-brand-600";

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block truncate text-[13px] font-semibold leading-tight text-ink">
        {label}
      </label>
      {/* Always rendered, so fields sitting side by side align even when only
          one of them has a hint. */}
      <p className="h-[13px] truncate text-[11px] leading-tight text-ink-soft">{hint ?? "\u00a0"}</p>
      <div
        className={`mt-1 flex items-center rounded-lg border bg-white transition ${focus} ${
          invalid ? "border-spend" : "border-hairline"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <span aria-hidden className="pl-2.5 text-sm text-ink-soft">
          ₹
        </span>
        {/*
          A text input, not type="number", on purpose. type="number" hands back
          "" for anything it dislikes — so pasting "31,500" from WhatsApp became
          Number("") === 0 and the field silently rendered empty, identical to
          never having typed it. Here the raw text is kept, commas and spaces
          are stripped, and anything still unparseable stays visible so the
          teacher can see and fix it.
        */}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder="0"
          aria-invalid={unparseable || invalid ? true : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const n = parseAmount(raw);
            onChange(n ?? 0);
          }}
          onBlur={() => setText(value === 0 ? "" : String(value))}
          className="tnum w-full min-w-0 bg-transparent px-1.5 py-2 text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-slate-300"
        />
      </div>
    </div>
  );
}
