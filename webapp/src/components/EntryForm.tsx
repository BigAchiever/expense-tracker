"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeDay, hasErrors, validateDay } from "@/lib/calc";
import { formatDateLong, isFuture, rupees, shiftDays, todayISO } from "@/lib/format";
import { useLang, useT } from "@/lib/i18n";
import { dailySummaryText, whatsappUrl } from "@/lib/share";
import { deleteEntryAction, saveEntryAction } from "@/lib/actions";
import type { DayEntry, DayInput, ExpenseItem, School } from "@/lib/types";
import { MoneyInput } from "./MoneyInput";
import { ExpenseRows } from "./ExpenseRows";
import { DaySummary } from "./DaySummary";

/**
 * The name of whoever is filling the form is remembered in this browser, so
 * staff type it once rather than every day. It lives in localStorage — external
 * to React and unknown during server rendering — so it is read through
 * useSyncExternalStore rather than seeded by an effect.
 */
const NAME_KEY = "sxm_entered_by";
const nameListeners = new Set<() => void>();
let nameCache: string | null = null;

function subscribeName(onChange: () => void) {
  nameListeners.add(onChange);
  return () => {
    nameListeners.delete(onChange);
  };
}

function rememberedName(): string {
  if (nameCache === null) nameCache = window.localStorage.getItem(NAME_KEY) ?? "";
  return nameCache;
}

const rememberedNameOnServer = () => "";

function rememberName(value: string) {
  nameCache = value;
  window.localStorage.setItem(NAME_KEY, value);
  for (const fn of nameListeners) fn();
}

