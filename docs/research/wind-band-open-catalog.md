# 吹奏楽オープン譜面候補

この一覧は、ConvoCertoに収録する吹奏楽作品を選ぶための調査台帳。`PD候補`は原曲と確認した版が公開されている候補であり、各国での商用配布を自動的に保証するものではない。MusicXML化するときは、指定された公開版を参照して新規に浄書し、音源・PDF・MusicXMLの権利を別々に記録する。

候補の再検索は `npm run ensemble:candidates` で実行する。PDMXのメタデータから管楽・金管・行進曲系を抽出し、`docs/research/pdmx-wind-candidates.json` とアプリから参照できる `public/repertoire/ensemble/pdmx-wind-candidates.json` を更新する。このレポートは収録許可リストではなく、各行を原譜・編曲者・MusicXML内部の権利表示まで確認してから `scripts/ensemble-selection.json` に追加する。

## 収録済み14エントリー

候補のうち、現在は次の14エントリーをMusicXMLとして収録済み。いずれもPDMXの`cc-zero`または`publicdomain`、`license_conflict=False`、`has_paywall=False`、`subset:all_valid=True`を満たし、内部の権利要素がないことを生成スクリプトで検査している。

この14曲のうち、パート名からクラリネット席を検出できるのは4曲（ドヴォルザーク、シュトラウス、モーツァルト、ホルスト）である。残りは金管・木管別編成や管楽器を含む合奏として、席の追加・楽器変更機能で試せる。

| 収録ID | 作品・編成 | パート数 |
| --- | --- | ---: |
| `dvorak-new-world-4-woodwind` | ドヴォルザーク《新世界より》第4楽章 木管アンサンブル | 16 |
| `strauss-radetzky-wind-ensemble` | シュトラウス1世 ラデツキー行進曲 | 8 |
| `fucik-florentiner-double-reed` | フチーク フロレンティーナ行進曲 | 7 |
| `byrd-earl-of-oxford-march-brass` | ウィリアム・バード オックスフォード伯の行進曲 | 5 |
| `chesnokov-salvation-is-created-brass` | チェスノコフ Salvation Is Created | 11 |
| `handel-la-march-d-major` | ヘンデル La March ニ長調 | 11 |
| `bizet-arlesienne-brass` | ビゼー《アルルの女》金管版 | 5 |
| `bizet-arlesienne-brass-expanded` | ビゼー《アルルの女》拡張金管版 | 6 |
| `bach-orchestral-suite-1` | J.S.バッハ 管弦楽組曲第1番 BWV 1066 | 6 |
| `mozart-turkish-march-orchestra` | モーツァルト トルコ行進曲（クラリネット入り） | 15 |
| `holst-jupiter-brass-ensemble` | ホルスト《木星》金管アンサンブル版 | 6 |
| `corelli-sarabande-brass-ensemble` | コレッリ《サラバンド》金管アンサンブル版 | 5 |
| `holst-jupiter-woodwind-chorale` | ホルスト《木星》コラール木管合奏版 | 13 |
| `holst-jupiter-low-brass-quintet` | ホルスト《木星》低音金管五重奏版 | 5 |

## 追加候補（今後の調査）

