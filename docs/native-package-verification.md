# Mac開発プレビューの梱包検証

2026-09-11に、DMG作成・マウント・一時フォルダーへのコピー・コピー先での実アプリ起動まで確認した。アプリのインストール先に依存せず、同梱Web画面・MIDI・マイク処理・楽譜・保存・印刷のsmokeを実行できた。ユーザーのApplicationsや保存済み練習は変更していない。

## 成果物

最新の開発プレビュー（2026-09-11）:

- DMG: `verification-results/2026-09-10T22-33-57.364Z/distribution/ConvoCerto-preview.dmg`
- 梱包・コピー先起動・中断復旧のログとSHA-256: 同じフォルダーの `package-report.json`
- 全体検証: `verification-results/2026-09-10T22-33-57.364Z/report.json`

単体271件・ブラウザ81件を含む8工程の検証後に梱包した。今回は[拍子を超える小節の注意表示](musicxml-measure-duration.md)を追加した。保存テイクの再読み込みも含む。[Swift/WKWebViewの実時間30分再生](native-playback-soak.md)は2026-09-10T21-31-42.805Zのビルドでの検証であり、このバンドルで再実施した結果とは区別する。「入りの1小節前から合わせる」、持続的な減速への追従改善、持続音ループ、無音サンプルの除外、ローカルフォントを含む。DMG内とコピー先のアプリ内容が検証済みビルドと一致し、コピー先の実WKWebViewとWebContent中断復旧の試験が通過した。build配下から上記フォルダーへ保存後、DMGのSHA-256を再照合した。

同日に `security find-identity -v -p codesigning` を実行し、有効なApple DevelopmentとApple Distributionのidentityは存在したが、Developer ID Applicationは表示されなかった。証明書の作成・変更・アップロードは行っていない。このアプリの署名は引き続きアドホックである。

初回の梱包検証（履歴）:

- DMG: `verification-results/2026-09-10T18-53-38.565Z/distribution/ConvoCerto-preview.dmg`
- パッケージ検証・SHA-256: 同じフォルダーの `package-report.json`
- ソースとアプリのハッシュ・全体検証: `verification-results/2026-09-10T18-53-38.565Z/report.json`
- 古いレポート指定の実コマンド拒否: `verification-results/2026-09-10T18-53-38.565Z/stale-package-rejection.json`

単体221件・ブラウザ69件と実WKWebView検証が通過した後、DMG内とインストール相当のコピー先のアプリ内容を照合し、コピー先でも同じWKWebView smokeが通過した。

## ビルド条件と実測環境

Apple Silicon（arm64）専用。最低OSを明示せずにビルドした実行ファイルにはminos 16.0が記録されていたため、ビルド指定をmacOS 13.0へ固定した。Info.plistのLSMinimumSystemVersionと実行ファイルのLC_BUILD_VERSIONの一致を梱包時に検査する。

実機検証OSはこの環境の `sw_vers -productVersion` が返した26.6.2。最低OS指定13.0は、macOS 13の実機で確認済みという意味ではない。Intel、他OS版、別のMac、ダウンロード後のGatekeeper動作は未確認。

## 再実行

アプリを終了し、`npm run verify:release` の成功レポートを `npm run native:package -- <report.json>` に渡す。通常の出力先はbuild/distributionで、次のWebビルドで消えるため、保存したい成果物は検証フォルダー等に保管する。

署名は開発用アドホック署名。Developer ID署名、公証、自動更新、全素材の再配布権利、販売・サポート・実演品質は未完了で、packagePassed=trueはそれらを保証しない。DMGの公開・第三者への送付は実行していない。
