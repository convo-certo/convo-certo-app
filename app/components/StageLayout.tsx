import { Link, useLocation } from "react-router";
import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

interface StageLayoutProps {
  children: React.ReactNode;
  locale?: Locale;
}

const steps = [
  { path: "/step1", label: "1" },
  { path: "/step2", label: "2" },
  { path: "/step3", label: "3" },
  { path: "/step4", label: "4" },
] as const;

export function StageLayout({ children, locale = "ja" }: StageLayoutProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          background: "#1a237e",
          color: "#fff",
        }}
      >
        <Link
          to="/"
          style={{
            textDecoration: "none",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            ConvoCerto
          </h1>
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {steps.map((step) => {
            const isActive = currentPath === step.path;
            const stepNum = parseInt(step.label);
            const currentNum = steps.findIndex((s) => s.path === currentPath) + 1;

            return (
              <Link
                key={step.path}
                to={step.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: isActive
                    ? "#fff"
                    : stepNum <= currentNum
                      ? "rgba(255,255,255,0.3)"
                      : "rgba(255,255,255,0.1)",
                  color: isActive ? "#1a237e" : "#fff",
                  textDecoration: "none",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 14,
                  transition: "all 0.2s ease",
                }}
              >
                {step.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main
        style={{
          flex: 1,
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
