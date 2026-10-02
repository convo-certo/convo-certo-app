import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "~/lib/locale-context";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ScoreDisplay } from "./ScoreDisplay";

const mock = vi.hoisted(() => {
  Object.assign(window, { __vite_plugin_react_preamble_installed__: true });
  return { loads: 0, lanes: [{ staff: "1", voice: "1" }] };
});

vi.mock("opensheetmusicdisplay", () => ({
  TransposeCalculator: class {},
  OpenSheetMusicDisplay: class {
    EngravingRules = {};
    Sheet = { TimestampSortedTempoExpressionsList: [] };
    GraphicSheet: { MeasureList: unknown[][] } = { MeasureList: [] };
    cursors = [];
    constructor(private container: HTMLElement) {}
    async load() { mock.loads++; }
    render() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.container.append(svg);
      this.GraphicSheet.MeasureList = [0, 1, 2].map(bar => [{
        MeasureNumber: bar + 1,
        parentSourceMeasure: { measureListIndex: bar, AbsoluteTimestamp: { RealValue: bar }, Duration: { RealValue: 1 } },
        staffEntries: mock.lanes.map(lane => ({ graphicalVoiceEntries: [{ notes: Array.from({ length: bar === 2 ? 1 : 4 }, (_, note) => {
          const element = document.createElementNS("http://www.w3.org/2000/svg", "g");
          svg.append(element);
          return {
            getSVGGElement: () => element,
            sourceNote: {
              getAbsoluteTimestamp: () => ({ RealValue: bar + note / 4 }),
              Length: { RealValue: bar === 2 ? 1 : 0.25 },
              isRest: () => bar === 2,
              ParentVoiceEntry: { ParentVoice: { VoiceId: lane.voice } },
              ParentStaff: { Id: lane.staff },
            },
          };
        }) }] })),
      }]);
    }
  },
}));

const measureNumbers = [1, 2, 3];
const measures: [] = [];

