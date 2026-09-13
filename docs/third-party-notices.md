# 配布物のクレジット確認

2026-09-11。`npm run notices:prepare` はインストール済みの本番依存ツリーから、ライセンス・NOTICE・COPYING本文を収集する。本文がREADME内にあるMITライセンスも抽出する。`npm run build` が毎回実行し、WebとMacのResources/webに同じページを含める。

- 利用者向け入口: `/credits.html`。音源の作者、レンダリング元、CC BY 3.0、抽出と再生加工、楽譜別の出典、ソフトウェア本文へのリンクを表示する。
- 本文: `/notices/dependencies.html`。テキストをHTMLエスケープし、ライセンスごとに折りたたむ。
- 機械可読な収集結果: `/notices/dependencies.json`。バージョン、宣言、取得した本文、lockfile SHA256を保存する。ローカルの絶対パスを含めない。
- 255種類のname/versionを収集。バンドルで除去されるものや実行環境用の依存も含む保守的な一覧であり、バンドルの正確なSBOMではない。欠落している他OSのオプション依存は収集しない。

パッケージ内で本文を取得できなかったもの:

- @mediapipe/tasks-vision 0.10.32（package.jsonの宣言: Apache-2.0）
- @npmcli/agent 2.2.2（ISC）
- eastasianwidth 0.2.0（MIT）
- err-code 2.0.3（MIT、READMEにはリンクのみ）

宣言から本文や著作権者を捏造して補わない。公開前に該当バージョンの上流資料、実際のバンドルへの包含、必要な表示を確認する。パッケージに埋め込まれた別ライブラリ・フォントについてもルート文書だけで網羅とみなさない。

音源の条件は[MIDI.js Soundfonts配布元](https://github.com/gleitz/midi-js-soundfonts)と[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)を再確認。既存の音源ハッシュと出典一覧を維持する。コード用のMITと音源用のCC BYを区別する。

別途外部取得するものも未監査として残す。`app/root.tsx` のGoogle Fonts Inter、`app/lib/pose-analyzer.ts` のMediaPipe WASMとpose_landmarker_liteモデルは、このnpm本文収集だけでは網羅されない。WASM URLとJS依存は0.10.32に固定した。実演での認識精度と外部取得物の権利確認は別に残る。これら、楽譜の版ごとの権利、配布方法による条件を満たすまで商用クリアランス完了と主張しない。

## 実際のバンドルとの照合

`bundled-notices-plugin.mjs` はRollupが各チャンクへ残したモジュール（renderedLengthが0のものを除く）をパッケージに対応付け、`build/client/notices/bundled-packages.json` を生成する。遅延ロードされるチャンクも対象。リリース検証JSONにもこの結果を含め、Macにも同梱する。検証の入力ハッシュにはVite・TypeScript設定も含める。

現時点の12パッケージのうち、本文取得済みは11、未取得はMediaPipe 0.10.32。@react-router/dev 7.12.0もランタイムの一部を生成していたため、同梱LICENSE.mdを収集対象に加えた。npmのproduction分類だけではこの文書を見落としていた。

上流確認で得た3件のnpm公開版のgitHeadと、そこにLICENSE本文がないことを記録する:

- [@npmcli/agent 2.2.2の上流ツリー](https://github.com/npm/agent/tree/47b9043b041c5ab982810fe16ea1c16e9ad9024e)
- [eastasianwidth 0.2.0の上流ツリー](https://github.com/komagata/eastasianwidth/tree/b89f04d44dc786885615e94cd6e2ba1ef7866fa4)
- [err-code 2.0.3の上流ツリー](https://github.com/IndigoUnited/js-err-code/tree/92511d41a6a926c94c9d11493404867b1e92a77a)

この3件は今回のRollup出力には現れなかった。インストール済み依存一覧からは削除せず、未取得のまま保持する。将来バンドルに入れば新しいレポートの未取得一覧に現れる。MediaPipeのnpm公開メタデータにはgitHeadがなく、masterのLICENSEを該当版の確認済み文書として転用していない。

この照合は完全なSBOMや商用許諾判定ではない。事前に一体化されたライブラリ内部の第三者コード、外部取得するWASM・モデル・フォント、音源・楽譜の条件は引き続き別途確認する。

## MediaPipeの公式タグから本文を補足（2026-09-11）

公式 `v0.10.32` タグはコミット `8317ba78778738ba90a521e7e4580a2ba0129c81` を指していた。その固定コミットの [LICENSE](https://github.com/google-ai-edge/mediapipe/blob/8317ba78778738ba90a521e7e4580a2ba0129c81/LICENSE) 全文を、独自の文面に置換せず `scripts/notices/mediapipe-0.10.32-LICENSE.txt` に取得した。Apache本文と末尾の特定ディレクトリに対する追加表示をそのまま維持する。SHA-256は `8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8`。

npmには引き続きgitHeadがないため、同じ版番号の公式ソースから得た補足資料として明示する。npmバイナリのビルド元を完全に同定した文書ではない。収集スクリプトはname/version完全一致で補足し、保存した本文のハッシュが変わっていればビルドを停止する。利用者向けHTMLにも出典と確認の限界を表示し、バンドル報告には `supplementalSources` を残す。

この更新後、実際のバンドルへ寄与する12パッケージの本文取得数は12、未取得は0。インストール済み一覧に残る3件は未取得のまま。`commercialClearance` はfalseを維持する。これで埋め込み第三者コード・モデル・WASM・フォント・音源・楽譜の許諾確認が終わったわけではない。

## Interを同梱（2026-09-11）

Google FontsへのCSS・フォント要求を削除し、[Inter公式4.1リリース](https://github.com/rsms/inter/releases/tag/v4.1)のInterVariable.woff2とInterVariable-Italic.woff2を変更せず抽出して同梱した。同じZIPのLICENSE.txt（OFL-1.1）も同梱し、クレジットから参照できる。`public/fonts/inter/source.json` に配布ZIPと各抽出ファイルのSHA-256・取得URLを保存する。2フォント合計740,216バイト。フォント単体を販売するものではない。

WebとMacは同じローカルURLからフォントを取得する。MacのサーバーはWOFF2をfont/woff2、本文をtext/plainとして返す。日本語グリフは端末のフォントへフォールバックする。カメラ用WASM・モデルの外部取得は残るため、アプリ全機能がオフライン対応になったという意味ではない。

ブラウザ試験では外部ホストへの要求を拒否し、通常体・斜体がFontFaceSetでloadedになること、外部要求0件、クレジットから著作権・OFL本文を読めることを確認する。Mac試験でも実WKWebViewによる両字体のデコードとMIMEを確認する。
