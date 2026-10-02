# Web ビルドの配信確認

`scripts/serve-web.mjs` は、生成済みの `build/client` を配信する依存追加不要の Node.js HTTP サーバーです。開発サーバーではなく、ビルド後の直接リンク・静的ファイル・キャッシュ設定をローカルで検証します。この操作だけでインターネットに公開されるわけではありません。

```sh
npm run build
npm start
```

ブラウザで <http://127.0.0.1:4173> を開きます。初期設定はこのコンピューターからのみ接続できます。終了は Ctrl+C です。

```sh
node scripts/serve-web.mjs --host 127.0.0.1 --port 8080 --root build/client
node scripts/serve-web.mjs --help
npm run test:web-serving
```

`--root` は実行時の作業ディレクトリを基準に解決します。存在する `index.html` が必要です。別の端末からの確認に必要な場合だけ `--host 0.0.0.0` または特定のインターフェースアドレスを指定します。これは接続可能な範囲を広げる設定で、TLS や認証は提供しません。

## 配信するもの

- `/`、`/guide`、`/perform`、`/step1`～`/step4` は、クエリ文字列と末尾スラッシュ付きの直接アクセスにも `index.html` を返します。ルートを追加するときはサーバーの `appRoutes`、ネイティブ版の `LocalServer.swift` とテストも更新します。
- ビルド内に実在するファイルを配信します。存在しない音源、MusicXML、JavaScript、未知の画面URLは `404 text/plain` です。HTMLへの一律フォールバックやディレクトリ一覧はありません。
- GET と HEAD に対応し、それ以外は `405` と `Allow: GET, HEAD` を返します。
- HTML とハッシュのないファイルは `Cache-Control: no-cache`、`assets/` 内の名前にビルドハッシュが付いたHTML以外のファイルは `public, max-age=31536000, immutable`、エラー応答は `no-store` です。ハッシュのない音源や楽譜にも更新が反映されます。[キャッシュ指示の意味](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
- JavaScript、CSS、音源、MusicXML、圧縮MusicXML、フォント、WebAssemblyなどにMIMEタイプを設定します。
- パストラバーサル、隠しファイル、ビルドルート外を参照するシンボリックリンクは拒否します。公開用の読み取り専用ビルドを指定し、配信中にディレクトリ構造を差し替えないでください。

## 本番ホストに必要な設定

マイクへのアクセスには安全なコンテキストが必要です。localhost/ループバックでの開発例外を除き、利用者向けには HTTPS を提供してください。LAN の `http://192.168.…` でページが開いても、マイクを利用できるとは限りません。[getUserMedia の前提条件](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

本番では TLS を終端するリバースプロキシ、または HTTPS 対応の静的ホストを用意し、上記のルーティングと404・MIME・キャッシュ設定を維持します。このサーバーを上流に使う場合は、プロキシからのみ到達可能なアドレスにバインドします。サイトはドメインのルート `/` で配信する前提です。

すべての応答に `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin` を設定します。CSP は `base-uri 'self'; object-src 'none'; frame-ancestors 'none'` の基本的な制限です。スクリプトや接続元の完全な許可リストではありません。Permissions Policy は同一オリジンのマイクとカメラを許可します。利用者の許可操作自体を省略するものではありません。

HTTPS の証明書・更新、HSTS、圧縮配信、監視、アクセス制限などは実際の公開環境に合わせて設定します。サーバーはアップロード先・保存API・利用者認証を提供しません。個人の楽譜をビルドディレクトリへ混ぜず、アプリ内のファイル選択から開いてください。

## 公開前の確認

```sh
curl -I http://127.0.0.1:4173/perform
curl -I http://127.0.0.1:4173/audio/does-not-exist.mp3
curl -I http://127.0.0.1:4173/scores/does-not-exist.musicxml
```

最初は `200 text/html`、残りは `404 text/plain` を返すことを確認します。ブラウザで `/perform` を直接開いて再読み込みし、MusicXMLの読み込み、伴奏の発音、マイクの許可を確認してください。実際のHTTPSホストでも同じ確認が必要です。

実装は [Node.js HTTP API](https://nodejs.org/api/http.html) を使用します。音源の読み込みは通常のGETで確認でき、Range応答・圧縮配信・条件付き304応答はこのサーバーの対象外です。

## Docker / Fly.io の構成

既存の `Dockerfile` は Node 24 Alpine でビルドし、実行段には `build/client` と `scripts/serve-web.mjs` だけをコピーします。公開ファイルの読取り・ディレクトリの走査権限を `chmod -R a+rX` で揃え、`node` ユーザーで配信します。実行段にnpm依存や個人の楽譜は入れません。Node 24を選ぶ根拠は[公式のLTS日程](https://github.com/nodejs/Release#release-schedule)。Alpineはmuslを使うため、Mac上の成功とは別にLinuxで依存のインストール・ビルドを確認します。[公式Nodeイメージ](https://github.com/nodejs/docker-node#nodealpine)

コンテナー内では `0.0.0.0:3000` を明示指定し、`fly.toml` の `http_service.internal_port = 3000` と合わせます。FlyのHTTPチェックは `GET /` が200を返すことを確認します。HTTPSは既存の `force_https = true` とFly側のTLS終端を使います。[待受要件](https://docs.fly.io/getting-started/troubleshooting/#your-app-isnt-listening-on-the-right-address)・[HTTPチェック](https://docs.fly.io/reference/configuration/#http_servicechecks)

Dockerエンジンが動作する環境で、まずローカルのイメージを確認します。Fly向けは `linux/amd64` を明示します。[公式flyctlの対応プラットフォーム指定](https://github.com/superfly/flyctl/blob/7951745a09f1e5dd869e0d3924a50ce092311ac7/internal/build/imgsrc/dockerfile_builder.go#L373-L385)

```sh
docker buildx build --platform linux/amd64 --pull --load -t convo-certo-web:preview .
docker run --platform linux/amd64 --rm -p 127.0.0.1:4173:3000 convo-certo-web:preview
```

Apple silicon上のローカルDockerではamd64のエミュレーションを使うため、ビルドが遅くなる場合があります。[Dockerの説明](https://docs.docker.com/build/building/multi-platform/#qemu)

起動後は上記のHTTP確認と、ブラウザでのMusicXML読み込み・伴奏再生を行います。終了は Ctrl+C。Linuxの検証後、実際に管理できるFlyアプリ・公開条件を確認してデプロイします。設定中の既存アプリ名だけでは、そのアプリの所有権や現在の公開状態を確認したことにはなりません。

`.dockerignore` はビルド入力を限定します。`.git`、`.env*`、個人用の `public/repertoire/local`、権利未確認の旧譜面、`.repertoire-cache`、`distribution`、検証記録、その他の開発資料を送信対象から外します。権利検査が必要とする `docs/research/pdmx-wind-candidates.json` と必要なビルドスクリプト・補足ライセンスは残します。入力を増やす場合はこの一覧も更新してください。ディレクトリを `!` で再包含すると子も対象になるため、個別ファイルだけ残す場所では子を改めて除外しています。[Dockerの除外規則](https://docs.docker.com/build/concepts/context/#dockerignore-files)

### 2026-09-30 の実Linux arm64検証

ローカルのDockerエンジンでLinux arm64イメージのビルドと起動が成功しました。既存のNix管理設定を変更せず、一時ディレクトリを `DOCKER_CONFIG` に指定してエンジンを起動し、元の設定のシンボリックリンクとSHA-256が変わっていないことを確認しました。

- Node 24.21.0 / Linux arm64、UID 1000で配信。イメージは68,829,329 bytes。`/app` は `build` と `scripts` だけで、アプリの `node_modules` はありません。
- 初回の実コンテナー試験で、所有者だけが読めるサンプル譜面（600）がroot所有でコピーされ、HTTP 403になる不具合を検出しました。上記の権限設定後、配信対象285ファイルすべてをUID 1000で読めることを確認。2譜面・34音色を維持し、238音源サンプルのSHA-256が出典記録と一致しました。個人用譜面は含まれません。
- HTTP 12件でトップ・直接リンク・両譜面・音源・非公開ファイルの404・HEADを確認。MIME、キャッシュ、`nosniff`も検査しました。
- コンテナー配信に接続したMac側のChromiumで、`/perform`の直接アクセスと再読み込み、MXL取込、担当選択、SVG譜面表示、音源開始2回、演奏位置1.5への進行、停止を確認。ブラウザ例外・HTTP読込エラー・通信失敗は0件。これは音源開始の機械検証であり、実奏者による音や追従の評価ではありません。
- コンテナーは停止要求後に終了コード0で終了し、検証用コンテナーを削除しました。OOMによる停止はありません。

検証したソースは `15def7428df2149de42d8460b7cebf4d7668b38b9d19d5b73176156e6dd219a5`、イメージIDは `sha256:c8cf6ed508fcecb91005f295046cb9b3004fa35c1c358a5df92e7ddf100224c2` です。[ビルド記録](../verification-results/linux-container-2026-09-30/build-report.json)と[実行記録](../verification-results/linux-container-2026-09-30/runtime-report.json)に同じIDを保存しています。試験スクリプト・ログ・画面は `verification-results/linux-container-2026-09-30/` にあります。

### 2026-09-30 の実Linux amd64検証

同じソース `15def7428df2149de42d8460b7cebf4d7668b38b9d19d5b73176156e6dd219a5` を、BuildKitのDockerドライバーで `--platform linux/amd64 --load` を指定してビルドし、起動検証まで成功しました。Apple silicon上のDocker Desktopによるエミュレーションであり、Fly実機での実行ではありません。

- Node 24.21.0 / Linux x64、UID 1000。配信対象285ファイルすべてを読めること、2譜面・34音色・238サンプルのハッシュ、個人用譜面とアプリのnpm依存が含まれないことを確認しました。
- HTTP 12件と、Mac側のChromiumによる直接アクセス・再読み込み・MXL取込・担当選択・SVG表示・音源開始2回・演奏位置1.5への進行・停止が成功。ブラウザ例外・HTTP読込エラー・通信失敗は0件です。
- 停止要求後は終了コード0、OOMなしで終了し、検証用コンテナーを削除しました。

イメージIDは `sha256:b71eb257aac2a53aa24b481f13262e07c340f90e6af47632ce058df8378ded2a`、サイズは68,407,827 bytes。[ビルド記録](../verification-results/linux-amd64-container-2026-09-30/build-report.json)と[実行記録](../verification-results/linux-amd64-container-2026-09-30/runtime-report.json)を照合しています。先行したlegacy builderは途中イメージの `No such image` で失敗しました。その[失敗記録](../verification-results/linux-amd64-container-2026-09-30/legacy-build-report.json)とログも残し、BuildKitへ切り替えた成功と区別しています。

**実際のFlyアプリのチェックとHTTPS公開は未検証**です。ローカルのLinux配信成功を公開完了とは扱いません。依存監査には警告が残ります。対象依存と現構成での到達性・未検証範囲は[依存監査記録](../verification-results/dependency-audit-2026-09-30/reachability.md)を参照してください。

### 2026-09-30 の先行Mac検証（履歴）

以下はDockerエンジン起動前に行った補助検証です。現在のLinux検証結果は上記を参照してください。

- Docker CLI 27.3.1の実際の送信アーカイブをローカルの受信先で検査し、19項目の除外と16項目の必須入力を確認。リモートへの送信はしていません。この検査はコンテナーのビルドではありません。
- その入力と既存Mac用依存のコピーを使い、Node 24.19.0 / macOSで本番ビルド成功。2譜面・34音色、配信ファイルは約11.2MB。この時点ではLinuxでの `npm ci` は未検証でした。
- `build/client` と配信スクリプトだけを別ディレクトリへ置き、Node 24のCLIで起動。HTTP9経路、直接リンクの再読み込み、実ブラウザでのMusicXML表示と伴奏の発音開始、正常終了を確認。ブラウザ例外・アセット読込失敗は0件。既存プロセスが3000番を使っていたため、このMac上の試験だけ空いているポートへ変更しました。
- 配信HTTP試験9件、配布ソースの変更検出を含む関連単体試験10件が成功。
- Docker Desktopは既存のNix管理設定への書込み時に `cross-device link` エラーとなり、エンジンに接続できませんでした。設定の変更や初期化はしていません。この時点ではLinuxイメージの実ビルド・非root起動・Flyのチェック通過・HTTPS公開は未検証でした。

検証記録は `verification-results/web-deployment-2026-09-30/`。Dockerfile・除外設定・Fly設定・権利検査の入力も `releaseSourceHash` に含め、これらの変更後に古いMac検証レポートで再梱包しないようにしています。このDocker補助検証はソース `c0c7f187897d3c34a61595c7c8982ff033b193176bd4bc65be2b9f9da35ae45e` 時点のものです。その後の日英UI修正とMacの全体検証・DMGについては[最新の成果物記録](release-candidate-verification-2026-09-30.md)を参照してください。Macの検証成功をLinuxでの成功とは扱いません。
