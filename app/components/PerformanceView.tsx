/**
 * PerformanceView - Main integrated performance interface
 * Combines score display, MIDI input, transport controls,
 * lead/follow indicator, pose detection, and voice commands.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ScoreDisplay } from "./ScoreDisplay";
import { LeadFollowIndicator } from "./LeadFollowIndicator";
import { TransportControls } from "./TransportControls";
import { MidiDeviceSelector } from "./MidiDeviceSelector";
import { VoiceCommandPanel } from "./VoiceCommandPanel";
import { PoseDetectorView } from "./PoseDetectorView";
import { AccompanimentEngine } from "~/lib/accompaniment-engine";
import { MidiManager } from "~/lib/midi-manager";
import { parseMusicXML } from "~/lib/musicxml-parser";
import { AudioReferenceAnalyser } from "~/lib/audio-reference";
import type {
  AccompanimentState,
  MidiDeviceInfo,
  ParsedScore,
  RehearsalCommand,
} from "~/lib/types";
import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

export function PerformanceView() {
  const engineRef = useRef<AccompanimentEngine | null>(null);
  const midiRef = useRef<MidiManager | null>(null);

  const [score, setScore] = useState<ParsedScore | null>(null);
  const [musicXML, setMusicXML] = useState<string | null>(null);
  const [engineState, setEngineState] = useState<AccompanimentState>({
    engineState: "idle",
    currentRole: { mode: "follow", strength: "moderate", factor: 0.3 },
    currentMeasure: 1,
    currentBeat: 0,
    tempo: 120,
    leadFollowRatio: 0.3,
  });
  const [midiDevices, setMidiDevices] = useState<MidiDeviceInfo[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string | null>(
    null
  );
  const [isRehearsalMode, setIsRehearsalMode] = useState(false);
  const [isPoseActive, setIsPoseActive] = useState(false);
  const [language] = useState<Locale>("ja");
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [audioRefName, setAudioRefName] = useState<string | null>(null);
  const [audioRefTempo, setAudioRefTempo] = useState<number | null>(null);

  // Initialize engine and MIDI
  useEffect(() => {
    const engine = new AccompanimentEngine();
    const midi = new MidiManager();

    engine.setNoteOutputCallback((note, delayMs) => {
      midi.playNote(note, delayMs);
    });

    engine.setStateChangeCallback((state) => {
      midi.setTempo(state.tempo);
      setEngineState(state);
    });

    midi.setNoteCallback((msg) => {
      engine.processMidiNote(msg);
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

  // Initialize audio on first user interaction
  const initAudio = useCallback(async () => {
    if (audioInitialized) return;
    await midiRef.current?.initAudio();
    setAudioInitialized(true);
  }, [audioInitialized]);

  // Load score
  const loadScore = useCallback(
    async (xmlString: string) => {
      await initAudio();
      const parsed = parseMusicXML(xmlString);
      setScore(parsed);
      setMusicXML(xmlString);
      engineRef.current?.loadScore(parsed);
    },
    [initAudio]
  );

  // Load sample score
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

  // Handle file upload
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      await loadScore(text);
    },
    [loadScore]
  );

  // Handle reference audio upload
  const handleAudioRefUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !engineRef.current) return;
      try {
        const analyser = new AudioReferenceAnalyser();
        const profile = await analyser.analyseFromFile(file);
        engineRef.current.setAudioReference(analyser, profile);
        setAudioRefName(file.name);
        setAudioRefTempo(Math.round(profile.averageTempo));
      } catch (err) {
        console.error("Failed to analyse audio reference:", err);
      }
    },
    []
  );

  // Transport controls
  const handleStart = useCallback(async () => {
    await initAudio();
    engineRef.current?.start();
  }, [initAudio]);

  const handleStop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  // MIDI device selection
  const handleMidiSelect = useCallback((deviceId: string) => {
    midiRef.current?.selectInput(deviceId);
    setSelectedMidiDevice(deviceId);
  }, []);

  const handleMidiRefresh = useCallback(() => {
    if (midiRef.current) {
      setMidiDevices(midiRef.current.getInputDevices());
    }
  }, []);

  // Rehearsal commands
  const handleRehearsalCommand = useCallback(
    (command: RehearsalCommand) => {
      if (!engineRef.current) return;

      switch (command.type) {
        case "set_role":
          if (command.measureNumber && command.role) {
            engineRef.current.updateMeasureAnnotation({
              measureNumber: command.measureNumber,
              role: command.role,
            });
            // Update displayed score measures
            if (score) {
              const existing = score.measures.find(
                (m) => m.measureNumber === command.measureNumber
              );
              if (existing) {
                existing.role = command.role;
              } else {
                score.measures.push({
                  measureNumber: command.measureNumber!,
                  role: command.role,
                });
                score.measures.sort(
                  (a, b) => a.measureNumber - b.measureNumber
                );
              }
              setScore({ ...score });
            }
          }
          break;
        case "set_wait":
          if (command.measureNumber && command.wait) {
            engineRef.current.updateMeasureAnnotation({
              measureNumber: command.measureNumber,
              wait: command.wait,
            });
          }
          break;
        case "set_tempo":
          if (command.tempo) {
            // If relative (small number), adjust from current
            if (Math.abs(command.tempo) <= 30) {
              setEngineState((prev) => ({
                ...prev,
                tempo: prev.tempo + command.tempo!,
              }));
            }
          }
          break;
        case "reset":
          if (musicXML) {
            const parsed = parseMusicXML(musicXML);
            setScore(parsed);
            engineRef.current.loadScore(parsed);
          }
          break;
      }
    },
    [score, musicXML]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 1200,
        margin: "0 auto",
        padding: 16,
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 0",
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            ConvoCerto
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
            {t(language, "appSubtitle")}
          </p>
        </div>
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
              color: "#666",
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
      </header>

      {/* MIDI Device */}
      <MidiDeviceSelector
        devices={midiDevices}
        selectedId={selectedMidiDevice}
        onSelect={handleMidiSelect}
        onRefresh={handleMidiRefresh}
        locale={language}
      />

      {/* Transport */}
      <TransportControls
        engineState={engineState.engineState}
        onStart={handleStart}
        onStop={handleStop}
        onToggleRehearsal={() => setIsRehearsalMode(!isRehearsalMode)}
        isRehearsalMode={isRehearsalMode}
        hasScore={score !== null}
        locale={language}
      />

      {/* Main Content */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: score ? "1fr 280px" : "1fr",
          gap: 16,
        }}
      >
        {/* Score Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {score && musicXML ? (
            <ScoreDisplay
              musicXML={musicXML}
              currentMeasure={engineState.currentMeasure}
              currentBeat={engineState.currentBeat}
              beatsPerMeasure={score.timeSignature.beats}
              totalMeasures={score.totalMeasures}
              engineState={engineState.engineState}
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
              <span style={{ fontSize: 48 }}>🎵</span>
              <span style={{ fontSize: 16 }}>
                {t(language, "loadScorePrompt")}
              </span>
              <span style={{ fontSize: 13 }}>
                {t(language, "loadScoreHint")}
              </span>
            </div>
          )}

          {/* Rehearsal Panel */}
          {isRehearsalMode && (
            <VoiceCommandPanel
              isActive={isRehearsalMode}
              onCommand={handleRehearsalCommand}
              language={language}
            />
          )}
        </div>

        {/* Sidebar */}
        {score && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <LeadFollowIndicator state={engineState} locale={language} />

            {/* Pose Toggle */}
            <button
              onClick={() => setIsPoseActive(!isPoseActive)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: isPoseActive
                  ? "2px solid #4caf50"
                  : "1px solid #e0e0e0",
                background: isPoseActive ? "#e8f5e9" : "#fff",
                color: isPoseActive ? "#2e7d32" : "#666",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: isPoseActive ? 600 : 400,
              }}
            >
              {isPoseActive ? t(language, "cameraOn") : t(language, "enableCamera")}
            </button>

            <PoseDetectorView isActive={isPoseActive} locale={language} />

            {/* Audio Reference Upload */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 16px",
                borderRadius: 8,
                border: audioRefName
                  ? "2px solid #7b1fa2"
                  : "1px solid #e0e0e0",
                background: audioRefName ? "#f3e5f5" : "#fff",
                color: audioRefName ? "#7b1fa2" : "#666",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: audioRefName ? 600 : 400,
              }}
            >
              {audioRefName
                ? `${t(language, "audioRefLoaded")}: ${audioRefName}`
                : t(language, "loadAudioRef")}
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioRefUpload}
                style={{ display: "none" }}
              />
            </label>
            {audioRefTempo && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: "#7b1fa2",
                }}
              >
                {t(language, "avgTempo")}: {audioRefTempo} BPM
              </div>
            )}

            {/* Score Info */}
            <div
              style={{
                padding: 12,
                background: "#fafafa",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {t(language, "scoreInfo")}
              </div>
              <div>{t(language, "title")}: {score.title}</div>
              <div>
                {t(language, "time")}: {score.timeSignature.beats}/
                {score.timeSignature.beatType}
              </div>
              <div>{t(language, "tempo")}: {score.tempo} BPM</div>
              <div>{t(language, "measures")}: {score.totalMeasures}</div>
              <div>{t(language, "parts")}: {score.parts.map((p) => p.name).join(", ")}</div>
              <div>
                {t(language, "annotations")}: {score.measures.length} {t(language, "measureUnit")}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
