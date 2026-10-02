# Starter scores and additional library

`npm run build` generates a compressed score library, builds the SPA, and runs `scripts/prepare-starter-bundle.mjs` against `build/client`. `npm run dev` generates the same library before starting Vite.

The first screen keeps two starter cards:

- `scores/sample-duet.musicxml`: the short ConvoCerto demo duet.
- `repertoire/ensemble/mozart-k622-2.musicxml`: Mozart's Clarinet Concerto, II. Adagio.

The duet offers twelve instrument editions: flute, oboe, B♭ clarinet, alto and tenor saxophones, B♭ trumpet, F horn, trombone, violin, viola, cello, and a right-hand piano melody. `app/lib/starter-duet.ts` creates the selected edition on the device from the same CC0 duet. It changes the melody's written pitches, key, register, clef, MusicXML transposition and playback instrument; the piano accompaniment and source credit stay intact. These are editions of one duet, not twelve additional compositions. The default “Listen and try the controls” option retains the original score.

## Browse scores

Below the starter cards, Browse scores offers **49 additional score editions**: 20 orchestral, 15 wind/brass, eight chamber and six solo editions. They include individual movements, excerpts and arrangements, so this is not a count of distinct compositions. The list starts with a mix of brass, flute, cello, violin, piano and chamber repertoire. Instrument filters use original part names plus the score's MIDI instrument information, and do not classify unknown instruments as piano. Solo scores are marked as having no separate accompaniment part; the card explains listening and practising a voice where the notation provides separate voices.

The catalogue request happens only when the disclosure is opened. An individual MXL is fetched only when selected. A Mac installation includes the compressed files for local use. The additional payload is 5,923,187 bytes including source metadata, of which 5,678,218 bytes are MXL files. The complete static client is 17,188,127 bytes after pruning, including 34 instrument banks and application assets. The build report is authoritative if later changes alter these figures.

`prepare-score-library.mjs` takes the existing 52-entry source catalogue and excludes:

- `mozart-k622-2`, already offered as a starter.
- `bach-orchestral-suite-1`, whose catalogue title says BWV 1066 while its contents identify a BWV 207 march.
- `mozart-k581-clarinet-quintet`, whose converted parts have inconsistent measure counts and need musical review.

Known excerpt titles identify the 1812 finale, Bach suite No. 2's Sarabande, the March of the Three Kings brass arrangements and the Water Music selection. Musical proofreading against original editions is not complete. Existing playback limitation notices still apply.

Each standard MXL contains the original XML bytes. The generator verifies the source SHA-256, source licence metadata, part information and archive contents. The app verifies downloaded size and SHA-256 before opening it. The practice copy uses the catalogue title and fills blank part names from instrument metadata; notation and original credits remain intact. These display changes are retained when the user saves or exports their practice copy, while the bundled source archive stays unchanged.

Complete source records are in `repertoire/library/sources.json`; the catalogue holds archive and original XML hashes; `repertoire/library/README.md` retains dataset attribution. The starter's complete source record, demo CC0 notice, all 34 instrument banks, software notices and font licences remain included. `public/repertoire/library` is generated and ignored by Git. Docker regenerates it from the source collection.

The uncompressed extra scores, full MusicXML ZIP, candidate reports, MIDI fallback JSONs and local editions are removed from the distribution. The source collection is untouched. `build/starter-bundle-report.json` records payload sizes, the two starter paths and the additional library's count and bytes. Native builds verify that report and every library archive before copying the client tree.

## Verification

```sh
npm test -- scripts/prepare-score-library.test.js scripts/prepare-starter-bundle.test.js app/lib/score-catalog.test.ts app/lib/starter-duet.test.ts
npx playwright test e2e/score-catalog.spec.ts e2e/starter-instruments.spec.ts e2e/repertoire-availability.spec.ts
```

Packaging fixtures cover retained attribution, byte-exact archive extraction, excluded payloads, deterministic generation, validation before deletion, source-directory protection, linked input trees, and file size limits. UI checks cover deferred requests, instrument search, actual MXL notation and audio, unnamed source parts, download retries and narrow screens. These checks do not establish acoustic following quality or musical accuracy of every edition.
