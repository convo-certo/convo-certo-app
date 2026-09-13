# ConvoCerto

Interactive Music Performance Agent — AI accompaniment with dynamic Lead/Follow switching.

Built as a browser-based web application (SPA) using React Router v7, Tone.js, and OpenSheetMusicDisplay.

## Play Mozart and Brahms

Open `/perform` (also available at `/step4`) for the concert rehearsal screen:

- Mozart's Clarinet Concerto K.622: all three movements, orchestral accompaniment.
- Brahms's Clarinet Sonata No.2 Op.120-2: all three movements, piano accompaniment.
- The solo clarinet is always excluded from the accompaniment audio.
- Microphone pitch/onset detection and MIDI/ClariMate input feed the score follower.
- Choose A or B-flat clarinet; transpose the whole accompaniment to retain the same written fingering, or choose the original key for an already-transposed part.
- Adjust tempo, tuning (A=430–450 Hz), volume and individual accompaniment parts.
- Seek to a playback measure, loop a passage, and set lead/follow or cue/timed waits at any playback measure.
- Release waits with a matching played note, a camera cue, or the resume button.
- Rehearsal instructions apply to the engine, including absolute and relative tempo changes. Plans persist per movement locally and can be exported/imported.

```bash
npm install
npm run repertoire:prepare
npm run dev
```

Preparation uses `uv` and downloads the performance MIDI editions and seven
FluidR3 instrument sample banks. The public-domain Mutopia orchestral-only
Mozart fallback and sampled instruments are included in the repository.
Local performance editions with solo parts are not committed because the hosting
sites do not state clear redistribution licenses. See
[repertoire sources](public/repertoire/SOURCES.md) for provenance and distribution scope.
A fresh checkout needs the preparation command for all six solo-following editions.

Use headphones so the microphone hears your clarinet rather than the accompaniment.
Microphone analysis runs locally in the browser. Voice commands use the browser's
separate speech recognition service and start only when requested.

The new concert engine (`concert-engine.ts`) uses a bounded pitch/onset matcher
(`performance-follower.ts`) and a short audio scheduling horizon. It is a
rule-based rehearsal companion, not a trained orchestral expression model.
Pitch-following supports one monophonic solo line; microphone performance with
real clarinets, room acoustics, vibrato and ornaments still needs musician testing.
The instrument audio is sample-based synthesis, not a live-orchestra recording.

Playback measure numbers come from the source MIDI timeline and can differ from
printed editions at fermatas and repeats. Uploaded uncompressed MusicXML (.musicxml/.xml) now replaces the performance data:
its notes, parts, transposition, meter, tempo changes and rehearsal directives drive
accompaniment and microphone/MIDI following. Choose the performer part to exclude
it from audio; the displayed solo score follows playback, including basic repeats.
Lead/Follow and wait edits apply immediately and export back into the full MusicXML.
Piano backup/forward voices, chords, ties, pickups and basic articulation are parsed.
Compressed MXL, alternate endings, D.C./D.S., ornaments and continuous hairpins are
not yet fully supported. The six built-in movement buttons still use MIDI-derived
data; import your full MusicXML score to use the XML performance path.

## Expressive rehearsal

In the concert rehearsal panel, write or say one intention at a time:

- “9〜12小節は歌うように”: phrase swell, connected notes and a little space at the end.
- “16小節は語尾を収めて”: gradual softening and slowing within that measure.
- “ここは柔らかく寄り添って”: quieter accompaniment with greater responsiveness.
- “次の入りは待って”: wait at the start of the next playback measure containing solo notes.

“ここ” uses the current measure during playback and the editor's selected measure
while stopped. A range shapes the whole range; otherwise the instruction covers
one measure. The interface shows the interpretation, strength and end measure;
overlapping ranges give priority to the later starting instruction. Rehearsal JSON
and exported MusicXML retain these intentions. Internal expression metadata is
removed from the displayed score.

The engine blends the score's phrase plan with confident performer matches.
Lead/Follow strength controls that blend, tempo and phase corrections are smoothed,
relative input velocity shapes subsequent accompaniment attacks, and note releases
influence subsequent note lengths. Input level is normalized within each take,
and seek/stop clear the previous take's expression. Explicit waits still require a
cue, matching note, or configured timeout.

These are transparent phrase presets and Japanese pattern rules, not unrestricted
language understanding or a trained human performance model. Negated and conflicting
expression commands are rejected. Breath intention is not automatically inferred
from silence; sustained-note dynamics and already scheduled note tails are not
continuously resynthesized. Real-instrument ensemble listening remains necessary
to evaluate musical naturalness.

## Verification

