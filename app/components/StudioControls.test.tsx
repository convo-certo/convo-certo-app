import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_STORAGE_KEY, LocaleProvider } from "~/lib/locale-context";
import { StudioControls } from "./StudioControls";

vi.hoisted(() => { Object.assign(window, { __vite_plugin_react_preamble_installed__: true }); });
vi.mock("./PracticeGuide", () => ({ PracticeGuideDialog: () => null }));

describe("studio first-entry controls", () => {
  let container: HTMLDivElement;
  let root: Root;
  let props: ComponentProps<typeof StudioControls>;
  let scrollDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "ja");
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    container = document.createElement("div");
    container.className = "score-page";
    container.scrollTo = vi.fn();
    document.body.append(container);
    root = createRoot(container);
    props = {
      state: { status: "idle", beat: 0, measure: 1, tempo: 100, mode: "follow", confidence: 0, matchedBeat: null },
      busy: false, mode: "accompany", partName: "Flute", inputLabel: "Fixed tempo", children: null, partPicker: null,
      onPlay: vi.fn(), onListen: vi.fn(), onTempo: vi.fn(), onLoop: vi.fn(), loop: false, first: 1, last: 20, total: 20,
      onRange: vi.fn(), entryRange: { first: 9, last: 12 }, hasAccompaniment: true, onSelectEntry: vi.fn(),
      countIn: 1, onCountIn: vi.fn(), onSave: vi.fn(), saved: false, onExport: vi.fn(), onExportXML: vi.fn(), onSettings: vi.fn(),
      volume: 80, onVolume: vi.fn(), onRestart: vi.fn(),
    };
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  });

  const render = async () => { await act(async () => root.render(<LocaleProvider><StudioControls {...props}/></LocaleProvider>)); };
  const button = (label: string) => [...container.querySelectorAll("button")].find(element => (element.getAttribute("aria-label") ?? element.textContent) === label)!;
  const click = async (label: string) => { const target = button(label); expect(target).toBeDefined(); await act(async () => target.click()); };

  it("keeps six main tools and selects an entry without starting playback, including during playback", async () => {
    props.state.status = "playing";
    await render();
    expect(container.querySelectorAll(".studio-toolbar > button")).toHaveLength(6);
    await click("↻ 区間");
    expect(button("自分の入りの4小節").disabled).toBe(false);
    await click("自分の入りの4小節");
    await click("入りの1小節前から");
    expect(props.onSelectEntry).toHaveBeenNthCalledWith(1, false);
    expect(props.onSelectEntry).toHaveBeenNthCalledWith(2, true);
    expect(props.onPlay).not.toHaveBeenCalled();
    expect(props.onListen).not.toHaveBeenCalled();
    expect(props.onRange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("区間を選ぶと停止します");
    await click("練習ツールを閉じる");
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("disables both shortcuts for an empty line and for an in-progress load", async () => {
    props.entryRange = null;
    await render();
    await click("↻ 区間");
    expect(button("自分の入りの4小節").disabled).toBe(true);
    expect(button("入りの1小節前から").disabled).toBe(true);
    expect(container.textContent).toContain("このパートには演奏できる音符がありません");
    props.entryRange = { first: 9, last: 12 };
    props.busy = true;
    await render();
    await click("自分の入りの4小節");
    await click("入りの1小節前から");
    expect(props.onSelectEntry).not.toHaveBeenCalled();
  });

  it("keeps solo entry selection available but explains why an accompaniment lead-in is unavailable", async () => {
    props.hasAccompaniment = false;
    await render();
    await click("↻ 区間");
    expect(button("自分の入りの4小節").disabled).toBe(false);
    expect(button("入りの1小節前から").disabled).toBe(true);
    expect(container.textContent).toContain("伴奏の音符がありません");
    await click("自分の入りの4小節");
    expect(props.onSelectEntry).toHaveBeenCalledWith(false);
    expect(props.onPlay).not.toHaveBeenCalled();
  });

  it("discloses a first-bar entry and labels a shortened passage accurately in English", async () => {
    props.entryRange = { first: 1, last: 4 };
    await render();
    await click("↻ 区間");
    expect(button("入りの1小節前から").disabled).toBe(true);
    expect(container.textContent).toContain("曲の最初から入るため");
    await act(async () => root.unmount());
    root = createRoot(container);
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    props.entryRange = { first: 19, last: 20 };
    props.repeated = true;
    await render();
    await click("↻ Loop");
    expect(button("2 bars from my first entry").disabled).toBe(false);
    expect(container.textContent).toContain("Bars 19–20");
    expect(container.textContent).toContain("including repeats");
    expect(container.textContent).toContain("Selecting a passage pauses playback");
  });
});
