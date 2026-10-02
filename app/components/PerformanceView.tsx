import { useLocale } from "~/lib/locale-context";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AcousticSetup } from "./AcousticSetup";
import { ExpressionDemo } from "./ExpressionDemo";
import { ScoreKeyControl } from "./ScoreKeyControl";
import { transposeMusicXMLKey, writtenScoreKey } from "~/lib/musicxml-key";
import { StudioControls } from "./StudioControls";
import { ExpressionPreview } from "./ExpressionPreview";
import { PracticeJournal } from "./PracticeJournal";
import { recordPracticeSession, updatePracticeSnapshot } from "~/lib/practice-journal";
import { EnsemblePresence } from "./EnsemblePresence";
import { exportPracticeFile, readPracticeFileUpload } from "~/lib/practice-file";
import { PracticeFileError, practiceFileErrorMessage } from "~/lib/practice-file-error";
import { firstPlayerExcerpt } from "~/lib/practice-excerpt";
import type { OrchestraSpace, PracticeSession, PracticeEnsemble } from "~/lib/practice-session";
import { useSearchParams } from "react-router";
import { OrchestraStage } from "./OrchestraStage";
import { StarterScores } from "./StarterScores";
import { ScoreCatalog } from "./ScoreCatalog";
import { PartPracticeHelp } from "./PartPracticeHelp";
import type { CatalogInstrumentId } from "~/lib/score-catalog";
import { preferredPartId } from "~/lib/preferred-part";
import { playbackBeatForSource } from "~/lib/score-position";
import { instrumentTranspositions } from "~/lib/instrument-transposition";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StageLayout } from "./StageLayout";
import { ScoreDisplay } from "./ScoreDisplay";
import { VoiceCommandPanel } from "./VoiceCommandPanel";
import { PoseDetectorView } from "./PoseDetectorView";
import { ConcertEngine, type ConcertState } from "~/lib/concert-engine";
import { OrchestraAudio } from "~/lib/orchestra-audio";
import { OrchestraAudioError, orchestraAudioErrorMessage } from "~/lib/orchestra-audio-error";
import { MicrophoneInput, type PitchReading } from "~/lib/microphone-input";
import { MidiManager, midiToNoteName } from "~/lib/midi-manager";
import { transposeScore, type RepertoireEntry } from "~/lib/repertoire";
import { parseMusicXML, updateMusicXMLAnnotation } from "~/lib/musicxml-parser";
import { assignPerformanceSeat, listPerformanceSeats, performanceName, playerPart } from "~/lib/performance-seats";
import { practicePartIssue } from "~/lib/practice-readiness";
import { readMusicXMLFile } from "~/lib/musicxml-file";
import { musicXMLErrorMessage } from "~/lib/musicxml-error-message";
import { inspectMusicXMLPlayback, type PlaybackIssue } from "~/lib/musicxml-playback-issues";
import { PlaybackIssues } from "./PlaybackIssues";
import { listLibraryScores, saveLibraryScore, removeLibraryScore, type LibraryScore } from "~/lib/score-library";
import { EnsembleLab } from "./EnsembleLab";
import { expressionPresets } from "~/lib/expressive-intent";
import { expressionPresetLabelsEn } from "~/lib/expression-preview";
import { readRehearsalPlan } from "~/lib/rehearsal-plan";
import { eventBus } from "~/lib/event-bus";
import { roleDirective } from "~/lib/rehearsal-nlp";
import type { MeasureAnnotation, MidiDeviceInfo, MidiNoteMessage, ParsedScore, RehearsalCommand } from "~/lib/types";

const initialState: ConcertState = { status: "idle", beat: 0, measure: 1, tempo: 120, mode: "follow", confidence: 0, matchedBeat: null };

