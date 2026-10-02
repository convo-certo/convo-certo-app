import { useMemo, useState } from "react";
import { keyChoices, keyLabel, writtenScoreKey, type ScoreKey } from "~/lib/musicxml-key";
import { useLocale } from "~/lib/locale-context";

const englishKeyErrors: Record<string, string> = {
  "特殊な調号の移調にはまだ対応していません。": "This key signature is not supported for transposition yet.",
  "長調・短調の調号を選べる楽譜でお試しください。": "Choose a score with a standard major or minor key signature.",
  "担当パートを確認してください。": "Check your selected part.",
  "同じ長調・短調の中から調を選んでください。": "Keep a major key major, or a minor key minor.",
  "特殊な調号・運指・装飾音の臨時記号を含むため、安全に移調できません。楽譜ソフトで移調してください。": "This notation needs to be transposed in your notation app because it contains special key signatures, fingerings or ornament accidentals.",
  "微分音など、半音単位でない音高にはまだ対応していません。": "Microtones are not supported for transposition yet.",
  "移調後の音域・臨時記号を表せません。別の調を選んでください。": "The resulting pitches or accidentals are out of range. Choose another key.",
  "別パートや曲中の転調で調号が7個を超えます。同じ響きの別の調を選んでください。": "Another part or key change would need more than seven sharps or flats. Choose an equivalent key spelling.",
};

export function ScoreKeyControl({ xml, partId, disabled, onApply }: { xml: string; partId?: string; disabled: boolean; onApply: (fifths: number) => Promise<void> }) {
  const { text } = useLocale();
  const label = (value: ScoreKey) => text(keyLabel(value), `${(value.mode === "minor" ? ["A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯", "G♯", "D♯", "A♯"] : ["C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯"])[value.fifths + 7]} ${value.mode}`);
  const errorText = (message: string) => text(message, englishKeyErrors[message] ?? "This score could not be transposed. Try another key, or transpose it in your notation app.");
  const source = useMemo(() => {
    try { return { key: writtenScoreKey(xml, partId), error: "" }; }
    catch (error) { return { key: null, error: (error as Error).message }; }
  }, [xml, partId]);
  const [target, setTarget] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const key = source.key;
  return <details className="score-key-menu"><summary>{text("調：", "Key: ")}{key ? label(key) : text("確認", "Check")}</summary><div>
    {key ? <><label>{text("変更先の調", "New key")}<select aria-label={text("変更先の調", "New key")} value={target ?? key.fifths} disabled={disabled || working} onChange={e => { setTarget(Number(e.target.value)); setError(""); }}>{keyChoices(key.mode).map(k => <option value={k.fifths} key={k.fifths}>{label(k)}{text(k.mode === "major" && k.fifths === -2 ? "（B♭）" : k.mode === "major" && k.fifths === 5 ? "（B♮）" : "", "")}</option>)}</select></label>
    <button disabled={disabled || working || target == null || target === key.fifths} onClick={async () => {
      if (target == null) return;
      setWorking(true); setError("");
      try { await onApply(target); setTarget(null); }
      catch (reason) { setError((reason as Error).message); }
      finally { setWorking(false); }
    }}>{working ? text("移調中…", "Transposing…") : text("楽譜を移調", "Transpose score")}</button>
    <small>{text("担当パートの記譜の調。全パートを近い音域へ移調します。保存メニューからMusicXMLを書き出せます。", "The written key of your part. All parts move to the nearest range. Export MusicXML from the save menu.")}</small></> : <p>{errorText(source.error)}</p>}
    {error && <p role="alert">{errorText(error)}</p>}
  </div></details>;
}
