"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { formatDateLong } from "@/lib/format";
import { LangToggle } from "./LangProvider";

interface AppHeaderProps {
  activeTab: "entry" | "records";
  schoolId: string;
  date: string;
}

export function AppHeader({ activeTab, schoolId, date }: AppHeaderProps) {
  const t = useT();

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-800 bg-slate-950/95 text-slate-100 shadow-lg backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
        {/* Brand & Date */}
        <div className="flex items-center gap-3">
          <Link
            href={`/?date=${date}&school=${schoolId}`}
            className="flex items-center gap-2 group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 font-black text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform duration-200">
              ₹
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black tracking-tight text-white leading-none">
                {t("Symbiosis", "सिम्बायोसिस")}
              </span>
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest leading-none mt-0.5">
                {t("Expense Manager", "ख़र्च मैनेजर")}
              </span>
            </div>
          </Link>
          <span className="hidden h-4 w-px bg-slate-800 sm:inline" />
          <span className="hidden truncate text-xs font-medium text-slate-400 tnum sm:inline">
            {formatDateLong(date)}
          </span>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80">
          <Link
            href={`/?date=${date}&school=${schoolId}`}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
              activeTab === "entry"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
              />
            </svg>
            <span>{t("Daily Form", "दैनिक फ़ॉर्म")}</span>
          </Link>

          <Link
            href={`/records?date=${date}&school=${schoolId}`}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
              activeTab === "records"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H5.625a1.125 1.125 0 01-1.125-1.125v-2.25c0-.621.504-1.125 1.125-1.125z"
              />
            </svg>
            <span>{t("Ledger", "रिकॉर्ड बही")}</span>
          </Link>
        </nav>

        {/* Language selector */}
        <div className="flex items-center gap-2">
          <LangToggle className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-bold transition hover:bg-slate-850 hover:text-white" />
        </div>
      </div>
    </header>
  );
}
