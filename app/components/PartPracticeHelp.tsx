import { useLocale } from "~/lib/locale-context";
import type { PerformanceSeat } from "~/lib/performance-seats";

export function PartPracticeHelp({ issue, staffChoices, hasVoices, disabled, onChooseStaff }: {
  issue: "empty-part" | "no-accompaniment" | null;
  staffChoices: PerformanceSeat[];
  hasVoices: boolean;
  disabled: boolean;
  onChooseStaff: (id: string) => void;
}) {
  const { text } = useLocale();
  if (issue === "empty-part") return <p role="status">{text("このパートには音符がありません。別のパートを選ぶか「お手本」で聴けます。", "This part has no notes. Choose another part, or use Listen to hear the score.")}</p>;
  if (issue !== "no-accompaniment") return <p>{text("このパートを伴奏から抜きます。", "You play this part. The ensemble plays the rest.")}</p>;
  if (!hasVoices) return <p role="status">{text("伴奏の音符がありません。「お手本」で聴くか、伴奏を含む総譜を開いてください。", "This score has no accompaniment notes. Use Listen, or open a score with accompaniment.")}</p>;
  return <div className="studio-part-options">
    <p role="status">{text("全体を担当すると、伴奏が残りません。譜表や声部を選ぶと、残りの音符が伴奏になります。", "Choosing the whole part leaves no accompaniment. Choose a staff or voice to play with the remaining notes.")}</p>
    {staffChoices.length > 1 && <div>{staffChoices.map(seat => <button key={seat.id} disabled={disabled} onClick={() => onChooseStaff(seat.id)}>{text(`譜表${seat.staff}を担当`, `Play staff ${seat.staff}`)}</button>)}</div>}
    <small>{text("担当する音符を確かめてから「このパートで練習」を押してください。譜表の番号は右手・左手の指定ではありません。", "Check the selected notes, then choose Practise this part. Staff numbers do not specify the right or left hand.")}</small>
  </div>;
}
