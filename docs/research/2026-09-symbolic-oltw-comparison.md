# MusicXML共奏のための5方式比較

確認・実行日: 2026-09-11（日本時間）。研究用の比較ページを追加した。本番の伴奏方式は変更していない。

## 公開研究の再確認

GitHub APIで既定ブランチを再取得した。ACCompanionは2024-01-19の[07e88f1](https://github.com/CPJKU/accompanion/commit/07e88f1fa34e24f2b5e7aae5a81065b915c199ba)、Matchmakerは2026-09-03の[40fd6e7](https://github.com/pymatchmaker/matchmaker/commit/40fd6e7602bd9e596cea1beafdcee4853b9f2c98)だった。コミット日から研究活動全体の停止・継続を推定しない。

[MatchmakerのISMIR 2025論文](https://arxiv.org/html/2510.10087v1)は複数方式を同じ条件で比較する枠組みを提供し、音声の比較ではOLTWがHMMより良い被覆率を示す。論文の評価は音声特徴量を使うシミュレーションで、ClariMateのMIDIや本アプリの音響入出力の評価ではない。この違いを踏まえて、今回MIDIイベント版を別に測定した。

[固定版の変更履歴](https://github.com/pymatchmaker/matchmaker/blob/40fd6e7602bd9e596cea1beafdcee4853b9f2c98/CHANGES.md)にはイベント単位のOLTW、粒子フィルター、外部入力ストリームなどがある。別アプリを作るなら、MusicXMLと入力を共通にして追従器を交換する研究室が適している。今回はその入口としてローカル比較ページを拡張した。

## 作ったもの

`npm run research:compare` で標準・独自SequenceFollower・Matchmaker HMM・OLTW Arzt・OLTW Dixonの5方式を同一の10条件に通す。HTMLには方式ごとに表示を切り替えられる位置グラフ、正解数、見逃し、誤位置、余分な音への反応、音ごとの結果がある。インターネット接続なしで生成済みページを開ける。音声再生や実機接続はしない。

OLTWは `OnlineTimeWarpingArztEvent` / `OnlineTimeWarpingDixonEvent` を使用。全128 MIDI音高のオンセットベクトル、cosine距離、30イベント窓。Arztの初期窓5・ステップ5。音高クラスに畳み込まない。同時刻の参照音をまとめるが、入力は単旋律のnote-onに限定する。テンポの良し悪しはOLTWとの比較対象にしていない。

## 実測結果と採用判断

|条件|標準|独自実験|HMM|Arzt|Dixon|
|---|---:|---:|---:|---:|---:|
|50ms間隔|4/8|8/8|8/8|8/8|8/8|
|同音反復と予測位置ずれ|8/8|8/8|8/8|5/8|8/8|
|冒頭への吹き直し|4/8|4/8|8/8|4/8|5/8|
|長い息継ぎ|4/8|8/8|8/8|8/8|8/8|
|同じ旋律が続く場所で戻る|4/8|4/8|4/8|4/8|4/8|

値は人工入力の正しい位置数。短い特定の条件であり、奏者の満足度や一般的な精度の推定ではない。外部3方式は余分な入力にも必ず位置を返すため、その出力はfalseMatchとして数える。「誤音を検出できない割合」とは解釈しない。

今回の条件では、本番をOLTWへ一律に切り替える根拠は得られなかった。次の有望な方向は、HMMなどを使った吹き直し位置の候補提示と、通常のテンポ・位相追従の分離。候補をそのまま伴奏の巻き戻し命令にすると同一旋律の反復で誤動作するため、採用前に実演ラベルと復帰時の音響確認が必要である。今回その機能を実装済みとはしていない。

## 検証と再現

- `uv run --script scripts/benchmark-matchmaker.py --self-test`: 3方式それぞれで拍位置対応、正解ラベル・expectedBeatを変更しても出力不変、入力の後半を取り除いても前半の出力不変、音域・時刻原点を変えても位置不変を確認。重複時刻の入力は拒否。
- `npm run research:compare`: 10条件の5方式が完了。入力JSONのSHA-256と固定コミット・実行環境を結果に記録。
- Chromiumで10個のグラフの切替、5方式の表、音別詳細、390px幅のページ、JavaScriptエラーなしを確認。

出力: `verification-results/followers-2026-09-10T22-54-49.919Z/`。`report.json`、`matchmaker.json`、`comparison.html`、`page-check.json`、デスクトップ／モバイル画像。HMM依存物は到達不能遷移のlog(0)警告を出したが、全出力は有限値で検査を通過した。

製品コードとSwift配布物に変更がないため、前回のアプリ一括検証を今回の研究ページの検証と混同しない。

## 権利と実装範囲

[ACCompanion](https://github.com/CPJKU/accompanion#license)はコードApache-2.0とデータ・学習済みモデルCC BY-NC-SA 4.0を区別する。[Matchmaker](https://github.com/pymatchmaker/matchmaker/blob/40fd6e7602bd9e596cea1beafdcee4853b9f2c98/LICENSE)のコードはApache-2.0。今回は既存キャッシュの固定版を研究スクリプトから呼び出し、実装コードを製品にコピーしたり、演奏家の録音・学習データ・モデルを配布物に加えたりしていない。テスト音列は自作。将来依存物を製品へ同梱する場合は、依存物と各資産を含めた表示・再配布条件を別途満たす必要がある。