export function PerformanceView({ stage = false }: { stage?: boolean }) {
  const { locale, text: translate } = useLocale();
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const text = useCallback((ja: string, en: string) => translateRef.current(ja, en), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const scorePage = searchParams.get("view") === "score";
  const setScorePage = (value: boolean) => { setSearchParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set("view", "score"); else next.set("view", "settings"); return next; }); window.scrollTo(0, 0); };
  const spacePanel = useRef<HTMLDetailsElement>(null);
  const [spaceRequested, setSpaceRequested] = useState(false);
  const openSpace = () => { setSpaceRequested(true); setScorePage(false); };
  useEffect(() => {
    if (!spaceRequested || scorePage || !spacePanel.current) return;
    spacePanel.current.open = true;
    spacePanel.current.scrollIntoView({ block: "start" });
    setSpaceRequested(false);
  }, [spaceRequested, scorePage]);
  const [journalRevision, setJournalRevision] = useState(0);
  const [recordRevision, setRecordRevision] = useState(0);
  const [spaceRevision, setSpaceRevision] = useState(0);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const editRevision = useRef(0);
  const pendingSnapshot = useRef<LibraryScore | null>(null);
  const [journalError, setJournalError] = useState("");
  const practiceSnapshot = useRef<() => LibraryScore | null>(() => null);
  const practiceTiming = useRef({ time: 0, running: false, seconds: 0 });
  const resumeBeat = useRef(0);
  const [resumedPractice, setResumedPractice] = useState(false);
  const practiceId = useRef<string | null>(null);
  const [practiceSaved, setPracticeSaved] = useState(false);
  const libraryPage = !scorePage && searchParams.get("view") !== "settings";
  const showLibrary = () => { engineRef.current?.stop(); setSearchParams({}); window.scrollTo(0, 0); };
  const spaceRef = useRef<OrchestraSpace | undefined>(undefined);
  const rememberSpace = useCallback((space: OrchestraSpace) => { spaceRef.current = space; setSpaceRevision(value => value + 1); }, []);
  const [restoredEnsemble, setRestoredEnsemble] = useState<PracticeEnsemble | undefined>();
  const [restoredSpace, setRestoredSpace] = useState<OrchestraSpace | undefined>();
  const [sessionRevision, setSessionRevision] = useState(0);
  const engineRef = useRef<ConcertEngine | null>(null);
  const seekPracticeBeat = (beat: number) => { resumeBeat.current = beat; engineRef.current?.seek(beat); };
  const audioRef = useRef<OrchestraAudio | null>(null);
  const micRef = useRef<MicrophoneInput | null>(null);
  const midiRef = useRef<MidiManager | null>(null);
  const inputTranspose = useRef(0);
  const mounted = useRef(true);
  const scoreRequest = useRef(0);
  const micRequest = useRef(0);
  const micListRequest = useRef(0);
  const [entry, setEntry] = useState<RepertoireEntry | null>(null);
  const [ensembleScore, setEnsembleScore] = useState<ParsedScore | null>(null);
  const [seatId, setSeatId] = useState("");
  const [seatConfirmed, setSeatConfirmed] = useState(false);
  const [partRequest, setPartRequest] = useState(0);
  const [original, setOriginal] = useState<ParsedScore | null>(null);
  const [score, setScore] = useState<ParsedScore | null>(null);
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | OrchestraAudioError | PracticeFileError>("");
  const [micStatus, setMicStatus] = useState<"off" | "starting" | "on">("off");
  const [micDevices, setMicDevices] = useState<{ id: string; label: string }[]>([]);
  const [micDevice, setMicDevice] = useState("");
  const [micInputLabel, setMicInputLabel] = useState("");
  const [micDeviceNotice, setMicDeviceNotice] = useState("");
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [breath, setBreath] = useState<{ controller: number; value: number } | null>(null);
  const [lastMidi, setLastMidi] = useState<MidiNoteMessage | null>(null);
  const [midiMonitor, setMidiMonitor] = useState(false);
  const [midiNotice, setMidiNotice] = useState("");
  const [midiDevice, setMidiDevice] = useState("");
  const [midiWritten, setMidiWritten] = useState(false);
  const [instrumentKey, setInstrumentKey] = useState(-3);
  const [shift, setShift] = useState(0);
  const [tuning, setTuning] = useState(440);
  const [practiceMode, setPracticeMode] = useState<"accompany" | "listen" | "wait">("accompany");
  const [countInBars, setCountInBars] = useState(0);
  const [click, setClick] = useState(false);
  const [volume, setVolume] = useState(65);
  const [muted, setMuted] = useState<number[]>([]);
  const [startMeasure, setStartMeasure] = useState(1);
  const [loopEnd, setLoopEnd] = useState(4);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [annotations, setAnnotations] = useState<MeasureAnnotation[]>([]);
  const [editMeasure, setEditMeasure] = useState(1);
  const [rehearsal, setRehearsal] = useState(false);
  const [camera, setCamera] = useState(false);
  const [musicXML, setMusicXML] = useState<string | null>(null);
  const [playbackIssues, setPlaybackIssues] = useState<PlaybackIssue[]>([]);
  const [library, setLibrary] = useState<LibraryScore[]>([]);
  const [unsavedImport, setUnsavedImport] = useState<Omit<LibraryScore, "id" | "savedAt"> | null>(null);
  const [libraryError, setLibraryError] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [notice, setNotice] = useState("");
  const [voiceLimited, setVoiceLimited] = useState(false);
  const [audioInterrupted, setAudioInterrupted] = useState(false);
  const [fileNotice, setFileNotice] = useState("");
  const libraryFeedback = useRef<HTMLDivElement>(null);
  const inputPanel = useRef<HTMLElement>(null);
  const waitingNotice = useRef<HTMLElement>(null);
  const [inputRequested, setInputRequested] = useState(false);
  const libraryVisible = libraryPage || !score;
  useEffect(() => {
    if (!libraryVisible || (!busy && !error && !fileNotice)) return;
    libraryFeedback.current?.scrollIntoView({ block: "nearest" });
    if (error) libraryFeedback.current?.focus({ preventScroll: true });
  }, [libraryVisible, busy, error, fileNotice]);
  useEffect(() => {
    if (!inputRequested || scorePage || libraryPage || !inputPanel.current) return;
    inputPanel.current.scrollIntoView({ block: "start" });
    inputPanel.current.focus({ preventScroll: true });
    setInputRequested(false);
  }, [inputRequested, scorePage, libraryPage]);
  const flushPracticeSnapshot = useCallback(async () => {
    const practice = pendingSnapshot.current;
    pendingSnapshot.current = null;
    if (!practice) return;
    try {
      const updated = await updatePracticeSnapshot(practice);
      if (mounted.current && practiceId.current === practice.id && updated) { setJournalRevision(value => value + 1); setJournalError(""); }
    } catch {
      if (mounted.current && practiceId.current === practice.id) setJournalError(text("最近の練習に変更を保存できませんでした。練習ファイルを書き出して保管してください。", "Could not update your recent practice. Export a practice file to keep these changes."));
    }
  }, [text]);
  const refreshMicrophones = useCallback(async () => {
    const request = ++micListRequest.current;
    try {
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error();
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput" && device.deviceId);
      if (!mounted.current || request !== micListRequest.current) return;
      setMicDevices([...new Map(inputs.map((device, index) => [device.deviceId, { id: device.deviceId, label: device.label || text(`マイク ${index + 1}`, `Microphone ${index + 1}`) }])).values()]);
      setMicDeviceNotice(inputs.length && inputs.every((device) => device.label) ? "" : text("機器名が表示されない場合は、一度マイクを開始して許可し、停止してから選び直してください。", "To show microphone names, allow microphone access, then stop and choose an input."));
    } catch {
      if (mounted.current && request === micListRequest.current) setMicDeviceNotice(text("マイク一覧を取得できませんでした。一覧を更新するか、システム既定のマイクで開始してください。", "Could not list microphones. Refresh the list or use the system default."));
    }
  }, []);
  useEffect(() => {
    const receive = (event: Event) => {
      const result = (event as CustomEvent).detail;
      if (result?.status === "saved") setFileNotice(text(`${result.name}を保存しました。`, `Saved ${result.name}.`));
      if (result?.status === "failed") setError(text(`ファイルを保存できませんでした。${result.error ?? ""}`, `Could not save the file. ${result.error ?? ""}`));
      if (result?.status === "cancelled") setFileNotice(text("ファイルの保存をキャンセルしました。", "File save cancelled."));
    };
    window.addEventListener("convocerto-download", receive);
    return () => window.removeEventListener("convocerto-download", receive);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void listLibraryScores().then((scores) => { if (mounted.current) setLibrary(scores); }).catch(() => { if (mounted.current) setLibraryError(text("マイ楽譜を読み込めませんでした。保存済みの楽譜がないという意味ではありません。", "Could not read your library. Your saved scores may still be available; try again.")); });
    const audio = new OrchestraAudio();
    const engine = new ConcertEngine(() => audio.currentTime);
    const stopObserving = engine.observe(event => { if (event.type === "control" && event.action === "changed") setSettingsRevision(value => value + 1); });
    const mic = new MicrophoneInput();
    const midi = new MidiManager();
    const interruptAudio = () => {
      const state = engine.getState();
      if (state.status !== "playing" && state.status !== "waiting") return;
      const beat = state.beat;
      engine.stop();
      engine.seek(beat);
      setAudioInterrupted(true);
    };
    audio.onAvailabilityChanged = (availability) => { if (availability !== "running") interruptAudio(); };
    engine.onState = (state) => {
      if (state.status !== "idle" || state.beat !== 0) resumeBeat.current = state.beat;
      const timing = practiceTiming.current;
      const now = audio.currentTime;
      if (timing.running) timing.seconds += Math.max(0, Math.min(2, now - timing.time));
      timing.time = now;
      timing.running = state.status === "playing" && !state.countInRemaining && engine.getPracticeOptions().mode !== "listen";
      if (state.status === "idle" || state.status === "finished") {
        const seconds = timing.seconds; timing.seconds = 0;
        const practice = seconds >= 3 ? practiceSnapshot.current() : null;
        if (practice) void recordPracticeSession(practice, seconds).then(() => { if (mounted.current) { setJournalRevision(value => value + 1); setRecordRevision(value => value + 1); setJournalError(""); } }).catch(() => { if (mounted.current) setJournalError(text("練習履歴を保存できませんでした。メニューから練習ファイルを書き出せます。", "Could not save your recent practice. Export a practice file from the menu to keep a copy.")); });
      }
      setState(state);
      if (state.status === "playing" || state.status === "waiting") {
        if (audio.availability !== "running") interruptAudio();
        else setAudioInterrupted(false);
      }
    };
    let observedAudioTime = audio.currentTime;
    let progressedAt = performance.now();
    const audioWatchdog = setInterval(() => {
      const current = audio.currentTime;
      const status = engine.getState().status;
      const now = performance.now();
      if ((status !== "playing" && status !== "waiting") || current !== observedAudioTime) {
        observedAudioTime = current;
        progressedAt = now;
      } else if (now - progressedAt >= 2000) {
        interruptAudio();
        setError(text("音声の時間が進んでいません。音声出力先を確認して、音声を復旧して再開してください。", "Audio has stopped responding. Check your output device, then choose Restore audio and resume."));
        progressedAt = now;
      }
    }, 250);
    audio.onVoiceLimit = () => setVoiceLimited(true);
    engine.onNote = (note, time, duration, notatedDuration) => audio.play(note, time, duration, notatedDuration);
    engine.onSilence = () => audio.stop();
    engine.onClick = (time, accent) => audio.playClick(time, accent);
    mic.onNote = (message) => engine.processNote(message);
    mic.onReading = setReading;
    mic.onLevel = setMicLevel;
    mic.onInterrupted = () => {
      micRequest.current++;
      setMicStatus("off");
      setMicInputLabel("");
      if (engine.getPracticeOptions().mode !== "listen") {
        const current = engine.getState();
        if (current.status === "playing" || current.status === "waiting") { engine.stop(); engine.seek(current.beat); }
      }
      setError(text("マイク入力が中断しました。接続を確認し「マイクで演奏する」でつなぎ直してください。伴奏を再開するには演奏開始を押してください。", "Microphone disconnected. Reconnect your microphone, then press Play to continue."));
    };
    midi.setLocalSoundEnabled(false);
    midi.onError = (message) => { setMidiDevice(""); setLastMidi(null); setBreath(null); setMidiNotice(message); };
    midi.onInputLost = () => {
      setMidiDevice(""); setLastMidi(null); setBreath(null);
      setMidiNotice(text("演奏中のMIDI機器が切断されました。機器を選び直し、演奏開始で続けられます。", "MIDI disconnected. Select your device again, then press Play to continue."));
      if (engine.getPracticeOptions().mode !== "listen") {
        const current = engine.getState();
        if (current.status === "playing" || current.status === "waiting") { engine.stop(); engine.seek(current.beat); }
      }
    };
    midi.onController = (controller, value) => { if (controller === 2 || controller === 11) setBreath({ controller, value }); };
    midi.onDevicesChanged = (inputs) => { setDevices(inputs); setMidiDevice((id) => inputs.some((device) => device.id === id) ? id : ""); };
    midi.setNoteCallback((message) => { const sounding = { ...message, note: message.note + inputTranspose.current }; setLastMidi(sounding); engine.processNote(sounding); midi.monitorNote(sounding); });
    engineRef.current = engine;
    audioRef.current = audio;
    micRef.current = mic;
    midiRef.current = midi;
    const refreshInputs = () => { void refreshMicrophones(); };
    navigator.mediaDevices?.addEventListener("devicechange", refreshInputs);
    refreshInputs();
    const off = eventBus.on("motion_cue", ({ data }) => {
      if (data.confidence > 0.6 && ["nod", "breath", "preparation"].includes(data.type)) engine.cue();
    });
    return () => {
      mounted.current = false;
      scoreRequest.current++;
      void flushPracticeSnapshot();
      micRequest.current++;
      micListRequest.current++;
      navigator.mediaDevices?.removeEventListener("devicechange", refreshInputs);
      off();
      stopObserving();
      clearInterval(audioWatchdog);
      engine.dispose();
      mic.stop();
      midi.dispose();
      audio.dispose();
    };
  }, [refreshMicrophones]);

  useEffect(() => { if (libraryPage) engineRef.current?.stop(); }, [libraryPage]);
  const starterRequested = searchParams.get("catalog") === "1";
  useEffect(() => {
    if (!libraryPage || !starterRequested) return;
    const frame = requestAnimationFrame(() => {
      const section = document.getElementById("starter-scores");
      section?.scrollIntoView({ block: "center" });
      section?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [libraryPage, starterRequested]);
  useEffect(() => { inputTranspose.current = midiWritten ? instrumentKey : 0; }, [midiWritten, instrumentKey]);

  const loadXML = async (file: File, orchestralSeat = false, session?: PracticeSession, savedId?: string, confirmedPart = !!session, preferredInstrument?: CatalogInstrumentId) => {
    const request = ++scoreRequest.current;
    setBusy(text("MusicXMLから演奏を準備しています…", "Opening your score…"));
    setError("");
    engineRef.current?.stop();
    try {
      await flushPracticeSnapshot();
      const xml = await readMusicXMLFile(file);
      if (!mounted.current || request !== scoreRequest.current) return;
      const source = parseMusicXML(xml);
      const issues = inspectMusicXMLPlayback(xml);
      const initialSeat = session?.seatId ?? preferredPartId(source, preferredInstrument);
      const base = initialSeat ? assignPerformanceSeat(source, initialSeat) : source;
      const parsed = session ? transposeScore(base, session.shift) : base;
      if (!parsed.title.trim()) parsed.title = file.name.replace(/\.(musicxml|xml|mxl)$/i, "");
      await audioRef.current?.prepare(parsed.parts, () => {
        if (mounted.current && request === scoreRequest.current) setBusy(text("音源を準備しています…", "Preparing instrument sounds…"));
      });
      if (!mounted.current || request !== scoreRequest.current) return;
      practiceId.current = savedId ?? crypto.randomUUID();
      resumeBeat.current = session?.beat ?? 0;
      setPracticeSaved(false);
      const key = parsed.parts.find((part) => part.isSolo)?.transposeSemitones ?? 0;
      setEntry({ id: "musicxml", composer: "MusicXML", title: parsed.title, movement: parsed.title, ensemble: parsed.parts.length > 3 ? "orchestra" : "piano", path: "", nativeTransposition: key, source: "" });
      setEnsembleScore(source);
      setSeatId(playerPart(parsed)?.id ?? parsed.parts[0].id);
      setSeatConfirmed(confirmedPart);
      setPartRequest(0);
      setOriginal(base);
      setVoiceLimited(false);
      setAudioInterrupted(false);
      setScore(parsed);
      setMusicXML(xml);
      setPlaybackIssues(issues);
      spaceRef.current = session?.space;
      setRestoredSpace(session?.space);
      setRestoredEnsemble(session?.ensemble);
      setSessionRevision((value) => value + 1);
      setAnnotations(parsed.measures);
      setInstrumentKey(key);
      setShift(0);
      setMuted([]);
      setStartMeasure(1);
      setLoopEnd(Math.min(4, parsed.playbackOrder.length));
      setLoopEnabled(false);
      setEditMeasure(parsed.measureNumbers.find((number) => number >= 1) ?? 0);
      setResumedPractice(!!session);
      if (searchParams.get("view") !== "settings") setScorePage(true);
      setNotice(orchestralSeat ? text("この版はクラリネットの共通譜です。声部番号は奏者番号と一致しないため、クラリネット全体の席で開きます。第2奏者専用の譜面としては未検証です。", "This edition combines the clarinets. Voice numbers may not match player numbers; the combined part is selected.") : text("このMusicXMLの音符・テンポ・対応している指示を使って伴奏と追従を行います。", "Ready to play from your MusicXML score."));
      setPracticeMode("accompany"); audioRef.current?.setSoloAudible(false);
      engineRef.current?.load(parsed);
      if (!session && searchParams.get("view") !== "settings") { setCountInBars(1); engineRef.current?.setPracticeOptions({ mode: "accompany", countInBars: 1, click }); }
      if (orchestralSeat) engineRef.current?.setLeader("conductor");
      engineRef.current?.setAnnotations(parsed.measures);
      audioRef.current?.setVolume(volume / 100);
      if (session) {
        const restoredMuted = parsed.parts.flatMap((part, index) => !part.isSolo && session.mutedPartIds?.includes(part.id) ? [index] : []);
        setMuted(restoredMuted);
        restoredMuted.forEach(index => audioRef.current?.setPartVolume(index, 0));
        setInstrumentKey(session.instrumentKey); setShift(session.shift); setTuning(session.tuning);
        audioRef.current?.setTuning(session.tuning); if (micRef.current) micRef.current.tuning = session.tuning;
        setStartMeasure(session.startMeasure); setLoopEnd(session.loopEnd); setLoopEnabled(session.loopEnabled);
        setPracticeMode(session.mode); setCountInBars(session.countInBars); setClick(session.click);
        setVolume(session.volume); setMidiWritten(session.midiWritten);
        audioRef.current?.setSoloAudible(session.mode === "listen"); audioRef.current?.setVolume(session.volume / 100);
        engineRef.current?.setPracticeOptions({ mode: session.mode, countInBars: session.countInBars, click: session.click });
        engineRef.current?.setTempo(session.tempo);
        engineRef.current?.setLoop(session.loopEnabled ? parsed.measureStartBeats[session.startMeasure - 1] : null, session.loopEnabled ? parsed.measureStartBeats[session.loopEnd] ?? parsed.totalBeats : null);
        seekPracticeBeat(Math.max(0, Math.min(parsed.totalBeats, session.beat)));
        setNotice(text("保存した席・練習区間・空間配置を戻しました。演奏開始で続けられます。", "Restored your part, passage and instrument positions. Press Play to continue."));
      }
    } catch (error) {
      if (mounted.current && request === scoreRequest.current) setError(error instanceof OrchestraAudioError ? error : musicXMLErrorMessage(error, translateRef.current("ja", "en") as "ja" | "en"));
    } finally { if (mounted.current && request === scoreRequest.current) setBusy(""); }
  };

  const currentPractice = (): LibraryScore | null => {
    if (!annotatedXML || !score) return null;
    const session: PracticeSession = { version: 1, seatId, instrumentKey, shift, tuning, tempo: engineRef.current?.getBaseTempo() ?? state.tempo, beat: state.status === "idle" && state.beat === 0 ? resumeBeat.current : state.beat, startMeasure, loopEnd, loopEnabled, mode: practiceMode, countInBars, click, volume, midiWritten, mutedPartIds: muted.map(index => score.parts[index].id), space: spaceRef.current, ensemble: engineRef.current ? { tuning: engineRef.current.getTuning(), leader: engineRef.current.getLeader(), reference: engineRef.current.getReference() } : undefined };
    return { id: practiceId.current ??= crypto.randomUUID(), title: score.title, xml: annotatedXML, savedAt: new Date().toISOString(), session };
  };

  practiceSnapshot.current = currentPractice;

  const savePractice = async () => {
    const practice = currentPractice();
    if (!practice) return;
    const revision = editRevision.current;
    setError("");
    try {
      await saveLibraryScore(practice);
      if (practice.id === practiceId.current && revision === editRevision.current) {
        setPracticeSaved(true);
        setNotice(text("この練習を保存しました。マイ楽譜から同じ席・区間で再開できます。", "Practice saved. Resume with the same part and passage from My scores."));
      }
      setLibrary(await listLibraryScores());
    } catch { setError(text("練習を保存できませんでした。「今の練習をファイルに書き出す」で楽譜と設定を退避できます。ブラウザの空き容量も確認してください。", "Could not save your practice. Export a practice file to keep your score and settings, and check available storage.")); }
  };

  const annotatedXML = useMemo(() => {
    if (!musicXML || !original) return null;
    let xml = musicXML;
    for (const number of new Set([...original.measures, ...annotations].map((a) => a.measureNumber))) {
      xml = updateMusicXMLAnnotation(xml, number, annotations.find((a) => a.measureNumber === number) ?? {});
    }
    return xml;
  }, [musicXML, original, annotations]);

  useEffect(() => {
    editRevision.current++;
    setPracticeSaved(false);
  }, [annotatedXML, seatId, instrumentKey, shift, tuning, state.tempo, state.beat, startMeasure, loopEnd, loopEnabled, practiceMode, countInBars, click, volume, midiWritten, muted, spaceRevision, settingsRevision]);

  useEffect(() => {
    if (state.status === "playing" || state.status === "waiting") { pendingSnapshot.current = null; return; }
    if (!score || busy) return;
    pendingSnapshot.current = practiceSnapshot.current();
    const timer = setTimeout(() => { void flushPracticeSnapshot(); }, 350);
    return () => clearTimeout(timer);
  }, [score, busy, state.status, recordRevision, annotatedXML, seatId, instrumentKey, shift, tuning, state.tempo, state.beat, startMeasure, loopEnd, loopEnabled, practiceMode, countInBars, click, volume, midiWritten, muted, spaceRevision, settingsRevision, libraryPage, flushPracticeSnapshot]);

  const displayXML = useMemo(() => {
    if (!musicXML || !score) return null;
    let cleanXML = musicXML;
    for (const annotation of original?.measures ?? []) cleanXML = updateMusicXMLAnnotation(cleanXML, annotation.measureNumber, {});
    const doc = new DOMParser().parseFromString(cleanXML, "application/xml");
    for (const words of doc.querySelectorAll("words")) if (words.textContent?.startsWith("ConvoCerto:")) words.remove();
    const solo = playerPart(score);
    if (solo) for (const part of doc.querySelectorAll("part, score-part")) if (part.getAttribute("id") !== (solo.sourcePartId ?? solo.id)) part.remove();
    return new XMLSerializer().serializeToString(doc);
  }, [musicXML, score, original]);

  const changeSolo = async (id: string) => {
    if (!ensembleScore) return;
    const request = ++scoreRequest.current;
    engineRef.current?.stop();
    const next = assignPerformanceSeat(ensembleScore, id);
    setBusy(text("伴奏パートを準備しています…", "Preparing your accompaniment…"));
    try {
      await audioRef.current?.prepare(next.parts, () => {
        if (mounted.current && request === scoreRequest.current) setBusy(text("音源を準備しています…", "Preparing instrument sounds…"));
      });
      if (!mounted.current || request !== scoreRequest.current) return;
      resumeBeat.current = 0;
      setSeatId(id);
      setPartRequest(0);
      setInstrumentKey(playerPart(next)?.transposeSemitones ?? 0);
      setOriginal(next);
      setLoopEnabled(false);
      setShift(0);
      const transposed = next;
      setVoiceLimited(false);
      setAudioInterrupted(false);
      setScore(transposed);
      setRestoredEnsemble(undefined); setRestoredSpace(undefined); spaceRef.current = undefined; setSessionRevision((value) => value + 1);
      setMuted([]);
      setPracticeMode("accompany"); audioRef.current?.setSoloAudible(false);
      engineRef.current?.load(transposed);
      engineRef.current?.setAnnotations(annotations);
    } catch (error) {
      if (mounted.current && request === scoreRequest.current) setError(error instanceof OrchestraAudioError ? error : musicXMLErrorMessage(error, translateRef.current("ja", "en") as "ja" | "en"));
    } finally { if (mounted.current && request === scoreRequest.current) setBusy(""); }
  };

  const partIssue = useMemo(() => score ? practicePartIssue(score) : null, [score]);
  const ensurePracticeReady = (mode = practiceMode) => {
    if (busy) return false;
    if (!musicXML || mode === "listen" || (seatConfirmed && (partIssue === null || (mode === "wait" && partIssue === "no-accompaniment")))) return true;
    const engine = engineRef.current;
    if (engine) { const beat = engine.getState().beat; engine.stop(); engine.seek(beat); }
    if (!scorePage) setScorePage(true);
    setPartRequest(value => value + 1);
    return false;
  };

  const updateAnnotations = useCallback((next: MeasureAnnotation[]) => {
    setAnnotations(next);
    engineRef.current?.setAnnotations(next);
    if (entry && !musicXML) {
      try { localStorage.setItem(`concert-plan:${entry.id}`, JSON.stringify({ version: 1, repertoireId: entry.id, annotations: next })); } catch {}
    }
  }, [entry, musicXML]);

  const editAnnotation = useCallback((measure: number, patch: Partial<MeasureAnnotation>) => {
    const next = annotations.filter((a) => a.measureNumber !== measure);
    const existing = annotations.find((a) => a.measureNumber === measure);
    const annotation = { ...existing, measureNumber: measure, ...patch };
    if (annotation.role || annotation.wait || annotation.expression || annotation.leader || annotation.memo) next.push(annotation);
    updateAnnotations(next.sort((a, b) => a.measureNumber - b.measureNumber));
  }, [annotations, updateAnnotations]);

  const activePlayback = () => state.status === "playing" || state.status === "waiting";

  const handleCommand = useCallback((command: RehearsalCommand) => {
    setNotice("");
    if (command.measureNumber != null && (!score || command.measureNumber < 1 || command.measureNumber > score.totalMeasures)) {
      setNotice(text("この楽章に含まれる再生小節を指定してください。", "Choose a bar within this movement."));
      return;
    }
    if (command.type === "set_expression" && command.expression && score) {
      const measure = command.measureNumber ?? (activePlayback() ? state.measure : editMeasure);
      const end = command.expression.endMeasure ?? measure;
      if (end < measure || end > score.totalMeasures || !score.measureNumbers.includes(measure)) { setNotice(text("この譜面に含まれる小節の区間を指定してください。", "Choose a passage within this score.")); return; }
      editAnnotation(measure, { expression: { ...command.expression, endMeasure: end } });
      setNotice(`${measure}〜${end}小節: ${expressionPresets[command.expression.preset].description}（強さ ${Math.round(command.expression.amount * 100)}%）`);
    } else if (command.type === "set_wait" && command.wait && command.measureNumber == null && score) {
      let measure = activePlayback() ? state.measure : editMeasure;
      if (command.rawText.includes("次")) {
        const current = score.measureStartBeats.reduce((found, beat, index) => beat <= state.beat ? index : found, 0);
        const next = score.measureStartBeats.findIndex((beat, index) => index > current && score.parts.some((part) => part.isSolo && part.notes.some((note) => note.startBeat >= beat && note.startBeat < (score.measureStartBeats[index + 1] ?? score.totalBeats))));
        if (next < 0) { setNotice(text("この先に奏者パートの入りが見つかりませんでした。", "There are no more entries for your part.")); return; }
        measure = score.measureNumbers[score.playbackOrder[next]];
      }
      editAnnotation(measure, { wait: command.wait });
      setNotice(`${measure}小節の頭で、演奏・うなずき・ボタンの合図を待ちます。`);
    } else if (command.type === "set_role" && command.role && command.measureNumber != null) editAnnotation(command.measureNumber, { role: command.role });
    else if (command.type === "set_wait" && command.wait && command.measureNumber != null) editAnnotation(command.measureNumber, { wait: command.wait });
    else if (command.type === "set_tempo" && command.tempo != null) {
      const tempo = command.tempoMode === "relative" ? (engineRef.current?.getState().tempo ?? 120) + command.tempo : command.tempo;
      engineRef.current?.setTempo(tempo);
    } else if (command.type === "reset") {
      engineRef.current?.stop();
      updateAnnotations([]);
      if (score) engineRef.current?.setTempo(score.tempo);
    }
  }, [score, state.measure, state.status, state.beat, editMeasure, editAnnotation, updateAnnotations]);

  const toggleMic = async () => {
    if (micStatus !== "off") {
      micRequest.current++;
      micRef.current?.stop();
      setMicStatus("off");
      setMicInputLabel("");
      return;
    }
    const request = ++micRequest.current;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(text("この環境ではマイクを使えません。HTTPSのページをChromeやSafariで開くか、Macアプリを使用してください。一定テンポでの練習は続けられます。", "Microphone access is unavailable here. Use an HTTPS page in Chrome or Safari, or the Mac app. You can still practice at a fixed tempo."));
      return;
    }
    setMicStatus("starting");
    try {
      await micRef.current?.start(micDevice);
      if (mounted.current && request === micRequest.current) {
        setMicStatus("on");
        setMicInputLabel(micRef.current?.getInputLabel() || text("機器名を取得できませんでした", "Microphone name unavailable"));
        void refreshMicrophones();
      }
    } catch (error) {
      if (mounted.current && request === micRequest.current) {
        setMicStatus("off");
        setError(error instanceof DOMException && ["OverconstrainedError", "NotFoundError"].includes(error.name) && micDevice
          ? text("選択したマイクを開始できませんでした。接続を確認し、一覧を更新して選び直してください。", "This microphone is unavailable. Check its connection, refresh the list and select it again.")
          : error instanceof DOMException && error.name === "NotSupportedError"
            ? text("この環境ではマイクの音程を解析できません。最新のChromeやSafari、またはMacアプリをお使いください。一定テンポやMIDIでの練習は続けられます。", "Microphone pitch detection is unavailable here. Use a current Chrome or Safari browser, or the Mac app. You can still practice at a fixed tempo or use MIDI.")
          : error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)
            ? text("マイクが許可されていません。Macアプリではシステム設定の「プライバシーとセキュリティ → マイク」でConvoCertoを許可してください。ブラウザではサイトのマイク許可を確認し、「マイクで演奏する」をもう一度押してください。", "Microphone access was denied. In the Mac app, allow ConvoCerto in System Settings → Privacy & Security → Microphone. In a browser, allow the microphone for this site, then try again.")
            : text("マイクを開始できませんでした。マイクの接続を確認し、別のマイクを選ぶか、もう一度お試しください。", "Could not start the microphone. Check its connection, choose another microphone or try again."));
      }
    }
  };

  const changeShift = (semitones: number) => {
    if (!original) return;
    resumeBeat.current = 0;
    const next = transposeScore(original, semitones);
    setRestoredEnsemble(undefined);
    setShift(semitones);
    setAudioInterrupted(false);
    setScore(next);
    setLoopEnabled(false);
    setPracticeMode("accompany"); audioRef.current?.setSoloAudible(false);
    engineRef.current?.load(next);
    engineRef.current?.setAnnotations(annotations);
  };

  const changeInstrument = (key: number) => {
    setInstrumentKey(key);
    changeShift(key - (original ? playerPart(original)?.transposeSemitones ?? entry?.nativeTransposition ?? key : key));
  };

  const applyLoop = (enabled: boolean, first = startMeasure, last = loopEnd) => {
    setLoopEnabled(enabled);
    engineRef.current?.setLoop(enabled ? score?.measureStartBeats[first - 1] ?? null : null, enabled ? score?.measureStartBeats[last] ?? score?.totalBeats ?? null : null);
  };

  const playExcerpt = (mode: "accompany" | "listen", fromEntry = false, withLeadIn = false) => {
    const engine = engineRef.current;
    if (!engine || !score || !ensurePracticeReady(mode)) return;
    const excerpt = fromEntry ? firstPlayerExcerpt(score, withLeadIn) : { first: startMeasure, last: Math.max(startMeasure, loopEnd) };
    if (!excerpt) return;
    setPracticeMode(mode); setCountInBars(1);
    audioRef.current?.setSoloAudible(mode === "listen");
    engine.setPracticeOptions({ mode, countInBars: 1, click });
    setStartMeasure(excerpt.first); setLoopEnd(excerpt.last);
    applyLoop(true, excerpt.first, excerpt.last);
    engine.restartFrom(score.measureStartBeats[excerpt.first - 1]);
  };

  const selectEntry = (withLeadIn: boolean) => {
    const engine = engineRef.current;
    if (!engine || !score || busy) return;
    const excerpt = firstPlayerExcerpt(score, withLeadIn);
    if (!excerpt) return;
    engine.stop();
    setStartMeasure(excerpt.first); setLoopEnd(excerpt.last);
    applyLoop(true, excerpt.first, excerpt.last);
    seekPracticeBeat(score.measureStartBeats[excerpt.first - 1]);
  };

  const exportPlan = () => {
    const data = JSON.stringify({ version: 1, repertoireId: entry?.id, annotations }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${entry?.id ?? "rehearsal"}.rehearsal.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const active = state.status === "playing" || state.status === "waiting";
  const needsPracticeInput = practiceMode === "wait" && micStatus !== "on" && !midiDevice;
  useEffect(() => {
    if (needsPracticeInput && state.status === "waiting") waitingNotice.current?.scrollIntoView({ block: "nearest" });
  }, [needsPracticeInput, state.status]);
  const useFixedTempo = () => {
    const engine = engineRef.current;
    const beat = engine?.getState().beat ?? state.beat;
    if (micStatus === "starting") {
      micRequest.current++;
      micRef.current?.stop();
      setMicStatus("off");
      setMicInputLabel("");
    }
    setPracticeMode("accompany");
    audioRef.current?.setSoloAudible(false);
    engine?.setPracticeOptions({ mode: "accompany", countInBars, click });
    seekPracticeBeat(beat);
  };
  const openPracticeInput = () => {
    const engine = engineRef.current;
    if (engine) { const beat = engine.getState().beat; engine.stop(); seekPracticeBeat(beat); }
    setInputRequested(true);
    setScorePage(false);
  };
  const solo = score ? playerPart(score) : undefined;
  const performanceSeats = useMemo(() => ensembleScore ? listPerformanceSeats(ensembleScore) : [], [ensembleScore]);
  const displaySeat = performanceSeats.find((seat) => seat.id === seatId);
  const partOptions = performanceSeats.filter(seat => seat.partId === (solo?.sourcePartId ?? solo?.id) && seat.staff != null);
  const nextNotes = solo?.notes.filter((note) => note.startBeat >= state.beat - 0.05).slice(0, 7) ?? [];
  const currentSoloNote = solo?.notes.find((note) => note.startBeat <= state.beat + 0.0001 && note.startBeat + note.durationBeats > state.beat + 0.0001);
  const sourceMeasure = score ? score.measureNumbers[score.playbackOrder[Math.max(0, score.measureStartBeats.reduce((found, beat, index) => beat <= state.beat ? index : found, 0))]] ?? 1 : 1;
  const exportAnnotatedXML = () => {
    if (!annotatedXML) return;
    const url = URL.createObjectURL(new Blob([annotatedXML], { type: "application/vnd.recordare.musicxml+xml" }));
    const link = document.createElement("a"); link.href = url; link.download = "rehearsal.musicxml"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const previewEnsemble = engineRef.current ? { tuning: engineRef.current.getTuning(), leader: engineRef.current.getLeader(), reference: engineRef.current.getReference() } : undefined;
  const pauseForPreview = () => { const engine = engineRef.current; if (!engine) return; const beat = engine.getState().beat; engine.stop(); engine.seek(beat); };
  const selectedAnnotation = annotations.find((a) => a.measureNumber === editMeasure);
  const statusText = state.countInRemaining ? text(`カウントイン ${state.countInRemaining}`, `Count-in ${state.countInRemaining}`) : practiceMode === "wait" && state.status === "waiting" ? text("正しい音を待っています", "Waiting for the written note") : { idle: text("準備完了", "Ready"), playing: text("演奏中", "Playing"), waiting: text("合図を待っています", "Waiting for your cue"), finished: text("演奏終了", "Finished") }[state.status];
  const feedback = <>
    {fileNotice && <p role="status" className="concert-message">{fileNotice}</p>}
    {busy && <p role="status" className="concert-message">{busy}</p>}
    {error && <p role="alert" className="concert-error">{error instanceof OrchestraAudioError ? orchestraAudioErrorMessage(error, locale) : error instanceof PracticeFileError ? practiceFileErrorMessage(error, locale) : error}</p>}
  </>;

  return <StageLayout locale={locale} immersive={scorePage && !!musicXML}>
    <div className={`concert studio-shell ${scorePage && musicXML ? "score-page" : ""}`} data-screen={libraryPage || !score ? "library" : scorePage ? "practice" : "settings"}>
      {score && <nav className="performance-navigation" aria-label={text("練習画面の切り替え", "Practice navigation")}><button onClick={showLibrary}>{text("‹ マイ楽譜", "‹ My scores")}</button><strong>{score.title}</strong><button aria-pressed={scorePage} disabled={!musicXML} onClick={() => setScorePage(true)}>{text("楽譜で練習", "Score")}</button><button aria-pressed={!scorePage && !libraryPage} onClick={() => setScorePage(false)}>{text("設定", "Settings")}</button><LanguageSwitcher /></nav>}
      <div className="concert-intro">
        <div><p className="concert-eyebrow">YOUR PERSONAL REHEARSAL</p><h2>{stage ? text("Step 4 — フルリハーサル", "Step 4 — Full rehearsal") : text("自分の楽譜で、練習しよう。", "Your score. Your practice.")}</h2><p>{text("MusicXMLから担当を選ぶと、残りのパートが伴奏になります。", "Open a MusicXML score. Choose your part. Play with the rest of the ensemble.")}</p></div>
        <span className="concert-badge">MusicXML · live accompaniment</span>
      </div>
      <PracticeJournal busy={!!busy} refreshKey={journalRevision} onResume={practice => loadXML(new File([practice.xml], practice.title + ".musicxml"), false, practice.session, practice.id)} />
      <section id="import-score" aria-label={text("自分の楽譜を開く", "Open your score")} className="concert-panel xml-dropzone" onDragOver={(event) => { event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (busy) return; const files = event.dataTransfer.files; if (files.length !== 1) { setError(text("楽譜ファイルを1つずつドロップしてください。", "Drop one score at a time.")); return; } void loadXML(files[0]); }}>
        <div className="import-heading"><span className="import-symbol" aria-hidden="true">↥</span><div><p className="concert-eyebrow">BRING YOUR OWN SCORE</p><h3>{text("MusicXMLの楽譜を開く", "Open a MusicXML score")}</h3><p>{text("ここにMusicXMLをドロップ、またはファイルを選択。", "Drop your score here, or choose a file.")}</p></div></div>
        <label className="import-file">{text("楽譜ファイルを選ぶ", "Choose a score")}<input aria-label={text("MusicXMLで演奏する", "Play a MusicXML score")} type="file" accept=".musicxml,.xml,.mxl" disabled={!!busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadXML(file); event.target.value = ""; }} /></label><p className="concert-muted">{text("MusicXML / XML / 圧縮MXL · ファイルはこの端末で処理します。", "MusicXML / XML / MXL · Processed on your device.")}</p>
        <details className="import-help"><summary>{text("どんな楽譜が使える？", "Which scores can I use?")}</summary><p>{text("楽譜作成ソフトから書き出した、独奏と伴奏を含む総譜を使ってください。PDF・写真には未対応です。単旋律だけの楽譜から伴奏を作曲する機能はありません。partwise / timewise形式に対応し、再現できない記譜は読み込み後に案内します。", "Export a full score from your notation app, including your part and accompaniment. MusicXML partwise and timewise formats are supported. PDFs and photos cannot be opened. A melody-only score will not create new accompaniment. Playback limitations appear after import.")}</p></details>
        {libraryVisible && (busy || error || fileNotice) && <div ref={libraryFeedback} tabIndex={-1}>{feedback}</div>}
      </section>
      <details role="region" aria-label={text("マイ楽譜", "My scores")} className="concert-panel score-library" open={library.length > 0}><summary>{text("保存した楽譜", "Saved scores")} <span>{library.length}  {text("曲", "scores")}</span></summary>
        <div className="library-heading"><div><p className="concert-eyebrow">YOUR COLLECTION</p><h3>{text("マイ楽譜", "My scores")}</h3></div><span>{library.length}  {text("曲", "scores")}</span></div>
        {!library.length && !libraryError && <p className="library-empty">{text("あなたのレパートリーを、ここに。楽譜を開いて「この練習を保存」を押すと、担当や練習区間も一緒に残せます。", "Open a score and choose Save practice to keep your part, passage and settings here.")}</p>}
        {!!library.length && !library.some(item => item.title.toLowerCase().includes(librarySearch.toLowerCase())) && <p role="status">{text(`「${librarySearch}」に一致する楽譜はありません。別の曲名で検索してください。`, `No scores match “${librarySearch}”. Try another title.`)}</p>}
        {libraryError && <div role="alert"><p>{libraryError}</p><button onClick={async () => {
          try { setLibrary(await listLibraryScores()); setLibraryError(""); }
          catch { setLibraryError(text("マイ楽譜をまだ読み込めません。現在の練習はファイルに書き出して保管できます。", "Your library is still unavailable. Export your current practice to keep a copy.")); }
        }}>{text("マイ楽譜を再読み込み", "Reload my scores")}</button></div>}
        <label>{text("練習ファイルを読み込む", "Import a practice file")}<input aria-label={text("練習ファイルを読み込む", "Import a practice file")} type="file" accept=".convo.json,.json" disabled={!!busy} onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          setUnsavedImport(null); setError("");
          try {
            const imported = await readPracticeFileUpload(file);
            try { await saveLibraryScore({ ...imported, id: crypto.randomUUID(), savedAt: new Date().toISOString() }); }
            catch { setUnsavedImport(imported); return; }
            setLibrary(await listLibraryScores()); setNotice(text("練習ファイルをマイ楽譜に追加しました。曲を押すと開けます。", "Practice added to My scores. Select it to open."));
          } catch (error) { setError(error instanceof PracticeFileError ? error : new PracticeFileError("import-failed", { cause: error })); }
        }} /></label>
        {unsavedImport && <div role="status">
          <p>{text(`「${unsavedImport.title}」は読み込めましたが、マイ楽譜に保存できませんでした。保存せずに練習できます。`, `Opened “${unsavedImport.title}”, but could not save it to My scores. You can practice without saving.`)}</p>
          <button disabled={!!busy} onClick={() => {
            const imported = unsavedImport; setUnsavedImport(null);
            setFileNotice(text("この練習はマイ楽譜に保存されていません。変更を残すには「今の練習をファイルに書き出す」を使ってください。", "This practice is not saved to My scores. Export a practice file to keep your changes."));
            void loadXML(new File([imported.xml], imported.title + ".musicxml"), false, imported.session);
          }}>{text("保存せず、この練習を開く", "Open without saving")}</button>
        </div>}
        <div className="concert-controls">
          <input aria-label={text("マイ楽譜を検索", "Search my scores")} placeholder={text("曲名で検索", "Search by title")} value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} />
          <button disabled={!annotatedXML || !!busy} onClick={() => void savePractice()}>{text("このMusicXMLをマイ楽譜に保存", "Save this MusicXML to My scores")}</button>
        </div>
        {[...library].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).filter((item) => item.title.toLowerCase().includes(librarySearch.toLowerCase())).map((item) => <div className="concert-controls" key={item.id}><button disabled={!!busy} onClick={() => void loadXML(new File([item.xml], item.title + ".musicxml"), false, item.session, item.id)}>{item.title}</button><button aria-label={text(`${item.title}の練習ファイルを書き出す`, `Export practice for ${item.title}`)} onClick={() => exportPracticeFile(item)}>{text("練習ファイルを書き出す", "Export practice file")}</button><button aria-label={text(`${item.title}をマイ楽譜から削除`, `Remove ${item.title} from My scores`)} onClick={async () => { try { await removeLibraryScore(item.id); setLibrary(await listLibraryScores()); } catch { setError(text("楽譜を削除できませんでした。", "Could not remove the score.")); } }}>{text("削除", "Remove")}</button></div>)}
        <p className="concert-muted">{text("保存先はこのブラウザです。練習ファイルを書き出すと、楽譜と保存済みの席・区間・空間配置を別のブラウザやMacアプリに持ち込めます。", "Saved on this device. Export a practice file to bring your score, part, passage and positions to another browser or the Mac app.")}</p>
      </details>
      {libraryPage && <ExpressionDemo />}
      <StarterScores busy={!!busy} onLoad={loadXML} />
      <ScoreCatalog busy={!!busy} onLoad={(file, instrument) => loadXML(file, false, undefined, undefined, false, instrument)} />
      {!libraryVisible && feedback}
      {score && <>
        <section className="concert-panel transport-panel" aria-label={text("演奏コントロール", "Playback controls")}>
          {!scorePage && <details className="performance-extras" open><summary>{text("練習メニュー", "Practice tools")}</summary>
          <PlaybackIssues key={sessionRevision} issues={playbackIssues} />
          {solo?.notes.length ? <details className="quick-rehearsal" open={!scorePage}><summary>{text("お手本と吹き比べる", "Listen, then play")}</summary>
            <div className="concert-controls"><button disabled={!!busy} onClick={() => playExcerpt("accompany", true)}>{text("自分の入りから吹く", "Play from my first entry")}</button><button disabled={!!busy} onClick={() => playExcerpt("listen")}>{text("この区間のお手本を聴く", "Listen to this passage")}</button><button disabled={!!busy} onClick={() => playExcerpt("accompany")}>{text("同じ区間を自分で吹く", "Play this passage")}</button></div>
            <button disabled={!!busy || firstPlayerExcerpt(score)?.first === 1} onClick={() => playExcerpt("accompany", true, true)}>{text("入りの1小節前から合わせる", "Start one bar before my entry")}</button>
            <p>{text("入りから4小節を選び、1小節のカウントでスタート。お手本と自分の演奏を、同じ区間でくり返せます。", "Practice four bars from your entry with a one-bar count-in. Alternate listening and playing.")}</p>
            <p className="concert-muted">{text("相手を聴いて入りたいときは「入りの1小節前から合わせる」。選んだ席の最初の入りの前に1小節を加え、自分の音を空けた伴奏でくり返します。冒頭から入る席では選べません。", "Start one bar early to hear the ensemble before joining in. Your part stays silent. Available when your part enters after the first bar.")}</p>
          </details> : null}
          <div className="practice-save"><button disabled={!musicXML || !!busy} onClick={() => void savePractice()}>{text("この練習を保存", "Save practice")}</button><button disabled={!musicXML || !!busy} onClick={() => {
            try { const practice = currentPractice(); if (practice) exportPracticeFile(practice); }
            catch { setError(text("練習ファイルを書き出せませんでした。もう一度お試しください。", "Could not export the practice file. Please try again.")); }
          }}>{text("今の練習をファイルに書き出す", "Export current practice")}</button><span role="status">{practiceSaved ? notice : ""}</span></div>
          </details>}
          {voiceLimited && <p role="status" className="concert-message">{text("同時発音の上限に達したため、一部の音を省略しました。奏者数や担当パートの重複を減らしてください。", "Some notes were skipped at the voice limit. Try fewer players or duplicated parts.")}<button onClick={() => setVoiceLimited(false)}>{text("閉じる", "Dismiss")}</button></p>}
          {audioInterrupted && <div role="alert" className="concert-message">
            <p>{text("音声が中断されたため、この位置で停止しました。出力先を確認して再開してください。", "Audio was interrupted. Your position is kept. Check your output device, then resume.")}</p>
            <button disabled={!!busy} onClick={async () => {
              setBusy(text("音声を再開しています…", "Restoring audio…")); setError("");
              try { await audioRef.current?.resume(); if (mounted.current && ensurePracticeReady()) { setAudioInterrupted(false); engineRef.current?.start(); } }
              catch (error) { if (mounted.current) setError(error instanceof OrchestraAudioError ? error : new OrchestraAudioError("resume-failed", { cause: error })); }
              finally { if (mounted.current) setBusy(""); }
            }}>{text("音声を復旧して再開", "Restore audio and resume")}</button>
          </div>}
          {needsPracticeInput && <section ref={waitingNotice} className="wait-input-recovery" aria-label={text("練習に必要な入力", "Input needed for this practice")}>
            <p role="status">{text("正しい音を待つ練習には、マイクかMIDIが必要です。入力を接続するか、一定テンポに切り替えてから演奏を始めてください。", "Waiting for written notes needs a microphone or MIDI device. Connect an input, or switch to a fixed tempo before playing.")}</p>
            <div><button disabled={!!busy} onClick={useFixedTempo}>{text("一定テンポで練習", "Practise at a fixed tempo")}</button><button disabled={!!busy} onClick={openPracticeInput}>{text("入力を接続", "Connect an input")}</button></div>
          </section>}
          {audioRef.current && <EnsemblePresence onOpenSpace={openSpace} audio={audioRef.current} state={state} parts={score.parts} nextEntry={currentSoloNote ? state.beat : nextNotes[0]?.startBeat} beatUnit={4 / (score.timeSignatureChanges.filter(event => event.beatPosition <= state.beat).at(-1)?.beatType ?? score.timeSignature.beatType)} onCue={() => engineRef.current?.cue()} canCue={practiceMode !== "wait"} inputConnected={micStatus === "on" || !!midiDevice} cameraEnabled={camera}/> }
          {scorePage && musicXML && <StudioControls key={`studio-${practiceId.current}`} state={state} busy={!!busy} mode={practiceMode} partName={solo ? performanceName(solo, locale) : text("担当を選ぶ", "Choose your part")} inputLabel={midiDevice ? text("MIDI接続中", "MIDI connected") : micStatus === "on" ? reading ? text(`マイク · ${midiToNoteName(reading.midi - instrumentKey)}を検出`, `Microphone · ${midiToNoteName(reading.midi - instrumentKey)}`) : text("マイク接続中 · 音を待っています", "Microphone connected · Play a note") : needsPracticeInput ? text("入力なし · マイクかMIDIが必要です", "Input needed · Connect mic or MIDI") : text("入力なし · 一定テンポで演奏", "Fixed tempo · Microphone off")} initialSetup={!seatConfirmed} partRequest={partRequest} onConfirmPart={() => { setSeatConfirmed(true); setPartRequest(0); }}
            onPlay={() => { const engine = engineRef.current; if (!engine) return; if (active && practiceMode !== "listen") { engine.stop(); return; } if (!ensurePracticeReady(practiceMode === "listen" ? "accompany" : practiceMode)) return; if (practiceMode === "listen") { const beat = state.beat; engine.setPracticeOptions({ mode: "accompany", countInBars, click }); engine.seek(beat); setPracticeMode("accompany"); audioRef.current?.setSoloAudible(false); } engine.start(); }}
            onListen={() => { const engine = engineRef.current; if (!engine) return; if (active && practiceMode === "listen") { engine.stop(); return; } const beat = state.beat; engine.setPracticeOptions({ mode: "listen", countInBars: 0, click: false }); engine.seek(beat); setPracticeMode("listen"); audioRef.current?.setSoloAudible(true); engine.start(); }}
            onTempo={tempo => engineRef.current?.setTempo(tempo)} loop={loopEnabled} first={startMeasure} last={loopEnd} total={score.playbackOrder.length} repeated={score.playbackOrder.length !== score.totalMeasures} entryRange={firstPlayerExcerpt(score)} hasAccompaniment={partIssue !== "no-accompaniment"} onSelectEntry={selectEntry} onRange={(first, last) => { setStartMeasure(first); setLoopEnd(last); applyLoop(loopEnabled, first, last); }} onLoop={enabled => { applyLoop(enabled); if (enabled) seekPracticeBeat(score.measureStartBeats[startMeasure - 1]); }}
            countIn={countInBars} onCountIn={bars => { setCountInBars(bars); engineRef.current?.setPracticeOptions({ mode: practiceMode, countInBars: bars, click }); }}
            volume={volume} onVolume={value => { setVolume(value); audioRef.current?.setVolume(value / 100); }} onRestart={() => {
              const engine = engineRef.current;
              if (!engine || audioInterrupted || !ensurePracticeReady()) return;
              const beat = score.measureStartBeats.reduce((found, beat) => beat <= state.beat ? beat : found, 0);
              const bars = Math.max(1, countInBars);
              setCountInBars(bars); setLoopEnabled(false); engine.setLoop(null, null);
              engine.setPracticeOptions({ mode: practiceMode, countInBars: bars, click }); engine.restartFrom(beat);
            }}
            saved={practiceSaved} onSave={() => void savePractice()} onExportXML={exportAnnotatedXML} onExport={() => { const practice = currentPractice(); if (practice) exportPracticeFile(practice); }} onSettings={() => setScorePage(false)}
            partPicker={<div className="studio-part-picker"><label>{text("担当パート", "Your part")}<select aria-label={text("奏者パート", "Your part")} disabled={!!busy || active} value={seatId} onChange={event => void changeSolo(event.target.value)}>{performanceSeats.map(seat => <option key={seat.id} value={seat.id}>{performanceName(seat, locale)}</option>)}</select></label><PartPracticeHelp issue={partIssue} staffChoices={partOptions.filter(seat => seat.voice == null)} hasVoices={partOptions.length > 0} disabled={!!busy || active} onChooseStaff={id => void changeSolo(id)} /><AcousticSetup instrumentKey={instrumentKey} onInstrument={changeInstrument} disabled={!!busy} micStatus={micStatus} onMic={() => void toggleMic()} reading={reading} level={micLevel} inputLabel={micInputLabel} expectedPitch={solo?.notes[0]?.pitch} tuning={tuning} active={active} device={micDevice} devices={micDevices} deviceNotice={micDeviceNotice} onDevice={setMicDevice} onRefresh={() => void refreshMicrophones()} /><details className="studio-other-input"><summary>{text("MIDI・一定テンポで練習する", "MIDI or fixed-tempo practice")}</summary><p>{text("マイクを接続しなくても、一定テンポの伴奏で練習できます。", "You can play with fixed-tempo accompaniment without a microphone.")}</p><button onClick={() => setScorePage(false)}>{text("MIDI・移調の設定", "MIDI and transposition settings")}</button></details></div>}>
            <ExpressionPreview score={score} measure={sourceMeasure} annotations={annotations} ensemble={previewEnsemble} space={spaceRef.current} tempo={engineRef.current?.getBaseTempo()} mutedParts={muted} tuningHz={tuning} volume={volume / 100} disabled={!!busy || active || !scorePage} onBeforePlay={pauseForPreview} onApply={patch => editAnnotation(sourceMeasure, patch)} />
          </StudioControls>}
          {scorePage && <div className="studio-progress"><span className="status-pill" role="status">{statusText}</span><span>{state.measure} / {score.totalMeasures}</span><input aria-label={text("演奏位置", "Playback position")} type="range" min="0" max={score.totalBeats} step="0.25" value={state.beat} onChange={event => seekPracticeBeat(Number(event.target.value))}/></div>}
          {scorePage && <PlaybackIssues key={sessionRevision} issues={playbackIssues} />}
          {journalError && <p role="status" className="concert-message">{journalError}</p>}
          {!scorePage && <>
          <div className="concert-now"><div><p className="concert-eyebrow">NOW REHEARSING</p><h3>{entry?.composer} · {entry?.movement}</h3></div><span role="status" className={`status-pill ${state.status}`}>{statusText}</span></div>
          <div className="concert-controls">
            <button className="concert-primary" disabled={!!busy} onClick={() => { if (active) engineRef.current?.stop(); else if (ensurePracticeReady()) engineRef.current?.start(); }}>{active ? text("■ 停止", "■ Stop") : text("▶ 演奏開始", "▶ Play")}</button>
            {practiceMode !== "wait" && <button disabled={!!busy || audioInterrupted} title={text("今の小節の頭へ戻り、1小節以上のカウントで再開します", "Restart this bar with at least one bar of count-in")} onClick={() => {
              const engine = engineRef.current;
              if (!engine || !ensurePracticeReady()) return;
              const beat = score.measureStartBeats.reduce((found, beat) => beat <= state.beat ? beat : found, 0);
              const bars = Math.max(1, countInBars);
              setCountInBars(bars); setLoopEnabled(false);
              engine.setLoop(null, null);
              engine.setPracticeOptions({ mode: practiceMode, countInBars: bars, click });
              engine.restartFrom(beat);
            }}>{text("この小節から入り直す", "Restart this bar")}</button>}
            <button onClick={() => {
              if (!ensurePracticeReady()) return;
              const index = score.measureStartBeats.reduce((found, beat, index) => beat <= state.beat ? index : found, 0);
              const first = index + 1; const last = Math.min(score.totalMeasures, first + 3);
              setStartMeasure(first); setLoopEnd(last); applyLoop(true, first, last);
              seekPracticeBeat(score.measureStartBeats[index]); if (!active) engineRef.current?.start();
            }}>{text("今の4小節をくり返す", "Loop the next four bars")}</button>
            {state.status === "waiting" && practiceMode !== "wait" && <button className="concert-primary" onClick={() => engineRef.current?.cue()}>{text("合図して再開", "Cue and continue")}</button>}
            <label>{text("練習モード", "Practice mode")}<select aria-label={text("練習モード", "Practice mode")} disabled={active || !!busy} value={practiceMode} onChange={(event) => {
              const mode = event.target.value as typeof practiceMode; setPracticeMode(mode); audioRef.current?.setSoloAudible(mode === "listen"); engineRef.current?.setPracticeOptions({ mode, countInBars, click });
            }}><option value="accompany">{text("共奏・入力に追従", "Accompany · Follow my playing")}</option><option value="listen">{text("お手本を聴く（全パート）", "Listen to all parts")}</option><option value="wait">{text("正しい音を吹くまで待つ", "Wait for the written note")}</option></select></label>
            <label>{text("カウントイン", "Count-in")}<select aria-label={text("カウントイン", "Count-in")} disabled={active || !!busy} value={countInBars} onChange={(event) => { const bars = Number(event.target.value); setCountInBars(bars); engineRef.current?.setPracticeOptions({ mode: practiceMode, countInBars: bars, click }); }}><option value={0}>{text("なし", "None")}</option><option value={1}>{text("1小節", "1 bar")}</option><option value={2}>{text("2小節", "2 bars")}</option></select></label>
            <button aria-pressed={click} disabled={active || !!busy} onClick={() => { setClick(!click); engineRef.current?.setPracticeOptions({ mode: practiceMode, countInBars, click: !click }); }}>{text("メトロノーム", "Metronome")} {click ? "ON" : "OFF"}</button>
            <label>{text("伴奏の役割", "Accompaniment role")}<select aria-label={text("伴奏の役割", "Accompaniment role")} value={state.mode} onChange={(event) => { updateAnnotations(annotations.map((a) => ({ measureNumber: a.measureNumber, wait: a.wait, expression: a.expression, leader: a.leader, memo: a.memo })).filter((a) => a.wait || a.expression || a.leader || a.memo)); engineRef.current?.setMode(event.target.value as "lead" | "follow"); }}><option value="lead">{text("AIがリード", "Ensemble leads")}</option><option value="follow" disabled={!solo}>{text("奏者に追従", "Follow the player")}</option></select></label>
            <label>{text("テンポ", "Tempo")} <span className="tempo-number">{Math.round(state.tempo)} BPM</span><input aria-label={text("演奏テンポ", "Playback tempo")} type="range" min={20} max={240} step={1} value={Math.min(240, state.tempo)} onChange={(event) => engineRef.current?.setTempo(Number(event.target.value))} /></label>
            <label>{text("伴奏音量", "Accompaniment volume")} {volume}%<input aria-label={text("伴奏音量", "Accompaniment volume")} type="range" min={0} max={100} value={volume} onChange={(event) => { setVolume(Number(event.target.value)); audioRef.current?.setVolume(Number(event.target.value) / 100); }} /></label>
          </div>
            <div className="concert-progress"><span>{text("再生小節", "Playback bar")} {state.measure} / {score.totalMeasures}</span><span className="score-event-status">{currentSoloNote ? text(`演奏 · ${midiToNoteName(currentSoloNote.pitch - instrumentKey)}`, `Play · ${midiToNoteName(currentSoloNote.pitch - instrumentKey)}`) : text("休符", "Rest")}</span><input aria-label={text("演奏位置", "Playback position")} type="range" min={0} max={score.totalBeats} step={0.25} value={state.beat} onChange={(event) => seekPracticeBeat(Number(event.target.value))} /><span>{Math.round(state.beat / score.totalBeats * 100)}%</span></div>
          <div id="live-nuance"/>
          <div className="concert-controls small-controls">

            <label>{text("開始小節", "Start bar")}<input aria-label={text("開始小節", "Start bar")} type="number" min={1} max={score.totalMeasures} value={startMeasure} onChange={(event) => { const value = Math.max(1, Math.min(score.totalMeasures, Number(event.target.value) || 1)); setStartMeasure(value); applyLoop(false); }} /></label>
            <button onClick={() => seekPracticeBeat(score.measureStartBeats[startMeasure - 1])}>{text("ここから練習", "Play from here")}</button>
            <label>{text("終了小節", "End bar")}<input aria-label={text("終了小節", "End bar")} type="number" min={startMeasure} max={score.totalMeasures} value={loopEnd} onChange={(event) => { setLoopEnd(Math.max(startMeasure, Math.min(score.totalMeasures, Number(event.target.value) || startMeasure))); applyLoop(false); }} /></label>
            <button aria-pressed={loopEnabled} disabled={loopEnd < startMeasure} onClick={() => applyLoop(!loopEnabled)}>{loopEnabled ? text("ループ ON", "Loop on") : text("区間をループ", "Loop passage")}</button>
            {solo && <button onClick={() => { const note = solo.notes.find((n) => n.startBeat >= state.beat + 0.1); if (note) seekPracticeBeat(Math.max(0, note.startBeat - 2)); }}>{text("次のソロへ", "Next entry")}</button>}
          </div>
          </>}
        </section>
        <details ref={spacePanel} className="concert-panel studio-settings"><summary>{text("伴奏の音色・配置", "Ensemble sound and positions")}</summary>{audioRef.current && <OrchestraStage key={`${sessionRevision}:${score.title}:${score.parts.map((part) => part.id).join(":")}`} initialSpace={restoredSpace} onSpaceChange={rememberSpace} mutedParts={muted} parts={score.parts} audio={audioRef.current} beat={state.beat} active={active} />}</details>
        <div className="concert-workspace">
          <section ref={inputPanel} tabIndex={-1} className="concert-panel" aria-label={text("楽器入力", "Instrument input")}>
            <p className="concert-eyebrow">LISTEN TO YOU</p><h3>{text("あなたの楽器 ·", "Your instrument ·")} {solo ? performanceName(solo, locale) : text("担当パート", "Your part")}</h3>
            <p className="concert-muted">{text("マイクは単音の旋律に追従します。ピアノなどの和音入力にはMIDIを使用してください。無音程の打楽器の音声追従は未対応です。伴奏を拾わないようヘッドホンで演奏してください。", "Use headphones so the microphone hears your instrument. Microphone following supports a single melody line, not unpitched percussion. Use MIDI for chords.")}</p>
            <div className="concert-controls"><label>{text("使用するマイク", "Microphone")}<select aria-label={text("使用するマイク", "Microphone")} value={micDevice} disabled={micStatus !== "off"} onChange={(event) => setMicDevice(event.target.value)}><option value="">{text("システム既定のマイク", "System default microphone")}</option>{micDevices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}{micDevice && !micDevices.some((device) => device.id === micDevice) && <option value={micDevice}>{text("選択中のマイク（一覧にありません）", "Selected microphone (unavailable)")}</option>}</select></label><button onClick={() => void refreshMicrophones()}>{text("マイク一覧を更新", "Refresh microphones")}</button></div>
            {micDeviceNotice && <p className="concert-muted" role="status">{micDeviceNotice}</p>}
            {micStatus === "on" && <p className="concert-muted" role="status">{text("使用中のマイク:", "Active microphone:")} {micInputLabel}{text("。変更するにはマイクを停止してください。", ". Stop the microphone to change it.")}</p>}
            <div className="concert-controls"><button className={micStatus === "on" ? "concert-primary" : ""} aria-pressed={micStatus === "on"} onClick={() => void toggleMic()}>{micStatus === "on" ? text("マイクを停止", "Stop microphone") : micStatus === "starting" ? text("マイク準備をキャンセル", "Cancel microphone setup") : text("マイクで演奏する", "Connect microphone")}</button><span className="pitch-reading" aria-live="off">{reading ? `${midiToNoteName(reading.midi - instrumentKey)} ${reading.cents >= 0 ? "+" : ""}${Math.round(reading.cents)}¢` : "—"}</span></div>
            <div className="level-meter" aria-label={text("マイク音量", "Microphone level")}><div style={{ width: `${Math.min(100, micLevel * 500)}%` }} /></div>
            <div className="concert-controls">
              <label>{text("使用する楽器", "Instrument key")}<select aria-label={text("使用する楽器", "Instrument key")} value={instrumentKey} onChange={(event) => changeInstrument(Number(event.target.value))}>{instrumentTranspositions.map((item) => <option key={item.semitones} value={item.semitones}>{text(item.label, item.labelEn)}</option>)}{!instrumentTranspositions.some((item) => item.semitones === instrumentKey) && <option value={instrumentKey}>{text("譜面指定（", "From score (")}{instrumentKey}{text("半音）", "semitones)")}</option>}</select></label>
              <label>{text("伴奏の移調", "Accompaniment transposition")}<select aria-label={text("伴奏の移調", "Accompaniment transposition")} value={shift} onChange={(event) => changeShift(Number(event.target.value))}>{Array.from({ length: 49 }, (_, i) => i - 24).map((n) => <option key={n} value={n}>{n > 0 ? "+" : ""}{n}  {text("半音", "semitones")}{n === 0 ? text("（原調）", "(original key)") : ""}</option>)}</select></label>
              <label>{text("基準ピッチ", "Tuning pitch")}<input aria-label={text("基準ピッチ", "Tuning pitch")} type="number" min={430} max={450} value={tuning} onChange={(event) => { const value = Math.max(430, Math.min(450, Number(event.target.value) || 440)); setTuning(value); if (micRef.current) micRef.current.tuning = value; audioRef.current?.setTuning(value); }} /> Hz</label>
            </div>
            <p className="concert-muted">{text("楽器を変えると、同じ運指の譜面で吹けるよう伴奏も移調します。移調済みの譜面を使う場合は「伴奏の移調」を原調に戻してください。", "Changing instrument key also transposes the accompaniment to keep your written notes. If your score is already transposed, reset accompaniment transposition to the original key.")}</p>
            <details open><summary>{text("MIDI / ClariMate を使う", "Use MIDI / ClariMate")}</summary><ol className="input-checks" aria-label={text("ClariMate接続チェック", "MIDI connection check")}><li>{midiDevice ? text("✓ 機器を選択済み", "✓ Device selected") : text("1. ClariMate / MIDIを接続して機器を選ぶ", "1. Connect and select your MIDI device")}</li><li>{midiDevice && lastMidi ? text("✓ 音符を受信しました", "✓ Note received") : text("2. 一音吹いて、音符の受信を確認", "2. Play a note to check input")}</li><li>{state.inputFeedback === "matched" ? text("✓ 演奏中の音が譜面と一致しました", "✓ Your note matched the score") : text("3. 正しい音を待つモードで譜面の音を吹く", "3. Try Wait for the written note mode")}</li></ol><div className="concert-controls"><button onClick={async () => {
              await midiRef.current?.init();
              const inputs = midiRef.current?.getInputDevices() ?? []; setDevices(inputs);
              const preferred = inputs.find((device) => /clari.?mate/i.test(device.name)) ?? (inputs.length === 1 ? inputs[0] : undefined);
              if (preferred) { midiRef.current?.selectInput(preferred.id); setMidiDevice(preferred.id); setMidiNotice(text(`${preferred.name}を選択しました。音を吹いて受信を確認してください。`, `${preferred.name} selected. Play a note to check input.`)); }
              else setMidiNotice(inputs.length ? text("使用するMIDI機器を選んでください。ClariMateがなければUSBモードと接続を確認してください。", "Select your MIDI device. For ClariMate, check the connection and USB mode.") : text("MIDI機器が見つかりません。接続・USBモード・ブラウザのMIDI許可を確認してください。", "No MIDI device found. Check the connection, USB mode and browser MIDI permission."));
            }}>{text("ClariMate / MIDIを接続", "Connect MIDI / ClariMate")}</button><select aria-label={text("MIDI機器", "MIDI device")} value={midiDevice} onChange={(event) => { setMidiDevice(event.target.value); midiRef.current?.selectInput(event.target.value); setLastMidi(null); setBreath(null); setMidiNotice(event.target.value ? text("MIDI機器を選択しました。音を吹いて受信を確認してください。", "MIDI selected. Play a note to check input.") : text("MIDI機器を選択してください。", "Select a MIDI device.")); }}><option value="">{text("機器を選択", "Select device")}</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select><label>{text("MIDIの音高", "MIDI pitch")}<select aria-label={text("MIDIの音高", "MIDI pitch")} value={midiWritten ? "written" : "concert"} onChange={(event) => setMidiWritten(event.target.value === "written")}><option value="concert">{text("実音", "Concert pitch")}</option><option value="written">{text("記譜音（選択した楽器の移調を適用）", "Written pitch (apply instrument transposition)")}</option></select></label><button aria-pressed={midiMonitor} onClick={async () => { try { if (!midiMonitor) await midiRef.current?.initAudio(); midiRef.current?.setLocalSoundEnabled(!midiMonitor); setMidiMonitor(!midiMonitor); } catch { setMidiNotice(text("試聴音を開始できませんでした。", "Could not start the input sound.")); } }}>{text("MIDI入力の試聴（電子音）", "Hear MIDI input")} {midiMonitor ? "ON" : "OFF"}</button></div><p className="concert-muted">{midiNotice}</p><p aria-live="polite" className="midi-reading">{lastMidi ? `${text("受信: 記譜", "Received: written")} ${midiToNoteName(lastMidi.note - instrumentKey)} / ${text("実音", "concert")} ${midiToNoteName(lastMidi.note)} · ${text("強さ", "velocity")} ${lastMidi.velocity} · ${lastMidi.type === "noteon" ? text("発音", "note on") : text("離鍵", "note off")}` : text("MIDI入力を待っています", "Waiting for MIDI input")}</p><label className="breath-display">{text("息のコントロール", "Breath control")} {breath ? `CC${breath.controller} · ${breath.value}/127` : text("CC2 / CC11 受信待ち", "Waiting for CC2 / CC11")}<meter aria-label={text("ClariMateの息", "Breath level")} min={0} max={127} value={breath?.value ?? 0} /></label><p className="concert-muted">{text("試聴をONにすると、息に合わせて電子音の音量が変わります。CC2を優先し、CC2が届く前はCC11を使います。息を送らない機器は発音時の強さで鳴ります。音色の連続変化は未対応です。", "With input sound on, breath changes its volume. CC2 takes priority over CC11. Devices without breath control use note velocity. Continuous timbre changes are not supported.")}</p><p className="concert-muted">{text("まず「正しい音を吹くまで待つ」で入力を確認し、次に「共奏・入力に追従」へ。機器自身の音を聴く場合、試聴はOFFにしてください。", "Check input with Wait for the written note, then try Accompany. Turn input sound off if your device already makes sound.")}</p></details>
            <p className="concert-muted">{text("表情:", "Expression:")} {state.expression || text("譜面の表情", "As written")}  {text("· 入力の強弱・音の切り方も、追従の強さに応じて伴奏へ反映します。", "· Your dynamics and note releases shape the accompaniment according to the follow setting.")}</p>
            <p className="concert-muted">{text("直近の入力:", "Last input:")} {state.inputFeedback === "matched" ? text("譜面と照合できました", "Matched the score") : state.inputFeedback === "unmatched" ? text("照合できませんでした", "No match") : text("入力待ち", "Waiting for input")}</p>
            <p className="concert-muted">{text("追従状態:", "Following:")} {state.matchedBeat == null ? text("最初の音を待っています", "Waiting for your first note") : text(`一致した位置 ${state.matchedBeat.toFixed(1)}拍 · 確信度 ${Math.round(state.confidence * 100)}%`, `Matched beat ${state.matchedBeat.toFixed(1)} · Confidence ${Math.round(state.confidence * 100)}%`)}</p>
            {!solo && <p className="concert-message">{text("このデータは伴奏のみです。テンポを設定して演奏できます。", "This score contains accompaniment only. Set a tempo and play along.")}</p>}
          </section>
          <section className="concert-panel" aria-label={text("伴奏パート", "Accompaniment parts")}>
            <p className="concert-eyebrow">YOUR ENSEMBLE</p><h3>{entry?.ensemble === "orchestra" ? text("オーケストラ", "Orchestra") : text("ピアニスト", "Accompaniment")}</h3>
            <p className="concert-muted">{text("選択した奏者パートの音は伴奏から除外します。", "Your selected part is left out of the accompaniment.")}</p>
            {ensembleScore && <label>{text("あなたが入る席", "Your part")}<select aria-label={text("奏者パート", "Your part")} disabled={!!busy || active} value={seatId} onChange={(event) => void changeSolo(event.target.value)}>{performanceSeats.map((seat) => <option key={seat.id} value={seat.id}>{performanceName(seat, locale)}</option>)}</select></label>}
            {solo?.sourcePartId && <p className="concert-muted">{text("選んだ声部だけを空け、同じパートの他の声部は演奏します。譜面は元のパートをまとめて表示します。声部番号と1番・2番の対応は譜面で確認してください。", "Only your selected voice is muted; the other voices still play. The notation shows the combined part. Check the score to identify which player each voice represents.")}</p>}

            {score.parts.map((part, index) => !part.isSolo && <div className="part-row" key={part.id}><span>{performanceName(part, locale)}</span><button aria-label={text(`${performanceName(part, locale)}を${muted.includes(index) ? "再生" : "ミュート"}`, `${muted.includes(index) ? "Unmute" : "Mute"} ${performanceName(part, locale)}`)} aria-pressed={muted.includes(index)} onClick={() => { const next = muted.includes(index) ? muted.filter((i) => i !== index) : [...muted, index]; setMuted(next); audioRef.current?.setPartVolume(index, next.includes(index) ? 0 : 1); }}>{muted.includes(index) ? "OFF" : "ON"}</button></div>)}
            {nextNotes.length > 0 && <><h4>{text("次の音（記譜音）", "Next notes (written pitch)")}</h4><div className="next-notes">{nextNotes.map((note, i) => <span key={i}>{midiToNoteName(note.pitch - instrumentKey)}</span>)}</div></>}
            <p className="concert-muted">{musicXML ? text("MusicXMLを演奏の元データとして使用中。反復は展開して再生します。", "Playing from MusicXML, including encoded repeats. ") : text("内蔵楽章はMIDI由来の演奏データを使用しています。", "This movement uses MIDI-derived performance data. ")}{text("フェルマータや反復によって、お手元の版の小節番号と異なる場合があります。", "Playback bar numbers may differ from your edition because of repeats or fermatas.")}</p>
          </section>
        </div>
        <details className="concert-panel studio-settings" aria-label={text("リハーサル設計", "Rehearsal directions")}><summary>{text("小節ごとの指示・読み込みと書き出し", "Bar directions and rehearsal files")}</summary>
          <div className="concert-now"><div><p className="concert-eyebrow">SHAPE THE PERFORMANCE</p><h3>{text("ここは任せる。ここは待って。", "Shape the next phrase.")}</h3></div><button onClick={() => setRehearsal(!rehearsal)} aria-pressed={rehearsal}>{text("リハーサルコマンド", "Rehearsal commands (Japanese)")}</button></div>
          <div className="concert-controls">
            <label>{text("再生小節", "Playback bar")}<input aria-label={text("編集する小節", "Bar to edit")} type="number" min={1} max={score.totalMeasures} value={editMeasure} onChange={(event) => setEditMeasure(Math.max(1, Math.min(score.totalMeasures, Number(event.target.value) || 1)))} /></label>
            <label>{text("ここからの役割", "Role from here")}<select aria-label={text("小節の役割", "Bar role")} value={selectedAnnotation?.role?.mode ?? "inherit"} onChange={(event) => editAnnotation(editMeasure, { role: event.target.value === "inherit" ? undefined : roleDirective(event.target.value as "lead" | "follow", "moderate") })}><option value="inherit">{text("前の設定を引き継ぐ", "Keep previous setting")}</option><option value="lead">{text("AIがリード", "Ensemble leads")}</option><option value="follow">{text("奏者に追従", "Follow the player")}</option></select></label>
            <label>{text("小節の入り", "Bar entry")}<select aria-label={text("小節の入り", "Bar entry")} value={selectedAnnotation?.wait ? selectedAnnotation.wait.duration ? "timed" : "cue" : "continue"} onChange={(event) => editAnnotation(editMeasure, { wait: event.target.value === "continue" ? undefined : event.target.value === "timed" ? { type: "wait", duration: 2 } : { type: "listen" } })}><option value="continue">{text("そのまま進む", "Continue")}</option><option value="cue">{text("演奏・うなずき・ボタンの合図を待つ", "Wait for an enabled cue")}</option><option value="timed">{text("指定秒数待つ", "Wait for a set time")}</option></select></label>
            {selectedAnnotation?.wait?.duration != null && <label>{text("待機秒数", "Wait in seconds")}<input aria-label={text("待機秒数", "Wait in seconds")} type="number" min={0.5} max={30} step={0.5} value={selectedAnnotation.wait.duration} onChange={(event) => editAnnotation(editMeasure, { wait: { type: "wait", duration: Math.max(0.5, Math.min(30, Number(event.target.value) || 0.5)) } })} /></label>}
            <label>{text("ここからの主導者", "Leader from here")}<select aria-label={text("ここからの主導者", "Leader from here")} value={selectedAnnotation?.leader ?? ""} onChange={(event) => editAnnotation(editMeasure, { leader: event.target.value || undefined })}>
              <option value="">{text("前の設定を引き継ぐ", "Keep previous setting")}</option><option value="player">{text("あなた", "You")}</option><option value="conductor">{text("指揮者・全体の拍", "Conductor · Ensemble beat")}</option>{score.parts.filter((part) => !part.isSolo).map((part) => <option key={part.id} value={part.id}>{performanceName(part, locale)}</option>)}
            </select></label>
            <label>{text("この区間の表情", "Passage expression")}<select aria-label={text("この区間の表情", "Passage expression")} value={selectedAnnotation?.expression?.preset ?? ""} onChange={(event) => editAnnotation(editMeasure, { expression: event.target.value ? { preset: event.target.value as keyof typeof expressionPresets, amount: selectedAnnotation?.expression?.amount ?? 0.6, endMeasure: selectedAnnotation?.expression?.endMeasure ?? editMeasure } : undefined })}>
              <option value="">{text("譜面どおり", "As written")}</option>{Object.entries(expressionPresets).map(([key, value]) => <option key={key} value={key}>{text(value.label, expressionPresetLabelsEn[key as keyof typeof expressionPresetLabelsEn])}</option>)}
            </select></label>
            {selectedAnnotation?.expression && <>
              <label>{text("表情の強さ", "Expression amount")} {Math.round(selectedAnnotation.expression.amount * 100)}%<input aria-label={text("表情の強さ", "Expression amount")} type="range" min={0} max={1} step={0.05} value={selectedAnnotation.expression.amount} onChange={(event) => editAnnotation(editMeasure, { expression: { ...selectedAnnotation.expression!, amount: Number(event.target.value) } })} /></label>
              <label>{text("表情の終了小節", "Expression end bar")}<input aria-label={text("表情の終了小節", "Expression end bar")} type="number" min={editMeasure} max={score.totalMeasures} value={selectedAnnotation.expression.endMeasure ?? editMeasure} onChange={(event) => editAnnotation(editMeasure, { expression: { ...selectedAnnotation.expression!, endMeasure: Math.max(editMeasure, Math.min(score.totalMeasures, Number(event.target.value) || editMeasure)) } })} /></label>
              <span>{expressionPresets[selectedAnnotation.expression.preset].description}</span>
            </>}
            <button onClick={() => { seekPracticeBeat(score.measureStartBeats[score.playbackOrder.findIndex((slot) => score.measureNumbers[slot] === editMeasure)] ?? 0); }}>{text("この小節へ", "Go to this bar")}</button>
            <button onClick={() => setCamera(!camera)} aria-pressed={camera}>{camera ? text("カメラを停止", "Stop camera") : text("うなずきで合図する", "Enable nod cues")}</button>
            <button onClick={exportPlan}>{text("練習設定を保存", "Export rehearsal settings")}</button>
            <label>{text("練習設定を読み込む", "Import rehearsal settings")}<input aria-label={text("練習設定を読み込む", "Import rehearsal settings")} type="file" accept=".json" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file || !entry) return;
              try { updateAnnotations(readRehearsalPlan(await file.text(), entry.id, score.totalMeasures)); setNotice(text("練習設定を読み込みました。", "Rehearsal settings imported.")); }
              catch (error) { setError(error instanceof Error ? error.message : text("設定を読み込めませんでした。", "Could not read these settings.")); }
              event.target.value = "";
            }} /></label>
          </div>
          {musicXML && <button onClick={exportAnnotatedXML}>{text("指示付きMusicXMLを保存", "Export annotated MusicXML")}</button>}
          <div className="annotation-list">{annotations.map((annotation) => <button key={annotation.measureNumber} onClick={() => setEditMeasure(annotation.measureNumber)}>{text("再生小節", "Playback bar")} {annotation.measureNumber}{annotation.expression?.endMeasure != null ? `〜${annotation.expression.endMeasure}` : ""} · {annotation.expression ? text(expressionPresets[annotation.expression.preset].label, expressionPresetLabelsEn[annotation.expression.preset]) + " " : ""}{annotation.role?.mode === "lead" ? text("リード", "Lead") : annotation.role ? text("追従", "Follow") : ""}{annotation.wait ? annotation.wait.duration ? text(` ${annotation.wait.duration}秒待機`, ` Wait ${annotation.wait.duration}s`) : text("合図待ち", "Waiting for a cue") : ""}</button>)}</div>
          {notice && <p role="status">{notice}</p>}
          {rehearsal && <VoiceCommandPanel isActive={rehearsal} onCommand={handleCommand} language="ja" />}
          {camera && <PoseDetectorView isActive={camera} locale={locale} />}
        </details>
        {engineRef.current && <EnsembleLab key={`${entry?.id}:${seatId}`} engine={engineRef.current} initialEnsemble={restoredEnsemble} score={score} annotations={annotations} state={state} disabled={!!busy} seatId={seatId} />}
        {musicXML && <section className="concert-panel score-stage-sheet">
          <ScoreDisplay key={`score-${sessionRevision}`} compact={scorePage} extraTools={<ScoreKeyControl xml={musicXML} partId={solo?.sourcePartId ?? solo?.id} disabled={!!busy || active} onApply={async fifths => {
            const practice = currentPractice();
            if (!practice?.session) return;
            const partId = solo?.sourcePartId ?? solo?.id;
            const key = writtenScoreKey(practice.xml, partId);
            const xml = transposeMusicXMLKey(practice.xml, { ...key, fifths }, partId);
            parseMusicXML(xml);
            await loadXML(new File([xml], `${practice.title}.musicxml`), false, { ...practice.session, ensemble: practice.session.ensemble ? { ...practice.session.ensemble, reference: undefined } : undefined }, undefined, seatConfirmed);
          }}/> } onAnnotationPreview={measure => <ExpressionPreview score={score} measure={measure} annotations={annotations} ensemble={previewEnsemble} space={spaceRef.current} tempo={engineRef.current?.getBaseTempo()} mutedParts={muted} tuningHz={tuning} volume={volume / 100} disabled={!!busy || active || !scorePage} onBeforePlay={pauseForPreview} onApply={patch => editAnnotation(measure, patch)}/>} onAnnotation={editAnnotation} focusVoice={displaySeat?.voice} focusStaff={displaySeat?.staff} focusLabel={displaySeat ? performanceName(displaySeat, locale) : undefined} onSeek={(beat) => { const engine = engineRef.current; if (!engine || !ensurePracticeReady()) return; engine.setLoop(null, null); setLoopEnabled(false); engine.restartFrom(playbackBeatForSource(score, beat, state.beat), 1); }} transpose={shift - instrumentKey + (playerPart(original!)?.transposeSemitones ?? 0) + (entry?.scoreDisplayTransposition ?? 0)} followPosition musicXML={displayXML} currentMeasure={state.measure} currentBeat={(() => {
            const index = Math.max(0, score.measureStartBeats.reduce((found, beat, index) => beat <= state.beat ? index : found, 0));
            return (score.sourceMeasureStartBeats?.[score.playbackOrder[index]] ?? score.measureStartBeats[index]) + state.beat - score.measureStartBeats[index];
          })()} beatsPerMeasure={score.timeSignature.beats} totalMeasures={score.totalMeasures} engineState={state.status === "finished" ? "idle" : state.status} measures={annotations} measureNumbers={score.measureNumbers} />
        </section>}
        <footer className="concert-muted">{text("音源: FluidR3 GM（CC BY 3.0） ·", "Sounds: FluidR3 GM (CC BY 3.0) ·")} {entry?.source && <a href={entry.source} target="_blank" rel="noreferrer">{text("楽曲データの出典", "Score source")}</a>} · <a href="/repertoire/SOURCES.md" target="_blank" rel="noreferrer">{text("データと音源について", "About scores and sounds")}</a> · <a href="/credits.html">{text("出典とクレジット", "Sources and credits")}</a></footer>
      </>}
    </div>
  </StageLayout>;
}
