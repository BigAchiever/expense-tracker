import "server-only";
import { db } from "./supabase";
import { sumPeriod, withTotals, type DayWithTotals, type PeriodTotals } from "./calc";
import { daysInMonth, isFuture, isSunday, monthRange } from "./format";
import type { DayEntry, ExpenseItem, School } from "./types";

const num = (v: unknown): number => Number(v ?? 0);

type ExpenseRow = {
  id: string;
  amount: string | number;
  reason: string;
  category: string;
  paid_from: string;
  position: number;
};

type EntryRow = {
  id: string;
  school_id: string;
  entry_date: string;
  offline_receiving: string | number;
  uolo_receiving: string | number;
  principal_receiving: string | number;
  online_receiving: string | number;
  bank_deposit: string | number;
  bank_reference: string | null;
  note: string | null;
  no_activity: boolean;
  created_at?: string;
  updated_at?: string;
  entered_by: string | null;
  expenses?: ExpenseRow[] | null;
};

const SELECT = `
  id, school_id, entry_date,
  offline_receiving, uolo_receiving, principal_receiving,
  online_receiving, bank_deposit, bank_reference, note, no_activity,
  entered_by, created_at, updated_at,
  expenses ( id, amount, reason, category, paid_from, position )
`;

function mapEntry(row: EntryRow): DayEntry {
  const expenses: ExpenseItem[] = (row.expenses ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      id: e.id,
      amount: num(e.amount),
      reason: e.reason,
      category: e.category,
      paidFrom: e.paid_from as ExpenseItem["paidFrom"],
    }));

  return {
    id: row.id,
    schoolId: row.school_id,
    entryDate: row.entry_date,
    offlineReceiving: num(row.offline_receiving),
    uoloReceiving: num(row.uolo_receiving),
    principalReceiving: num(row.principal_receiving),
    onlineReceiving: num(row.online_receiving),
    bankDeposit: num(row.bank_deposit),
    bankReference: row.bank_reference,
    note: row.note,
    noActivity: row.no_activity,
    expenses,
    enteredBy: row.entered_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSchools(): Promise<School[]> {
  const { data, error } = await db()
    .from("schools")
    .select("id, code, name, name_hi, opening_date, sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSchool(schoolId: string): Promise<School | null> {
  const schools = await getSchools();
  return schools.find((s) => s.id === schoolId) ?? null;
}

export async function getEntry(schoolId: string, date: string): Promise<DayEntry | null> {
  const { data, error } = await db()
    .from("day_entries")
    .select(SELECT)
    .eq("school_id", schoolId)
    .eq("entry_date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapEntry(data as unknown as EntryRow) : null;
}

/** All entries for a school up to `to`, oldest first. Omit `from` for all history. */
export async function getEntries(
  schoolId: string,
  from: string | null,
  to: string,
): Promise<DayEntry[]> {
  let query = db().from("day_entries").select(SELECT).eq("school_id", schoolId).lte("entry_date", to);
  if (from) query = query.gte("entry_date", from);

  const { data, error } = await query.order("entry_date");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapEntry(r as unknown as EntryRow));
}

export interface MonthView {
  month: string;
  school: School;
  rows: DayWithTotals<DayEntry>[];
  totals: PeriodTotals;
  /** Days in the month, up to today, with no entry at all. */
  missingDays: string[];
}

export async function getMonth(schoolId: string, month: string, schoolOverride?: School): Promise<MonthView> {
  const school = schoolOverride ?? (await getSchool(schoolId));
  if (!school) throw new Error("School not found");

  const { start, end } = monthRange(month);
  const entries = await getEntries(schoolId, start, end);
  const rows = withTotals(entries);

  // Sundays are not working days, so nagging about them would make the banner
  // permanent and train people to ignore it. `!isFuture` already covers `<= today`.
  const logged = new Set(entries.map((e) => e.entryDate));
  const missingDays = daysInMonth(month).filter(
    (d) => !logged.has(d) && !isFuture(d) && !isSunday(d) && d >= school.opening_date,
  );

  return {
    month,
    school,
    rows,
    totals: sumPeriod(rows),
    missingDays,
  };
}

