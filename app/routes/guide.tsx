import { Link } from "react-router";
import type { Route } from "./+types/guide";
import { LanguageSwitcher } from "~/components/LanguageSwitcher";
import { PracticeLessons } from "~/components/PracticeGuide";
import { useLocale } from "~/lib/locale-context";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ConvoCerto — Practice guide / 練習ガイド" }, { name: "description", content: "From your MusicXML score to your first rehearsal. 楽譜の準備から、担当選択・演奏・練習の保存まで。" }];
}

export default function Guide() {
  const { text } = useLocale();
  return <main className="practice-guide-page">
    <header className="practice-guide-header"><Link className="brand-lockup" to="/" aria-label={text("ConvoCerto ホーム", "ConvoCerto home")}><img src="/brand/icon.svg" alt="" width="40" height="40"/><span>ConvoCerto</span></Link><LanguageSwitcher /></header>
    <section className="practice-guide-intro">
      <p className="practice-guide-eyebrow">YOUR FIRST REHEARSAL</p>
      <h1>{text("はじめの一音まで、", "From a score")}<br/><em>{text("迷わずに。", "to your first phrase.")}</em></h1>
      <p>{text("楽譜を開いて、自分のパートを選ぶ。まずはマイクなしで聴いて、短い区間から一緒に演奏してみましょう。", "Open a score and choose your part. Start by listening with the microphone off, then join the ensemble for a short passage.")}</p>
      <div className="practice-guide-actions"><Link to="/perform?catalog=1">{text("収録曲で試す", "Try a starter score")} <span aria-hidden="true">↗</span></Link><Link to="/perform">{text("自分のMusicXMLを開く", "Open your MusicXML")} <span aria-hidden="true">→</span></Link></div>
      <p className="practice-guide-small">{text("5つの手順 · マイク・MIDI・アカウントなしで始められます", "Five steps · No microphone, MIDI device or account needed to begin")}</p>
    </section>
    <nav className="practice-guide-index" aria-label={text("ガイドの目次", "Guide contents")}>
      {[text("楽譜の準備", "Your score"), text("担当を選ぶ", "Your part"), text("聴く・演奏する", "Listen & play"), text("テンポ・区間", "Tempo & loop"), text("表情・保存", "Expression & save")].map((label, index) => <a key={index} href={`#lesson-${index + 1}`}><span>0{index + 1}</span>{label}</a>)}
    </nav>
    <PracticeLessons />
    <section id="instruments" className="practice-guide-inputs" aria-labelledby="guide-inputs">
      <p className="practice-guide-eyebrow">PLAY YOUR WAY</p>
      <h2 id="guide-inputs">{text("楽器と練習に合わせて選ぶ", "Choose how to practise")}</h2>
      <div>
        <article><span aria-hidden="true">♩</span><h3>{text("まずは、一定テンポ", "Start at a fixed tempo")}</h3><p>{text("どの楽器でも、入力機器なしで伴奏と練習できます。和音や無音程打楽器も、この方法から始められます。担当パートを確認して「演奏する」を押してください。", "Play any instrument with accompaniment and no input device. This also works for chords and unpitched percussion. Confirm your part and choose “Play”.")}</p></article>
        <article><span aria-hidden="true">♪</span><h3>{text("単音の旋律は、マイクでも", "Use a mic for single notes")}</h3><p>{text("管楽器・弦楽器・鍵盤の単音向けです。「楽器とマイクを確認」からマイクを接続し、ヘッドホンを使って、表示された最初の音を鳴らします。一音チェックで楽器と音の一致を確認してください。", "For single notes on wind, string or keyboard instruments, open “Check instrument and microphone”. Use headphones, connect the mic and play the displayed first note. The one-note check helps confirm your instrument and pitch.")}</p></article>
        <article><span aria-hidden="true">♬</span><h3>{text("鍵盤・電子楽器は、MIDIでも", "Use MIDI with electronic instruments")}</h3><p>{text("MIDI対応の鍵盤や電子楽器を接続し、「MIDI・一定テンポで練習する」→「MIDI・移調の設定」で機器を選びます。音符の受信を確認してから演奏へ。和音にはMIDI入力を使います。", "Connect a MIDI keyboard or electronic instrument, then choose “MIDI or fixed-tempo practice” → “MIDI and transposition settings”. Select your device and check that a note is received. Use MIDI input for chords.")}</p></article>
      </div>
    </section>
    <section className="practice-guide-questions" aria-labelledby="guide-questions">
      <h2 id="guide-questions">{text("途中で迷ったら", "If you get stuck")}</h2>
      <details><summary>{text("音が出ません", "I cannot hear the score")}</summary><p>{text("「お手本」を押して確認します。端末の音量・出力先と「••• 保存と設定」の伴奏音量を確認してください。休符の区間やミュートしたパートだけでは音が出ません。音声を再開する案内が出た場合は、そのボタンを押してください。", "Try “Listen”. Check your device volume and output, and the accompaniment volume under “••• Save and settings”. Rests or muted parts do not produce sound. If a message asks you to resume audio, use its button.")}</p></details>
      <details><summary>{text("自分のパートだけの楽譜しかありません", "I only have my own part")}</summary><p>{text("「お手本」で旋律を聴くことはできます。伴奏と演奏するには、ピアノなど他のパートも入った総譜のMusicXMLを用意してください。操作だけなら収録曲で試せます。", "You can hear the melody with “Listen”. To play with accompaniment, open a MusicXML full score that includes the other parts, such as piano. Use a starter score to explore the controls first.")}</p></details>
      <details><summary>{text("伴奏が合図を待っています", "The ensemble is waiting for a cue")}</summary><p>{text("譜面に合図待ちの指示があると、そこで伴奏が待ちます。画面上部の光の丸ボタンで入りの合図を送ると、マイクなしでも続けられます。「正しい音を待っています」と出るモードは入力機器が必要です。一定テンポで練習するには、設定の練習モードを「共奏・入力に追従」に戻し、マイクとMIDIを接続せずに演奏します。", "A cue instruction in the score pauses the ensemble. Use the round light at the top of the screen, “Cue the ensemble”, to resume without a mic. “Waiting for the written note” is a different mode that needs an input device. For fixed-tempo practice, choose “Accompany · Follow my playing” under Practice mode in Settings and play with the mic and MIDI disconnected.")}</p></details>
      <details><summary>{text("次回も同じ設定で練習したい", "I want to return to the same practice")}</summary><p>{text("「この練習を保存」で、担当・テンポ・区間・書き込みをこの端末に保存できます。別の端末へ移すときやバックアップには、練習ファイルを書き出し、マイ楽譜の「練習ファイルを読み込む」から開いてください。端末間の自動同期はありません。", "“Save practice” keeps your part, tempo, loop and score notes on this device. For a backup or another device, export a practice file and use “Import a practice file” in My scores to open it. Practices do not sync automatically between devices.")}</p></details>
    </section>
    <section className="practice-guide-finish"><h2>{text("まずは、一つのフレーズから。", "Begin with one phrase.")}</h2><p>{text("演奏画面でも「••• 保存と設定」→「使い方」から、この手順を確認できます。", "In the practice screen, open “••• Save and settings” → “How to practise” to check these steps without leaving your score.")}</p><Link to="/perform?catalog=1">{text("収録曲を開く", "Open a starter score")} <span aria-hidden="true">↗</span></Link></section>
    <footer className="practice-guide-footer"><Link to="/">{text("ホーム", "Home")}</Link><a href="/credits.html">{text("出典とクレジット", "Sources & credits")}</a><a href="/privacy.html">{text("データの扱い", "Privacy")}</a></footer>
  </main>;
}
