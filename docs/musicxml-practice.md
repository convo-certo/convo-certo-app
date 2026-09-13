# MusicXML practice coverage

2026-09-08。MetronautのWeb練習機能を比較対象にする。完全な機能同等性を達成したという意味ではない。

| 操作 | ConvoCertoの実装 |
| --- | --- |
| XML/MXL持ち込み | パート譜・総譜を取り込み、伴奏と入力照合の音符に使用 |
| 譜面表示 | 選択パート、演奏位置カーソル、拡大、移調表示、印刷/PDF |
| 練習の進め方 | 固定テンポ、入力への追従、全パート試聴、正しい音まで無音で待機 |
| 基本コントロール | テンポ、移調、基準ピッチ、カウントイン、メトロノーム、小節移動、区間ループ、パート消音 |
| 記譜の解釈 | 拍子、テンポ、移調楽器、和音、タイ、強弱・アーティキュレーションの一部、反復・括弧・D.C./D.S./Coda/Fine |
| リハーサル指示 | 小節の表情曲線、待機、主導者、Lead/Follow。MusicXMLへ保存可能 |
| ライブラリ | ブラウザ内にXMLと指示を保存・曲名検索・削除 |
| 共奏チューニング | 応答パラメータ保存、同じ音符入力で設定比較、自分のテイクから表現曲線を抽出 |
| 演奏フィードバック | 直近入力の照合状態、推定位置、確信度。総合採点ではない |

## 利用できる曲

- Mozart K.622：全3楽章のCC0表示があるMusicXML総譜。出典とメタデータは `public/repertoire/ensemble/sources.json`。
- Beethoven Op.73：第2楽章の同様のMusicXML総譜。クラリネット共通譜であり、第2奏者専用としては未検証。
- Brahms Op.120-2：ローカル環境には既存MIDIの3楽章がある。再配布可能な全楽章MusicXMLは未確保。持ち込みXMLで演奏可能。権利表示に矛盾のあるPDMX候補は収録しない。

## 完成を主張しない範囲

Metronautの手書き注釈、音声・動画録音、クラウド同期、広範な楽譜カタログ、包括的なAI採点までは実装していない。MusicXMLの全要素・全版での互換性も保証しない。特に装飾音、特殊奏法、複雑な独自ナビゲーションは個別確認が必要。

追従はピッチ照合と平滑化による推定。クラリネットの実演での自然さは未検証。マイクにはヘッドホンを推奨し、伴奏の回り込みを防ぐ。自分のテイクから抽出した表現と、実在する演奏家の解析済みモデルを区別する。Fuchsの録音は解析・学習・再配布していない。

## 比較元

- [Metronaut公式・プラットフォーム別機能表](https://community.metronautapp.com/hc/en-us/articles/24714903516562-Metronaut-Features-Available-on-iOS-Android-Web-Full-Comparison)
- [Metronaut公式・練習モードの概要](https://community.metronautapp.com/hc/en-us/articles/360002662792-How-Metronaut-Helps-You-Practice-Sheet-Music-with-AI-An-Overview)