`npm test`, `npm run typecheck`, `npm run build`, and `npm run e2e` cover the core
engines and browser flows. Concert tests load all six movements, verify that
sample voices start, exercise live browser audio input using a synthetic stream,
and check rehearsal instructions, persistence and the phone layout. Run repertoire
preparation before the concert browser tests.

## Background

ConvoCerto extends the ideas of [ACCompanion](https://github.com/CPJKU/accompanion) (Cancino-Chacón et al., JKU Linz) — an automatic accompaniment system that tracks a performer's MIDI input and adapts tempo/dynamics in real time.

ACCompanion's core contribution is an HMM-based score follower that matches incoming MIDI notes against expected positions in the score. However, feedback from musicians indicated that it felt like "sight-reading with a beginner accompanist" — the system only _follows_ and never takes the initiative.

ConvoCerto addresses this by adding:

1. **Dynamic Lead/Follow switching** — the system can _lead_ (drive tempo) or _follow_ (adapt to the performer), controlled per measure via MusicXML annotations.
2. **Wait/Listen mechanism** — at phrase beginnings or after rests, the system pauses and waits for a visual or audio cue before resuming.
3. **Pose-based cue detection** — MediaPipe Pose Landmarker detects breathing, nods, and preparatory gestures from a webcam to trigger timing cues.

[Metronaut](https://metronautapp.com/) (Antescofo) is also referenced as a commercial counterpart, but its fixed-tempo playback limits the performer's expressive freedom.

## Architecture

```
Performer plays MIDI
    │
    ├─ MidiManager (Web MIDI API)
    │       │
    │       ▼
    ├─ ScoreFollower (HMM-based position tracking)
    │       │
    │       ▼
    ├─ AccompanimentEngine (Lead/Follow blending, scheduling)
    │       │
    │       ▼
    └─ Tone.js PolySynth (audio output)

Webcam ──► PoseAnalyzer (MediaPipe) ──► MotionCue events
Voice  ──► RehearsalNLP (pattern matching) ──► annotation updates
Score  ──► MusicXMLParser ──► OpenSheetMusicDisplay (rendering)
```

### Score Follower — current implementation

The score follower (`app/lib/score-follower.ts`) uses a **rule-based Bayesian filter**, not a trained machine learning model. It is inspired by the HMM approach in ACCompanion but simplified for browser execution:

- **5 parallel tempo hypotheses** spanning ±30% of the base tempo
- Each incoming MIDI `noteon` triggers:
  1. **Observation** — pitch matching against nearby score positions (exact match: 0.8, ±2 semitones: 0.15, miss: 0.05)
  2. **Transition** — position advancement based on elapsed time and each hypothesis's tempo
  3. **Bayesian update** — multiply state probabilities by observation likelihood
  4. **Normalisation** — scale to sum to 1
  5. **MAP estimation** — pick the highest-probability state as current position and tempo
- **Lead/Follow differentiation**: in Follow mode, `tempoAdaptRate = 0.3` (tracks performer closely); in Lead mode, `tempoAdaptRate = 0.1` (stays near base tempo)

All probability values are hard-coded constants — **no parameters are learned from data**. This keeps the system lightweight and predictable, but limits its ability to handle complex expression.

### What is NOT yet implemented

The following features from the ACCompanion paper and the project proposal are not yet present:

| Feature | ACCompanion | ConvoCerto status |
|---------|-------------|-------------------|
| Learned expression model (Basis Mixer) | Yes | Not implemented |
| Dynamics curve from trained data | Yes | Not implemented — velocity is passed through as-is |
| Articulation analysis (legato, staccato) | Yes | Not implemented |
| Continuous-time online DTW | Yes | Simplified to discrete note-step HMM |
| Multi-voice score alignment | Yes | Single solo part only |
| Audio input (microphone) | Partial | Implemented in the concert screen; monophonic pitch/onset detection |

## Roadmap

### Phase 1 — Learned expression models

Replace hard-coded probability constants with parameters learned from performance data:

- Train observation/transition models from aligned MIDI performance recordings
- Support dynamics curves (velocity shaping over time) from reference recordings
- Import articulation markings from MusicXML (`<articulations>`, `<slur>`, `<staccato>`) and reflect them in accompaniment output

### Phase 2 — MusicXML annotation editing

The concert panel edits roles, waits and phrase intentions and exports them to
MusicXML. Direct click-to-edit overlays on rendered score measures remain.

### Phase 3 — Audio input support

Monophonic microphone input and onset detection are connected to the concert
follower. Remaining work includes measured latency calibration, robustness tests
with real clarinets and richer expression models.

## 4-Step Learning Progression

| Step | Route | Description |
|------|-------|-------------|
| 1 | `/step1` | Score display + fixed-tempo playback |
| 2 | `/step2` | Karaoke mode — add MIDI input, accompaniment at fixed tempo |
| 3 | `/step3` | Adaptive accompaniment — HMM score following, tempo adapts to performer |
| 4 | `/step4` | The integrated concert rehearsal screen |
| Full | `/perform` | Mozart/Brahms concert rehearsal with microphone/MIDI following and sampled accompaniment |

## Step 1 practice controls

- Seek by clicking the progress bar, or focus it and use arrow keys, Home, and End. Playback starts from the selected position.
- Use Space to start/stop, Escape to stop, and left/right arrows to move between measures when no control is focused.
- Select zero, one, or two bars of count-in and toggle the metronome independently.
- Set A at the current measure's start and B at its end to repeat a passage. Both endpoints are required; × clears the loop.
- Loading another score resets the playback position, muted parts, and loop.

The Playwright server uses port 5187 with strict port binding to avoid connecting to an unrelated development server. Run `npx playwright test e2e/practice.spec.ts` for the practice-control regression scenario.

## Sample Scores

| Score | Licence | Included in repo |
|-------|---------|------------------|
| **Sample Duet** (Clarinet + Piano) | CC0 1.0 (Public Domain) | Yes |
| Mozart K.622 Adagio | Derived from Mutopia Project (CC BY 3.0) — not redistributed | No (gitignored) |
| Mozart K.581 Trio | MakeMusic, Inc. sample — not redistributed | No (gitignored) |

The legacy samples above live in `public/scores/`. Verified CC0 MusicXML editions of Mozart K.622 (all three movements) and Beethoven Op.73 (movement II, combined clarinet part) are included in `public/repertoire/ensemble/`, with per-file metadata and hashes in `sources.json`.

Scores use standard MusicXML with ConvoCerto annotations (Lead/Follow/Wait/Listen via rehearsal marks).

## Development

```bash
npm install
npm run dev         # development server on :5173
npm run build       # production build (SPA, static output in build/client/)
npm run typecheck   # type checking
npm test            # unit tests (Vitest)
npm run e2e         # end-to-end tests (Playwright)
```

## Deployment

The app builds as a static SPA. Deploy `build/client/` to any static hosting (Cloudflare Pages, Netlify, GitHub Pages, etc.). Ensure all routes fall back to `index.html` for client-side routing.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React Router v7 | SPA framework |
| Tone.js | Audio synthesis |
| OpenSheetMusicDisplay | MusicXML rendering |
| Web MIDI API | Instrument input |
| MediaPipe Pose Landmarker | Gesture detection |
| Vitest + Playwright | Testing |
| Tailwind CSS + MUI | Styling |

## References

- Cancino-Chacón, C. E. et al. — [ACCompanion: Auto-Accompaniment](https://cpjku.github.io/accompanion/)
- [Metronaut](https://metronautapp.com/) by Antescofo
- [YAMAHA AI Ensemble](https://www.yamaha.com/ja/tech-design/research/technologies/muens/)


## MusicXML concert practice

手元でのWeb・Swift・ClariMate確認は [手元での確認手順](docs/local-verification.md) を参照。

Open `/perform`. The MusicXML cards load full scores and render the selected part. Upload `.musicxml`, `.xml`, or `.mxl` to use another score. Save scores and rehearsal directions in the local browser library.

- Choose the part or encoded voice/staff you play; the remaining ensemble plays sampled instruments.
- Accompany with microphone/MIDI following, listen to all parts, or advance silently only after correct pitches.
- Use count-in, metronome, tempo, transposition, tuning, seek, passage loops, part mute, score zoom and browser print/PDF.
- Set phrase expression, waits and leadership by measure. Export rehearsal directions back to MusicXML. Display transposition does not rewrite the exported source XML.
- Save response settings, record input-event takes and compare settings on identical input. Extract expression curves from your own reliably matched takes. This does not record audio or reproduce a named artist.

See [feature coverage](docs/musicxml-practice.md) and [ensemble model and limits](docs/ensemble-vision.md).

`npm run ensemble:prepare` reproducibly checks source metadata and prepares bundled CC0 scores. Production builds explicitly exclude `repertoire/local`, including privately obtained editions whose distribution rights are unverified. Those local MIDI editions are optional and are not a public Brahms score catalogue.

追加収録・ClariMate設定・クリック再生については [操作と収録状況](docs/collection-and-midi.md) を参照。現在はMusicXML 30譜、管弦楽編成の特集5譜、26種類の音源を収録。個別XMLと出典付きZIPを演奏画面からダウンロードできる。
