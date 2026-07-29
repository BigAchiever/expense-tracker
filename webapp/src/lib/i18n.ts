"use client";

import { createContext, useContext } from "react";
import type { Lang } from "./types";

export type { Lang };

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "en",
  setLang: () => {},
});

export function useLang() {
  return useContext(LangContext);
}

/** Picks the English or Hindi string for the active language. */
export function useT() {
  const { lang } = useLang();
  return (en: string, hi: string) => (lang === "hi" ? hi : en);
}

