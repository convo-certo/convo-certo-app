# ConvoCerto 公開準備

確認日: 2026-09-30。公開先へのアップロード、Appleへの提出、アカウント作成・購入は実施していない。

実際の初見奏者による観察・実楽器での受け入れ試験はまだ実施していない。主要導線の日英対応を進めているが、詳細・実験画面には日本語だけの表示が一部残る。今回の自動試験や翻訳追加を、実ユーザー検証や全画面の英語対応完了として扱わない。

最初はHTTPSのWeb体験を公開し、持ち込んだMusicXMLで「担当を選ぶ → 楽器をつなぐ → 合奏する」を試せるようにする。続いて署名・公証を終えたMac版のDMGを同じサイトから配布する。初版は手動更新で十分。初回は2曲から始め、追加の圧縮楽譜は「曲を探す」から選ぶ。MusicXMLの対応範囲と、実際に検証した楽器・ブラウザを表示し、あらゆる記譜法や楽器での追従を保証する表現は避ける。

## いまあるものと残る作業

| 項目 | 現状 | 公開前に必要なこと |
| --- | --- | --- |
| 軽量な配布 | 本番ビルドはスターター2譜、追加49点の圧縮楽譜、34音色。追加点数は版・抜粋を含む。個人用譜面は除外する処理あり | `build/starter-bundle-report.json` と最終配布物を照合。個人フォルダやリポジトリ全体を配信しない |
| Web | `build/client` の配信・ルート・404・MIME・キャッシュを検証。Linux arm64・amd64で実ビルド・非root配信・MXL取込・発音開始を確認。同梱サンプルが403になるファイル権限を修正 | 既存Flyアプリの管理権限と使用方針、HTTPS公開先・ドメインを確認し本番でも試験 |
| Macアプリ | Swift/WKWebView、CoreMIDI、ローカルサーバー。現在の実成果物はarm64。ビルド最低指定はmacOS 13 | 対応表はApple silicon版と明記。macOS 13実機確認は別。Intel対応を約束する前にx86_64版と実機試験を用意 |
| 保存 | 再起動でも同じローカル接続先を使う修正と独立した永続化試験を追加 | 通常終了・更新での復元を最終版で再確認。旧開発版のランダムな接続先にある保存は自動移行されない |
| 機械検証 | 型・単体・ブラウザ・Swift・実WKWebView・復旧・DMG内コピーの検証あり | 最終ソース・最終バイナリで再実行。成功した古いレポートは新しいビルドの証明にしない |
| 署名と公証 | 既定は開発用アドホック署名。`--release` でDeveloper ID・Hardened Runtime・時刻署名を必須化。2026-09-30の本機Keychain検査では有効なDeveloper ID Application証明書は0件 | 所有者の証明書とAppleへの提出資格を用意し、実署名・公証・チケット添付・別Macでの通常起動を検証 |
| 版と更新 | `release.config.json` に版・ビルド・最低OS・bundle IDを一元化。現在 `0.1.0` / build `1`、自動更新なし | 公開する版ごとに番号を更新。ダウンロードページに変更点・版・CPU・OS・サイズ・SHA-256を表示 |
| プライバシー | [日英の処理説明](../public/privacy.html)と任意音声認識の開始前案内あり。保存データの削除範囲、ローカル処理と任意の外部通信を記載 | 実在する運営者・問い合わせ先、採用したホストのログ処理を確定 |
| 権利表示 | 楽譜・音源の出典/ハッシュ、Interライセンス、ソフトウェアの通知を収録 | 実配布する素材の条件を照合しアプリ本体の利用条件を決める。作品の保護期間終了だけで個々のファイルを許諾済みと扱わない |

## 1. まずWebで体験できる状態にする

1. [製品評価計画](product-launch.md)の条件で、複数の実楽器を持つ初見の奏者に体験してもらう。観察試験の同意を得て、操作の成功と実際の入り・追従を記録する。自動テストの成功を、説明不要の実演成功として数えない。
2. `npm run verify:release` を通す。Macでは下記の独立した保存試験も必須工程に含む。単独で再実行する場合のコマンドは次のとおり。通常の保存領域には試験データを書き込まない。

   ```sh
   npm run native:persistence
   ```

   永続化試験はmacOS 14以降で専用のWebKit保存領域を使い、保存後1秒待って通常終了、再起動、ポート競合の拒否、競合解消後の復元を別プロセスで確認する。直後の強制終了やディスク障害の耐久性を証明しない。詳細は[試験仕様](../native/tests/Persistence/README.md)。

