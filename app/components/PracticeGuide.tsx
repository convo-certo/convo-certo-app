import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "~/lib/locale-context";
import "~/practice-guide.css";

function usePracticeLessons() {
  const { text } = useLocale();
  return [
    {
      title: text("楽譜を用意する", "Bring a score"),
      control: "MusicXML / MXL",
      summary: text("自分のパートと伴奏が、ひとつの総譜に入っていることが大切です。", "Your part and the accompaniment need to be in the same score."),
      actions: [
        text("楽譜作成ソフトで総譜をMusicXMLまたはMXLに書き出し、「楽譜ファイルを選ぶ」から開きます。", "Export the full score as MusicXML or MXL from your notation app, then choose “Choose a score”."),
        text("楽譜がなければ「収録曲で試す」へ。演奏する場合は「デュエットの楽器」で自分の楽器を選んでから「短いデュエット」を開きます。楽器なしで聴くだけでも試せます。", "If you do not have a score, choose “Try a starter score”. To play along, select “Your duet instrument” before opening “A short duet”. You can also listen without an instrument."),
      ],
      note: text("PDFや写真は開けません。旋律だけの楽譜に、新しい伴奏を作る機能はありません。", "PDFs and photos cannot be opened. A melody-only score will not create new accompaniment."),
    },
    {
      title: text("自分のパートを選ぶ", "Choose your part"),
      control: text("♩ あなたのパート", "♩ Your part"),
      summary: text("あなたが担当する音を抜いて、残りのパートを伴奏にします。", "You play the selected part. The ensemble plays the rest."),
      actions: [
        text("「担当パート」で自分が演奏するパートを選びます。最初の候補が自分のパートとは限りません。管・弦・鍵盤など、総譜に入っているパートから選べます。", "Choose the part you will play under “Your part”. Check the initial suggestion: it may be a different instrument. You can select wind, string, keyboard and other parts present in the score."),
        text("ピアノなどの複数譜表では「譜表1（全声部）」のような担当も選べます。その譜表の音を自分で演奏し、残りを伴奏にします。", "For a score with several staves, you can choose a part such as “staff 1 (all voices)”. Play that staff while the remaining notes provide accompaniment."),
        text("「手元の楽器」で移調を確認し、「このパートで練習」を押します。マイクを接続せずに進むと、一定テンポで練習できます。", "Check “Your instrument” for the correct transposition, then choose “Practise this part”. Leave the microphone off to practise at a fixed tempo."),
      ],
      note: text("B♭・A・F・E♭などの楽器は、自分の楽器に合う設定を選びます。楽器を変えると伴奏の高さも変わります。", "For a B♭, A, F or E♭ instrument, select its key. Changing the instrument key also shifts the accompaniment."),
    },
    {
      title: text("聴いてから、一緒に演奏", "Listen, then join in"),
      control: text("♫ お手本 → ▶ 演奏する", "♫ Listen → ▶ Play"),
      summary: text("「お手本」は自分のパートも再生。「演奏する」は伴奏だけを再生します。", "“Listen” includes your part. “Play” leaves your part to you."),
      actions: [
        text("「お手本」を押して、入りとフレーズを確認します。「試聴を止める」で止められます。", "Choose “Listen” to hear the entry and phrase. Choose “Stop listening” to stop."),
        text("「演奏する」を押し、カウントインのあとで楽譜に合わせて演奏します。「停止」で止めます。マイクなしでも伴奏は鳴ります。", "Choose “Play”, then join the score after the count-in. Choose “Stop” to stop. Accompaniment plays even with the microphone off."),
      ],
      note: text("休符や長い前奏では、すぐに自分の音が始まらないことがあります。入りに近い小節を「区間」で選ぶと練習しやすくなります。", "Your part may begin after rests or an introduction. Use “Loop” to practise a passage closer to your entry."),
    },
    {
      title: text("短い区間を、自分の速さで", "Make a passage manageable"),
      control: text("BPM + ↻ 区間", "BPM + ↻ Loop"),
      summary: text("まずは2〜4小節。難しい箇所をゆっくり、何度でも。", "Start with two to four bars. Slow down a difficult passage and repeat it."),
      actions: [
        text("停止してから「BPM」の数字を押し、テンポを下げます。同じ画面でカウントインを1小節か2小節にすると、楽器を構える時間を作れます。", "Stop, choose the BPM number, and lower the tempo. Set a one- or two-bar count-in in the same panel to give yourself time to get ready."),
        text("長い前奏を飛ばすなら、「区間」の「自分の入りの4小節」を選びます。「入りの1小節前から」なら、伴奏を聴いて入れます。選んだだけでは再生しません。", "To skip a long introduction, choose “4 bars from my first entry” in Loop. “One bar before my entry” includes the lead-in accompaniment. Selecting a passage does not start playback."),
        text("「区間」で開始・終了小節を入れ、「くり返す」を押します。「演奏する」で練習し、終わったら「くり返し ON」を押して解除します。", "In “Loop”, set the start and end bars and choose “Turn loop on”. Choose “Play” to practise. Choose “Loop on” again when you want to stop repeating."),
      ],
      note: text("反復記号がある曲では、区間の小節番号は再生順です。譜面に印刷された番号と異なる場合があります。", "In scores with repeats, loop bar numbers follow playback order and may differ from the printed score."),
    },
    {
      title: text("表情を試して、次回に残す", "Shape it and keep it"),
      control: text("◒ 表情 + ••• 保存と設定", "◒ Expression + ••• Save and settings"),
      summary: text("音の変化を聴き比べてから、譜面と練習設定を保存できます。", "Compare the sound before keeping a change, then save your score and practice settings."),
      actions: [
        text("「表情」で「A この指示なし」と「B 変化を聴く」を聴き比べます。気に入ったら「楽譜に残す」。試聴するだけでは譜面は変わりません。", "In “Expression”, compare “A Without this change” and “B Hear the change”. Choose “Add to score” to apply it. Previewing alone does not change the score."),
        text("鉛筆の「楽譜に書き込む」を押し、音符を選ぶと小節にメモを残せます。自由な文章は自分用メモで、音への指示は「表情」から選びます。", "Choose the pencil, “Mark the score”, then a note to add a bar note. Free text is a reminder for you; use “Expression” for changes to the sound."),
        text("「••• 保存と設定」から「この練習を保存」を押すと、この端末の「マイ楽譜」から再開できます。別の端末へ持ち運ぶなら「練習ファイルを書き出す」を使います。", "Open “••• Save and settings” and choose “Save practice” to resume from “My scores” on this device. Use “Export practice file” to move your score and settings to another device."),
      ],
      note: text("「指示付きMusicXMLを保存」は他の楽譜ソフトへ渡すための楽譜です。テンポ・区間などの練習設定ごと残すには、練習ファイルを書き出してください。", "“Export annotated MusicXML” creates a score for other notation apps. Export a practice file to keep practice settings such as tempo and loop too."),
    },
  ];
}

