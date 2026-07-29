"use client";

import { useT } from "@/lib/i18n";
import { formatDateLong } from "@/lib/format";
import { LangToggle } from "./LangProvider";
import { EntryForm } from "./EntryForm";
import { RecordsPanel, type RecordsData } from "./RecordsPanel";
import type { DayEntry, School } from "@/lib/types";

/**
 * One page, top to bottom:
 *
 *   1. the form a teacher fills in — sized to fit a phone screen without
 *      scrolling in its default state
 *   2. the records section, behind a password, below the fold
 *
 * There is no sign-in. Anyone who opens the link can log the day; only the
 * records are private.
 */
export function OnePage({
  schools,
  school,
  date,
  entry,
  records,
  recordsConfigured,
}: {
  schools: School[];
  school: School;
  date: string;
  entry: DayEntry | null;
  records: RecordsData | null;
  recordsConfigured: boolean;
}) {
  const t = useT();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 bg-brand-600 text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-3 py-2">
          <span className="text-sm font-bold">{t("Expense Manager", "ख़र्च मैनेजर")}</span>
          <span className="hidden truncate text-xs text-white/70 sm:inline">{formatDateLong(date)}</span>
          <a
            href="#records"
            className="ml-auto rounded-lg px-2 py-1 text-xs font-medium transition hover:bg-white/15"
          >
            {t("Records", "रिकॉर्ड")}
          </a>
          <LangToggle className="px-2 py-1 text-xs" />
        </div>
      </header>

      {/* pb leaves room for the sticky action bar on phones */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-3 pb-32 pt-2 lg:pb-8">
        <EntryForm
          schools={schools}
          school={school}
          date={date}
          entry={entry}
        />

        <RecordsPanel school={school} date={date} records={records} configured={recordsConfigured} />
      </main>
    </div>
  );
}
