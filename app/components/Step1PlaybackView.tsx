import { playbackBeatForSource } from "~/lib/score-position";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScoreDisplay } from "./ScoreDisplay";
import { TempoSlider } from "./TempoSlider";
import { ProgressBar } from "./ProgressBar";
import { StageLayout } from "./StageLayout";
import { PlaybackEngine } from "~/lib/playback-engine";
import type { PlaybackState } from "~/lib/playback-engine";
import { MidiManager } from "~/lib/midi-manager";
import { loadScore as loadScoreFromPath, parseUploadedScore } from "~/lib/score-loader";
import type { ParsedScore, TempoEvent } from "~/lib/types";
import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

export function Step1PlaybackView() {
  const engineRef = useRef<PlaybackEngine | null>(null);
  const midiRef = useRef<MidiManager | null>(null);

  const [score, setScore] = useState<ParsedScore | null>(null);
  const [musicXML, setMusicXML] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    engineState: "idle",
    currentMeasure: 1,
    currentBeat: 0,
    tempo: 50,
    countingIn: false,
    countInBeat: 0,
  });
  const [language] = useState<Locale>("ja");
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [mutedParts, setMutedParts] = useState<Set<number>>(new Set());
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [countIn, setCountIn] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  const isPlaying =
    playbackState.engineState === "playing" ||
    playbackState.engineState === "waiting" ||
    playbackState.engineState === "listening";

  useEffect(() => {
    const midi = new MidiManager();
    const engine = new PlaybackEngine({
      getAudioTime: () => midi.getCurrentTime(),
    });

    engine.setNoteOutputCallback((note, delayMs, audioTime) => {
      midi.playNote(note, delayMs, audioTime);
    });

    engine.setStateChangeCallback((state) => {
      midi.setTempo(state.tempo);
      setPlaybackState(state);
    });

    engine.setClickOutputCallback((accent, audioTime) => {
      midi.playClick(accent, audioTime);
    });

    engine.setCountInMeasures(1);

    engineRef.current = engine;
    midiRef.current = midi;

    return () => {
      engine.stop();
      midi.dispose();
    };
  }, []);

  const initAudio = useCallback(async () => {
    if (audioInitialized) return;
    await midiRef.current?.initAudio();
    setAudioInitialized(true);
  }, [audioInitialized]);

  const applyScore = useCallback(
    (parsed: ParsedScore, xml: string) => {
      setError(null);
      setLoopA(null);
      setLoopB(null);
      setScore(parsed);
      setMusicXML(xml);
      setMutedParts(new Set());
      engineRef.current?.loadScore(parsed);
    },
    []
  );

  const loadSampleScore = useCallback(
    async (path = "/scores/mozart-k622-adagio.musicxml") => {
      try {
        await initAudio();
        const { score, musicXML } = await loadScoreFromPath(path);
        applyScore(score, musicXML);
      } catch (err) {
        setError("楽譜を読み込めませんでした。ファイルを確認して、もう一度お試しください。");
      }
    },
    [initAudio, applyScore]
  );

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await initAudio();
        const text = await file.text();
        const parsed = parseUploadedScore(text);
        applyScore(parsed, text);
      } catch {
        setError("楽譜を読み込めませんでした。非圧縮の MusicXML ファイルを選択してください。");
      }
      event.target.value = "";
    },
    [initAudio, applyScore]
  );

  const handleStart = useCallback(async () => {
    await initAudio();
    engineRef.current?.start();
  }, [initAudio]);

  const handleStop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const handleTempoChange = useCallback((bpm: number) => {
    engineRef.current?.setTempo(bpm);
  }, []);

  const handleTempoMapReady = useCallback((events: TempoEvent[]) => {
    engineRef.current?.setTempoMap(events);
  }, []);

  const handleSeek = useCallback((beat: number) => {
    engineRef.current?.seekToBeat(beat);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof Element && e.target.closest("input, select, textarea, button, a, [contenteditable], [role=slider]")) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (isPlaying) {
            engineRef.current?.stop();
          } else if (score) {
            initAudio().then(() => engineRef.current?.start());
          }
          break;
        case "Escape":
          engineRef.current?.stop();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (score) {
            const currentIdx = engineRef.current
              ? Math.min(
                  score.measureStartBeats.length - 1,
                  score.measureStartBeats.findIndex((b) => b > playbackState.currentBeat)
                )
              : 0;
            if (currentIdx >= 0) engineRef.current?.seekToMeasure(currentIdx);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (score) {
            const beats = score.measureStartBeats;
            let idx = 0;
            for (let i = beats.length - 1; i >= 0; i--) {
              if (beats[i] < playbackState.currentBeat - 0.1) {
                idx = i;
                break;
              }
            }
            engineRef.current?.seekToMeasure(Math.max(0, idx));
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, score, playbackState.currentBeat, initAudio]);

  const handleToggleMetronome = useCallback(() => {
    setMetronomeOn((prev) => {
      const next = !prev;
      engineRef.current?.setMetronomeEnabled(next);
      return next;
    });
  }, []);

  const handleCountInChange = useCallback((measures: number) => {
    setCountIn(measures);
    engineRef.current?.setCountInMeasures(measures);
  }, []);

  const handleSetLoopA = useCallback(() => {
    const beat = playbackState.currentBeat;
    const measureIdx = score?.measureStartBeats.findIndex((b, i, arr) =>
      i === arr.length - 1 || arr[i + 1] > beat
    ) ?? -1;
    const startBeat = measureIdx >= 0 ? score!.measureStartBeats[measureIdx] : beat;
    setLoopA(startBeat);
    if (loopB != null && loopB <= startBeat) setLoopB(null);
    engineRef.current?.setLoop(startBeat, loopB);
  }, [playbackState.currentBeat, score, loopB]);

  const handleSetLoopB = useCallback(() => {
    const beat = playbackState.currentBeat;
    const measureIdx = score?.measureStartBeats.findIndex((b) => b > beat) ?? -1;
    const endBeat = measureIdx >= 0 ? score!.measureStartBeats[measureIdx] : score?.totalBeats ?? beat;
    if (loopA != null && loopA >= endBeat) {
      setLoopA(null);
      engineRef.current?.setLoop(null, endBeat);
    } else {
      engineRef.current?.setLoop(loopA, endBeat);
    }
    setLoopB(endBeat);
  }, [playbackState.currentBeat, score, loopA]);

  const handleClearLoop = useCallback(() => {
    setLoopA(null);
    setLoopB(null);
    engineRef.current?.setLoop(null, null);
  }, []);

  const handleToggleMute = useCallback((partIndex: number) => {
    setMutedParts((prev) => {
      const next = new Set(prev);
      if (next.has(partIndex)) {
        next.delete(partIndex);
        engineRef.current?.unmutePart(partIndex);
      } else {
        next.add(partIndex);
        engineRef.current?.mutePart(partIndex);
      }
      return next;
    });
  }, []);

  return (
    <StageLayout locale={language}>
      {error && <p role="alert" style={{ color: "#b71c1c" }}>{error}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            {t(language, "step1Title")}
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                borderRadius: 4,
                border: "1px solid #1976d2",
                color: "#1976d2",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {t(language, "uploadMusicXML")}
              <input
                type="file"
                accept=".xml,.musicxml"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </label>
            <select
              onChange={(e) => {
                if (e.target.value) loadSampleScore(e.target.value);
              }}
              defaultValue=""
              style={{
                padding: "8px 16px",
                borderRadius: 4,
                border: "1px solid #666",
                background: "transparent",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              <option value="" disabled>
                {t(language, "loadSample")}
              </option>
              <option value="/scores/mozart-k622-adagio.musicxml">
                {t(language, "sampleMozart")}
              </option>
              <option value="/scores/weber-concertino-clarinet.musicxml">
                {t(language, "sampleWeber")}
              </option>
              <option value="/scores/sample-duet.musicxml">
                {t(language, "sampleDuet")}
              </option>
              <option value="/scores/mozart-k581-trio.musicxml">
                {t(language, "sampleK581")}
              </option>
              <option value="/scores/mozart-k545-allegro.musicxml">
                {t(language, "sampleK545")}
              </option>
              <option value="/scores/schubert-lindenbaum.musicxml">
                {t(language, "sampleSchubert")}
              </option>
              <option value="/scores/chopin-mazurka-op6no2.musicxml">
                {t(language, "sampleChopin")}
              </option>
            </select>
          </div>
        </div>

        {score && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: "#fff",
              borderRadius: 8,
              border: "1px solid #e0e0e0",
            }}
          >
            <button
              onClick={isPlaying ? handleStop : handleStart}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 48,
                height: 48,
                borderRadius: "50%",
                border: "none",
                background: isPlaying ? "#f44336" : "#4caf50",
                color: "#fff",
                cursor: "pointer",
                fontSize: 20,
                transition: "all 0.2s ease",
              }}
            >
              {isPlaying ? "\u25A0" : "\u25B6"}
            </button>

            <div style={{ flex: 1 }}>
              <TempoSlider
                tempo={playbackState.tempo}
                baseTempo={score.tempo}
                onTempoChange={handleTempoChange}
                locale={language}
              />
            </div>

            <button
              aria-label="メトロノーム"
              aria-pressed={metronomeOn}
              onClick={handleToggleMetronome}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 12px",
                borderRadius: 6,
                border: metronomeOn ? "2px solid #1976d2" : "1px solid #ccc",
                background: metronomeOn ? "#e3f2fd" : "transparent",
                color: metronomeOn ? "#1565c0" : "#666",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: metronomeOn ? 600 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {metronomeOn ? "Click ON" : "Click"}
            </button>

            <select
              aria-label="カウントイン"
              value={countIn}
              onChange={(e) => handleCountInChange(Number(e.target.value))}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #ccc",
                fontSize: 13,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <option value={0}>カウントインなし</option>
              <option value={1}>1小節カウントイン</option>
              <option value={2}>2小節カウントイン</option>
            </select>

            <div style={{ fontSize: 13, color: "#666", whiteSpace: "nowrap" }}>
              {playbackState.countingIn
                ? `カウント: ${playbackState.countInBeat + 1}`
                : playbackState.engineState === "playing"
                  ? t(language, "statePlaying")
                  : t(language, "stateIdle")}
            </div>
          </div>
        )}

        {score && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <ProgressBar
                currentBeat={playbackState.currentBeat}
                totalBeats={score.totalBeats}
                measureStartBeats={score.measureStartBeats}
                isPlaying={isPlaying}
                countingIn={playbackState.countingIn}
                loopStartBeat={loopA}
                loopEndBeat={loopB}
                onSeek={handleSeek}
              />
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                aria-label="ループ開始位置を設定"
                onClick={handleSetLoopA}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: loopA != null ? "2px solid #ff9800" : "1px solid #ccc",
                  background: loopA != null ? "#fff3e0" : "transparent",
                  color: loopA != null ? "#e65100" : "#666",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                A
              </button>
              <button
                aria-label="ループ終了位置を設定"
                onClick={handleSetLoopB}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: loopB != null ? "2px solid #ff9800" : "1px solid #ccc",
                  background: loopB != null ? "#fff3e0" : "transparent",
                  color: loopB != null ? "#e65100" : "#666",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                B
              </button>
              {(loopA != null || loopB != null) && (
                <button
                  aria-label="ループを解除"
                  onClick={handleClearLoop}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    background: "transparent",
                    color: "#999",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )}

        {score && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 12px",
              background: "#f5f5f5",
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>
              {t(language, "parts")}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {score.parts.map((part, idx) => {
                const isMuted = mutedParts.has(idx);
                const hasNotes = part.notes.length > 0;
                return (
                  <button
                    key={part.id}
                    onClick={() => handleToggleMute(idx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      borderRadius: 6,
                      fontSize: 13,
                      border: isMuted
                        ? "1px solid #ccc"
                        : "1px solid #1976d2",
                      cursor: "pointer",
                      background: isMuted ? "#eee" : "#e3f2fd",
                      color: isMuted ? "#999" : "#1565c0",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span style={{ fontSize: 15 }}>
                      {isMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
                    </span>
                    <span
                      style={{
                        textDecoration: isMuted ? "line-through" : "none",
                      }}
                    >
                      {part.name}
                    </span>
                    {!hasNotes && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "#f57f17",
                          background: "#fff9c4",
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        no notes
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 10,
                        color: isMuted ? "#bbb" : "#90caf9",
                      }}
                    >
                      {part.notes.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {score && musicXML ? (
          <ScoreDisplay
            onSeek={async (beat) => { await initAudio(); engineRef.current?.seekToBeat(playbackBeatForSource(score, beat, playbackState.currentBeat)); engineRef.current?.start(); }}
            musicXML={musicXML}
            currentMeasure={playbackState.currentMeasure}
            currentBeat={playbackState.currentBeat}
            beatsPerMeasure={score.timeSignature.beats}
            totalMeasures={score.totalMeasures}
            engineState={playbackState.engineState}
            measures={score.measures}
            measureNumbers={score.measureNumbers}
            onTempoMapReady={handleTempoMapReady}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 300,
              background: "#fafafa",
              borderRadius: 8,
              border: "2px dashed #ddd",
              color: "#999",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 16 }}>
              {t(language, "loadScorePrompt")}
            </span>
            <span style={{ fontSize: 13 }}>
              {t(language, "loadScoreHint")}
            </span>
          </div>
        )}

        {score && (
          <div
            style={{
              padding: 12,
              background: "#fafafa",
              borderRadius: 8,
              fontSize: 13,
              display: "flex",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <span>
              {t(language, "title")}: {score.title}
            </span>
            <span>
              {t(language, "time")}: {score.timeSignature.beats}/
              {score.timeSignature.beatType}
            </span>
            <span>
              {t(language, "tempo")}: {score.tempo} BPM
            </span>
            <span>
              {t(language, "measures")}: {score.totalMeasures}
            </span>
          </div>
        )}
      </div>
    </StageLayout>
  );
}
