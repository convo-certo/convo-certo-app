# 吹奏楽オープン譜面候補

この一覧は、ConvoCertoに収録する吹奏楽作品を選ぶための調査台帳。`PD候補`は原曲と確認した版が公開されている候補であり、各国での商用配布を自動的に保証するものではない。MusicXML化するときは、指定された公開版を参照して新規に浄書し、音源・PDF・MusicXMLの権利を別々に記録する。

## 収録候補10曲

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

PDMXの検索台帳では、**Holst: Second Suite for Military Band Op.28 No.2**（34パート、451小節、CC0表示、`license_conflict=False`、有効ファイル）が候補として見つかっている。ただし現行のPDMX配布は全体で約1.9GBのMXLアーカイブで、元のMusicScore投稿と内部権利の不一致も報告されているため、個別MXLを取得して内部権利・編成・欠落箇所を確認するまで収録対象にはしない。[PDMX Zenodo](https://zenodo.org/records/15571083)

ラデツキー行進曲は、PDMXの`cc-zero`・`license_conflict=False`・`all_valid=True`を満たす8パート版を取得し、MusicXMLの権利要素が空であることを確認して収録した。38小節の短いアレンジなので、原曲全曲版ではなく「木管・金管アレンジ」として表示する。

追加調査では、Sousa「The Washington Post」とHalvorsen「Entry March of the Boyars」の候補を検索した。前者はアルトサックスまたはピアノ譜、後者はMusicXMLを取得できない検索結果しか見つからなかったため、吹奏楽譜としては登録していない。原曲の公開性だけでなく、実際に取得できる編成済みMusicXMLまで揃うことを収録条件にする。

## リード作品と課題曲

## クラリネット優先ロードマップ

吹奏楽候補とは別に、ユーザー体験の優先順位を次の順に固定する。

1. モーツァルト：クラリネット協奏曲 K.622（第1〜3楽章）
2. モーツァルト：クラリネット五重奏曲 K.581（第1〜4楽章）
3. ブラームス：クラリネットソナタ Op.120-2（第1〜3楽章）
4. ベートーヴェン：交響曲第5番、第6番《田園》第7番
5. チャイコフスキー：交響曲第5番 第1楽章

モーツァルト協奏曲は既に3楽章のMusicXML総譜を収録済み。K.581は公開スコアを確認済みだが、収録用の検証済みMusicXMLは未確保。ブラームスの原典初版はIMSLPでPublic Domain表示を確認できる。[Mozart K.581](https://imslp.org/wiki/Clarinet_Quintet%2C_K.581_%28Mozart%2C_Wolfgang_Amadeus%29) [Brahms Op.120-2](https://imslp.org/wiki/Clarinet_Sonata_No.2%2C_Op.120_No.2_%28Brahms%2C_Johannes%29)

ベートーヴェンの5・6・7番は、クラリネット担当を中心にした優先キューとして扱う。5番第1楽章は、12パート・514小節の検証済みMusicXMLを収録済み。6番は公開ページ上でオーケストラ版とCC0表示を確認できる候補があるが、現時点でMusicXMLの配布エンドポイントが404になるため同梱しない。7番は第2楽章の10パート版がPDMXの`no_license_conflict`・`all_valid`を満たす一方、全曲総譜ではないため、まずは全楽章版の確保を優先する。

K.581はIMSLPに初版スコアとパート譜が揃っている。公開PDFをそのままMusicXMLとして再配布せず、自前浄書後に小節数・5パート（クラリネット＋弦4部）・調号・アーティキュレーションを校正してから収録する。

ブラームス：クラリネットソナタ Op.120-2はIMSLPで原典初版のPublic Domain表示を確認済み。ただし、現時点で取得できるPDMXの該当MusicXMLは第2楽章の別版でライセンス競合があるため、同梱対象にしていない。K.581と同じく、公開版を基にした自前浄書と全楽章の校正を次のクラリネット優先作業にする。[IMSLP Op.120-2](https://imslp.org/wiki/Clarinet_Sonata_No.2%2C_Op.120_No.2_%28Brahms%2C_Johannes%29)

浄書の入力資料として、Mutopia ProjectのK.581ページにBreitkopf und Härtel（1883）を基にした5パートのLilyPondソースが公開されている。ページ上でPublic Domain表示と、クラリネット・第1/第2ヴァイオリン・ヴィオラ・チェロの編成を確認した。LilyPondからMusicXMLへ変換した後、原譜との校正を完了するまで配布ファイルには含めない。[Mutopia K.581](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=337)

ScoreBaseではK.581相当の検索結果（スコアID 238394、クラリネット＋弦4部、22ページ）を確認できるが、MusicXMLエンドポイントが404でPDFのみだった。別のF管版（238397）やA管版（238395）も同様に、実データを取得できるまでカタログへ登録しない。これにより、ページ上の編成表記だけでMusicXML収録済みと誤表示しない。

アルフレッド・リードの作品は、本人が2005年に亡くなっており、現在の死後70年基準では自由収録の対象にしない。[Keiser Productionsの略歴](https://keiserproductions.com/composer3/?tid=6902739C-817A-4490-A515-E6638762F888)にある *Armenian Dances*、*El Camino Real*、*A Festival Prelude*、*The Hounds of Spring* などは、出版社からMusicXML化・表示・伴奏生成・商用配布の許諾を得る候補として別のライセンス待ちリストに置く。

吹奏楽コンクールの課題曲も、作曲者や編曲者が存命であることが多く、演奏できることと譜面データを再配布できることは別。まずは権利者から、アプリ内表示、MusicXMLの同梱、派生編集、生成伴奏、TestFlight配布の範囲を含む許諾を取る。

## ConvoCertoへの取り込み手順

1. 出典ページ、版、国別のPD表示、編曲者、取得日を`public/repertoire/ensemble/sources.json`に登録する。
2. 公開版PDFから自前でMusicXMLを浄書し、原譜との小節数・パート数・調号・拍子・音域を検査する。
3. 自前MusicXMLの変更履歴と校正結果を保存し、ファイル自体はCC0で公開できる状態にする。CC0は権利者が自分の権利を放棄し、商用利用や改変を許可する仕組み。[Creative Commons CC0](https://creativecommons.org/publicdomain/zero/1.0/)
4. Clarimateでクラリネット担当を吹き、休符、入り、テンポ変化、伴奏の音量、楽器配置を実演確認する。
5. 権利が曖昧な作品はアプリに同梱せず、ユーザーが自分のMusicXMLを読み込む機能だけで扱う。