describe("score keyboard navigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  const seek = vi.fn();
  const annotate = vi.fn();

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    localStorage.clear();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() { this.callback([{ contentRect: { width: 600 } }]); }
      disconnect() {}
    });
    mock.loads = 0;
    mock.lanes = [{ staff: "1", voice: "1" }];
    seek.mockClear(); annotate.mockClear();
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  const render = async (interactive = true, focus: { staff?: string; voice?: string } = {}) => {
    await act(async () => root.render(<LocaleProvider><LanguageSwitcher /><ScoreDisplay musicXML="<score-partwise/>" currentMeasure={1} currentBeat={0} beatsPerMeasure={4} totalMeasures={3} engineState="idle" measures={measures} measureNumbers={measureNumbers} onSeek={interactive ? seek : undefined} onAnnotation={interactive ? annotate : undefined} focusStaff={focus.staff} focusVoice={focus.voice}/></LocaleProvider>));
    await act(async () => { await vi.waitFor(() => expect(container.querySelectorAll("[data-score-beat]")).toHaveLength(9 * mock.lanes.length)); });
  };
  const key = async (target: Element, value: string) => {
    const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
    await act(async () => { target.dispatchEvent(event); });
    return event;
  };
  const entry = () => container.querySelector<SVGGElement>('[data-score-beat][tabindex="0"]')!;

  it("offers one Tab stop and moves by complete bars, including a bar of rest", async () => {
    await render();
    expect(container.querySelectorAll("[data-score-beat]")).toHaveLength(9);
    expect(container.querySelectorAll('[data-score-beat][tabindex="0"]')).toHaveLength(1);
    expect(container.querySelectorAll("[data-score-keyboard]")).toHaveLength(3);
    expect(entry().dataset.scoreMeasure).toBe("1");
    await key(entry(), "ArrowRight");
    expect(entry().dataset.scoreMeasure).toBe("2");
    expect(document.activeElement).toBe(entry());
    await key(entry(), "Enter");
    expect(seek).toHaveBeenLastCalledWith(4);
    await key(entry(), "End");
    expect(entry().dataset.scoreMeasure).toBe("3");
    await key(entry(), " ");
    expect(seek).toHaveBeenLastCalledWith(8);
    await key(entry(), "Home");
    expect(entry().dataset.scoreMeasure).toBe("1");
    expect((await key(entry(), "Tab")).defaultPrevented).toBe(false);
  });

  it("opens the chosen bar's editor with keyboard focus and does not start audio", async () => {
    await render();
    const mark = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Mark the score"))!;
    await act(async () => mark.click());
    await key(entry(), "End");
    expect(entry().getAttribute("aria-label")).toBe("Bar 3: edit instructions");
    await key(entry(), "Enter");
    const editor = container.querySelector(".score-editor-focus")!;
    expect(editor.getAttribute("aria-label")).toBe("Bar 3 instructions");
    expect(document.activeElement).toBe(editor);
    expect(seek).not.toHaveBeenCalled();
    await act(async () => (editor.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(annotate).toHaveBeenCalledWith(3, { wait: { type: "listen" } });
  });

  it("updates accessible labels without reloading the score or losing its keyboard position", async () => {
    await render();
    await key(entry(), "ArrowRight");
    const selected = entry();
    expect(mock.loads).toBe(1);
    await act(async () => {
      const language = container.querySelector<HTMLSelectElement>(".language-switcher")!;
      language.value = "ja";
      language.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mock.loads).toBe(1);
    expect(entry()).toBe(selected);
    expect(entry().getAttribute("aria-label")).toBe("2小節のこの音から再生");
  });

  it("does not expose inert note buttons in a display without score actions", async () => {
    await render(false);
    expect(container.querySelectorAll("[data-score-beat][tabindex]")).toHaveLength(0);
    expect(container.querySelectorAll('[data-score-beat][role="button"]')).toHaveLength(0);
  });

  it("focuses every voice on the selected staff and keeps keyboard navigation on that staff", async () => {
    mock.lanes = [{ staff: "1", voice: "1" }, { staff: "1", voice: "2" }, { staff: "2", voice: "3" }];
    await render(true, { staff: "1" });
    expect(container.querySelectorAll('[data-score-focused="true"]')).toHaveLength(18);
    expect(container.querySelectorAll('[data-score-staff="2"][opacity="0.35"]')).toHaveLength(9);
    expect(container.querySelectorAll('[data-score-staff="1"].score-current-note')).toHaveLength(2);
    expect(container.querySelectorAll('[data-score-staff="2"].score-current-note')).toHaveLength(0);
    expect(container.textContent).toContain("All voices on your staff are highlighted");
    await key(entry(), "End");
    expect(entry().dataset.scoreStaff).toBe("1");
    expect(entry().dataset.scoreMeasure).toBe("3");
    await act(async () => {
      const language = container.querySelector<HTMLSelectElement>(".language-switcher")!;
      language.value = "ja"; language.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("譜表1（全声部）");
    expect(mock.loads).toBe(1);
  });

  it("retains specific voice focus when another staff uses the same voice number", async () => {
    mock.lanes = [{ staff: "1", voice: "1" }, { staff: "1", voice: "2" }, { staff: "2", voice: "2" }];
    await render(true, { staff: "1", voice: "2" });
    expect(container.querySelectorAll('[data-score-focused="true"]')).toHaveLength(9);
    expect(container.querySelectorAll('[data-score-staff="2"][opacity="0.35"]')).toHaveLength(9);
    expect(container.querySelectorAll(".score-current-note")).toHaveLength(1);
  });

  it("shows a visible fallback when the selected staff cannot be located in the notation", async () => {
    await render(true, { staff: "missing" });
    expect(container.querySelectorAll('[data-score-focused="true"]')).toHaveLength(9);
    expect(container.querySelectorAll('[opacity="0.35"]')).toHaveLength(0);
    expect(container.textContent).toContain("This staff could not be identified in the notation");
    expect(container.querySelectorAll('[data-score-beat][tabindex="0"]')).toHaveLength(1);
  });
});