export function PracticeLessons() {
  const lessons = usePracticeLessons();
  return <ol className="practice-lessons">{lessons.map((lesson, index) => <li key={index}>
    <span className="practice-lesson-number" aria-hidden="true">0{index + 1}</span>
    <article id={`lesson-${index + 1}`}>
      <h2>{lesson.title}</h2>
      <p className="practice-lesson-summary">{lesson.summary}</p>
      <p className="practice-lesson-control">{lesson.control}</p>
      <ol>{lesson.actions.map(action => <li key={action}>{action}</li>)}</ol>
      <p className="practice-lesson-note">{lesson.note}</p>
    </article>
  </li>)}</ol>;
}

export function PracticeGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { text } = useLocale();
  const lessons = usePracticeLessons();
  const [step, setStep] = useState(2);
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLElement>(null);
  const heading = useId();
  const lesson = lessons[step];
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [open, step]);
  return <dialog ref={dialog} className="practice-guide-dialog" aria-labelledby={heading} onClose={onClose}>
    <header><p>{text("練習ガイド", "Practice guide")}</p><button type="button" autoFocus aria-label={text("ガイドを閉じる", "Close guide")} onClick={() => dialog.current?.close()}>×</button></header>
    <nav aria-label={text("ガイドの手順", "Guide steps")}>{lessons.map((item, index) => <button type="button" key={index} aria-pressed={step === index} aria-label={`${index + 1}. ${item.title}`} onClick={() => setStep(index)}>{index + 1}</button>)}</nav>
    <section ref={content} className="practice-guide-current" tabIndex={0} aria-live="polite" aria-atomic="true">
      <p className="practice-lesson-control">{lesson.control}</p>
      <h2 id={heading}>{lesson.title}</h2>
      <p className="practice-lesson-summary">{lesson.summary}</p>
      <ol>{lesson.actions.map(action => <li key={action}>{action}</li>)}</ol>
      <p className="practice-lesson-note">{lesson.note}</p>
    </section>
    <footer>
      <button type="button" disabled={step === 0} onClick={() => setStep(value => value - 1)}>{text("← 前へ", "← Previous")}</button>
      {step < lessons.length - 1 ? <button type="button" onClick={() => setStep(value => value + 1)}>{text("次へ →", "Next →")}</button> : <button type="button" onClick={() => dialog.current?.close()}>{text("練習に戻る", "Back to practice")}</button>}
    </footer>
  </dialog>;
}
