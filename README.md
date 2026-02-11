# ConvoCerto

Interactive Music Performance Agent — AI accompaniment with dynamic Lead/Follow switching.

Built as a browser-based web application (SPA) using React Router v7, Tone.js, and OpenSheetMusicDisplay.

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
| Audio input (microphone) | Partial | Not implemented — MIDI input only |

## Roadmap

### Phase 1 — Learned expression models

Replace hard-coded probability constants with parameters learned from performance data:

- Train observation/transition models from aligned MIDI performance recordings
- Support dynamics curves (velocity shaping over time) from reference recordings
- Import articulation markings from MusicXML (`<articulations>`, `<slur>`, `<staccato>`) and reflect them in accompaniment output

### Phase 2 — MusicXML annotation editing

Allow performers to edit Lead/Follow roles and Wait/Listen directives directly in the UI:

- Visual editor overlaid on the score display
- Click a measure to toggle Lead/Follow mode and strength
- Add/remove Wait/Listen points
- Export modified annotations back to MusicXML

### Phase 3 — Audio input support

- Microphone-based pitch detection (replacing MIDI-only input)
- Onset detection for instruments without MIDI output
- Integration with the existing score follower

## 4-Step Learning Progression

| Step | Route | Description |
|------|-------|-------------|
| 1 | `/step1` | Score display + fixed-tempo playback |
| 2 | `/step2` | Karaoke mode — add MIDI input, accompaniment at fixed tempo |
| 3 | `/step3` | Adaptive accompaniment — HMM score following, tempo adapts to performer |
| 4 | `/step4` | Full rehearsal — voice commands, pose detection, audio reference |
| Full | `/perform` | All features integrated |

## Sample Scores

| Score | Licence | Included in repo |
|-------|---------|------------------|
| **Sample Duet** (Clarinet + Piano) | CC0 1.0 (Public Domain) | Yes |
| Mozart K.622 Adagio | Derived from Mutopia Project (CC BY 3.0) — not redistributed | No (gitignored) |
| Mozart K.581 Trio | MakeMusic, Inc. sample — not redistributed | No (gitignored) |

Only `sample-duet.musicxml` is included in the repository. The Mozart scores must be obtained separately and placed in `public/scores/`.

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
