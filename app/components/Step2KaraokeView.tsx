import { useCallback, useEffect, useRef, useState } from "react";
import { ScoreDisplay } from "./ScoreDisplay";
import { TempoSlider } from "./TempoSlider";
import { StageLayout } from "./StageLayout";
import { MidiDeviceSelector } from "./MidiDeviceSelector";
import { PlaybackEngine } from "~/lib/playback-engine";
import type { PlaybackState } from "~/lib/playback-engine";
import { MidiManager, midiToNoteName } from "~/lib/midi-manager";
import { parseMusicXML } from "~/lib/musicxml-parser";
import type { MidiDeviceInfo, ParsedScore } from "~/lib/types";
import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

export function Step2KaraokeView() {
  const engineRef = useRef<PlaybackEngine | null>(null);
  const midiRef = useRef<MidiManager | null>(null);

  const [score, setScore] = useState<ParsedScore | null>(null);
  const [musicXML, setMusicXML] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    engineState: "idle",
    currentMeasure: 1,
    currentBeat: 0,
    tempo: 50,
  });
  const [midiDevices, setMidiDevices] = useState<MidiDeviceInfo[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string | null>(null);
  const [lastMidiNote, setLastMidiNote] = useState<number | null>(null);
  const [lastMidiNoteName, setLastMidiNoteName] = useState<string | null>(null);
  const [language] = useState<Locale>("ja");
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [myPartIndex, setMyPartIndex] = useState<number | null>(null);
  const [mutedParts, setMutedParts] = useState<Set<number>>(new Set());
  const [localSoundEnabled, setLocalSoundEnabled] = useState(true);

  useEffect(() => {
    const engine = new PlaybackEngine();
    const midi = new MidiManager();

    engine.setNoteOutputCallback((note, delayMs) => {
      midi.playNote(note, delayMs);
    });

    engine.setStateChangeCallback((state) => {
      midi.setTempo(state.tempo);
      setPlaybackState(state);
    });

    midi.setNoteCallback((msg) => {
      if (msg.type === "noteon") {
        setLastMidiNote(msg.note);
        setLastMidiNoteName(midiToNoteName(msg.note));
        midi.playNoteImmediate(msg.note, msg.velocity, 0.5);
      }
    });

    midi.init().then(() => {
      setMidiDevices(midi.getInputDevices());
    });

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

  const loadScoreWithPart = useCallback(
    (parsed: ParsedScore, partIndex: number) => {
      setMyPartIndex(partIndex);
      setMutedParts(new Set());
      engineRef.current?.loadScore(parsed, { excludePartIndex: partIndex });
    },
    []
  );

  const loadScore = useCallback(
    async (xmlString: string) => {
      await initAudio();
      const parsed = parseMusicXML(xmlString);
      setScore(parsed);
      setMusicXML(xmlString);
      const defaultPartIndex = parsed.parts.findIndex((p) => p.isSolo);
      const idx = defaultPartIndex >= 0 ? defaultPartIndex : 0;
      loadScoreWithPart(parsed, idx);
    },
    [initAudio, loadScoreWithPart]
  );

  const loadSampleScore = useCallback(
    async (path = "/scores/mozart-k622-adagio.musicxml") => {
      try {
        const response = await fetch(path);
        const xml = await response.text();
        await loadScore(xml);
      } catch (err) {
        console.error("Failed to load sample score:", err);
      }
    },
    [loadScore]
  );

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      await loadScore(text);
    },
    [loadScore]
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

  const handleMidiSelect = useCallback((deviceId: string) => {
    midiRef.current?.selectInput(deviceId);
    setSelectedMidiDevice(deviceId);
  }, []);

  const handleMidiRefresh = useCallback(() => {
    if (midiRef.current) {
      setMidiDevices(midiRef.current.getInputDevices());
    }
  }, []);

  const handleMyPartChange = useCallback(
    (idx: number) => {
      if (!score) return;
      engineRef.current?.stop();
      loadScoreWithPart(score, idx);
    },
    [score, loadScoreWithPart]
  );

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

  const handleToggleLocalSound = useCallback(() => {
    setLocalSoundEnabled((prev) => {
      const next = !prev;
      midiRef.current?.setLocalSoundEnabled(next);
      return next;
    });
  }, []);

  const isPlaying =
    playbackState.engineState === "playing" ||
    playbackState.engineState === "waiting" ||
    playbackState.engineState === "listening";

  return (
    <StageLayout locale={language}>
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
            {t(language, "step2Title")}
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
                accept=".xml,.musicxml,.mxl"
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
              <option value="/scores/sample-duet.musicxml">
                {t(language, "sampleDuet")}
              </option>
              <option value="/scores/mozart-k581-trio.musicxml">
                {t(language, "sampleK581")}
              </option>
            </select>
          </div>
        </div>

        <MidiDeviceSelector
          devices={midiDevices}
          selectedId={selectedMidiDevice}
          onSelect={handleMidiSelect}
          onRefresh={handleMidiRefresh}
          locale={language}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "4px 12px",
            background: lastMidiNote !== null ? "#e8f5e9" : "#f5f5f5",
            borderRadius: 4,
            fontSize: 13,
            color: lastMidiNote !== null ? "#2e7d32" : "#999",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: lastMidiNote !== null ? "#4caf50" : "#ccc",
            }}
          />
          <span>
            {lastMidiNoteName
              ? `${t(language, "midiActivity")}: ${lastMidiNoteName} (MIDI ${lastMidiNote})`
              : t(language, "midiActivity")}
          </span>

          <button
            onClick={handleToggleLocalSound}
            style={{
              marginLeft: "auto",
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              border: localSoundEnabled ? "1px solid #1976d2" : "1px solid #999",
              background: localSoundEnabled ? "#e3f2fd" : "#f5f5f5",
              color: localSoundEnabled ? "#1565c0" : "#666",
              cursor: "pointer",
            }}
          >
            {localSoundEnabled
              ? t(language, "localSoundOn")
              : t(language, "localSoundOff")}
          </button>
        </div>

        {score && myPartIndex !== null && (
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
              {t(language, "myPart")}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {score.parts.map((part, idx) => {
                const isMyPart = idx === myPartIndex;
                return (
                  <button
                    key={part.id}
                    onClick={() => handleMyPartChange(idx)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 6,
                      fontSize: 13,
                      border: isMyPart
                        ? "2px solid #e65100"
                        : "1px solid #ccc",
                      background: isMyPart ? "#fff3e0" : "#fff",
                      color: isMyPart ? "#e65100" : "#666",
                      cursor: "pointer",
                      fontWeight: isMyPart ? 600 : 400,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {isMyPart && "\u266A "}
                    {part.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {score && myPartIndex !== null && (
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
                if (idx === myPartIndex) return null;
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

            <div style={{ fontSize: 13, color: "#666", whiteSpace: "nowrap" }}>
              {playbackState.engineState === "playing"
                ? t(language, "statePlaying")
                : t(language, "stateIdle")}
            </div>
          </div>
        )}

        {score && musicXML ? (
          <ScoreDisplay
            musicXML={musicXML}
            currentMeasure={playbackState.currentMeasure}
            currentBeat={playbackState.currentBeat}
            beatsPerMeasure={score.timeSignature.beats}
            totalMeasures={score.totalMeasures}
            engineState={playbackState.engineState}
            measures={score.measures}
            measureNumbers={score.measureNumbers}
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
