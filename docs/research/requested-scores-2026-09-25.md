# Requested full orchestral scores — 2026-09-25

The request is Berlioz *Symphonie fantastique* V, Beethoven *Pastoral* all five movements, and Beethoven Piano Concerto No. 1 Op. 15 I–II. These are personal additions, separate from the two-score starter bundle.

## Clarinet repertoire follow-up

The user subsequently asked for many legal MusicXML sources, favoring links to normal download pages and prioritizing famous clarinet solos, including *Pines of Rome*. The user-facing guide is [repertoire-download-guide.md](../repertoire-download-guide.md). Files are consolidated in `~/Music/ConvoCertoの楽譜`, outside app assets: 37 symphonic movement files, the previous 52 scores compressed without changing XML bytes, and Weber Op.26 / Rimsky-Korsakov Op.34. This is 91 files, not 91 distinct complete works.

The added symphonies are Beethoven 3, 4, 5, 7, 8 and Brahms 1, 3, 4, alongside all five Pastoral movements. Pinned source Git blob hashes were verified. All 37 passed the browser importer/parser numeric checks; three representative movements passed display and audio-node start checks. This does not assert full listening or source-notation accuracy. Beethoven 5/I m268 has an extended oboe cadenza, triggering an overlong-measure warning. Weber's piano mm237–239 and Capriccio's harp mm525/527/529/531 also trigger warnings requiring score review. Sources are unaltered except the symphonies' movement-specific work titles.

The source guide supplies individual links for all 53 Beethoven/Brahms symphonic movements and separate access/rights/scope descriptions for other clarinet repertoire. *Pines of Rome* has a normal MuseScore MusicXML download option which leads to a purchase gate; its file is not acquired or redistributed. Berlioz V and Beethoven Op.15 remain pending as described below. Research records are in `.repertoire-cache/requested-2026-09-25/clarinet-links/` and copied to the personal library. Verification artifacts are in `verification-results/clarinet-library/`.

## Ready: Pastoral I–V

The full orchestral MusicXML files come from [Hauptstimme / OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme), pinned to commit `8f677853c45b74ca0afcd79677e5379c06c82354`, under `data/Beethoven,_Ludwig_van/Symphony_No.6,_Op.68/{movement}/Beethoven_Op.68_{movement}.mxl`. The upstream README identifies score data as CC0 1.0 Universal and annotations as CC-By-SA; its attribution and embedded rights are preserved.

Prepared files are in `verification-results/requested-scores/Pastoral-MusicXML/`. A ZIP is available at `verification-results/requested-scores/Beethoven-Pastoral-MusicXML.zip`. These ignored local artifacts are not bundled with the app. The five compressed scores total 1,147,049 bytes. Only `work-title` has been changed to Japanese movement-specific titles to distinguish the entries in the library. The package includes upstream attribution, source links, original and prepared SHA-256 hashes, and the playback audit.

| Movement | Measures | Parts |
| --- | ---: | ---: |
| I | 512 | 15 |
| II | 139 | 16 |
| III | 266 | 17 |
| IV | 155 | 21 |
| V | 264 | 19 |

All five originals were processed through the actual browser MusicXML importer, parser and playback inspector. No measure overruns, invalid pitch/start values, or nonpositive note durations were found. Movement I was imported through the UI, engraved, and its placement panel opened. This is a structural/import check, not a note-by-note comparison with the printed edition or a full listening audit. The existing engine does not realize grace notes, trill/tremolo symbols, or automatic fermata extensions. The tremolos in IV are especially affected. The inspector's missing-transpose warnings on bassoons and C trumpets are not evidence of score errors.

## Pending: Berlioz V

