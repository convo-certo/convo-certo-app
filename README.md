# ConvoCerto

Bring your own MusicXML, choose your part, and practise with the ensemble.

ConvoCerto runs in a browser or a native Mac app. The main practice workflow supports English and Japanese; rehearsal directions stay on the score and can be carried into the next practice.

## Practice with your own MusicXML

Open `/perform` (also available at `/step4`). Bring a full score as `.musicxml`, `.xml`, or compressed `.mxl`, choose your part, and play with the remaining parts as accompaniment. PDFs and photos are not supported; a melody-only score does not generate a newly composed accompaniment.

The standard app starts with two examples: an eight-bar clarinet/piano duet and Mozart's Clarinet Concerto K.622, II. Adagio. The score page has six main controls: play, listen, tempo, passage, expression, and a menu. Instrument/input settings and experimental performance models live behind their own controls.

- The library includes a two-bar piano phrase for hearing expression changes before importing a score; it reuses the bundled duet.
- Resting measures remain readable without added count numbers. Playback highlights the current resting measure.
- Choose a written key such as C dur → D dur above the score to rewrite pitches, key signatures and chord roots across all parts. The MusicXML export retains the change and score notes. Major/minor mode is preserved; missing mode defaults to major. Unusual notation and key signatures beyond seven accidentals are rejected with an explanation.
- Hear an expression change as A/B audio before leaving its instruction on the score. Personal text notes remain notes; they are not interpreted as unspecified audio transformations.
- Practise a passage, adjust the tempo and count-in, and click the notation to restart at a musical position.
- Confirm your part before starting. You can practise at a fixed tempo without connecting an input, or use a microphone or MIDI instrument for following. A score needs sounding accompaniment parts for ensemble playback; a solo-only score can still be heard with Listen.
- Recent playing time, practice days, the latest score annotations and settings are saved on this device. Resume from the recent-practice cards. Audition playback and count-in are excluded from practice duration.
- Repeatedly saving a practice updates the same library item. Recent practice also keeps score notes and settings changed after stopping; deleting a history entry leaves explicitly saved library scores intact.
- The menu saves a portable practice file or an annotated MusicXML file. The local library and recent history are independent of any online account.
- The main practice workflow supports Japanese and English. Language selection preserves the current score and audio session. Use one Tab entry and arrow keys to move between bars, then Enter to seek or edit. Spoken rehearsal commands remain Japanese.

The distribution keeps 34 instrument sample banks, two starter scores, and 49 additional compressed score editions in Browse scores. The additional catalogue and individual scores are fetched only when opened. The uncompressed research scores, full score ZIP, MIDI fallbacks and local editions are excluded. Source assets remain in the repository for research and tests. See [starter packaging and measured size](docs/starter-bundle.md), [practice UX](docs/musicxml-practice.md), and [ensemble model and limits](docs/ensemble-vision.md).

```bash
npm install
npm run dev
```

No repertoire download is needed for the starter scores. Use headphones for microphone following. Microphone analysis runs locally; optional voice commands use the browser's separate speech-recognition service.

The concert engine uses bounded pitch/onset matching and a short audio scheduling horizon. It is a rule-based rehearsal companion, not a trained orchestral expression model. Microphone following supports one monophonic solo line; MIDI supports note input from electronic instruments. The audio is sample-based synthesis. Live instrument, room-acoustics and ensemble listening tests are still necessary.

Imported MusicXML supplies pitches, parts, transposition, meter, tempo changes, repeats and supported rehearsal directives. The selected performer part is excluded from accompaniment. The notation follows playback, and unsupported or ambiguous notation is reported when the score opens. Repeated passages use expanded playback order; the printed score retains its original measure numbers.

## Expressive rehearsal

The normal score workflow selects expression by listening to A/B audio. Optional Japanese rehearsal commands remain in Settings; write or say one intention at a time:

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

## Starter scores and personal repertoire

| Score | Licence | Production distribution |
| --- | --- | --- |
| Sample Duet (Clarinet + Piano, eight bars) | CC0 1.0 | Included |
| Mozart K.622, II. Adagio (full score) | CC0 1.0; dataset attribution retained | Included |

The Mozart source and byte hash are in `public/repertoire/ensemble/sources.json`; the production build retains only the selected movement's record. The bundled sample banks, font and dependency notices have their own attribution. See [packaging details](docs/starter-bundle.md).

The source collection stays in the repository for development. `npm run ensemble:prepare` prepares it after checking source metadata. `npm run dev` and `npm run build` generate the additional library as standard MXL archives, verify source and archive hashes, and retain its attribution in `repertoire/library/sources.json`. The starter duplicate and two editions requiring review are excluded from this library. The production build removes the uncompressed extra scores, full ZIP, fallback JSONs and `repertoire/local`. Personal scores are not uploaded or added to the app's download.

[MusicXML source guide / 楽譜の入手先](docs/repertoire-download-guide.md) lists additional orchestral repertoire, download conditions and edition-specific rights. A source link is not a downloaded or verified score. PDF, MIDI-only and solo arrangements are not substitutes for full orchestral MusicXML.