3. 静的HTTPSホストの公開ルートに `build/client` だけを配置する構成を用意する。現状は `/audio/...` などルート相対URLを使うため、リポジトリ名付きサブパスへの配置には追加のbase-path対応が必要。存在する静的ファイルを優先し、アプリのルートだけを `index.html` にフォールバックする。存在しない音源やXMLまでHTMLを返さない。
4. `/`、`/perform` の直接アクセスと再読み込み、音源・MXL取込、権限拒否と再接続、印刷・書き出し、キーボード操作、日英表示を公開と同じ条件で確認する。マイクは安全なコンテキストが必要なので、公開版はHTTPSを使う。[MediaDevices.getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
5. HTMLは更新が届くキャッシュ方針、内容ハッシュ付きアセットは長期キャッシュにする。Content-Type、`X-Content-Type-Options: nosniff`、Referrer-Policyを設定。CSPは音源・Blob・WebAssemblyと、任意のMediaPipe配信先を含めて試験し、未確認の制限をそのまま本番へ入れない。

`npm run build && npm start` で `http://127.0.0.1:4173` にビルド済みアプリを開ける。[配信サーバーとホスト設定](web-serving.md)を参照。初期状態はこのコンピューターからのみ接続できる。公開用TLS・ドメイン・運営者の窓口を提供する機能ではない。

公開先やドメインが決まるまでは配置先を架空のURLで案内しない。この文書は手順の準備であり、公開を実行する指示ではない。

既存の `fly.toml` には `convo-certo-app-muy1ga` が指定されています。管理権限や現在の稼働状態は未確認です。2026-09-30に、一時的なDocker設定で既存のNix管理ファイルを変更せずにエンジンを起動できました。実Linux arm64と、Apple silicon上でエミュレーションしたFly向けamd64でビルド、UID 1000での全配信ファイル読取、HTTP 12件、MacのChromiumからのMXL表示と発音開始、正常終了を確認しました。[Docker/Flyの手順と検証範囲](web-serving.md#docker--flyio-の構成)を参照してください。これはFlyやHTTPS上での成功ではありません。

## 2. Mac版を通常のダウンロードで開けるようにする

一般配布用にはDeveloper ID Application署名、Hardened Runtime、署名時刻、公証が必要。`scripts/build-native.mjs` と `scripts/package-native.mjs` は開発プレビューと製品署名を明示的に分けるが、製品署名だけで公証済みにはならない。Appleの提出は現在 `notarytool` を使う。[Appleの公証要件](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

### 実装した配布工程

- `release.config.json` のbundle ID・版・ビルド番号・最低OSをビルドと梱包で照合する。CPUは実行したMacの `arm64` または `x86_64`。現在の `tech.gawatech.convocerto.preview` を変更するなら、保存データの移行を別途実装する。名前だけを変更して保存継続を約束しない。
- `--release` は `CONVOCERTO_SIGNING_IDENTITY` に指定した有効なDeveloper ID Application証明書を要求し、存在しない場合は停止する。アドホック署名への自動切替はない。証明書の表示名だけでなくAppleの署名要件、チーム、Hardened Runtime、時刻署名、実entitlementsを検査する。
- Hardened Runtimeのentitlementsは音声入力とカメラのみ。JIT、署名のない実行メモリ、library validationの例外をまとめて追加していない。実署名後のマイク・カメラ動作は未検証。[Audio Input Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input)
- 検証レポートのモード、ソースハッシュ、最終アプリのハッシュを照合する。製品署名→最終検証→梱包の順を維持し、古いアドホック署名のレポートを製品版へ流用しない。開発プレビューと製品署名の両方で、検証済みコピーだけをDMGへ入れる。

開発プレビューは以下で作る。実行結果のレポートパスをそのまま梱包へ渡す。

```sh
npm run verify:release
npm run native:package -- verification-results/<run>/report.json
```

所有者の証明書を用意した後の製品署名は次の形になる。環境変数に入れるのは証明書の完全な表示名またはSHA-1識別子であり、秘密鍵やパスワードではない。

```sh
export CONVOCERTO_SIGNING_IDENTITY='Developer ID Application: YOUR NAME (TEAMID)'
npm run verify:release -- --release
npm run native:package -- --release verification-results/<run>/report.json
```

`YOUR NAME (TEAMID)` はKeychain内の実際の証明書に置き換える。生成した `package-report.json` とダウンロード用manifestにモード・版・ビルド・CPU・OS・サイズ・SHA-256を残す。製品署名DMGも、公証前は `notarized: false` と `publicReleaseReady: false` のままにする。

DMG・manifest・検証ログはリポジトリ直下の `distribution/ConvoCerto-<mode>-<version>-<build>-<cpu>-<unique>/` に保存する。Webの再ビルドで消える `build/` から分離し、過去の配布物を保持する。`distribution/` はGitへ追加せず、Web配信の公開ルートにも含めない。

### 実際の配布で残る確認

- 最終DMGからApplicationsへコピーした状態で初回起動・権限・保存・再起動・書き出し・更新を試す。開発機の起動だけでなく、ブラウザからダウンロードした別MacでGatekeeperの通常操作を確認する。[Appleの配布時検証](https://help.apple.com/xcode/mac/current/en.lproj/dev033e997ca.html)

### 所有者の外部資格が必要な工程

有効なApple Developer Programのチーム、Developer ID Application証明書と秘密鍵、公証提出の資格情報が必要。資格情報はKeychainまたはCIの秘密管理へ入れ、リポジトリ・ログ・チャットに記載しない。アカウント登録・購入・証明書の作成・アップロードはまだ実施していない。[AppleのMac配布案内](https://developer.apple.com/macos/distribution/)

資格情報と公開の実行が承認された後の工程は、製品署名したアプリで検証→DMGを作成・署名→`xcrun notarytool submit`→Acceptedと公証ログを確認→`xcrun stapler staple` / `validate`→最終DMGのSHA-256記録→通常インストール試験→アップロード。提出成功だけで起動や音の品質は保証されない。[公証のカスタム手順](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)

## 3. 初版は手動更新で運用する

ダウンロードページには公開済みの最新版、変更点、対応CPUと確認済みOSを掲載する。利用者は練習ファイルを書き出し、アプリを終了して新しい版へ置き換える。同じbundle IDと保存したローカル接続先を維持し、更新後にマイ楽譜と最近の練習を確認する。ブラウザ版とMac版の移動には練習ファイルを使う。累積の練習履歴は現在の練習ファイルに含まれない。

初回公開の条件に自動更新を追加しない。後で導入するときは、更新データの署名検証、更新失敗時の復旧、改ざん・ダウングレードへの対応、公開済み版からの移行を試験する。Webサイト配布の更新とサポートは開発者が管理する。[Appleの配布方式の比較](https://developer.apple.com/macos/distribution/)

## データと権利について公開前に確定する項目

- マイ楽譜から削除しても最近の練習の別コピーは残る。Macアプリ削除でも保存領域は残る。履歴は曲・担当ごとに削除でき、明示保存のマイ楽譜と独立している。現状を処理説明へ明記した。全データ削除を追加する場合はバックアップ案内と削除範囲を一致させる。
- 任意の音声指示はWeb Speech APIを使い、外部で認識される場合がある。カメラはjsDelivrから解析素材、Googleの配信先からモデルを読む。楽器のマイク解析がローカルでも「常に完全オフライン」とは案内しない。[音声認識の外部処理](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- 現在のクライアントには利用解析・広告・自動クラッシュ報告の送信実装は見つからない。実際の公開ホストのアクセスログ、保持期間、窓口を確認してから公開時のプライバシー情報を確定する。架空の問い合わせ先は入れない。
- `public/credits.html`、`public/repertoire/ensemble/sources.json`、`public/audio/fluid/sources.json`、フォントのライセンス、`notices/bundled-packages.json` を実配布物に照合する。広い依存一覧の不足と、実際のクライアントに含まれる不足を区別する。クレジットは日英で読め、元ファイルと配布ビルドの34音色表記を揃えた。
- アプリ本体の利用条件は未決定。無料プレビューの利用範囲、サポート窓口をまず用意する。決済・有名演奏家の学習モデル・取得制限のある楽譜の同梱は現在の公開範囲に含めない。

## この変更で確認した範囲

初回の担当確認、伴奏がない場合の案内、保存した練習の再開、小画面の操作、日英表示を調整した。さらに、音色変更後の保存・復元と調変更時の実楽器設定を修正し、音声指示の開始前案内を追加した。練習ファイルの読込失敗と生成した声部名も日英対応し、既存履歴・テイクとの互換性を確認した。保存済みの開発プレビューは単体439件・ブラウザ120件・HTTP配信9件を含む全10工程が成功。同じソースとアプリのハッシュを照合した約8.4MBのDMGから、コピー後の実WKWebView起動・復旧も確認した。同梱は2譜面・34音色を維持している。[検証範囲・成果物・未確認事項](release-candidate-verification-2026-09-30.md)を参照。現在のソースハッシュにはDocker/Fly設定も含む。Linux arm64・amd64は別のコンテナー検証記録で確認し、Fly実機やHTTPS公開は未検証。次のソース変更後は全体検証を再実行する。製品署名・公証後の最終リリース検証は未実施。

公開の準備完了は、実演の受け入れ確認、現在の全体検証、日英の案内と権利表示、データ削除と移行の説明、実在する連絡先、公開先の決定が揃った時点で判断する。Macの一般配布には、さらに署名・公証・別Macの通常インストール確認を加える。
