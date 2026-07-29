"use server";

import { revalidatePath } from "next/cache";
import { lockRecords, unlockRecords } from "./auth";
import { db } from "./supabase";
import { hasErrors, validateDay } from "./calc";
import { isFuture, isValidISODate } from "./format";
import type { DayInput, ExpenseItem, PaidFrom } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorHi?: string;
  issues?: { level: string; en: string; hi: string; field?: string }[];
  /** Set when someone else changed the day first — the caller must reload. */
  conflict?: boolean;
  /** The row's new updated_at, so the form can keep editing without a reload. */
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Daily entry — no sign-in required, by design
// ---------------------------------------------------------------------------

export interface SaveEntryPayload extends DayInput {
  schoolId: string;
  entryDate: string;
  enteredBy: string;
  bankReference?: string;
  note?: string;
  /**
   * The row's updated_at as the browser last saw it; null means "there was no
   * entry when I loaded". The database refuses the write if reality has moved
   * on, so one teacher can no longer silently overwrite another.
   */
  expectedUpdatedAt?: string | null;
}

const clean = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
};

export async function saveEntryAction(payload: SaveEntryPayload): Promise<ActionResult> {
  if (!isValidISODate(payload.entryDate)) {
    return { ok: false, error: "That is not a real date.", errorHi: "यह असली तारीख नहीं है।" };
  }
  if (isFuture(payload.entryDate)) {
    return {
      ok: false,
      error: "You cannot log a future date.",
      errorHi: "आने वाली तारीख नहीं भर सकते।",
    };
  }

  const enteredBy = String(payload.enteredBy ?? "").trim();
  if (!enteredBy) {
    return {
      ok: false,
      error: "Please put your name at the bottom, so we know who filled this in.",
      errorHi: "नीचे अपना नाम लिखें, ताकि पता रहे किसने भरा।",
    };
  }

  const { data: school } = await db()
    .from("schools")
    .select("id")
    .eq("id", payload.schoolId)
    .maybeSingle();
  if (!school) return { ok: false, error: "Unknown school.", errorHi: "स्कूल नहीं मिला।" };

  const expenses: ExpenseItem[] = (payload.expenses ?? [])
    .map((e) => ({
      amount: clean(e.amount),
      reason: String(e.reason ?? "").trim(),
      category: String(e.category ?? "other"),
      paidFrom: (["cash", "bank", "external"].includes(e.paidFrom) ? e.paidFrom : "cash") as PaidFrom,
    }))
    .filter((e) => e.amount > 0 || e.reason.length > 0);

  const input: DayInput = {
    offlineReceiving: clean(payload.offlineReceiving),
    uoloReceiving: clean(payload.uoloReceiving),
    principalReceiving: clean(payload.principalReceiving),
    onlineReceiving: clean(payload.onlineReceiving),
    bankDeposit: clean(payload.bankDeposit),
    noActivity: Boolean(payload.noActivity),
    expenses,
  };

  // Re-run validation on the server — never trust what the browser calculated.
  const issues = validateDay(input);
  if (hasErrors(issues)) {
    return {
      ok: false,
      issues,
      error: "Please fix the highlighted problems.",
      errorHi: "बताई गई गलतियाँ ठीक करें।",
    };
  }

  const { data: updatedAt, error } = await db().rpc("save_day_entry", {
    p_school_id: payload.schoolId,
    p_entry_date: payload.entryDate,
    p_offline_receiving: input.offlineReceiving,
    p_uolo_receiving: input.uoloReceiving,
    p_principal_receiving: input.principalReceiving,
    p_online_receiving: input.onlineReceiving,
    p_bank_deposit: input.bankDeposit,
    p_bank_reference: payload.bankReference?.trim() || null,
    p_note: payload.note?.trim() || null,
    p_no_activity: input.noActivity ?? false,
    p_entered_by: enteredBy,
    p_expenses: expenses.map((e) => ({
      amount: e.amount,
      reason: e.reason,
      category: e.category,
      paid_from: e.paidFrom,
    })),
    p_expected_updated_at: payload.expectedUpdatedAt ?? null,
  });

  if (error) {
    const conflict = describeConflict(error.message);
    if (conflict) return conflict;
    // Anything else is unexpected. Give a message in both languages rather than
    // leaking raw Postgres text to a teacher who cannot act on it.
    console.error("save_day_entry failed", error);
    return {
      ok: false,
      error: "Could not save. Please try again in a moment.",
      errorHi: "सेव नहीं हो सका। थोड़ी देर बाद फिर कोशिश करें।",
    };
  }

  revalidatePath("/");
  return {
    ok: true,
    updatedAt: typeof updatedAt === "string" ? updatedAt : undefined,
    issues: issues.filter((i) => i.level === "warning"),
  };
}

/**
 * The save function raises CONFLICT_* when someone else got there first. Those
 * are expected outcomes, not failures, so they get their own wording.
 */
function describeConflict(message: string): ActionResult | null {
  if (message.includes("CONFLICT_CREATED")) {
    return {
      ok: false,
      conflict: true,
      error: "Someone else filled this day in while you were typing. Reload to see their entry before saving.",
      errorHi: "आप भर रहे थे तभी किसी और ने यह दिन भर दिया। सेव करने से पहले पेज रीलोड करके देखें।",
    };
  }
  if (message.includes("CONFLICT_CHANGED")) {
    return {
      ok: false,
      conflict: true,
      error: "Someone else changed this day while you were typing. Reload so their work is not lost.",
      errorHi: "आप भर रहे थे तभी किसी और ने यह दिन बदल दिया। रीलोड करें ताकि उनका काम न मिटे।",
    };
  }
  if (message.includes("CONFLICT_DELETED")) {
    return {
      ok: false,
      conflict: true,
      error: "This day was deleted while you were typing. Reload before saving.",
      errorHi: "आप भर रहे थे तभी यह दिन हटा दिया गया। सेव करने से पहले रीलोड करें।",
    };
  }
  return null;
}

/**
 * Removes a day entirely — for an entry saved against the wrong date, which
 * previously could not be undone at all. The row and its expenses are copied
 * into the audit trail first, so a delete stays recoverable.
 */
export async function deleteEntryAction(
  schoolId: string,
  entryDate: string,
  deletedBy: string,
): Promise<ActionResult> {
  if (!isValidISODate(entryDate)) {
    return { ok: false, error: "That is not a real date.", errorHi: "यह असली तारीख नहीं है।" };
  }
  const who = String(deletedBy ?? "").trim();
  if (!who) {
    return {
      ok: false,
      error: "Please put your name in before deleting.",
      errorHi: "हटाने से पहले अपना नाम लिखें।",
    };
  }

  const { error } = await db().rpc("delete_day_entry", {
    p_school_id: schoolId,
    p_entry_date: entryDate,
    p_deleted_by: who,
  });

  if (error) {
    console.error("delete_day_entry failed", error);
    return {
      ok: false,
      error: "Could not delete. Please try again in a moment.",
      errorHi: "हटाया नहीं जा सका। थोड़ी देर बाद फिर कोशिश करें।",
    };
  }

  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Records section — the one thing behind a password
// ---------------------------------------------------------------------------

export async function unlockRecordsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const password = String(formData.get("password") ?? "");

  if (!password) {
    return { ok: false, error: "Enter the password.", errorHi: "पासवर्ड भरें।" };
  }

  if (!(await unlockRecords(password))) {
    return { ok: false, error: "Wrong password.", errorHi: "पासवर्ड ग़लत है।" };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function lockRecordsAction(): Promise<void> {
  await lockRecords();
  revalidatePath("/");
}
