# 手元での確認手順

## いちばん簡単な確認（DMG）

検証済みDMGは次の場所にある。

`build/distribution/ConvoCerto-preview-0.1.0-arm64-91nzaD/ConvoCerto-preview.dmg`

1. DMGを開き、`ConvoCerto.app`を`Applications`へコピーする。
2. 初回だけ、Controlキーを押しながらアプリを開き、「開く」を選ぶ。これは開発用アドホック署名で、公証済みの一般配布版ではない。
3. 「準備・オーケストラ」でモーツァルトのクラリネット協奏曲を選ぶ。
4. 自分の担当をClarinetにし、「楽譜専用ページで演奏する」を開く。
5. 「▶ 演奏開始」で伴奏を鳴らす。楽譜をクリックすると、その位置から再生する。

## ClariMateで吹く

1. ClariMateをUSBで接続し、ClariMate側でMIDI出力を有効にする。
2. アプリの「準備・オーケストラ」から「ClariMate / MIDIを接続」を押す。
3. MIDI機器一覧からClariMateを選ぶ。入力表示に音名または強さが出れば接続できている。
4. MIDI入力の試聴は、ClariMate自身の音を聴きたいときはOFFにする。
5. 最初は練習モードを「正しい音を待つ」にし、冒頭音を吹いて進むことを確認する。その後「伴奏に合わせる」でテンポ追従を試す。
6. MIDI機器を抜いたときに停止し、再接続後に演奏開始を押して明示的に再開できることを確認する。

ClariMateの音色、発音遅延、実演での追従精度は自動テストでは保証していない。短い8小節、通常テンポ、遅いテンポ、息継ぎを入れたテイクを順に試し、違和感があれば入力方式・テンポ・譜面の小節番号を記録する。

## 任意のMusicXMLを試す

「MusicXMLで演奏する」から`.musicxml`、`.xml`、`.mxl`を選ぶ。読み込み後に担当パート、移調、ミュート、席の位置を設定できる。楽譜の問題が見つかった場合は、画面の再生問題表示に出るパート名と小節番号を記録する。元ファイルは変更されない。

## 開発版の自動確認

リポジトリのルートで実行する。

```sh
npm install
npm run typecheck
npm test
npm run build
npm run e2e
```

Webを手で見るときは別のターミナルで`npm run dev`を実行し、`http://localhost:5173/perform`を開く。

MacでSwift版も確認する場合は、Webビルド後に次を実行する。

```sh
npm run native:build
npm run native:test
npm run native:recovery
```

全工程を一度に検証する場合は`npm run verify:release`を使う。結果は`verification-results/<実行時刻>/report.json`に保存される。DMGの作成とコピー後の検証まで行う場合は、検証レポートを指定して次を実行する。

```sh
npm run native:package -- verification-results/<実行時刻>/report.json
```

通常版も検証版も、起動時にOSが空いているローカルポートを割り当てるため、同じMacで同時に起動できる。一般販売の可否、Developer ID、公証、全楽譜の商用権利、実演者の満足度はこの手順では判定しない。
