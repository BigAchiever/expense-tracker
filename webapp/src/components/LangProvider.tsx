"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { LangContext, useLang, type Lang } from "@/lib/i18n";

const KEY = "sxm_lang";

/**
 * The chosen language is browser state, not React state — it has to survive a
 * reload and it is not known during server rendering. `useSyncExternalStore`
 * models exactly that: the server (and the hydration pass) sees "en", then the
 * client swaps to whatever localStorage holds, without a setState-in-effect
 * cascade.
 */
const listeners = new Set<() => void>();
let cached: Lang | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): Lang {
  if (cached === null) {
    const saved = window.localStorage.getItem(KEY);
    cached = saved === "hi" || saved === "en" ? saved : "en";
  }
  return cached;
}

const getServerSnapshot = (): Lang => "en";

function writeLang(next: Lang) {
  cached = next;
  window.localStorage.setItem(KEY, next);
  for (const fn of listeners) fn();
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setLang = useCallback((next: Lang) => writeLang(next), []);

  // Keeps screen readers and font selection in step with the visible language.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "hi" : "en")}
      aria-label={lang === "en" ? "हिंदी में बदलें" : "Switch to English"}
      className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold transition hover:bg-white/15 ${className}`}
    >
      {lang === "en" ? "हिं" : "EN"}
    </button>
  );
}
