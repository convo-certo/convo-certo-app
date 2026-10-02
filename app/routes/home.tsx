import { ScoreAudition } from "~/components/ScoreAudition";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { LanguageSwitcher } from "~/components/LanguageSwitcher";
import { useLocale } from "~/lib/locale-context";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ConvoCerto — Your score. Your ensemble." }, { name: "description", content: "Bring your MusicXML score, choose your part, and practise with the ensemble. 自分のMusicXMLで、伴奏と演奏する。" }];
}

export default function Home() {
  const { text } = useLocale();
  return <main className="welcome">
    <header className="welcome-header"><a className="brand-lockup" href="/" aria-label={text("ConvoCerto ホーム", "ConvoCerto home")}><img src="/brand/icon.svg" alt="" width="44" height="44"/><h1>ConvoCerto</h1></a><nav className="welcome-navigation" aria-label={text("主な画面", "Main navigation")}><Link to="/guide">{text("使い方", "How to play")}</Link><LanguageSwitcher /></nav></header>
    <section className="welcome-hero" aria-label={text("共奏を始める", "Start playing together")}>
      <div>
        <p className="welcome-eyebrow">YOUR SCORE. YOUR ENSEMBLE.</p>
        <h2>{text("自分の楽譜で、", "Your score.")}<br/><em>{text("伴奏と演奏する。", "Your ensemble.")}</em></h2>
        <p className="welcome-intro">{text("MusicXMLを開いて、自分のパートを選ぶ。", "Open a MusicXML score and choose your part.")}<br/>{text("残りのパートと、一緒に演奏できます。", "Play your instrument with the rest of the ensemble.")}</p>
        <div className="welcome-actions"><Link className="welcome-start" to="/perform">{text("自分の楽譜で始める", "Open your score")} <span aria-hidden="true">↗</span></Link><Link className="welcome-secondary" to="/perform?catalog=1">{text("収録曲で試す", "Try a starter score")} →</Link></div>
        <p className="welcome-note">{text("MusicXML / MXL対応 · アカウント登録なし", "MusicXML / MXL · No account needed")}</p>
        <Link className="welcome-first-use" to="/guide"><span aria-hidden="true">01 → 02 → 03</span><strong>{text("はじめての方へ", "New here?")}</strong><span>{text("楽譜選びから、最初の合奏まで", "From choosing a score to playing together")}</span></Link>
      </div>
      <ScoreAudition />
    </section>
    <section className="welcome-instruments" aria-labelledby="welcome-instruments-title">
      <div><p className="welcome-eyebrow">ROOM FOR YOUR INSTRUMENT</p><h2 id="welcome-instruments-title">{text("いつもの楽器で、合奏へ。", "A place for your instrument.")}</h2><p>{text("まずは一定テンポで。入力機器は、あとからつなげます。", "Start at a steady tempo. Connect an input whenever you’re ready.")}</p></div>
      <ul>
        <li><strong>{text("管楽器・弦楽器", "Winds & strings")}</strong><span>{text("フルート、サックス、ヴァイオリン、チェロなど。自分の総譜から担当を選びます。", "Flute, saxophone, violin, cello and more. Choose your part from your full score.")}</span></li>
        <li><strong>{text("鍵盤楽器", "Keyboards")}</strong><span>{text("ピアノなどの担当を選んで練習。和音で追従させたいときはMIDI入力へ。", "Practise the keyboard part. Connect MIDI when you want following with chords.")}</span></li>
        <li><strong>{text("マイクを使う練習", "Practice with a microphone")}</strong><span>{text("ヘッドホンと一音チェックで準備。一音ずつの旋律に合わせる追従を試せます。", "Use headphones and check a note first. Try following with single-note melodies.")}</span></li>
      </ul>
      <Link className="welcome-secondary" to="/guide#instruments">{text("自分の楽器での始め方", "Find the setup for your instrument")} →</Link>
    </section>
    <section className="welcome-features" aria-label={text("共奏でできること", "Your practice, your way")}>
      <article><span>01 · BRING YOUR SCORE</span><h3>{text("練習したい曲を、持ち込む", "Bring the music you love")}</h3><p>{text("課題曲も自作曲も、MusicXMLから。", "Assigned repertoire or your own composition, in MusicXML.")}</p></article>
      <article><span>02 · PLAY TOGETHER</span><h3>{text("楽器を手に、伴奏と演奏する", "Pick up your instrument")}</h3><p>{text("テンポを決めて練習。マイクやMIDIで、その場の演奏に反応する伴奏も。", "Set your tempo, or connect a mic or MIDI instrument for responsive accompaniment.")}</p></article>
      <article><span>03 · KEEP YOUR PRACTICE</span><h3>{text("書き込んで、次の練習へ", "Make it yours, then return")}</h3><p>{text("譜面のメモや練習設定を、この端末に保存。", "Keep score notes and practice settings on your device.")}</p></article>
    </section>
    <section className="welcome-details" aria-label={text("利用前の案内", "Before you play")}>
      <details><summary>{text("どんな楽譜が使えますか？", "Which scores can I use?")}</summary><p>{text("独奏と伴奏を含むMusicXML・MXLの総譜を使います。MuseScoreやDoricoなどの楽譜作成ソフトから書き出せます。PDF・写真の読み込みや、単旋律からの伴奏作曲には未対応です。", "Use a MusicXML or MXL score containing your part and the accompaniment. Export one from notation software such as MuseScore or Dorico. PDF and photo import, and generating accompaniment from a melody alone, are not supported.")}</p></details>
      <details><summary>{text("自分の楽器で使えますか？", "Can I use my instrument?")}</summary><p>{text("管楽器・弦楽器・鍵盤などのパートを選べます。マイク追従は一音ずつの旋律向け。和音はMIDI入力を使い、無音程打楽器は一定テンポで練習できます。マイクを使うときはヘッドホンをご用意ください。", "Choose a wind, string, keyboard or other part. Microphone following supports one note at a time. Use MIDI for chords, or a fixed tempo for unpitched percussion. Wear headphones when using the microphone.")}</p></details>
      <details><summary>{text("楽譜がなくても試せますか？", "Can I try it without a score?")}</summary><p>{text("短いデュエットとモーツァルトの協奏曲、2曲から始められます。自分のMusicXMLはあとから追加できます。", "Two starter scores are included: a short duet and a Mozart concerto movement. Add your own MusicXML whenever you like.")}</p></details>
    </section>
    <footer className="welcome-footer">ConvoCerto · <a href="/credits.html">{text("出典とクレジット", "Sources & credits")}</a> · <a href="/privacy.html">{text("データの扱い", "Privacy")}</a></footer>
  </main>;
}
