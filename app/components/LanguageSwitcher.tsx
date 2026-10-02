import { useLocale } from "~/lib/locale-context";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, text } = useLocale();
  return <select className={`language-switcher ${className}`.trim()} aria-label={text("言語", "Language")} title={text("言語", "Language")} value={locale} onChange={event => setLocale(event.target.value === "ja" ? "ja" : "en")}>
    <option value="en" lang="en">English</option>
    <option value="ja" lang="ja">日本語</option>
  </select>;
}