[A MuseScore full-score candidate by fkzsmdtzk](https://musescore.com/user/38443173/scores/14481028) displays CC0 1.0, 23 parts, 524 measures and 48 pages. Its normal Download → MusicXML flow reaches a login / one-credit prompt. No credit has been used and no file has been acquired, so completeness and app playback are not yet verified. Evidence is saved under `.repertoire-cache/requested-2026-09-25/berlioz-source/fantastique-v-source-update.{json,md}`.

[Neuma's Berlioz catalogue](https://neuma.huma-num.fr/home/corpus/composers%3Aberlioz/) lists the exact fifth movement and links a MusicXML download:

`https://neuma.huma-num.fr/media/corpora/composers/berlioz/Fantastique_Berlioz_5/score.xml`

The file and opus page could not be retrieved because connections to the source server timed out. The public `rigaux/neuma` repository's available archives did not supply this score: `data/composers.zip` is catalogue metadata; `data/sym.zip` contains Haydn symphonies. No usable full fifth-movement MusicXML has been prepared yet.

## Pending: Beethoven Op. 15 I–II

Full-score candidates by coz ilax / MuseScore user `38606`:

- [Movement I](https://musescore.com/user/38606/scores/14556577)
- [Movement II](https://musescore.com/user/38606/scores/14709892)

Movement I's page identifies a CC0 1.0 waiver and 510 measures, 20 parts, 42 pages. The author describes editorial additions; this is not yet validated as an edition for the app. Movement II's separate page also identifies CC0 1.0, with 119 measures, 20 parts and 13 pages. Both licenses were checked in the rendered public score-info tables. The logged-out MusicXML download flow displayed account/credit prompts, but that does not establish that payment is required for a logged-in account. A free account may suffice; current conditions remain unverified. No credit was spent, no paywall was bypassed, and no file was downloaded. An asynchronous question asks whether the user has an existing MuseScore account. After an initial native CUA pipe failure, the Chrome browser API worked: the selected browser was logged out, and an existing-account login form was opened on movement I for user handoff.

Previous PDF/OMR work is documented in `beethoven-op15-acquisition.md`. Its rhythm/part errors remain unresolved and it must not be presented as a completed playable score.

## Rachmaninoff follow-up: Op.18 and Op.27

The user requested Piano Concerto No.2 (all three movements) and Symphony No.2 (all four movements). The download guide now includes a movement-by-movement source table. These are source links, not acquired or app-validated files; the personal library remains at 91 MXL files and the starter bundle is unchanged.

For Op.18, Dave5400's [three-movement set](https://musescore.com/user/1236216/sets/5117579) supplies [I](https://musescore.com/user/1236216/scores/7101510), [II](https://musescore.com/user/1236216/scores/2752871), and [III](https://musescore.com/user/1236216/scores/7219509). I lists 17 parts and 364 measures, with All rights reserved; choosing MusicXML leads to a login / one-credit prompt. III lists 20 parts and 478 measures, also All rights reserved, and its MusicXML option leads to a purchase dialog. II is region-restricted in the current connection environment, as is [the alternative by user 14481651](https://musescore.com/user/14481651/scores/4355726); individual licenses and format availability could not be verified on those blocked pages. No purchase, credit spending or location workaround was attempted.

I has public comments alleging a piano chord error in m6; this has not been checked against the source score. The editor also describes rendering ornaments/cadenzas with ordinary notes, extended measures and hidden tempo changes, including in II. If acquired, those passages require app synchronization checks. A public Git candidate proved to be piano-only (375 measures) and was not substituted for the requested orchestral score. Full PDMX metadata review found only reductions/excerpts, not the original orchestral Op.18.

[Mazmazika's Op.18 page](https://www.mazmazika.com/note-sheets-editor/s-rachmaninoff/rachmaninoff-concerto-no-2) also offers MusicXML export. After the actual browser editor loaded, its public interface showed one Piano part, 56 bars, 2:01, and the arranger credit Gabriel C. Lanzi. This is a piano arrangement/excerpt, not the requested complete orchestral work, and was excluded without exporting it.

For Op.27, rtuhsnsgell's [I](https://musescore.com/user/41737026/scores/14804749), [II](https://musescore.com/user/41737026/scores/8277641), [III](https://musescore.com/user/41737026/scores/15046198), and [IV](https://musescore.com/user/41737026/scores/16152508) list 28/24/24/24 parts and 570/532/171/574 measures respectively. Every page states All rights reserved; the official MusicXML option reaches a login / one-credit prompt. Files are not acquired. Another CC0 candidate is explicitly described as work in progress and was not represented as a complete edition. ScoreBase's relevant full-score entry exposes PDF, not MusicXML.

Evidence is under `.repertoire-cache/requested-2026-09-25/rachmaninoff-concerto2/`, `rachmaninoff-symphony2/`, and `rachmaninoff-rights/`. The rights memo distinguishes the historical public-domain compositions from modern arrangements, creative additions and the specific download/redistribution terms. Public redistribution of these particular All-rights-reserved files is not approved by this research.

## Placement fix delivered alongside this work

The score's accompaniment display now has a visible 「楽器の配置」 button which opens and scrolls to the existing spatial panel. Its instance and edited seats are preserved. Eight placement/studio browser checks passed, including dragging, position changes, save/reload, and reopening a saved score. Type checking, web/native builds, and the native WKWebView smoke test passed. The native output is `build/native/ConvoCerto.app`.