| 作品 | 作曲者 | 吹奏楽譜の確認先 | 現時点の扱い |
| --- | --- | --- | --- |
| フロレンティーナ行進曲 Op.214 | Julius Fučík | [IMSLP](https://imslp.org/wiki/Florentiner_Marsch%2C_Op.214_%28Fu%C4%8D%C3%ADk%2C_Julius%29) | PD候補。1908年の吹奏楽版を優先して採譜 |
| 軍隊の子供たち Op.169 | Julius Fučík | [IMSLP](https://imslp.org/wiki/Die_Regimentskinder%2C_Op.169_%28Fu%C4%8D%C3%ADk%2C_Julius%29) | PD候補。完全スコアとパートの有無を確認して採譜 |
| ファンファーレ・クレンゲ Op.278 | Julius Fučík | [IMSLP](https://imslp.org/wiki/Fanfarenkl%C3%A4nge_%28Fu%C4%8D%C3%ADk%2C_Julius%29) | PD候補。吹奏楽原版の探索を継続 |
| ラデツキー行進曲 Op.228 | Johann Strauss Sr. | [IMSLP](https://imslp.org/wiki/Radetzky_Marsch_%28_for_Concert_Bands_%29_%28Strauss_Sr.%2C_Johann%29) | PD候補。PD表示の版だけを採譜 |
| The Free-Lance March | John Philip Sousa | [IMSLP](https://imslp.org/wiki/The_Free-Lance_March_%28Sousa%2C_John_Philip%29) | PD表示。1906年初版を基準にする |
| Ancient and Honorable Artillery Company | John Philip Sousa | [IMSLP](https://imslp.org/wiki/Ancient_and_Honorable_Artillery_Company_%28Sousa%2C_John_Philip%29) | PD表示。吹奏楽とハープの編成を確認 |
| Holyrood | Kenneth J. Alford | [IMSLP](https://imslp.org/wiki/Holyrood_%28Alford%2C_Kenneth_J.%29) | PD表示。1913年版のスコアとパートを基準にする |
| The Vanished Army | Kenneth J. Alford | [IMSLP](https://imslp.org/wiki/The_Vanished_Army_%28Alford%2C_Kenneth_J.%29) | PD表示。軍楽隊版のパートを基準にする |
| The Washington Post | John Philip Sousa | [IMSLP](https://imslp.org/wiki/The_Washington_Post_%28Sousa%2C_John_Philip%29) | 原曲PD。編曲版はCPDL License v4など条件を明記 |
| 交響曲第5番 第1楽章 | Pyotr Ilyich Tchaikovsky | [IMSLP](https://imslp.org/wiki/Symphony_No.5_%28Tchaikovsky%2C_Pyotr_Ilyich%29) | 原曲PD候補。吹奏楽化は自前編曲として別管理 |
| 第1組曲《シャコンヌ》 | Gustav Holst | PDMX候補（CC0表示） | 31パート候補は`license_conflict=True`のため未収録。別版の同定待ち |
| 水上の音楽 | George Frideric Handel | PDMX候補（PDM/CC0表示） | 編成済みMusicXMLの版と内部権利表示を確認してから採譜 |
| ウィリアム王の行進曲 | Jeremiah Clarke | PDMX候補（公開表示） | 原曲PDと編曲版の権利を分けて確認 |

PDMXの検索台帳では、**Holst: Second Suite for Military Band Op.28 No.2**（34パート、451小節、CC0表示、`license_conflict=False`、有効ファイル）が候補として見つかっている。ただしScoreBaseで取得できた個別MXL（スコアID 223642）は1パートのピアノ版で、別の演奏用候補（155502）はユーフォニアム版だった。全曲吹奏楽版（492895）はPDFのみでMusicXMLを取得できないため、吹奏楽収録には追加していない。[PDMX Zenodo](https://zenodo.org/records/15571083)

ラデツキー行進曲は、PDMXの`cc-zero`・`license_conflict=False`・`all_valid=True`を満たす8パート版を取得し、MusicXMLの権利要素が空であることを確認して収録した。38小節の短いアレンジなので、原曲全曲版ではなく「木管・金管アレンジ」として表示する。

追加調査では、Sousa「The Washington Post」とHalvorsen「Entry March of the Boyars」の候補を検索した。前者はアルトサックスまたはピアノ譜、後者はMusicXMLを取得できない検索結果しか見つからなかったため、吹奏楽譜としては登録していない。原曲の公開性だけでなく、実際に取得できる編成済みMusicXMLまで揃うことを収録条件にする。

PDMXの候補には、Holst《First Suite for Military Band》の31パート453小節版（CC0表示）と《Jupiter》の32パート409小節版（CC0表示）もある。ただし編曲者・版の同定と原譜との校合が未完了で、現時点では配布カタログへ入れていない。候補の存在だけで権利確認済み・演奏可能とは扱わず、取得元、編曲者表示、全パートの整合を確認してから収録する。

2026-09-14のローカルPDMX台帳再検索では、Holst以外にも次の候補を確認した。English Folk Song Suite（29パート、CC0、`license_conflict=False`、`subset:all_valid=True`）、Handel Water Musicの22パート版（Public Domain、同条件）、Clarke King William's Marchの5パート版（CC0、同条件）が該当する。ただしPDMXの行メタデータだけでは編曲者と原譜の同定が完了しないため、MusicXML本体の取得、内部`rights`要素、編曲版の利用範囲を確認するまで候補扱いに留める。対照的にHolst First Suiteの31パート版は`license_conflict=True`であり、候補から除外する。

PDMXの`metadata`番号（例：English Folk Song Suiteの6103030、Water Musicの3386756）はScoreBaseのスコアIDではない。これらをScoreBaseのMusicXMLエンドポイントへ直接渡しても404になったため、番号だけを根拠に取得済みとは扱わない。取得元のファイル配布または正しいスコアIDが確認できた場合に限り、生成スクリプトへ追加する。

CSVの`mxl`欄にあるCIDを公開IPFSゲートウェイへ直接渡す方法も試したが、対象MXLは取得できなかった。PDMXの1.9GBアーカイブ全体を配布物へ同梱する方法は採らず、個別ファイルを再現可能に取得できる経路が確保されるまで候補として保持する。

モーツァルト《交響曲第41番《ジュピター》》の17パートMusicXMLも収録した。クラリネットは原編成にないため、クラリネット席を直接検出する譜面ではないが、空間ステージで任意の木管席をクラリネットへ差し替えて試奏できる。PDMXのCC0条件と内部権利表示を検査済みである。

## リード作品と課題曲

アルフレッド・リード《アルメニアン・ダンス Part I》《エル・カミーノ・レアル》《春の猟犬》などは、原曲と出版譜の権利が存続しているため、公開カタログへ自動追加しない。出版社または権利者から、MusicXML化・アプリ内表示・伴奏生成・商用配布の範囲を明記した許諾を得た場合だけ追加する。許諾済みの自分のMusicXMLは、アプリの「MusicXMLで演奏する」からローカルで読み込める。

課題曲も同じ基準で扱う。公開初版の作曲者がパブリックドメインでも、後年の編曲・浄書・大会指定版は別の権利になり得るため、原譜・編曲者・利用許諾を分けて記録する。公開収録の優先候補は、ホルスト《第1組曲》《第2組曲》、スーザ《ワシントン・ポスト》《星条旗よ永遠なれ》、フチーク《軍隊の子供たち》《ファンファーレ・クレンゲ》、アルフォード《ホーリー・ルード》《消えた軍隊》である。各作品は利用地域と版の確認が完了するまで「候補」として表示する。

## クラリネット優先ロードマップ

吹奏楽候補とは別に、ユーザー体験の優先順位を次の順に固定する。

1. モーツァルト：クラリネット協奏曲 K.622（第1〜3楽章）
2. モーツァルト：クラリネット五重奏曲 K.581（第1〜4楽章）
3. ブラームス：クラリネットソナタ Op.120-2（第1〜3楽章）
4. ベートーヴェン：交響曲第5番、第6番《田園》第7番
5. チャイコフスキー：交響曲第5番 第1楽章

モーツァルト協奏曲は既に3楽章のMusicXML総譜を収録済み。K.581はMutopiaの公開ソースを基に4楽章・5パートへ変換し、A管クラリネットの移調情報を保持したMusicXMLを収録済み。ブラームスの原典初版はIMSLPでPublic Domain表示を確認できる。[Mozart K.581](https://imslp.org/wiki/Clarinet_Quintet%2C_K.581_%28Mozart%2C_Wolfgang_Amadeus%29) [Brahms Op.120-2](https://imslp.org/wiki/Clarinet_Sonata_No.2%2C_Op.120_No.2_%28Brahms%2C_Johannes%29)

ベートーヴェンの5・6・7番は、クラリネット担当を中心にした優先キューとして扱う。5番第1楽章は、12パート・514小節の検証済みMusicXMLを収録済み。6番はScoreBaseのオーケストラ版（スコアID 60123、CC0表示、10パート・第1楽章）を取得して収録済み。7番は第2楽章の10パート版がPDMXの`no_license_conflict`・`all_valid`を満たす一方、全曲総譜ではないため、まずは全楽章版の確保を優先する。

K.581はIMSLPに初版スコアとパート譜が揃っている。Mutopiaの公開LilyPondソースをMusicXMLへ変換し、小節番号・5パート（クラリネット＋弦4部）・A管移調を確認して収録した。原譜との全音符単位の校正は継続中である。

ブラームス：クラリネットソナタ Op.120-2はIMSLPで原典初版のPublic Domain表示を確認済み。公開MIDIから3楽章をMusicXMLへ変換したローカル検証版は作成済みだが、MIDI由来で譜面情報が欠けるため同梱対象にしていない。公開版を基にした自前浄書と全楽章の校正を次のクラリネット優先作業にする。[IMSLP Op.120-2](https://imslp.org/wiki/Clarinet_Sonata_No.2%2C_Op.120_No.2_%28Brahms%2C_Johannes%29)

浄書の入力資料として、Mutopia ProjectのK.581ページにBreitkopf und Härtel（1883）を基にした5パートのLilyPondソースが公開されている。ページ上でPublic Domain表示と、クラリネット・第1/第2ヴァイオリン・ヴィオラ・チェロの編成を確認した。LilyPondからMusicXMLへ変換し、変換記録とハッシュを保存して配布ファイルへ含めた。[Mutopia K.581](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=337)

ScoreBaseではK.581相当の検索結果（スコアID 238394、クラリネット＋弦4部、22ページ）を確認できるが、MusicXMLエンドポイントが404でPDFのみだった。別のF管版（238397）やA管版（238395）も同様に、実データを取得できるまでカタログへ登録しない。これにより、ページ上の編成表記だけでMusicXML収録済みと誤表示しない。

アルフレッド・リードの作品は、本人が2005年に亡くなっており、現在の死後70年基準では自由収録の対象にしない。[Keiser Productionsの略歴](https://keiserproductions.com/composer3/?tid=6902739C-817A-4490-A515-E6638762F888)にある *Armenian Dances*、*El Camino Real*、*A Festival Prelude*、*The Hounds of Spring* などは、出版社からMusicXML化・表示・伴奏生成・商用配布の許諾を得る候補として別のライセンス待ちリストに置く。

吹奏楽コンクールの課題曲も、作曲者や編曲者が存命であることが多く、演奏できることと譜面データを再配布できることは別。まずは権利者から、アプリ内表示、MusicXMLの同梱、派生編集、生成伴奏、TestFlight配布の範囲を含む許諾を取る。

## ConvoCertoへの取り込み手順

1. 出典ページ、版、国別のPD表示、編曲者、取得日を`public/repertoire/ensemble/sources.json`に登録する。
2. 公開版PDFから自前でMusicXMLを浄書し、原譜との小節数・パート数・調号・拍子・音域を検査する。
3. 自前MusicXMLの変更履歴と校正結果を保存し、ファイル自体はCC0で公開できる状態にする。CC0は権利者が自分の権利を放棄し、商用利用や改変を許可する仕組み。[Creative Commons CC0](https://creativecommons.org/publicdomain/zero/1.0/)
4. Clarimateでクラリネット担当を吹き、休符、入り、テンポ変化、伴奏の音量、楽器配置を実演確認する。
5. 権利が曖昧な作品はアプリに同梱せず、ユーザーが自分のMusicXMLを読み込む機能だけで扱う。
