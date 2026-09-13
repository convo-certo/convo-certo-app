# ConvoCerto repertoire sources

## Mozart — Clarinet Concerto in A major, K.622

Bundled orchestral-only fallback: all three movements from the Mutopia Project,
typeset by M. Leménager, based on Breitkopf, Leipzig (1877–1910, plate B.517).
Mutopia labels this edition Public Domain. The MIDI parts are converted to
quarter-note beat events without changing the pitches or durations.

https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1635
https://www.mutopiaproject.org/ftp/MozartWA/KV622/MozartK622/MozartK622-mids.zip

The optional local performance edition contains the clarinet line and its matching
orchestra from Reinier Bakels' MUS2MIDI sequences (1996), available through BitMidi:

https://bitmidi.com/k622-clarinet-concerto-1mov-mid
https://bitmidi.com/k622-clarinet-concerto-2mov-mid
https://bitmidi.com/k622-clarinet-concerto-3mov-mid

The initial 127-tick MIDI setup interval is removed from every part equally.
Strings share one MIDI channel; flute, bassoon and horn sections retain separate
instruments. The clarinet channel is used only for following, never accompaniment.
Fermata holds encoded in this MIDI create additional playback measures compared
with printed editions. The interface explicitly labels these as playback measures.

## Brahms — Clarinet Sonata No.2 in E-flat major, Op.120 No.2

All three movements are obtained from Viola in Music's downloadable MIDI archive.
Despite the hosting page's viola category, these files identify the solo track as
"Clarinet in Bb", GM program 71, alongside piano. The piano and solo retain their
common source timeline; solo notes are excluded from output.

https://www.viola-in-music.com/free-classical-music-midi-download.html
https://www.viola-in-music.com/support-files/sonata_no2_in_eb_major_op120_midi.zip

## Local editions

The BitMidi and Viola in Music files do not state a clear redistribution license.
They are downloaded for local practice by `npm run repertoire:prepare`; their
converted files under `public/repertoire/local/` and the download cache are
excluded from version control. They are not bundled as licensed repository assets. The build command explicitly
removes this directory from the distribution output, even when it exists locally.
Do not include the local editions in a public deployment without checking their
redistribution terms. Preparation does not require an account or payment.

## Instrument recordings

FluidR3 General MIDI samples, rendered by Benjamin Gleitzman's MIDI.js Soundfonts
project. Fluid Soundfont was created by Frank Wen.
The sample set is distributed under Creative Commons Attribution 3.0.

https://github.com/gleitz/midi-js-soundfonts
https://creativecommons.org/licenses/by/3.0/

ConvoCerto extracts C1 through C7 MP3 samples for 26 instruments.
The per-instrument source URLs and sample hashes are recorded in `/audio/fluid/sources.json`. Playback interpolates other pitches,
applies gain envelopes, stereo placement and a limiter. These are synthesized
performances using instrument recordings, not recordings of a live orchestra.