## Run locally

```sh
npm install
npm run dev
```

Open <http://localhost:5173> and choose **Open your score** or **Try a starter score**. No separate repertoire download is needed for those two examples.

To check the production build:

```sh
npm run build
npm start
```

Open <http://127.0.0.1:4173>. This serves only `build/client` on this computer. See [Web serving](docs/web-serving.md) for ports, routing, headers and HTTPS hosting. A public host must serve from the domain root; repository-subpath deployment needs additional base-path support.

On macOS:

```sh
npm run build
npm run native:build
open build/native/ConvoCerto.app
```

The default Mac build uses a development ad hoc signature. It is not a notarized public release. The build targets the current machine's CPU and macOS 13 or later; the minimum target alone is not proof of testing on every OS version or architecture.

## Check a release candidate

```sh
npm run typecheck
npm test
npm run test:web-serving
npm run e2e
npm run verify:release
```

`verify:release` saves logs and a source hash under `verification-results/`. On macOS it also builds the native app and checks CoreMIDI parsing, WKWebView playback, display-process recovery and isolated persistent storage. The persistence harness needs macOS 14 or later; the app's build target remains macOS 13. It uses dedicated test profiles, not personal practice data.

After a successful full Mac verification, package that exact app:

```sh
npm run native:package -- verification-results/<run>/report.json
```

Packaging checks the source and bundle hashes, mounts the DMG, copies the app and exercises the installed copy. A stale verification report cannot authorize a new build. The default output is a development preview DMG, with version, architecture, minimum OS and SHA-256 in its package report.

Browser tests use a dedicated development server on port 5187 with strict port binding. Do not run a production build or edit sources concurrently with final browser verification: generated public assets can trigger a reload. Tests that use the larger research corpus require those repository fixtures, including the source editions intentionally held out of the production library.

Automated coverage includes artificial microphone streams, MIDI events, audio scheduling, notation, saved practice and recovery. It does **not** establish real-instrument tracking quality, perceived sound quality or success by an uninstructed first-time musician. [Human-session results](docs/acoustic-first-use-results.md) currently record **zero sessions**; [the observation plan](docs/acoustic-first-use-test.md) is ready to use.

## Publication and saved data

The intended release order is an HTTPS Web preview, then a Developer ID-signed and notarized Mac DMG on the same site. [Publication plan](docs/public-release-plan.md) covers signing, notarization, host requirements, manual updates and the remaining checks. No public deployment or notarized release has been completed.

`release.config.json` defines the Mac version, build, minimum OS and bundle identifier. Developer ID builds require an explicitly selected valid signing identity and `--release`; they fail if signing is unavailable. Signing and notarization are separate operations. Never label an ad hoc preview or an unnotarized package as the public Mac release.

The native app preserves its local origin across ordinary launches. Earlier development versions that used changing origins are not automatically migrated. Export important practice before replacing a development build. Web and Mac storage are separate; portable practice files transfer the score and current settings, but not cumulative practice history.

[Data handling](public/privacy.html) describes local score and microphone processing, deletion and optional external services. Recent practice and explicitly saved library scores are independent: deleting one does not remove the other. Camera model downloads and optional browser speech recognition can require external connections.

## Implementation and current limits

The `/perform` workflow uses `ConcertEngine` with `OrchestraAudio` for sampled Web Audio playback. It matches the selected performer's pitch/onset events, bounds tempo corrections, and combines explicit score directions with live expression estimates. OpenSheetMusicDisplay renders the notation. Web MIDI and native CoreMIDI provide electronic input; the microphone path extracts a single pitched line locally.

The legacy learning routes `/step1`–`/step3` use a separate demonstration engine and score follower; `/step4` opens the integrated practice screen. Their rule-based tempo hypotheses are not the implementation of the main concert workflow.

Current limits include:

- Monophonic pitched microphone input; chords and unpitched percussion are not supported for microphone following. Fixed-tempo practice and MIDI are separate options.
- No trained model of a named performer. Experimental reference curves come from the user's own matched event takes, not an artist's audio recordings.
- Supported articulation and phrase rules affect playback, but ornaments, trills, tremolo realization and automatic fermata extension are incomplete. Import warnings and unusual notation require review.
- Event takes are not audio/video recordings. Cloud sync, freehand score drawing, universal musical grading and automatic updates are not implemented.
- Real instruments, acoustics, input/output latency and musical naturalness still require live evaluation.

See [practice feature coverage](docs/musicxml-practice.md), [ensemble model](docs/ensemble-vision.md), [audio quality plan](docs/audio-quality-plan.md) and [performer-model plan](docs/performer-model-plan.md).

## Related work

- [ACCompanion](https://cpjku.github.io/accompanion/)
- [Metronaut](https://metronautapp.com/) — see the [source-backed comparison](docs/product-direction.md)
- [Yamaha AI Ensemble](https://www.yamaha.com/ja/tech-design/research/technologies/muens/)
