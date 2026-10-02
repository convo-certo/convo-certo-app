import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "~/components/LanguageSwitcher";
import { t } from "./i18n";
import { LocaleProvider, LOCALE_STORAGE_KEY, useLocale } from "./locale-context";

vi.hoisted(() => { Object.assign(window, { __vite_plugin_react_preamble_installed__: true }); });

function Screen({ inspect }: { inspect?: (value: ReturnType<typeof useLocale>) => void }) {
  const value = useLocale();
  inspect?.(value);
  return <><LanguageSwitcher /><p>{value.text("楽譜を開く", "Open a score")}</p></>;
}

describe("application language", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    localStorage.clear();
    document.documentElement.lang = "en";
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const render = async () => {
    root = createRoot(container);
    await act(async () => root?.render(<LocaleProvider><Screen /></LocaleProvider>));
  };

  it("uses a saved preference ahead of the browser language without overwriting it", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["ja-JP"]);
    const write = vi.spyOn(Storage.prototype, "setItem");
    await render();
    expect(container.querySelector("p")?.textContent).toBe("Open a score");
    expect(document.documentElement.lang).toBe("en");
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    { languages: ["fr-FR", "ja-JP", "en-US"], language: "fr-FR", expected: "ja" },
    { languages: ["en-GB", "ja-JP"], language: "en-GB", expected: "en" },
    { languages: ["fr-FR", "de-DE"], language: "fr-FR", expected: "en" },
    { languages: [], language: "ja-JP", expected: "ja" },
  ])("chooses $expected for browser preferences $languages and $language", async ({ languages, language, expected }) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "invalid");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
    vi.spyOn(navigator, "language", "get").mockReturnValue(language);
    await render();
    expect(container.querySelector("select")?.value).toBe(expected);
    expect(document.documentElement.lang).toBe(expected);
  });

  it("persists an explicit language choice and updates the document and accessible name", async () => {
    await render();
    const select = container.querySelector("select")!;
    expect(select.getAttribute("aria-label")).toBe("Language");
    await act(async () => {
      select.value = "ja";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(select.getAttribute("aria-label")).toBe("言語");
    expect(container.querySelector("p")?.textContent).toBe("楽譜を開く");
  });

  it("keeps language selection usable when storage reads and writes are denied", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["ja-JP"]);
    await render();
    expect(document.documentElement.lang).toBe("ja");
    await act(async () => {
      const select = container.querySelector("select")!;
      select.value = "en";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.documentElement.lang).toBe("en");
    expect(container.querySelector("p")?.textContent).toBe("Open a score");
  });

  it("hydrates server markup without a mismatch before applying the saved language", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "ja");
    const tree = <LocaleProvider><Screen /></LocaleProvider>;
    container.innerHTML = renderToString(tree);
    expect(container.querySelector("p")?.textContent).toBe("Open a score");
    const recoverableError = vi.fn();
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: recoverableError }); });
    expect(recoverableError).not.toHaveBeenCalled();
    expect(container.querySelector("p")?.textContent).toBe("楽譜を開く");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("keeps translation callbacks stable across unrelated renders and preserves the existing dictionary API", async () => {
    let current: ReturnType<typeof useLocale> | undefined;
    const inspect = (value: ReturnType<typeof useLocale>) => { current = value; };
    root = createRoot(container);
    await act(async () => root?.render(<LocaleProvider><Screen inspect={inspect} /></LocaleProvider>));
    const previous = current;
    await act(async () => root?.render(<LocaleProvider><Screen inspect={inspect} /><span>Updated</span></LocaleProvider>));
    expect(current?.text).toBe(previous?.text);
    expect(current?.setLocale).toBe(previous?.setLocale);
    expect(t("ja", "uploadMusicXML")).toBe("MusicXML を読み込む");
    expect(t("en", "uploadMusicXML")).toBe("Upload MusicXML");
  });
});
