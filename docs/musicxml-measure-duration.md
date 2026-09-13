# 拍子を超える小節の注意表示

PDF認識から作ったベートーヴェンOp.15第2楽章の試作MusicXMLに、4/4なのに4.5拍ある小節が見つかった。持ち込みMusicXMLでも同種の問題を見つけられるよう、「この楽譜の再生上の注意」にパート・小節の場所を出す。

音符とforwardで位置を進め、backupで戻す。chordは前の音と同じ開始位置、graceは時間を消費しないものとして小節内の最大終了位置を計算する。divisionsと拍子をパート内で継承し、複合拍子は四分音符単位へ換算する。実際の長さが拍子を超えた小節だけを案内し、読み込んだ音符・再生データを自動修正しない。

短い小節・弱起はこの検査では警告しない。拍子不明、譜表別の拍子、自由拍子、implicit/non-controlling指定、途中の拍子変更や解釈できない長さは検査対象から外す。これらが正しく再生される保証ではなく、判定できない条件を誤りと断定しないための扱い。音抜け・誤音・誤移調は別途校合する。

仕様根拠: [MusicXML backup](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/backup/)、[chord](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/chord/)、[time](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/time/)。

一括検証は `verification-results/2026-09-10T22-33-57.364Z/report.json` の8工程が通過。最初のネイティブ試験は旧譜の注意表示を読み込み途中に拾い失敗したため、新しい譜面のパート・小節表示を待つように試験を修正した。失敗記録は `verification-results/2026-09-10T22-32-08.732Z/` に保持している。
