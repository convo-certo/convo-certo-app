import { Link, useLocation } from "react-router";
import type { Locale } from "~/lib/i18n";
import { useLocale } from "~/lib/locale-context";
import { LanguageSwitcher } from "./LanguageSwitcher";

interface StageLayoutProps {
  children: React.ReactNode;
  locale?: Locale;
  immersive?: boolean;
}

export function StageLayout({ children, immersive = false }: StageLayoutProps) {
  const { text } = useLocale();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        height: immersive ? "100dvh" : undefined,
        overflow: immersive ? "hidden" : undefined,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <header className="stage-header" style={immersive ? {display:"none"} : undefined}>
        <Link to="/" className="stage-brand" aria-label={text("ConvoCerto ホーム", "ConvoCerto home")}>
          <img src="/brand/icon.svg" alt="" width="34" height="34"/><h1>ConvoCerto</h1>
        </Link>
        <nav aria-label={text("主な画面", "Main navigation")}>
          {currentPath === "/perform"
            ? <span aria-current="page">{text("共奏", "Play together")}</span>
            : <Link to="/perform">{text("共奏へ", "Play together")}</Link>}
          <a href="/credits.html" target="_blank" rel="noreferrer">{text("出典・クレジット", "Credits")}</a>
          <LanguageSwitcher />
        </nav>
      </header>

      <main
        style={{
          flex: 1,
          minHeight: immersive ? 0 : undefined,
          display: immersive ? "flex" : undefined,
          flexDirection: "column",
          overflow: immersive ? "hidden" : undefined,
          maxWidth: 1200,
          width: "100%",
          margin: "0 auto",
          padding: 16,
        }}
      >
        {children}
      </main>
    </div>
  );
}
