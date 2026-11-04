"use client";

import { useEffect, useState } from "react";
import { LANGS, isLang, type Lang } from "@/lib/i18n";

/** Remembers the chosen language on this device only (browser storage). */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try { const l = localStorage.getItem("eco_lang"); if (isLang(l)) setLang(l); } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem("eco_lang", lang); } catch {}
  }, [lang]);
  return [lang, setLang];
}

export function LangGrid({ lang, onPick }: { lang: Lang; onPick: (l: Lang) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.code} role="radio" aria-checked={lang === l.code} onClick={() => onPick(l.code)}
          className={`min-h-[52px] rounded-xl border-2 px-1 text-base font-bold transition ${
            lang === l.code ? "border-eco bg-eco text-white" : "border-neutral-300 bg-white text-ink hover:border-eco"}`}>
          {l.native}
        </button>
      ))}
    </div>
  );
}

export function LangButton({ lang, label, onPick }: { lang: Lang; label: string; onPick: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === lang)!;
  return (
    <>
      <button onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="flex min-h-[44px] items-center gap-1 rounded-full border-2 border-eco px-4 text-base font-bold text-eco">
        <span aria-hidden>🌐</span>{current.native}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={label}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-xl font-extrabold">{label}</h2>
            <LangGrid lang={lang} onPick={(l) => { onPick(l); setOpen(false); }} />
          </div>
        </div>
      )}
    </>
  );
}
