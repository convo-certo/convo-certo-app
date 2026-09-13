import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ConvoCerto — あなたの楽器で、合奏へ" }, { name: "description", content: "MusicXMLから担当パートを選び、オーケストラやピアノ伴奏と練習。楽譜、入力への追従、空間配置をひとつの共奏体験に。" }];
}

export default function Home() {
  return <main className="welcome">
    <header className="welcome-header"><h1>ConvoCerto</h1><span>共奏 · プレビュー</span></header>
    <section className="welcome-hero" aria-label="共奏を始める">
      <div>
        <p className="welcome-eyebrow">YOUR INSTRUMENT. YOUR SEAT.</p>
        <h2>ひとりでも、<br/>合奏へ。</h2>
        <p className="welcome-intro">モーツァルトをオーケストラと。<br/>持ち込んだMusicXMLでも。<br/>あなたの楽器で、好きなパートに入ろう。</p>
        <Link className="welcome-start" to="/perform">共奏を始める <span aria-hidden="true">→</span></Link>
        <p className="welcome-note">楽器をつながず、お手本を聴くところから試せます。</p>
      </div>
      <aside className="welcome-guide" aria-label="初めての共奏">
        <p className="welcome-eyebrow">FIRST REHEARSAL</p>
        <h3>最初は、ひとつのフレーズ。</h3>
        <ol>
          <li><strong>曲と、あなたの席を選ぶ</strong><p>収録曲から選ぶか、お持ちのMusicXMLを読み込みます。</p></li>
          <li><strong>お手本を聴く</strong><p>「この区間のお手本を聴く」でフレーズを確かめてから、同じ区間を練習できます。</p></li>
          <li><strong>同じ区間を、自分で吹く</strong><p>マイクやClariMate / MIDIを接続。最初は「正しい音を吹くまで待つ」で入力を確かめると安心です。</p></li>
        </ol>
        <p className="welcome-note">マイクで吹くときは、伴奏を拾わないようヘッドホンを使ってください。</p>
      </aside>
    </section>
    <section className="welcome-features" aria-label="共奏でできること">
      <article><span>01 · SCORE</span><h3>好きなパートに入る</h3><p>MusicXMLの担当を選んで、あなたの音を伴奏から空ける。楽譜を押せば、その場所から練習できます。</p></article>
      <article><span>02 · ENSEMBLE</span><h3>相手との合わせ方を探す</h3><p>自分が主導するか、全体の拍に合わせるか。追従の強さや表情を調整して、同じフレーズを試せます。</p></article>
      <article><span>03 · YOUR PLACE</span><h3>オーケストラの中で聴く</h3><p>奏者と聴く場所を動かし、同じ楽器の仲間を追加。気に入った配置と練習設定を保存できます。</p></article>
    </section>
    <section className="welcome-details" aria-label="利用前の案内">
      <details><summary>使える楽譜と楽器について</summary><p>MusicXML・圧縮MXLを読み込めます。マイク追従は単音の旋律向けです。和音入力にはMIDIを使ってください。ブラームスのMIDI伴奏はローカル練習用で、配布版には含めていません。お持ちのMusicXMLを使った演奏に対応します。演奏の自然さは引き続き検証しています。</p></details>
      <details><summary>以前の練習画面を開く</summary><nav aria-label="以前の練習画面"><Link to="/step1">楽譜表示 + 再生</Link><Link to="/step2">カラオケモード</Link><Link to="/step3">追従伴奏</Link><Link to="/step4">フルリハーサル</Link></nav></details>
    </section>
    <footer className="welcome-footer">ConvoCerto · あなたの演奏と、一緒に育てる共奏。 · <a href="/credits.html">出典とクレジット</a></footer>
  </main>;
}
