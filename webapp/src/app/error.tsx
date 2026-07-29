"use client";

import { useT } from "@/lib/i18n";

/**
 * Shown when a page-level render fails.
 *
 * This must not claim the teacher's work is safe. When a save rejects, this
 * boundary replaces the form and everything typed into it is gone — an earlier
 * version said "Nothing was lost", which was false in exactly the situation
 * that produced it. (The form now catches its own network failures, so the
 * common case never reaches here at all.)
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-hairline bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-ink">
          {t("Something went wrong", "कुछ गड़बड़ हो गई")}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {t(
            "This page could not load. If you were filling in a day, check it afterwards — anything not yet saved will need entering again.",
            "यह पेज लोड नहीं हो सका। अगर आप कोई दिन भर रहे थे, तो बाद में जाँच लें — जो सेव नहीं हुआ वह दोबारा भरना होगा।",
          )}
        </p>

        {error.digest ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs break-words text-ink-soft">
            {t("Reference", "रेफ़रेंस")}: {error.digest}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-hairline py-3 font-semibold text-ink transition hover:bg-slate-50"
          >
            {t("Try again", "फिर कोशिश करें")}
          </button>
          {/* reset() re-renders without re-fetching; on a data error a full
              reload is what actually recovers a force-dynamic page. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-700"
          >
            {t("Reload the page", "पेज रीलोड करें")}
          </button>
        </div>
      </div>
    </main>
  );
}