/** A titled block. Deliberately low-chrome: one small heading, no subtitle. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-2.5 shadow-sm">
      <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">{title}</h2>
      {children}
    </section>
  );
}

export function EntryForm({
  schools,
  school,
  date,
  entry,
}: {
  schools: School[];
  school: School;
  date: string;
  entry: DayEntry | null;
}) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [offlineReceiving, setOffline] = useState(entry?.offlineReceiving ?? 0);
  const [uoloReceiving, setUolo] = useState(entry?.uoloReceiving ?? 0);
  const [principalReceiving, setPrincipal] = useState(entry?.principalReceiving ?? 0);
  const [onlineReceiving, setOnline] = useState(entry?.onlineReceiving ?? 0);
  const [bankDeposit, setBankDeposit] = useState(entry?.bankDeposit ?? 0);
  const [bankReference, setBankReference] = useState(entry?.bankReference ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [expenses, setExpenses] = useState<ExpenseItem[]>(entry?.expenses ?? []);
  const [noActivity, setNoActivityRaw] = useState(entry?.noActivity ?? false);

  /**
   * Ticking Holiday hides the money fields. It must also clear them: the values
   * lived on in state, so validation demanded the teacher "clear the amounts"
   * with no field on screen able to do it.
   */
  const setNoActivity = (on: boolean) => {
    setNoActivityRaw(on);
    if (on) {
      setOffline(0);
      setUolo(0);
      setPrincipal(0);
      setOnline(0);
      setBankDeposit(0);
      setBankReference("");
      setExpenses([]);
    }
  };

  // Whoever is at this browser, not whoever filled the day last. Seeding this
  // from entry.enteredBy meant an editor silently saved under the previous
  // person's name, and rememberName() then wrote that name into their own
  // browser — so every later day was misattributed too.
  const remembered = useSyncExternalStore(subscribeName, rememberedName, rememberedNameOnServer);
  const [typedName, setTypedName] = useState<string | null>(null);
  const enteredBy = typedName ?? remembered;

  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The row version this form was loaded from; null means "no entry existed".
  const [baseVersion, setBaseVersion] = useState<string | null>(entry?.updatedAt ?? null);
  const [showIssues, setShowIssues] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // The server drops entirely-blank expense rows before validating, so the form
  // must too — otherwise a row the teacher abandoned blocks Save with errors
  // about a line the server would have ignored.
  const meaningfulExpenses = useMemo(
    () => expenses.filter((e) => (e.amount || 0) > 0 || (e.reason ?? "").trim().length > 0),
    [expenses],
  );

  const input: DayInput = useMemo(
    () => ({
      offlineReceiving,
      uoloReceiving,
      principalReceiving,
      onlineReceiving,
      bankDeposit,
      expenses: meaningfulExpenses,
      noActivity,
    }),
    [
      offlineReceiving,
      uoloReceiving,
      principalReceiving,
      onlineReceiving,
      bankDeposit,
      meaningfulExpenses,
      noActivity,
    ],
  );

  const totals = useMemo(() => computeDay(input), [input]);
  const issues = useMemo(() => validateDay(input), [input]);
  const blocked = hasErrors(issues);
  const warnings = issues.filter((i) => i.level === "warning");
  const errors = issues.filter((i) => i.level === "error");

  const shareText = useMemo(
    () =>
      dailySummaryText({
        schoolName: lang === "hi" ? school.name_hi : school.name,
        date,
        input,
        totals,
        enteredBy: enteredBy || "—",
        lang,
      }),
    [school, date, input, totals, enteredBy, lang],
  );

  const goTo = (nextDate: string, nextSchool = school.id) => {
    setSaved(false);
    startTransition(() => {
      router.push(`/?date=${nextDate}&school=${nextSchool}`);
    });
  };

  const shiftDate = (delta: number) => {
    const iso = shiftDays(date, delta);
    if (isFuture(iso)) return;
    goTo(iso);
  };

  const submit = () => {
    setShowIssues(true);
    setServerError(null);
    setConflict(false);
    if (blocked || !enteredBy.trim()) return;

    rememberName(enteredBy.trim());

    startTransition(async () => {
      try {
        const res = await saveEntryAction({
          ...input,
          schoolId: school.id,
          entryDate: date,
          enteredBy: enteredBy.trim(),
          bankReference,
          note,
          expectedUpdatedAt: baseVersion,
        });
        if (res.ok) {
          // Keep the row's new version so the teacher can carry on editing
          // without a reload and without tripping the conflict check.
          if (res.updatedAt) setBaseVersion(res.updatedAt);
          setSaved(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          setConflict(Boolean(res.conflict));
          setServerError((lang === "hi" ? res.errorHi : res.error) ?? res.error ?? "Could not save.");
        }
      } catch {
        // A dropped connection rejects the server action. Without this catch the
        // rejection reaches the error boundary, which unmounts the form and
        // silently discards everything the teacher typed.
        setServerError(
          t(
            "Could not reach the server. Your figures are still here — check your connection and press Save again.",
            "सर्वर से संपर्क नहीं हुआ। आपकी भरी हुई जानकारी सुरक्षित है — कनेक्शन जाँचकर फिर सेव करें।",
          ),
        );
      }
    });
  };

  const removeEntry = () => {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await deleteEntryAction(school.id, date, enteredBy.trim() || "unknown");
        if (res.ok) {
          setConfirmDelete(false);
          router.refresh();
        } else {
          setServerError((lang === "hi" ? res.errorHi : res.error) ?? "Could not delete.");
        }
      } catch {
        setServerError(
          t("Could not reach the server. Try again.", "सर्वर से संपर्क नहीं हुआ। फिर कोशिश करें।"),
        );
      }
    });
  };

  // ---- saved confirmation ---------------------------------------------------
  if (saved) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <div className="rounded-xl border border-income/30 bg-income-soft p-4 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-income text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-2 text-lg font-bold text-ink">{t("Entry saved", "एंट्री सेव हो गई")}</h2>
          <p className="text-xs text-ink-soft">
            {formatDateLong(date)} · {lang === "hi" ? school.name_hi : school.name}
          </p>
          <p className={`tnum mt-2 text-2xl font-bold ${totals.cashInHand < 0 ? "text-spend" : "text-income"}`}>
            {rupees(totals.cashInHand)}
          </p>
          <p className="text-[11px] text-ink-soft">
            {totals.cashInHand < 0
              ? t("brought in from outside", "बाहर से लाया गया")
              : t("cash to hand over", "देने के लिए नकद")}
          </p>
        </div>

        {warnings.length ? (
          <div className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2">
            {warnings.map((w, i) => (
              <p key={i} className="text-[13px] text-warn">
                ⚠️ {lang === "hi" ? w.hi : w.en}
              </p>
            ))}
          </div>
        ) : null}

        <a
          href={whatsappUrl(shareText)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 font-semibold text-white transition hover:brightness-95"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.44 9.44 0 01-4.8-1.32l-.35-.2-3.57.94.95-3.48-.22-.36a9.42 9.42 0 01-1.44-5.03c0-5.2 4.24-9.44 9.45-9.44a9.4 9.4 0 016.68 2.77 9.37 9.37 0 012.76 6.68c0 5.2-4.24 9.44-9.45 9.44zM20.52 3.49A11.8 11.8 0 0012.05 0C5.5 0 .17 5.33.16 11.89c0 2.09.55 4.14 1.59 5.94L.06 24l6.33-1.66a11.87 11.87 0 005.66 1.44h.01c6.55 0 11.88-5.33 11.89-11.89a11.82 11.82 0 00-3.43-8.4z" />
          </svg>
          {t("Share on WhatsApp", "WhatsApp पर भेजें")}
        </a>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSaved(false)}
            className="rounded-xl border border-hairline bg-white py-2.5 text-sm font-semibold text-ink transition hover:bg-slate-50"
          >
            {t("Edit this day", "इस दिन को बदलें")}
          </button>
          <button
            type="button"
            onClick={() => goTo(todayISO())}
            className="rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            {t("Go to today", "आज पर जाएँ")}
          </button>
        </div>
      </div>
    );
  }

  const problems = showIssues && (errors.length > 0 || !enteredBy.trim());

  const saveButton = (
    <button
      type="button"
      onClick={submit}
      disabled={pending}
      className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
    >
      {pending
        ? t("Saving…", "सेव हो रहा है…")
        : entry
          ? t("Update", "अपडेट करें")
          : t("Save entry", "सेव करें")}
    </button>
  );

  const alerts = (
    <>
      {problems ? (
        <div role="alert" className="rounded-lg border border-spend/30 bg-spend-soft px-3 py-2">
          <ul className="space-y-0.5">
            {!enteredBy.trim() ? (
              <li className="text-[13px] text-spend">
                • {t("Add your name below.", "नीचे अपना नाम लिखें।")}
              </li>
            ) : null}
            {errors.map((e, i) => (
              <li key={i} className="text-[13px] text-spend">
                • {lang === "hi" ? e.hi : e.en}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2">
          <ul className="space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-[13px] text-warn">
                ⚠️ {lang === "hi" ? w.hi : w.en}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {serverError ? (
        <div
          role="alert"
          className={`rounded-lg px-3 py-2 ${conflict ? "border border-warn/40 bg-warn-soft" : "bg-spend-soft"}`}
        >
          <p className={`text-[13px] font-medium ${conflict ? "text-warn" : "text-spend"}`}>{serverError}</p>
          {conflict ? (
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-1.5 rounded-lg border border-warn/50 px-2.5 py-1 text-[12px] font-semibold text-warn"
            >
              {t("Reload this day", "यह दिन रीलोड करें")}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      {pending && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden bg-brand-100/50">
          <div className="h-full w-full bg-brand-600 origin-left animate-loading-bar" />
        </div>
      )}
      {/* ---------------- the form ---------------- */}
      <div className={`space-y-2 transition-opacity duration-250 ${pending ? "opacity-70 pointer-events-none" : ""}`}>
        {/* school + date, one compact strip */}
        <div className="rounded-xl border border-hairline bg-white p-2 shadow-sm">
          {/* Two rows on a phone, one on anything wider — never overflows. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
              {schools.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={pending}
                  onClick={() => goTo(date, s.id)}
                  className={`rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition ${
                    s.id === school.id ? "bg-white text-brand-700 shadow-sm" : "text-ink-soft"
                  } ${pending ? "cursor-not-allowed" : ""}`}
                >
                  {s.code === "higher" ? t("Higher", "उच्च") : t("Senior", "वरिष्ठ")}
                </button>
              ))}
            </div>

            <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline px-2 py-1.5">
              <input
                type="checkbox"
                checked={noActivity}
                disabled={pending}
                onChange={(e) => setNoActivity(e.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              <span className="text-[13px] font-medium text-ink">{t("Holiday", "छुट्टी")}</span>
            </label>

            <div className="flex w-full items-center gap-1.5 sm:w-auto sm:flex-1">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                disabled={pending}
                aria-label={t("Previous day", "पिछला दिन")}
                className="shrink-0 rounded-lg border border-hairline px-2.5 py-1.5 text-ink-soft transition hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              <input
                type="date"
                value={date}
                max={todayISO()}
                disabled={pending}
                aria-label={t("Which day are you filling?", "आप कौन सा दिन भर रहे हैं?")}
                onChange={(e) => e.target.value && goTo(e.target.value)}
                className="tnum min-w-0 flex-1 rounded-lg border border-hairline px-2 py-1.5 text-center text-[13px] font-semibold outline-none focus:border-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => shiftDate(1)}
                disabled={pending || date >= todayISO()}
                aria-label={t("Next day", "अगला दिन")}
                className="shrink-0 rounded-lg border border-hairline px-2.5 py-1.5 text-ink-soft transition hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>
          </div>

          {entry ? (
            <div className="mt-1.5 flex items-center gap-2 rounded bg-brand-50 px-2 py-1">
              <p className="min-w-0 flex-1 truncate text-[11px] text-brand-700">
                {t("Already filled — you are editing.", "पहले से भरा है — आप बदल रहे हैं।")}
                {entry.enteredBy ? ` ${t("Last by", "आख़िरी")} ${entry.enteredBy}.` : ""}
              </p>
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={removeEntry}
                    disabled={pending}
                    className="shrink-0 rounded bg-spend px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    {t("Delete for good", "पक्का हटाएँ")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="shrink-0 text-[11px] font-semibold text-ink-soft"
                  >
                    {t("Cancel", "रद्द")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="shrink-0 text-[11px] font-semibold text-spend underline"
                >
                  {t("Delete this day", "यह दिन हटाएँ")}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {!noActivity ? (
          <>
            <Card title={t("Fees received today", "आज प्राप्त फीस")}>
              <div className="grid grid-cols-2 gap-2">
                <MoneyInput
                  label={t("Uolo fees", "Uolo फीस")}
                  hint={t("on the Uolo app", "Uolo ऐप पर")}
                  value={uoloReceiving}
                  onChange={setUolo}
                  accent="income"
                />
                <MoneyInput
                  label={t("Offline fees", "ऑफ़लाइन फीस")}
                  hint={t("manual receipt", "मैनुअल रसीद")}
                  value={offlineReceiving}
                  onChange={setOffline}
                  accent="income"
                />
                <MoneyInput
                  label={t("Principal / Sir", "प्रिंसिपल / सर")}
                  hint={t("taken by Sir", "सर ने ली")}
                  value={principalReceiving}
                  onChange={setPrincipal}
                  accent="income"
                />
                <MoneyInput
                  label={t("Of that, non-cash", "इसमें बिना नकद")}
                  hint={t("Paytm, UPI, online", "Paytm, UPI, ऑनलाइन")}
                  value={onlineReceiving}
                  onChange={setOnline}
                  invalid={showIssues && onlineReceiving > totals.totalReceiving}
                />
              </div>
              {/* Kept as a disclosure: the wording matters (it is what stops
                  online-paid Uolo fees being counted as cash) but it is long. */}
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[11px] text-ink-soft">
                  {t("What counts as non-cash?", "बिना नकद में क्या आता है?")}
                </summary>
                <p className="mt-1 text-[11px] leading-snug text-ink-soft">
                  {t(
                    "Anything that never reached the cash box: Paytm, UPI, parents paying online through Uolo, direct bank transfer.",
                    "जो कैश बॉक्स में नहीं आया: Paytm, UPI, Uolo पर पैरेंट्स का ऑनलाइन भुगतान, सीधा बैंक ट्रांसफ़र।",
                  )}
                </p>
              </details>
            </Card>

            <Card title={t("Money out", "पैसा बाहर")}>
              <div className="grid grid-cols-2 gap-2">
                <MoneyInput
                  label={t("Bank deposit", "बैंक जमा")}
                  hint={t("cash taken to bank", "बैंक ले गए नकद")}
                  value={bankDeposit}
                  onChange={setBankDeposit}
                />
                {bankDeposit > 0 ? (
                  <div className="min-w-0">
                    <label htmlFor="bank-ref" className="block text-[13px] font-semibold leading-tight text-ink">
                      {t("Slip no.", "स्लिप नं.")}
                    </label>
                    <p className="truncate text-[11px] leading-tight text-ink-soft">
                      {t("optional", "वैकल्पिक")}
                    </p>
                    <input
                      id="bank-ref"
                      type="text"
                      value={bankReference}
                      onChange={(e) => setBankReference(e.target.value)}
                      className="mt-1 w-full min-w-0 rounded-lg border border-hairline px-2 py-2 text-base outline-none focus:border-brand-600"
                    />
                  </div>
                ) : null}
              </div>

              <div className="mt-2">
                <p className="mb-1 text-[13px] font-semibold text-ink">{t("Expenses", "खर्च")}</p>
                <ExpenseRows items={expenses} onChange={setExpenses} />
              </div>
            </Card>
          </>
        ) : null}

        {/* No card chrome here — the placeholders say what these are, and the
            saved height keeps the whole form on one screen. */}
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={enteredBy}
            onChange={(e) => setTypedName(e.target.value)}
            aria-label={t("Your name", "आपका नाम")}
            placeholder={t("Your name", "आपका नाम")}
            className={`min-w-0 rounded-lg border bg-white px-2.5 py-2 text-base shadow-sm outline-none focus:border-brand-600 placeholder:text-slate-400 ${
              showIssues && !enteredBy.trim() ? "border-spend" : "border-hairline"
            }`}
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={t("Note", "नोट")}
            placeholder={t("Note (optional)", "नोट (वैकल्पिक)")}
            className="min-w-0 rounded-lg border border-hairline bg-white px-2.5 py-2 text-base shadow-sm outline-none focus:border-brand-600 placeholder:text-slate-400"
          />
        </div>

        {/* Alerts inline on desktop only; on mobile they live in the sticky bar. */}
        <div className="hidden space-y-2 lg:block">{alerts}</div>
      </div>

      {/* ---------------- summary: sidebar on desktop ---------------- */}
      <div className="hidden space-y-3 lg:sticky lg:top-16 lg:block">
        {!noActivity ? <DaySummary totals={totals} /> : null}
        {saveButton}
      </div>

      {/* ---------------- summary: sticky bar on phones ---------------- */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-white/95 backdrop-blur lg:hidden">
        {showDetails && !noActivity ? (
          <div className="max-h-[45vh] overflow-y-auto border-b border-hairline p-2">
            <DaySummary totals={totals} />
          </div>
        ) : null}

        {problems || warnings.length || serverError ? (
          <div className="space-y-1.5 border-b border-hairline p-2">{alerts}</div>
        ) : null}

        <div className="flex items-center gap-2 p-2">
          {!noActivity ? (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="min-w-0 flex-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-left transition active:bg-slate-100"
            >
              <span className="block text-[10px] font-semibold uppercase leading-tight tracking-wide text-ink-soft">
                {totals.cashInHand < 0 ? t("From outside", "बाहर से") : t("Cash to hand over", "देने के लिए नकद")}
                <span aria-hidden className="ml-1">
                  {showDetails ? "▾" : "▸"}
                </span>
              </span>
              <span
                className={`tnum block text-lg font-bold leading-tight ${
                  totals.cashInHand < 0 ? "text-spend" : "text-income"
                }`}
              >
                {rupees(totals.cashInHand)}
              </span>
            </button>
          ) : (
            <span className="flex-1 text-[13px] text-ink-soft">
              {t("Marked as a holiday", "छुट्टी चुनी गई है")}
            </span>
          )}
          <div className="w-32 shrink-0">{saveButton}</div>
        </div>
      </div>
    </div>
  );
}
