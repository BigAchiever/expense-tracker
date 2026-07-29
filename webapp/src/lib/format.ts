/** Indian-format money and date helpers. */

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** 123456.5 → "1,23,456.5" */
export function money(n: number | null | undefined): string {
  return inr.format(Number(n ?? 0));
}

/** 123456.5 → "₹1,23,456.5" */
export function rupees(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v < 0 ? "-" : ""}₹${inr.format(Math.abs(v))}`;
}

/** Today in the school's local calendar, as YYYY-MM-DD. */
export function todayISO(timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * True only for a real calendar date in YYYY-MM-DD form.
 *
 * A regex alone is not enough: "2026-02-31" and "2026-00-00" match the shape,
 * and Postgres rejects them with "date/time field value out of range", which
 * surfaces as a crashed page. parseISO cannot be used as a guard either — it
 * silently rolls over ("2026-02-31" becomes 3 March).
 */
export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** True only for a real calendar month in YYYY-MM form. */
export function isValidISOMonth(ym: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(ym)) return false;
  const m = Number(ym.slice(5));
  return m >= 1 && m <= 12;
}

/** Parses YYYY-MM-DD without letting the local timezone shift the day. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** "2026-07-27" → "27 Jul 2026" */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseISO(iso));
}

/** "2026-07-27" → "Mon, 27 Jul 2026" */
export function formatDateLong(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseISO(iso));
}

export function formatWeekday(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short" }).format(parseISO(iso));
}

/** "2026-07" → "July 2026" */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start: toISO(start), end: toISO(end) };
}

/** Every date in a month, as YYYY-MM-DD — used to spot days nobody logged. */
export function daysInMonth(ym: string): string[] {
  const { start, end } = monthRange(ym);
  const out: string[] = [];
  const cur = parseISO(start);
  const last = parseISO(end);
  while (cur <= last) {
    out.push(toISO(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Moves an ISO date by whole days. The single place this arithmetic lives. */
export function shiftDays(iso: string, delta: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + delta);
  return toISO(d);
}

export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isSunday(iso: string): boolean {
  return parseISO(iso).getUTCDay() === 0;
}

export function isFuture(iso: string, timeZone = "Asia/Kolkata"): boolean {
  return iso > todayISO(timeZone);
}
