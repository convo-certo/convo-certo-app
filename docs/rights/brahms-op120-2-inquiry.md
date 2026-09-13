# ブラームス第2番 — 商用MusicXMLライセンス確認依頼（未送信）

確認日: 2026-09-11。宛先: Virtual Sheet Music公式問い合わせ窓口 https://www.virtualsheetmusic.com/EMail.html 。購入・登録・送信・契約は未実施。送信者の氏名・返信先・事業者情報は実際の送信時にユーザーが指定する。架空の会社・利用者数・発売日・予算は提示しない。

## 送信用件名

Licensing inquiry: Brahms Op. 120 No. 2 MusicXML for an interactive accompaniment app

## 送信用本文

Hello Virtual Sheet Music licensing team,

We are developing ConvoCerto, an interactive rehearsal app for web browsers and macOS. We would like to ask whether you offer a separate commercial license for the MusicXML edition of Brahms's Clarinet Sonata No. 2, Op. 120 No. 2, covering all three movements and the B-flat clarinet and piano parts:

https://www.virtualsheetmusic.com/score/SonataBrOp120No2.html

Your product page mentions MusicXML export through Playground for members. We understand that this does not by itself authorize redistribution or commercial integration in another app. We have not purchased, exported, or integrated this edition.

The proposed app would display the score, allow users to choose their part, transpose and annotate it, and synthesize the remaining parts as accompaniment that responds to the player's timing. It uses its own audio engine; we are not requesting your MP3 recordings or accompaniment videos.

Could you clarify:

1. Whether you can supply a complete, editable MusicXML score for all three movements with clarinet and piano voices, and a sample file for compatibility evaluation under appropriate evaluation terms.
2. Whether a license can cover paid web and macOS distribution, local offline copies, score display and printing, transposition, annotations, corrections, and synthesized accompaniment.
3. Whether users may export a personal rehearsal file containing the MusicXML and their settings for transfer between their own devices. If this requires different terms or restrictions, please specify them.
4. The attribution and copyright notices required, territorial limits, term, usage reporting, fees or minimum guarantees, and treatment of existing users' local copies after an agreement ends. An initial Japan launch is being considered; no launch territory or date has been committed.
5. Which source edition your files are based on, which editorial or third-party materials are included, and which relevant rights you are able to license.

At this stage we are seeking information and possible evaluation terms, not committing to a purchase or accepting license terms. If another contact handles these requests, please direct us to them.

Thank you.

## 確認した一次資料

- [商品ページ](https://www.virtualsheetmusic.com/score/SonataBrOp120No2.html): clarinet/viola and piano、3楽章の一覧、Playground経由の会員限定MusicXML書き出しを案内。実際のXMLを取得・校合していないため、音符・声部・反復の正確さは未確認。
- [利用規約](https://www.virtualsheetmusic.com/aboutus/legal.html): CUSTOMER RIGHTS & OBLIGATIONS 8で、取得した音楽の公開・販売・第三者への提供に事前同意を要求している。商品ページの購入価格を商用再配布ライセンス料として扱わない。
- [公式問い合わせ](https://www.virtualsheetmusic.com/EMail.html): 送信先の候補。フォームへの入力・送信は行っていない。

## 別候補の再確認

[Stigjb/lily-Brahms120no2](https://github.com/Stigjb/lily-Brahms120no2/tree/729f3f6166bb86d45529abfafe3a701ed135ffa7) は2026-09-11時点で既定ブランチ先頭が `729f3f6166bb86d45529abfafe3a701ed135ffa7`（2014-04-21）。GitHub API上のLICENSEは0バイト、blob `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`。score.lyはglobalOne/clarinetOne/pianoROne/pianoLOneを参照し、global.lyには第1楽章Allegro amabileの記述がある。全3楽章の完全な譜面として扱わない。MusicXML形式でもない。許諾・完成度・変換後の校合が必要で、販売用ファイルには追加していない。

## 回答後の採用条件

書面で利用範囲が確認できること、全3楽章の両パートが提供されること、移調・声部・音長・繰り返しを元版と校合できることを確認する。サンプルファイルの評価許可と製品への再配布許可を混同しない。契約の承認・費用の支払いは別途ユーザーが判断する。
