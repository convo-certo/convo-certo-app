# クラリネットで楽しむ MusicXML 入手ガイド

確認日：2026-09-25

ConvoCertoは **MusicXML（`.musicxml` / `.xml` / 圧縮版の `.mxl`）** を読み込みます。`.mxl`は展開せず、そのまま選べます。伴奏と合わせるには、自分のパートと伴奏が一緒に入った総譜やピアノ伴奏版を選びます。PDF・音源・クラリネットのパート譜だけでは、他の楽器の伴奏を生成できません。

まずはクラリネットのソロが知られる作品を優先しました。選曲の参考は[北イリノイ大学のオーディション曲一覧](https://www.niu.edu/gbarrett/resources/audition-lists.shtml)と[Sean Osbornのオーケストラ曲解説](https://osbornmusic.com/guide.html)。アプリは他の楽器のパートも選べます。

## 手元の楽譜を開く

保存先は **ミュージック → ConvoCertoの楽譜**。ConvoCertoで「MusicXMLで演奏する」からファイルを開き、「奏者パート」でクラリネットを選びます。楽譜のA管・B♭管と、自分の楽器の設定を確認してください。

| フォルダ | 内容 |
|---|---|
| `01 交響曲・総譜` | ベートーベン第3・4・5・6・7・8番、ブラームス第1・3・4番。全楽章、計37ファイル |
| `02 以前の52譜・編曲や抜粋を含む` | 以前の52ファイル。K.622の全3楽章、K.581など。編曲・抜粋・独奏曲も含む |
| `03 クラリネットの独奏曲・追加曲` | ウェーバー《小協奏曲》のクラリネット＋ピアノ版、《スペイン奇想曲》の総譜 |
| `04 ラフマニノフ（入手先リンク）` | ピアノ協奏曲第2番の全3楽章、交響曲第2番の全4楽章へのショートカット。**楽譜本体は未取得** |

上記は個人の楽譜フォルダです。アプリの初回ダウンロードには追加していません。曲名・楽章番号をファイル名に入れ、各フォルダの `sources.json` に出典と利用条件を残しています。

## まず吹いてみる候補

| 曲 | 練習の入口 | 入手先・収録範囲 |
|---|---|---|
| ベートーベン：第4交響曲 | 第2楽章 | OpenScore Orchestra。全4楽章の総譜を保存済み |
| ベートーベン：第6交響曲《田園》 | 第1・第2楽章 | 同上。全5楽章を保存済み |
| ベートーベン：第8交響曲 | 第3楽章 | 同上。全4楽章を保存済み |
| ブラームス：第3交響曲 | 第1・第2楽章 | 同上。全4楽章を保存済み |
| ブラームス：第4交響曲 | 第2楽章 | 同上。全4楽章を保存済み |
| モーツァルト：クラリネット協奏曲 K.622 | 第1・第2楽章 | 既存フォルダに全3楽章。出典：[I](https://scorebase.org/scores/196564)・[II](https://scorebase.org/scores/9239)・[III](https://scorebase.org/scores/152191) |
| モーツァルト：クラリネット五重奏曲 K.581 | 第1・第2楽章 | 既存フォルダに全4楽章。原出典は[Mutopia](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=337)。原サイトはLilyPond/PDF/MIDIで、直接MusicXML配布ではない |
| ウェーバー：小協奏曲 Op.26 | 冒頭から | [music21の配布ページ](https://github.com/cuthbertLab/music21/blob/d28a1347eb287e71a24f7e8b18c8a4e2c1a6ff10/music21/corpus/weber/concertino_clarinet.mxl)。全241小節、クラリネット＋ピアノ。保存済み |
| リムスキー＝コルサコフ：スペイン奇想曲 Op.34 | 第I・III・IV部 | [ScoreBaseのDownload MXL](https://scorebase.org/scores/170132)。全5部、32パート641小節の総譜を保存済み |

OpenScore Orchestraの各楽章へのリンクは、このガイドの末尾にあります。いずれもソロ抜粋ではなく総譜の `.mxl` を選んでいます。

## ローマの松と、外部から取得する曲

| 曲・入手先 | MusicXMLと編成 | 利用時の条件・確認状況 |
|---|---|---|
| [レスピーギ：ローマの松（descourtis版）](https://musescore.com/user/43948481/scores/21835225) | 管弦楽総譜の候補。38パート435小節と表示 | 正規の「ダウンロード → MusicXML」で購入画面へ進むことを確認。**購入が必要／再配布許諾なし**。未購入・未取得なので第III楽章の内容や精度は未検証 |
| [チャイコフスキー：第6交響曲《悲愴》](https://github.com/iis-mctl/mctl-symphony-dataset/tree/f845a46314fc603259bbe9bdf773a7bb2d235295/symbolic_symphony_set) | S3の `tc1`〜`tc4` 内の `sheet.xml`。全4楽章の総譜として公開 | 公開GitHub。第4楽章の実XML構造を確認。元データはMuseScore由来で、個別譜の再配布許諾は未確定。**リンクのみ／再配布保留** |
| [ドヴォルザーク：第9交響曲《新世界より》](https://github.com/iis-mctl/mctl-symphony-dataset/tree/f845a46314fc603259bbe9bdf773a7bb2d235295/symbolic_symphony_set) | S3の `dv1`〜`dv4` 内の `sheet.xml`。全4楽章の総譜として公開 | 第2楽章の実XML構造を確認。上と同じ理由で**リンクのみ／再配布保留**。旧フォルダの木管編曲とは別の版 |
| [ブラームス：ソナタ第2番 Op.120-2](https://www.virtualsheetmusic.com/score/SonataBrOp120No2.html) | クラリネット＋ピアノ、全3楽章 | VSMのPlaygroundからMusicXML export対応。**MusicXMLは会員限定**。単品PDF購入のみでXMLが付くとは確認できない。未取得、再配布許諾なし |
| [サン＝サーンス：ソナタ Op.167](https://www.virtualsheetmusic.com/score/SonataSaintOp167ClPf.html) | クラリネット＋ピアノ、全4楽章 | 同じく**MusicXMLはVSM会員限定**。未取得、再配布許諾なし |
| [リムスキー＝コルサコフ：シェエラザード](https://scorebase.org/scores/53994) | 第2楽章の**吹奏楽編曲**。24パート362小節 | MXL取得・構成確認済み。原編成の全曲総譜ではない。今回のおすすめフォルダへの追加は保留 |
| [ブラームス：三重奏曲 Op.114 第2楽章](https://scorebase.org/scores/132798) | クラリネット＋**ヴァイオリン**＋ピアノへの編曲。54小節 | 既存フォルダに保存済み。原曲のチェロ編成とは異なる。今回、外部ダウンロードは403で確認できず |

《ローマの松》は第III楽章「ジャニコロの松」を優先しています。[IMSLPにもMusicXML](https://imslp.org/wiki/Special:ImagefromIndex/788181)がありますが、こちらは**オルガン4手＋ピアノへの編曲**です。クラリネット入りの総譜の代わりとして案内していません。

## ラフマニノフ：ピアノ協奏曲第2番・交響曲第2番

個人フォルダの `04 ラフマニノフ（入手先リンク）` に、各楽章の `.webloc` をまとめています。ダブルクリックすると配布ページが開きます。これはブラウザ用のリンクで、ConvoCertoに読み込む楽譜ではありません。入手先リンクの整理：2026-09-30。以下の取得条件は2026-09-25の確認記録です。

7楽章の出典・確認日・取得状況は、同フォルダの `sources.json` にも保存しています。開発側の記録は [rachmaninoff-sources.json](research/rachmaninoff-sources.json)。ショートカット7件のURLと照合済みです。

以下は**管弦楽総譜の入手先候補**です。今回の環境ではMusicXML本体を取得できておらず、手元の91ファイルにはまだ含めていません。ページで確認できる編成・小節数を記録していますが、全音符やアプリでの演奏は未検証です。

### ピアノ協奏曲第2番 Op.18（全3楽章）

[Dave5400による全3楽章の一覧](https://musescore.com/user/1236216/sets/5117579)。投稿者のプロフィールにはダウンロードを歓迎する記載がありますが、確認できたI・IIIの個別ライセンスは **All rights reserved**。公開再配布は許可されたと扱いません。

| 楽章 | 総譜ページ | 確認できた取得条件 |
|---|---|---|
| I Moderato | [第1楽章](https://musescore.com/user/1236216/scores/7101510) — 17パート・364小節 | 「ダウンロード → MusicXML」でログイン／1クレジットの案内。ログイン後の料金条件は未確認 |
| II Adagio sostenuto | [第2楽章](https://musescore.com/user/1236216/scores/2752871) — 投稿者一覧では17パート | **今回の接続環境では地域制限**。個別ページとMusicXML取得条件を確認できない。[別投稿のフル版](https://musescore.com/user/14481651/scores/4355726)も同じ制限 |
| III Allegro scherzando | [第3楽章](https://musescore.com/user/1236216/scores/7219509) — 20パート・478小節 | 「ダウンロード → MusicXML」で**購入画面**。未購入・未取得 |

Iには第6小節のピアノ和音について誤記を指摘する公開コメントがあります。指摘そのものは原譜と未照合です。また、投稿者は装飾音やカデンツァを通常音符・延長小節・隠したテンポ変更で実装したと説明しています。取得後はこの部分の譜面と伴奏の同期を確認します。

### 交響曲第2番 Op.27（全4楽章）

rtuhsnsgellによる管弦楽版です。全4ページで **All rights reserved** と「ダウンロード → MusicXML → ログイン／1クレジット」の案内を確認しました。ログイン後の取得可否・料金は未確認です。クレジット消費・購入はしていません。

| 楽章 | 総譜ページ | ページに表示された構成 |
|---|---|---|
| I Largo – Allegro moderato | [第1楽章](https://musescore.com/user/41737026/scores/14804749) | 28パート・570小節 |
| II Allegro molto | [第2楽章](https://musescore.com/user/41737026/scores/8277641) | 24パート・532小節 |
| III Adagio | [第3楽章：クラリネットの長いソロ](https://musescore.com/user/41737026/scores/15046198) | 24パート・171小節 |
| IV Allegro vivace | [第4楽章](https://musescore.com/user/41737026/scores/16152508) | 24パート・574小節 |

別のCC0公開版には投稿者自身の「work in progress」の記載があり、完成した全曲版として採用していません。ScoreBaseで確認できた原曲総譜はPDFのみです。

原曲の保護期間と、現代の編曲・編集や各ファイルの利用条件は分けて確認しています。今回の7楽章は、まず正規入手先の案内として追加しました。

## まだ準備できていない曲

| 曲 | 現在の状況・参照先 |
|---|---|
| ベルリオーズ：幻想交響曲 第5楽章 | [MuseScoreの総譜候補](https://musescore.com/user/38443173/scores/14481028)。CC0 1.0表示、23パート524小節48ページ。「ダウンロード → MusicXML」のログイン／1クレジット案内まで確認。未取得・未検証。[Neumaの候補](https://neuma.huma-num.fr/home/corpus/composers%3Aberlioz/)は接続タイムアウト |
| ベートーベン：ピアノ協奏曲第1番 Op.15 第1・第2楽章 | MuseScoreの正規候補：[I](https://musescore.com/user/38606/scores/14556577)・[II](https://musescore.com/user/38606/scores/14709892)。**両方のCC0 1.0表示を確認**。各20パート、Iは510小節、IIは119小節。未ログイン状態では未取得。ログイン後の料金・取得条件は未確定。第5番《皇帝》とは別 |
| メンデルスゾーン：第3交響曲《スコットランド》第2楽章 | [IMSLP原譜](https://imslp.org/wiki/Symphony_No.3,_Op.56_(Mendelssohn,_Felix))はあるが、原編成MusicXMLは未確保 |
| チャイコフスキー：第5交響曲 第1楽章 | 許諾の確かな総譜MusicXMLは未確保。見つかった第2楽章のホルンソロ抜粋は代用しない |
| ドヴォルザーク：第8交響曲 | PDMX候補にライセンス矛盾あり。未採用 |
| ショスタコーヴィチ：第9交響曲 第2楽章 | [出版社の作品ページ](https://www.boosey.com/cr/music/Dmitri-Shostakovich-Symphony-No-9-in-E-flat-major/3975)。公認MusicXMLの入手先は未確認、収集・再配布を保留 |

## ダウンロードの手順

1. 案内した曲のページを開き、編成と楽章を確認。
2. **MusicXML / MXL**を選択。GitHubではファイルを開いて「Download raw file」を使う。`_melody.mxl` は独奏用に繋げた分析資料なので、伴奏用には通常の `.mxl` を選ぶ。
3. ConvoCertoの「MusicXMLで演奏する」から読み込み、自分のパートを選ぶ。

外部サイトの料金・会員条件は取得時の表示に従ってください。ログインや購入が必要な譜面は、ユーザー自身が正規の導線で取得する想定です。

## データを配布する場合の区別

原曲の保護期間と、入力・編曲されたファイルの利用条件は別に確認します。今回は一般的な法律判断で一括許可せず、配布元の表示と実ファイルの記録を保存しました。

| 公開元 | 確認できた表示 | 今回の扱い |
|---|---|---|
| [Hauptstimme / OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/README.md#licence) | 楽譜CC0 1.0、分析注釈CC-BY-SA（版番号は明記なし） | 元のクレジット・分析注釈を保存。変更は表示曲名のみ。公開再配布時は注釈の表示・継承条件も引き継ぐ |
| music21のウェーバー Op.26 | ファイル内にOliver SeelyとPublic Domainへの提供表示 | 未変更の原MXLを保存。music21ソフトウェアのライセンスから推定していない |
| [PDMX](https://zenodo.org/records/15571083) / ScoreBase | 個別CC0/PD表示、データセットCC BY 4.0。一部データには権利表示の矛盾あり | 採用したファイルは `license_conflict=False` を確認。内部表示・出典・ハッシュも記録。矛盾のある《ローマの松》やドヴォルザーク第8は除外 |
| MuseScoreの《ローマの松》 / VSMの上記版 | 再配布の許諾を確認できない | 正規の入手先リンクのみ。購入済みでも自動的に再配布可とはしない |
| MuseScoreの上記《幻想》第5楽章 / ベートーベン Op.15 I・II | 各公開ページにCC0 1.0 | ファイル未取得。権利表示と、サイトの取得時のログイン・料金条件は別に確認する |
| S3の《悲愴》《新世界》 | リポジトリMIT、楽譜にMuseScore出典 | コード・リポジトリの許諾だけで第三者譜面まで判断せず、再配布保留 |

PDMX出典：Phillip Long, Zachary Novack, Julian McAuley, Taylor Berg-Kirkpatrick, *PDMX: A Large-Scale Public Domain MusicXML Dataset for Symbolic Music Processing*, ICASSP 2025。関連研究：Weihan Xu et al., *Generating Symbolic Music from Natural Language Prompts using an LLM-Enhanced Dataset*, 2024。

## 検査の範囲

交響曲37ファイルはConvoCertoの実際のMXL読込・解析を通し、不正な音高・開始時刻・長さは検出しませんでした。全音符の原譜比較や全曲の聴取検査ではありません。第5交響曲第1楽章268小節はオーボエのカデンツァを含む拡張小節で、拍子超過の警告が出ます。原データを短縮せず残しています。

装飾音の発音、トリル・トレモロ記号からの音列化、フェルマータによる自動延長にはアプリ側の制限があります。特に原譜の細かなニュアンスまで完成済みとは扱っていません。詳細は同じフォルダの検査記録を参照してください。

追加2曲も読み込み・音符の基本数値検査を通りました。ただしウェーバーOp.26のピアノ237〜239小節、《スペイン奇想曲》のハープ525・527・529・531小節には拍子超過の警告があり、当該箇所は原譜確認が必要です。勝手に音符を削る修正はしていません。《スペイン奇想曲》はA管・B♭管が別パートに分かれているため、練習区間に応じたパートを選んでください。

ベートーベン第4番II・第8番III、ブラームス第3番II、ウェーバーOp.26、スペイン奇想曲の5例では、クラリネットのパート選択・譜面表示・伴奏の発音処理まで確認しました。ウェーバーはスマホ幅でも確認しています。実楽器を使った全曲の演奏テストは含みません。

## ベートーベンとブラームス：全53楽章へのリンク

以下は同じ公開元の固定版です。手元に保存した37楽章以外は、リンク・ファイル一覧の確認のみです。

| 作品 | 各楽章のMusicXML配布ページ |
|---|---|
| ベートーベン 第1交響曲 Op.21 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.1,_Op.21/1/Beethoven_Op.21_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.1,_Op.21/2/Beethoven_Op.21_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.1,_Op.21/3/Beethoven_Op.21_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.1,_Op.21/4/Beethoven_Op.21_4.mxl) |
| ベートーベン 第2交響曲 Op.36 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.2,_Op.36/1/Beethoven_Op.36_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.2,_Op.36/2/Beethoven_Op.36_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.2,_Op.36/3/Beethoven_Op.36_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.2,_Op.36/4/Beethoven_Op.36_4.mxl) |
| ベートーベン 第3交響曲 Op.55 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.3,_Op.55/1/Beethoven_Op.55_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.3,_Op.55/2/Beethoven_Op.55_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.3,_Op.55/3/Beethoven_Op.55_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.3,_Op.55/4/Beethoven_Op.55_4.mxl) |
| ベートーベン 第4交響曲 Op.60 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.4,_Op.60/1/Beethoven_Op.60_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.4,_Op.60/2/Beethoven_Op.60_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.4,_Op.60/3/Beethoven_Op.60_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.4,_Op.60/4/Beethoven_Op.60_4.mxl) |
| ベートーベン 第5交響曲 Op.67 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.5,_Op.67/1/Beethoven_Op.67_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.5,_Op.67/2/Beethoven_Op.67_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.5,_Op.67/3/Beethoven_Op.67_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.5,_Op.67/4/Beethoven_Op.67_4.mxl) |
| ベートーベン 第6交響曲 Op.68 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.6,_Op.68/1/Beethoven_Op.68_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.6,_Op.68/2/Beethoven_Op.68_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.6,_Op.68/3/Beethoven_Op.68_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.6,_Op.68/4/Beethoven_Op.68_4.mxl)・[5](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.6,_Op.68/5/Beethoven_Op.68_5.mxl) |
| ベートーベン 第7交響曲 Op.92 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.7,_Op.92/1/Beethoven_Op.92_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.7,_Op.92/2/Beethoven_Op.92_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.7,_Op.92/3/Beethoven_Op.92_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.7,_Op.92/4/Beethoven_Op.92_4.mxl) |
| ベートーベン 第8交響曲 Op.93 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.8,_Op.93/1/Beethoven_Op.93_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.8,_Op.93/2/Beethoven_Op.93_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.8,_Op.93/3/Beethoven_Op.93_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.8,_Op.93/4/Beethoven_Op.93_4.mxl) |
| ベートーベン 第9交響曲 Op.125 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.9,_Op.125/1/Beethoven_Op.125_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.9,_Op.125/2/Beethoven_Op.125_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.9,_Op.125/3/Beethoven_Op.125_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Beethoven,_Ludwig_van/Symphony_No.9,_Op.125/4/Beethoven_Op.125_4.mxl) |
| ブラームス 第1交響曲 Op.68 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.1,_Op.68/1/Brahms_Op.68_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.1,_Op.68/2/Brahms_Op.68_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.1,_Op.68/3/Brahms_Op.68_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.1,_Op.68/4/Brahms_Op.68_4.mxl) |
| ブラームス 第2交響曲 Op.73 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.2,_Op.73/1/Brahms_Op.73_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.2,_Op.73/2/Brahms_Op.73_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.2,_Op.73/3/Brahms_Op.73_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.2,_Op.73/4/Brahms_Op.73_4.mxl) |
| ブラームス 第3交響曲 Op.90 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.3,_Op.90/1/Brahms_Op.90_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.3,_Op.90/2/Brahms_Op.90_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.3,_Op.90/3/Brahms_Op.90_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.3,_Op.90/4/Brahms_Op.90_4.mxl) |
| ブラームス 第4交響曲 Op.98 | [1](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.4,_Op.98/1/Brahms_Op.98_1.mxl)・[2](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.4,_Op.98/2/Brahms_Op.98_2.mxl)・[3](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.4,_Op.98/3/Brahms_Op.98_3.mxl)・[4](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/data/Brahms,_Johannes/Symphony_No.4,_Op.98/4/Brahms_Op.98_4.mxl) |


GitHubのファイルページで「Download raw file」を選ぶと、1楽章ずつ取得できます。まとめて全リポジトリをダウンロードする必要はありません。
