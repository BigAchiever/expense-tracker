import { recordsPasswordIsSet, recordsUnlocked } from "@/lib/auth";
import { expensesByCategory } from "@/lib/calc";
import { getEntry, getMonth, getSchools } from "@/lib/data";
import { isFuture, isValidISODate, isValidISOMonth, monthOf, todayISO } from "@/lib/format";
import { isConfigured } from "@/lib/supabase";
import { OnePage } from "@/components/OnePage";
import { SetupNotice } from "@/components/SetupNotice";
import type { School, DayEntry } from "@/lib/types";
import type { RecordsData } from "@/components/RecordsPanel";

export const dynamic = "force-dynamic";

/**
 * The whole app. Teachers land straight on the form — no sign-in — and the
 * records section below is the only thing behind a password.
 */
export default async function Page(props: PageProps<"/">) {
  if (!isConfigured()) return <SetupNotice />;

  const params = await props.searchParams;

  let schools: School[] = [];
  let school: School | undefined;
  let date = "";
  let entry: DayEntry | null = null;
  let records: RecordsData | null = null;
  let dbError: unknown = null;

  try {
    schools = await getSchools();

    if (schools.length > 0) {
      const requested = typeof params.school === "string" ? params.school : undefined;
      school = schools.find((s) => s.id === requested) ?? schools[0];

      const rawDate = typeof params.date === "string" ? params.date : "";
      // Calendar-checked, not just shape-checked: "2026-02-31" matches the regex
      // but Postgres rejects it, which used to crash the page into the boundary.
      date = isValidISODate(rawDate) && !isFuture(rawDate) ? rawDate : todayISO();

      const unlocked = await recordsUnlocked();

      // Every figure on the form is derived from that one day, so nothing here
      // leaks past data — only the Records section below needs the password.
      entry = await getEntry(school.id, date);

      const rawMonth = typeof params.month === "string" ? params.month : "";
      const month = isValidISOMonth(rawMonth) ? rawMonth : monthOf(date);

      records = unlocked
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
    }
  } catch (error) {
    dbError = error;
  }

  // Handle database connection/fetching errors
  if (dbError) {
    console.error("Database connection/fetch failed during page render:", dbError);
    const errMessage = dbError instanceof Error ? dbError.message : String(dbError);
    const isFetchFailed = errMessage.toLowerCase().includes("fetch failed") || errMessage.toLowerCase().includes("enotfound");

    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-6 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold text-lg">!</span>
            <h1 className="text-base font-bold text-red-950">Database Connection Failed</h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-red-800">
            The Next.js server was unable to retrieve data from the database. This usually means the database server is offline, the project has been paused/deleted, or the environment variables are misconfigured.
          </p>
          {isFetchFailed && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50/80 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-red-900">Troubleshooting</h2>
              <ul className="mt-2 list-inside list-disc text-xs space-y-1 text-red-850">
                <li>Check your <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in the Vercel Dashboard Project Settings.</li>
                <li>Make sure your Supabase project is active and has not been paused due to inactivity.</li>
                <li>Verify your internet connection if testing locally.</li>
              </ul>
            </div>
          )}
          <div className="mt-4">
            <span className="text-xs font-semibold text-red-900 uppercase tracking-wider">Error Details</span>
            <pre className="mt-1 max-h-48 overflow-auto rounded-xl border border-red-100 bg-white/80 p-4 font-mono text-[11px] leading-normal text-red-700 shadow-inner">
              {dbError instanceof Error ? dbError.stack || dbError.message : String(dbError)}
            </pre>
          </div>
        </div>
      </main>
    );
  }

  // Handle empty schools list
  if (!schools.length) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <p className="rounded-xl border border-hairline bg-white p-6 text-sm text-ink-soft">
          No schools found. Run <span className="font-mono">supabase/schema.sql</span> to seed them.
        </p>
      </main>
    );
  }

  // Under normal conditions, school is guaranteed to be defined because schools.length > 0
  const activeSchool = school!;

  return (
    <OnePage
      key={`${activeSchool.id}:${date}`}
      schools={schools}
      school={activeSchool}
      date={date}
      entry={entry}
      records={records}
      recordsConfigured={recordsPasswordIsSet()}
    />
  );
}
