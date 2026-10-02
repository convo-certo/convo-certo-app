import { useEffect, useState } from "react";
import { parseMusicXML } from "~/lib/musicxml-parser";
import type { ParsedScore } from "~/lib/types";
import { ExpressionPreview } from "./ExpressionPreview";
import { useLocale } from "~/lib/locale-context";

const annotations: [] = [];
const beforePlay = () => {};

function DemoPlayer() {
  const { text } = useLocale();
  const [score, setScore] = useState<ParsedScore | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/scores/sample-duet.musicxml", { signal: controller.signal });
        if (!response.ok) throw new Error("Demo score unavailable");
        const parsed = parseMusicXML(await response.text());
        const melody = parsed.parts[0];
        const demo = { ...parsed, parts: [{ ...melody, name: "Piano", midiProgram: 0, isSolo: true, notes: melody.notes.map(note => ({ ...note, partIndex: 0 })) }], measures: [] };
        if (!controller.signal.aborted) setScore(demo);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, []);
  return <>{score ? <ExpressionPreview demo score={score} measure={1} annotations={annotations} tempo={100} onBeforePlay={beforePlay}/> : <p role={error ? "alert" : "status"}>{error ? text("サンプルを読み込めませんでした。閉じて、もう一度開いてください。", "Couldn't load the demo. Close this panel and open it again.") : text("短いフレーズを準備中…", "Preparing a short phrase…")}</p>}</>;
}

export function ExpressionDemo() {
  const { text } = useLocale();
  const [open, setOpen] = useState(false);
  return <details className="expression-demo" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>♫ {text("短いフレーズで、音の変化を試す", "Hear how expression changes a phrase")}</summary>
    {open && <><p>{text("ド・レ・ミ・ファ → ソ・ミ。同じ2小節の長さ・強さ・間を聴き比べます。", "C–D–E–F → G–E. Hear how note length, dynamics and timing change the same two bars.")}</p><DemoPlayer/></>}
  </details>;
}
