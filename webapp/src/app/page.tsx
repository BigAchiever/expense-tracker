import { recordsPasswordIsSet, recordsUnlocked } from "@/lib/auth";
import { expensesByCategory } from "@/lib/calc";
import { getEntry, getMonth, getSchools } from "@/lib/data";
import { isFuture, isValidISODate, isValidISOMonth, monthOf, todayISO } from "@/lib/format";
import { isConfigured } from "@/lib/supabase";
import { OnePage } from "@/components/OnePage";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

/**
 * The whole app. Teachers land straight on the form — no sign-in — and the
 * records section below is the only thing behind a password.
 */
export default async function Page(props: PageProps<"/">) {
  if (!isConfigured()) return <SetupNotice />;

  const params = await props.searchParams;
  const schools = await getSchools();

  if (!schools.length) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <p className="rounded-xl border border-hairline bg-white p-6 text-sm text-ink-soft">
          No schools found. Run <span className="font-mono">supabase/schema.sql</span> to seed them.
        </p>
      </main>
    );
  }

  const requested = typeof params.school === "string" ? params.school : undefined;
  const school = schools.find((s) => s.id === requested) ?? schools[0];

  const rawDate = typeof params.date === "string" ? params.date : "";
  // Calendar-checked, not just shape-checked: "2026-02-31" matches the regex
  // but Postgres rejects it, which used to crash the page into the boundary.
  const date = isValidISODate(rawDate) && !isFuture(rawDate) ? rawDate : todayISO();

  const unlocked = await recordsUnlocked();

  // Every figure on the form is derived from that one day, so nothing here
  // leaks past data — only the Records section below needs the password.
  const entry = await getEntry(school.id, date);

  const rawMonth = typeof params.month === "string" ? params.month : "";
  const month = isValidISOMonth(rawMonth) ? rawMonth : monthOf(date);

  const records = unlocked
    ? await (async () => {
        const view = await getMonth(school.id, month);
        return {
          month: view.month,
          schoolId: school.id,
          rows: view.rows,
          totals: view.totals,
          missingDays: view.missingDays,
          byCategory: expensesByCategory(view.rows.map((r) => r.entry)),
        };
      })()
    : null;

  return (
    <OnePage
      key={`${school.id}:${date}`}
      schools={schools}
      school={school}
      date={date}
      entry={entry}
      records={records}
      recordsConfigured={recordsPasswordIsSet()}
    />
  );
}
