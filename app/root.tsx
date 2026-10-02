import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { LocaleProvider, useLocale } from "~/lib/locale-context";
import "./app.css";
import "./studio.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/brand/icon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/brand/icon-180.png" },
  { rel: "preload", href: "/fonts/inter/InterVariable.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <LocaleProvider>{children}</LocaleProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { text } = useLocale();
  let message = text("画面を開けませんでした", "This page could not be opened");
  let details = text("もう一度読み込むか、ホームからやり直してください。", "Reload the page, or return home and try again.");
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : text("画面を開けませんでした", "This page could not be opened");
    details =
      error.status === 404
        ? text("お探しのページが見つかりませんでした。", "The requested page could not be found.")
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      <Link to="/">{text("ホームに戻る", "Return home")}</Link>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
