import { exportPracticeFile, readPracticeFile } from "~/lib/practice-file";
import { firstPlayerExcerpt } from "~/lib/practice-excerpt";
import type { OrchestraSpace, PracticeSession, PracticeEnsemble } from "~/lib/practice-session";
import { useSearchParams } from "react-router";
import { OrchestraStage } from "./OrchestraStage";
import { ScoreCatalog } from "./ScoreCatalog";
import { playbackBeatForSource } from "~/lib/score-position";
import { instrumentTranspositions } from "~/lib/instrument-transposition";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StageLayout } from "./StageLayout";
import { ScoreDisplay } from "./ScoreDisplay";
import { VoiceCommandPanel } from "./VoiceCommandPanel";
import { PoseDetectorView } from "./PoseDetectorView";
import { ConcertEngine, type ConcertState } from "~/lib/concert-engine";
import { OrchestraAudio } from "~/lib/orchestra-audio";
import { MicrophoneInput, type PitchReading } from "~/lib/microphone-input";
import { MidiManager, midiToNoteName } from "~/lib/midi-manager";
import { repertoire, loadRepertoire, transposeScore, type RepertoireEntry } from "~/lib/repertoire";
import { parseMusicXML, updateMusicXMLAnnotation } from "~/lib/musicxml-parser";
import { assignPerformanceSeat, listPerformanceSeats, playerPart } from "~/lib/performance-seats";
import { readMusicXMLFile } from "~/lib/musicxml-file";
import { inspectMusicXMLPlayback, type PlaybackIssue } from "~/lib/musicxml-playback-issues";
import { PlaybackIssues } from "./PlaybackIssues";
import { listLibraryScores, saveLibraryScore, removeLibraryScore, type LibraryScore } from "~/lib/score-library";
import { EnsembleLab } from "./EnsembleLab";
import { expressionPresets } from "~/lib/expressive-intent";
import { readRehearsalPlan } from "~/lib/rehearsal-plan";
import { eventBus } from "~/lib/event-bus";
import { roleDirective } from "~/lib/rehearsal-nlp";
import type { MeasureAnnotation, MidiDeviceInfo, MidiNoteMessage, ParsedScore, RehearsalCommand } from "~/lib/types";

const initialState: ConcertState = { status: "idle", beat: 0, measure: 1, tempo: 120, mode: "follow", confidence: 0, matchedBeat: null };

export function PerformanceView({ stage = false }: { stage?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const scorePage = searchParams.get("view") === "score";
  const setScorePage = (value: boolean) => { setSearchParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set("view", "score"); else next.delete("view"); return next; }); window.scrollTo(0, 0); };
  const spaceRef = useRef<OrchestraSpace | undefined>(undefined);
  const rememberSpace = useCallback((space: OrchestraSpace) => { spaceRef.current = space; }, []);
  const [restoredEnsemble, setRestoredEnsemble] = useState<PracticeEnsemble | undefined>();
  const [restoredSpace, setRestoredSpace] = useState<OrchestraSpace | undefined>();
  const [sessionRevision, setSessionRevision] = useState(0);
  const engineRef = useRef<ConcertEngine | null>(null);
  const audioRef = useRef<OrchestraAudio | null>(null);
  const micRef = useRef<MicrophoneInput | null>(null);
  const midiRef = useRef<MidiManager | null>(null);
  const inputTranspose = useRef(0);
  const mounted = useRef(true);
  const micRequest = useRef(0);
  const micListRequest = useRef(0);
  const [entry, setEntry] = useState<RepertoireEntry | null>(null);
  const [ensembleScore, setEnsembleScore] = useState<ParsedScore | null>(null);
  const [seatId, setSeatId] = useState("");
  const [original, setOriginal] = useState<ParsedScore | null>(null);
  const [score, setScore] = useState<ParsedScore | null>(null);
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [micStatus, setMicStatus] = useState<"off" | "starting" | "on">("off");
  const [micDevices, setMicDevices] = useState<{ id: string; label: string }[]>([]);
  const [micDevice, setMicDevice] = useState("");
  const [micInputLabel, setMicInputLabel] = useState("");
  const [micDeviceNotice, setMicDeviceNotice] = useState("");
  const [reading, setReading] = useState<PitchReading | null>(null);
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
  const [localAvailability, setLocalAvailability] = useState<Record<string, boolean>>({});
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [library, setLibrary] = useState<LibraryScore[]>([]);
  const [unsavedImport, setUnsavedImport] = useState<Omit<LibraryScore, "id" | "savedAt"> | null>(null);
  const [libraryError, setLibraryError] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [notice, setNotice] = useState("");
  const [voiceLimited, setVoiceLimited] = useState(false);
  const [audioInterrupted, setAudioInterrupted] = useState(false);
  const [fileNotice, setFileNotice] = useState("");
  const refreshMicrophones = useCallback(async () => {
    const request = ++micListRequest.current;
    try {
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error();
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput" && device.deviceId);
      if (!mounted.current || request !== micListRequest.current) return;
      setMicDevices([...new Map(inputs.map((device, index) => [device.deviceId, { id: device.deviceId, label: device.label || `マイク ${index + 1}` }])).values()]);
      setMicDeviceNotice(inputs.length && inputs.every((device) => device.label) ? "" : "機器名が表示されない場合は、一度マイクを開始して許可し、停止してから選び直してください。");
    } catch {
      if (mounted.current && request === micListRequest.current) setMicDeviceNotice("マイク一覧を取得できませんでした。一覧を更新するか、システム既定のマイクで開始してください。");
    }
  }, []);
  useEffect(() => {
    const receive = (event: Event) => {
      const result = (event as CustomEvent).detail;
      if (result?.status === "saved") setFileNotice(`${result.name}を保存しました。`);
      if (result?.status === "failed") setError(`ファイルを保存できませんでした。${result.error ?? ""}`);
      if (result?.status === "cancelled") setFileNotice("ファイルの保存をキャンセルしました。");
    };
    window.addEventListener("convocerto-download", receive);
    return () => window.removeEventListener("convocerto-download", receive);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void listLibraryScores().then((scores) => { if (mounted.current) setLibrary(scores); }).catch(() => { if (mounted.current) setLibraryError("マイ楽譜を読み込めませんでした。保存済みの楽譜がないという意味ではありません。"); });
    const audio = new OrchestraAudio();
    const engine = new ConcertEngine(() => audio.currentTime);
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
        setError("音声の時間が進んでいません。音声出力先を確認して、音声を復旧して再開してください。");
        progressedAt = now;
      }
    }, 250);
    audio.onVoiceLimit = () => setVoiceLimited(true);
    engine.onNote = (note, time, duration, notatedDuration) => audio.play(note, time, duration, notatedDuration);
    engine.onSilence = () => audio.stop();
    engine.onClick = (time, accent) => audio.playClick(time, accent);
    mic.onNote = (message) => engine.processNote(message);
    mic.onReading = setReading;
    mic.onInterrupted = () => {
      micRequest.current++;
      setMicStatus("off");
      setMicInputLabel("");
      if (engine.getPracticeOptions().mode !== "listen") {
        const current = engine.getState();
        if (current.status === "playing" || current.status === "waiting") { engine.stop(); engine.seek(current.beat); }
      }
      setError("マイク入力が中断しました。接続を確認し「マイクで演奏する」でつなぎ直してください。伴奏を再開するには演奏開始を押してください。");
    };
    midi.setLocalSoundEnabled(false);
    midi.onError = (message) => { setMidiDevice(""); setLastMidi(null); setBreath(null); setMidiNotice(message); };
    midi.onInputLost = () => {
      setMidiDevice(""); setLastMidi(null); setBreath(null);
      setMidiNotice("演奏中のMIDI機器が切断されました。機器を選び直し、演奏開始で続けられます。");
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
      micRequest.current++;
      micListRequest.current++;
      navigator.mediaDevices?.removeEventListener("devicechange", refreshInputs);
      off();
      clearInterval(audioWatchdog);
      engine.dispose();
      mic.stop();
      midi.dispose();
      audio.dispose();
    };
  }, [refreshMicrophones]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    setLocalAvailability({});
    void Promise.all(repertoire.filter(item => item.path.startsWith("/repertoire/local/")).map(async item => {
      try {
        const response = await fetch(item.path, { method: "HEAD", signal: controller.signal });
        return [item.id, response.ok && !!response.headers.get("content-type")?.includes("application/json")] as const;
      } catch { return [item.id, false] as const; }
    })).then(entries => { if (active) setLocalAvailability(Object.fromEntries(entries)); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [availabilityRevision]);

  useEffect(() => { inputTranspose.current = midiWritten ? instrumentKey : 0; }, [midiWritten, instrumentKey]);

  const load = useCallback(async (selected: RepertoireEntry) => {
    setBusy("楽章を読み込んでいます…");
    setError("");
    engineRef.current?.stop();
    try {
      const source = await loadRepertoire(selected);
      const parsed = { ...source, parts: source.parts.map((part) => ({ ...part, transposeSemitones: part.transposeSemitones ?? (part.isSolo ? selected.nativeTransposition : 0) })) };
      if (!mounted.current) return;
      await audioRef.current?.prepare(parsed.parts, setBusy);
      if (!mounted.current) return;
      setEntry(selected);
      setEnsembleScore(parsed);
      setSeatId(playerPart(parsed)?.id ?? parsed.parts[0].id);
      setOriginal(parsed);
      setVoiceLimited(false);
      setAudioInterrupted(false);
      setScore(parsed);
      setInstrumentKey(selected.nativeTransposition);
      inputTranspose.current = midiWritten ? selected.nativeTransposition : 0;
      setShift(0);
      let saved: MeasureAnnotation[] = [];
      try { const text = localStorage.getItem(`concert-plan:${selected.id}`); if (text) saved = readRehearsalPlan(text, selected.id, parsed.totalMeasures); } catch {}
      setAnnotations(saved);
      setMuted([]);
      setStartMeasure(1);
      setLoopEnd(Math.min(4, parsed.totalMeasures));
      setLoopEnabled(false);
      setEditMeasure(1);
      setMusicXML(null);
      setPlaybackIssues([]);
      setRestoredEnsemble(undefined); setRestoredSpace(undefined); spaceRef.current = undefined; setSessionRevision((value) => value + 1);
      setNotice("");
      setPracticeMode("accompany"); audioRef.current?.setSoloAudible(false);
      engineRef.current?.load(parsed);
      engineRef.current?.setAnnotations(saved);
      audioRef.current?.setVolume(volume / 100);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "読み込みに失敗しました。");
    } finally { if (mounted.current) setBusy(""); }
  }, [volume, midiWritten]);

  const loadXML = async (file: File, orchestralSeat = false, session?: PracticeSession) => {
    setBusy("MusicXMLから演奏を準備しています…");
    setError("");
    engineRef.current?.stop();
    try {
      const xml = await readMusicXMLFile(file);
      const source = parseMusicXML(xml);
      const issues = inspectMusicXMLPlayback(xml);
      const base = session ? assignPerformanceSeat(source, session.seatId) : source;
      const parsed = session ? transposeScore(base, session.shift) : base;
      if (!parsed.title.trim()) parsed.title = file.name.replace(/\.(musicxml|xml)$/i, "");
      await audioRef.current?.prepare(parsed.parts, setBusy);
      if (!mounted.current) return;
      const key = parsed.parts.find((part) => part.isSolo)?.transposeSemitones ?? 0;
      setEntry({ id: "musicxml", composer: "MusicXML", title: parsed.title, movement: parsed.title, ensemble: parsed.parts.length > 3 ? "orchestra" : "piano", path: "", nativeTransposition: key, source: "" });
      setEnsembleScore(source);
      setSeatId(playerPart(parsed)?.id ?? parsed.parts[0].id);
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
      setNotice(orchestralSeat ? "この版はクラリネットの共通譜です。声部番号は奏者番号と一致しないため、クラリネット全体の席で開きます。第2奏者専用の譜面としては未検証です。" : "このMusicXMLの音符・テンポ・対応している指示を使って伴奏と追従を行います。");
      setPracticeMode("accompany"); audioRef.current?.setSoloAudible(false);
      engineRef.current?.load(parsed);
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
        engineRef.current?.seek(Math.max(0, Math.min(parsed.totalBeats, session.beat)));
        setNotice("保存した席・練習区間・空間配置を戻しました。演奏開始で続けられます。");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "MusicXMLを読み込めませんでした。");
    } finally { if (mounted.current) setBusy(""); }
  };

  const currentPractice = (): LibraryScore | null => {
    if (!annotatedXML || !score) return null;
    const session: PracticeSession = { version: 1, seatId, instrumentKey, shift, tuning, tempo: state.tempo, beat: state.beat, startMeasure, loopEnd, loopEnabled, mode: practiceMode, countInBars, click, volume, midiWritten, mutedPartIds: muted.map(index => score.parts[index].id), space: spaceRef.current, ensemble: engineRef.current ? { tuning: engineRef.current.getTuning(), leader: engineRef.current.getLeader(), reference: engineRef.current.getReference() } : undefined };
    return { id: crypto.randomUUID(), title: score.title, xml: annotatedXML, savedAt: new Date().toISOString(), session };
  };

  const savePractice = async () => {
    const practice = currentPractice();
    if (!practice) return;
    setError("");
    try {
      await saveLibraryScore(practice);
      setLibrary(await listLibraryScores()); setNotice("この練習を保存しました。マイ楽譜から同じ席・区間で再開できます。");
    } catch { setError("練習を保存できませんでした。「今の練習をファイルに書き出す」で楽譜と設定を退避できます。ブラウザの空き容量も確認してください。"); }
  };

  const annotatedXML = useMemo(() => {
    if (!musicXML || !original) return null;
    let xml = musicXML;
    for (const number of new Set([...original.measures, ...annotations].map((a) => a.measureNumber))) {
      xml = updateMusicXMLAnnotation(xml, number, annotations.find((a) => a.measureNumber === number) ?? {});
    }
    return xml;
  }, [musicXML, original, annotations]);

  const displayXML = useMemo(() => {
    if (!musicXML || !score) return null;
    const doc = new DOMParser().parseFromString(musicXML, "application/xml");
    for (const words of doc.querySelectorAll("words")) if (words.textContent?.startsWith("ConvoCerto:")) words.remove();
    const solo = playerPart(score);
    if (solo) for (const part of doc.querySelectorAll("part, score-part")) if (part.getAttribute("id") !== (solo.sourcePartId ?? solo.id)) part.remove();
    return new XMLSerializer().serializeToString(doc);
  }, [musicXML, score]);

  const changeSolo = async (id: string) => {
    if (!ensembleScore) return;
    engineRef.current?.stop();
    const next = assignPerformanceSeat(ensembleScore, id);
    setBusy("伴奏パートを準備しています…");
    try {
      await audioRef.current?.prepare(next.parts, setBusy);
      setSeatId(id);
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
    } catch (error) { setError(String(error)); }
    finally { setBusy(""); }
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
    if (annotation.role || annotation.wait || annotation.expression || annotation.leader) next.push(annotation);
    updateAnnotations(next.sort((a, b) => a.measureNumber - b.measureNumber));
  }, [annotations, updateAnnotations]);

  const activePlayback = () => state.status === "playing" || state.status === "waiting";

  const handleCommand = useCallback((command: RehearsalCommand) => {
    setNotice("");
    if (command.measureNumber != null && (!score || command.measureNumber < 1 || command.measureNumber > score.totalMeasures)) {
      setNotice("この楽章に含まれる再生小節を指定してください。");
      return;
    }
    if (command.type === "set_expression" && command.expression && score) {
      const measure = command.measureNumber ?? (activePlayback() ? state.measure : editMeasure);
      const end = command.expression.endMeasure ?? measure;
      if (end < measure || end > score.totalMeasures || !score.measureNumbers.includes(measure)) { setNotice("この譜面に含まれる小節の区間を指定してください。"); return; }
      editAnnotation(measure, { expression: { ...command.expression, endMeasure: end } });
      setNotice(`${measure}〜${end}小節: ${expressionPresets[command.expression.preset].description}（強さ ${Math.round(command.expression.amount * 100)}%）`);
    } else if (command.type === "set_wait" && command.wait && command.measureNumber == null && score) {
      let measure = activePlayback() ? state.measure : editMeasure;
      if (command.rawText.includes("次")) {
        const current = score.measureStartBeats.reduce((found, beat, index) => beat <= state.beat ? index : found, 0);
        const next = score.measureStartBeats.findIndex((beat, index) => index > current && score.parts.some((part) => part.isSolo && part.notes.some((note) => note.startBeat >= beat && note.startBeat < (score.measureStartBeats[index + 1] ?? score.totalBeats))));
        if (next < 0) { setNotice("この先に奏者パートの入りが見つかりませんでした。"); return; }
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
    setMicStatus("starting");
    try {
      await micRef.current?.start(micDevice);
      if (mounted.current && request === micRequest.current) {
        setMicStatus("on");
        setMicInputLabel(micRef.current?.getInputLabel() || "機器名を取得できませんでした");
        void refreshMicrophones();
      }
    } catch (error) {
      if (mounted.current && request === micRequest.current) {
        setMicStatus("off");
        setError(error instanceof DOMException && ["OverconstrainedError", "NotFoundError"].includes(error.name) && micDevice
          ? "選択したマイクを開始できませんでした。接続を確認し、一覧を更新して選び直してください。"
          : "マイクを開始できませんでした。ブラウザのマイク許可と接続を確認してください。");
      }
    }
  };

  const changeShift = (semitones: number) => {
    if (!original) return;
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

  const applyLoop = (enabled: boolean, first = startMeasure, last = loopEnd) => {
    setLoopEnabled(enabled);
    engineRef.current?.setLoop(enabled ? score?.measureStartBeats[first - 1] ?? null : null, enabled ? score?.measureStartBeats[last] ?? score?.totalBeats ?? null : null);
  };

  const playExcerpt = (mode: "accompany" | "listen", fromEntry = false, withLeadIn = false) => {
    const engine = engineRef.current;
    if (!engine || !score || busy) return;
    const excerpt = fromEntry ? firstPlayerExcerpt(score, withLeadIn) : { first: startMeasure, last: Math.max(startMeasure, loopEnd) };
    if (!excerpt) return;
    setPracticeMode(mode); setCountInBars(1);
    audioRef.current?.setSoloAudible(mode === "listen");
    engine.setPracticeOptions({ mode, countInBars: 1, click });
    setStartMeasure(excerpt.first); setLoopEnd(excerpt.last);
    applyLoop(true, excerpt.first, excerpt.last);
    engine.restartFrom(score.measureStartBeats[excerpt.first - 1]);
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
  const solo = score ? playerPart(score) : undefined;
  const performanceSeats = useMemo(() => ensembleScore ? listPerformanceSeats(ensembleScore) : [], [ensembleScore]);
  const displaySeat = performanceSeats.find((seat) => seat.id === seatId);
  const nextNotes = solo?.notes.filter((note) => note.startBeat >= state.beat - 0.05).slice(0, 7) ?? [];
  const currentSoloNote = solo?.notes.find((note) => note.startBeat <= state.beat + 0.0001 && note.startBeat + note.durationBeats > state.beat + 0.0001);
  const selectedAnnotation = annotations.find((a) => a.measureNumber === editMeasure);
  const statusText = state.countInRemaining ? `カウントイン ${state.countInRemaining}` : practiceMode === "wait" && state.status === "waiting" ? "正しい音を待っています" : { idle: "準備完了", playing: "演奏中", waiting: "合図を待っています", finished: "演奏終了" }[state.status];

  return <StageLayout locale="ja" immersive={scorePage && !!musicXML}>
    <div className={`concert ${scorePage && musicXML ? "score-page" : ""}`}>
      {score && <div className="performance-navigation"><button aria-pressed={!scorePage} onClick={() => setScorePage(false)}>準備・オーケストラ</button><button disabled={!musicXML} aria-pressed={scorePage} onClick={() => setScorePage(true)}>楽譜専用ページで演奏する →</button><span>{solo?.name} · {midiDevice ? "MIDI接続中" : micStatus === "on" ? "マイク接続中" : "入力未接続"}</span></div>}
      <div className="concert-intro">
        <div><p className="concert-eyebrow">YOUR SEAT. OUR CONCERT.</p><h2>{stage ? "Step 4 — フルリハーサル" : "今日は、誰と共演する？"}</h2><p>好きな作品の、好きな席へ。相手を聴いて、相手もあなたを受け取る。</p></div>
        <span className="concert-badge">MusicXML · live accompaniment</span>
      </div>
      <details className="repertoire-drawer" open={!score}><summary>曲を選ぶ・持ち込み楽譜を開く</summary>
      <section className="concert-panel" aria-label="MusicXML総譜で共奏">
        <h3>オーケストラの席へ</h3>
        <p>総譜からあなたの担当パートを空けます。声部が分かれた譜面では、同じ楽器の相手を残して共奏できます。</p>
        <p className="concert-muted">優先収集：ベートーヴェン交響曲第5・6・7番。5番第1楽章はすぐ演奏でき、6・7番は全曲総譜を確認中です。</p>
        <div className="concert-controls">
          {[{ id: "mozart-k622-1", label: "モーツァルト：クラリネット協奏曲 第1楽章 · MusicXML総譜", second: false }, { id: "mozart-k622-3", label: "モーツァルト：クラリネット協奏曲 第3楽章 · MusicXML総譜", second: false }, { id: "mozart-k622-2", label: "モーツァルト：クラリネット協奏曲 第2楽章 · MusicXML総譜", second: false }].map((item) => <button key={item.id} disabled={!!busy} onClick={async () => {
            try {
              const response = await fetch(`/repertoire/ensemble/${item.id}.musicxml`);
              if (!response.ok) throw new Error("総譜を読み込めませんでした。");
              await loadXML(new File([await response.text()], `${item.id}.musicxml`), item.second);
            } catch (error) { setError(String(error)); }
          }}>{item.label}</button>)}
        </div>
        <p className="concert-muted">出典と権利表示を確認したMusicXMLを使用。<a href="/repertoire/ensemble/sources.json" target="_blank" rel="noreferrer">楽譜ごとの出典・権利確認</a></p>
      </section>
      <ScoreCatalog busy={!!busy} onLoad={loadXML} />
      <section className="repertoire-grid" aria-label="演奏する作品">
        {["orchestra", "piano"].map((ensemble) => <article className={`repertoire-card ${ensemble}`} key={ensemble}>
          <p className="concert-eyebrow">{ensemble === "orchestra" ? "W. A. MOZART · ORCHESTRA" : "JOHANNES BRAHMS · PIANO"}</p>
          <h3>{ensemble === "orchestra" ? "クラリネット協奏曲" : "クラリネットソナタ第2番"}</h3>
          <p>{ensemble === "orchestra" ? "K.622 · MusicXML総譜 · 原曲 A管" : "Op.120-2 · MIDI伴奏（譜面表示なし） · 原曲 B♭管"}</p>
          <div className="movement-list">{repertoire.filter((item) => item.ensemble === ensemble).map((item) => <button key={item.id} disabled={!!busy || (item.ensemble === "piano" && localAvailability[item.id] !== true)} aria-pressed={entry?.id === item.id} onClick={async () => { if (item.ensemble === "orchestra") { try { const response = await fetch(`/repertoire/ensemble/${item.id}.musicxml`); if (!response.ok) throw new Error("MusicXMLを読み込めませんでした。"); await loadXML(new File([await response.text()], `${item.id}.musicxml`)); } catch (error) { setError(String(error)); } } else await load(item); }}>{item.movement}<span>{item.ensemble === "piano" && localAvailability[item.id] !== true ? localAvailability[item.id] === false ? "データ未確認" : "確認中…" : entry?.id === item.id ? "選択中" : "演奏する →"}</span></button>)}</div>
          {ensemble === "piano" && repertoire.some(item => item.ensemble === "piano" && localAvailability[item.id] === false) && <div role="status"><p>この環境ではMIDI伴奏データを確認できません。再配布条件が未確認のため、配布版には含めていません。お持ちのMusicXMLは下の「MusicXMLで演奏する」から開けます。</p><button disabled={!!busy} onClick={() => setAvailabilityRevision(value => value + 1)}>データを再確認</button></div>}
        </article>)}
      </section>
      </details>
      <section className="concert-panel xml-dropzone" onDragOver={(event) => { event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (busy) return; const files = event.dataTransfer.files; if (files.length !== 1) { setError("楽譜ファイルを1つずつドロップしてください。"); return; } void loadXML(files[0]); }}>
        <label>MusicXMLで演奏する<input aria-label="MusicXMLで演奏する" type="file" accept=".musicxml,.xml,.mxl" disabled={!!busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadXML(file); event.target.value = ""; }} /></label>
        <p className="concert-muted">総譜を読み込むと、その音符から伴奏を生成し、あなたのパートを聴いて追従します。.musicxml / .xml / 圧縮 .mxl に対応。ここにファイルをドロップできます。partwise / timewise形式に対応。</p>
      </section>
      <section className="concert-panel" aria-label="マイ楽譜">
        <h3>マイ楽譜</h3>
        {libraryError && <div role="alert"><p>{libraryError}</p><button onClick={async () => {
          try { setLibrary(await listLibraryScores()); setLibraryError(""); }
          catch { setLibraryError("マイ楽譜をまだ読み込めません。現在の練習はファイルに書き出して保管できます。"); }
        }}>マイ楽譜を再読み込み</button></div>}
        <label>練習ファイルを読み込む<input aria-label="練習ファイルを読み込む" type="file" accept=".convo.json,.json" disabled={!!busy} onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          setUnsavedImport(null); setError("");
          try {
            if (file.size > 30_000_000) throw new Error("練習ファイルは30MB以下にしてください。");
            const imported = readPracticeFile(await file.text());
            try { await saveLibraryScore({ ...imported, id: crypto.randomUUID(), savedAt: new Date().toISOString() }); }
            catch { setUnsavedImport(imported); return; }
            setLibrary(await listLibraryScores()); setNotice("練習ファイルをマイ楽譜に追加しました。曲を押すと開けます。");
          } catch (error) { setError(error instanceof Error ? error.message : "練習ファイルを読み込めませんでした。"); }
        }} /></label>
        {unsavedImport && <div role="status">
          <p>「{unsavedImport.title}」は読み込めましたが、マイ楽譜に保存できませんでした。保存せずに練習できます。</p>
          <button disabled={!!busy} onClick={() => {
            const imported = unsavedImport; setUnsavedImport(null);
            setFileNotice("この練習はマイ楽譜に保存されていません。変更を残すには「今の練習をファイルに書き出す」を使ってください。");
            void loadXML(new File([imported.xml], imported.title + ".musicxml"), false, imported.session);
          }}>保存せず、この練習を開く</button>
        </div>}
        <div className="concert-controls">
          <input aria-label="マイ楽譜を検索" placeholder="曲名で検索" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} />
          <button disabled={!annotatedXML || !!busy} onClick={async () => {
            if (!annotatedXML || !score) return;
            try { await saveLibraryScore({ id: crypto.randomUUID(), title: score.title, xml: annotatedXML, savedAt: new Date().toISOString() }); setLibrary(await listLibraryScores()); }
            catch { setError("楽譜を保存できませんでした。ブラウザの空き容量を確認してください。"); }
          }}>このMusicXMLをマイ楽譜に保存</button>
        </div>
        {library.filter((item) => item.title.toLowerCase().includes(librarySearch.toLowerCase())).map((item) => <div className="concert-controls" key={item.id}><button disabled={!!busy} onClick={() => void loadXML(new File([item.xml], item.title + ".musicxml"), false, item.session)}>{item.title}</button><button aria-label={`${item.title}の練習ファイルを書き出す`} onClick={() => exportPracticeFile(item)}>練習ファイルを書き出す</button><button aria-label={`${item.title}をマイ楽譜から削除`} onClick={async () => { try { await removeLibraryScore(item.id); setLibrary(await listLibraryScores()); } catch { setError("楽譜を削除できませんでした。"); } }}>削除</button></div>)}
        <p className="concert-muted">保存先はこのブラウザです。練習ファイルを書き出すと、楽譜と保存済みの席・区間・空間配置を別のブラウザやMacアプリに持ち込めます。</p>
      </section>
      {fileNotice && <p role="status" className="concert-message">{fileNotice}</p>}
      {busy && <p role="status" className="concert-message">{busy}</p>}
      {error && <p role="alert" className="concert-error">{error}</p>}
      {!score && !busy && <p className="concert-empty">楽章を選ぶと、伴奏の準備が始まります。演奏したいパートを選んで参加できます。</p>}
      {score && <>
        <section className="concert-panel transport-panel" aria-label="演奏コントロール">
          <PlaybackIssues key={sessionRevision} issues={playbackIssues} />
          {solo?.notes.length ? <details className="quick-rehearsal" open={!scorePage}><summary>お手本と吹き比べる</summary>
            <div className="concert-controls"><button disabled={!!busy} onClick={() => playExcerpt("accompany", true)}>自分の入りから吹く</button><button disabled={!!busy} onClick={() => playExcerpt("listen")}>この区間のお手本を聴く</button><button disabled={!!busy} onClick={() => playExcerpt("accompany")}>同じ区間を自分で吹く</button></div>
            <button disabled={!!busy || firstPlayerExcerpt(score)?.first === 1} onClick={() => playExcerpt("accompany", true, true)}>入りの1小節前から合わせる</button>
            <p>入りから4小節を選び、1小節のカウントでスタート。お手本と自分の演奏を、同じ区間でくり返せます。</p>
            <p className="concert-muted">相手を聴いて入りたいときは「入りの1小節前から合わせる」。選んだ席の最初の入りの前に1小節を加え、自分の音を空けた伴奏でくり返します。冒頭から入る席では選べません。</p>
          </details> : null}
          <div className="practice-save"><button disabled={!musicXML || !!busy} onClick={() => void savePractice()}>この練習を保存</button><button disabled={!musicXML || !!busy} onClick={() => {
            try { const practice = currentPractice(); if (practice) exportPracticeFile(practice); }
            catch { setError("練習ファイルを書き出せませんでした。もう一度お試しください。"); }
          }}>今の練習をファイルに書き出す</button><span role="status">{notice.startsWith("この練習を保存") || notice.startsWith("保存した席") ? notice : ""}</span></div>
          {voiceLimited && <p role="status" className="concert-message">同時発音の上限に達したため、一部の音を省略しました。奏者数や担当パートの重複を減らしてください。<button onClick={() => setVoiceLimited(false)}>閉じる</button></p>}
          {audioInterrupted && <div role="alert" className="concert-message">
            <p>音声が中断されたため、この位置で停止しました。出力先を確認して再開してください。</p>
            <button disabled={!!busy} onClick={async () => {
              setBusy("音声を再開しています…"); setError("");
              try { await audioRef.current?.resume(); if (mounted.current) { setAudioInterrupted(false); engineRef.current?.start(); } }
              catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "音声を再開できませんでした。"); }
              finally { if (mounted.current) setBusy(""); }
            }}>音声を復旧して再開</button>
          </div>}
          <div className="concert-now"><div><p className="concert-eyebrow">NOW REHEARSING</p><h3>{entry?.composer} · {entry?.movement}</h3></div><span role="status" className={`status-pill ${state.status}`}>{statusText}</span></div>
          <div className="concert-controls">
            <button className="concert-primary" disabled={!!busy} onClick={() => active ? engineRef.current?.stop() : engineRef.current?.start()}>{active ? "■ 停止" : "▶ 演奏開始"}</button>
            {practiceMode !== "wait" && <button disabled={!!busy || audioInterrupted} title="今の小節の頭へ戻り、1小節以上のカウントで再開します" onClick={() => {
              const engine = engineRef.current;
              if (!engine) return;
              const beat = score.measureStartBeats.reduce((found, beat) => beat <= state.beat ? beat : found, 0);
              const bars = Math.max(1, countInBars);
              setCountInBars(bars); setLoopEnabled(false);
              engine.setLoop(null, null);
              engine.setPracticeOptions({ mode: practiceMode, countInBars: bars, click });
              engine.restartFrom(beat);
            }}>この小節から入り直す</button>}
            <button onClick={() => {
              const index = score.measureStartBeats.reduce((found, beat, index) => beat <= state.beat ? index : found, 0);
              const first = index + 1; const last = Math.min(score.totalMeasures, first + 3);
              setStartMeasure(first); setLoopEnd(last); applyLoop(true, first, last);
              engineRef.current?.seek(score.measureStartBeats[index]); if (!active) engineRef.current?.start();
            }}>今の4小節をくり返す</button>
            {state.status === "waiting" && practiceMode !== "wait" && <button className="concert-primary" onClick={() => engineRef.current?.cue()}>合図して再開</button>}
            <label>練習モード<select aria-label="練習モード" disabled={active || !!busy} value={practiceMode} onChange={(event) => {
              const mode = event.target.value as typeof practiceMode; setPracticeMode(mode); audioRef.current?.setSoloAudible(mode === "listen"); engineRef.current?.setPracticeOptions({ mode, countInBars, click });
            }}><option value="accompany">共奏・入力に追従</option><option value="listen">お手本を聴く（全パート）</option><option value="wait">正しい音を吹くまで待つ</option></select></label>
            <label>カウントイン<select aria-label="カウントイン" disabled={active || !!busy} value={countInBars} onChange={(event) => { const bars = Number(event.target.value); setCountInBars(bars); engineRef.current?.setPracticeOptions({ mode: practiceMode, countInBars: bars, click }); }}><option value={0}>なし</option><option value={1}>1小節</option><option value={2}>2小節</option></select></label>
            <button aria-pressed={click} disabled={active || !!busy} onClick={() => { setClick(!click); engineRef.current?.setPracticeOptions({ mode: practiceMode, countInBars, click: !click }); }}>メトロノーム {click ? "ON" : "OFF"}</button>
            <label>伴奏の役割<select aria-label="伴奏の役割" value={state.mode} onChange={(event) => { updateAnnotations(annotations.map((a) => ({ measureNumber: a.measureNumber, wait: a.wait, expression: a.expression, leader: a.leader })).filter((a) => a.wait || a.expression || a.leader)); engineRef.current?.setMode(event.target.value as "lead" | "follow"); }}><option value="lead">AIがリード</option><option value="follow" disabled={!solo}>奏者に追従</option></select></label>
            <label>テンポ <span className="tempo-number">{Math.round(state.tempo)} BPM</span><input aria-label="演奏テンポ" type="range" min={20} max={240} step={1} value={Math.min(240, state.tempo)} onChange={(event) => engineRef.current?.setTempo(Number(event.target.value))} /></label>
            <label>伴奏音量 {volume}%<input aria-label="伴奏音量" type="range" min={0} max={100} value={volume} onChange={(event) => { setVolume(Number(event.target.value)); audioRef.current?.setVolume(Number(event.target.value) / 100); }} /></label>
          </div>
            <div className="concert-progress"><span>再生小節 {state.measure} / {score.totalMeasures}</span><span className="score-event-status">{currentSoloNote ? `演奏 · ${midiToNoteName(currentSoloNote.pitch - instrumentKey)}` : "休符"}</span><input aria-label="演奏位置" type="range" min={0} max={score.totalBeats} step={0.25} value={state.beat} onChange={(event) => engineRef.current?.seek(Number(event.target.value))} /><span>{Math.round(state.beat / score.totalBeats * 100)}%</span></div>
          <div className="concert-controls small-controls">

            <label>開始小節<input aria-label="開始小節" type="number" min={1} max={score.totalMeasures} value={startMeasure} onChange={(event) => { const value = Math.max(1, Math.min(score.totalMeasures, Number(event.target.value) || 1)); setStartMeasure(value); applyLoop(false); }} /></label>
            <button onClick={() => engineRef.current?.seek(score.measureStartBeats[startMeasure - 1])}>ここから練習</button>
            <label>終了小節<input aria-label="終了小節" type="number" min={startMeasure} max={score.totalMeasures} value={loopEnd} onChange={(event) => { setLoopEnd(Math.max(startMeasure, Math.min(score.totalMeasures, Number(event.target.value) || startMeasure))); applyLoop(false); }} /></label>
            <button aria-pressed={loopEnabled} disabled={loopEnd < startMeasure} onClick={() => applyLoop(!loopEnabled)}>{loopEnabled ? "ループ ON" : "区間をループ"}</button>
            {solo && <button onClick={() => { const note = solo.notes.find((n) => n.startBeat >= state.beat + 0.1); if (note) engineRef.current?.seek(Math.max(0, note.startBeat - 2)); }}>次のソロへ</button>}
          </div>
        </section>
        {audioRef.current && <OrchestraStage key={`${sessionRevision}:${score.title}:${score.parts.map((part) => part.id).join(":")}`} initialSpace={restoredSpace} onSpaceChange={rememberSpace} mutedParts={muted} parts={score.parts} audio={audioRef.current} beat={state.beat} active={active} />}
        <div className="concert-workspace">
          <section className="concert-panel" aria-label="楽器入力">
            <p className="concert-eyebrow">LISTEN TO YOU</p><h3>あなたの楽器 · {solo?.name ?? "担当パート"}</h3>
            <p className="concert-muted">マイクは単音の旋律に追従します。ピアノなどの和音入力にはMIDIを使用してください。無音程の打楽器の音声追従は未対応です。伴奏を拾わないようヘッドホンで演奏してください。</p>
            <div className="concert-controls"><label>使用するマイク<select aria-label="使用するマイク" value={micDevice} disabled={micStatus !== "off"} onChange={(event) => setMicDevice(event.target.value)}><option value="">システム既定のマイク</option>{micDevices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}{micDevice && !micDevices.some((device) => device.id === micDevice) && <option value={micDevice}>選択中のマイク（一覧にありません）</option>}</select></label><button onClick={() => void refreshMicrophones()}>マイク一覧を更新</button></div>
            {micDeviceNotice && <p className="concert-muted" role="status">{micDeviceNotice}</p>}
            {micStatus === "on" && <p className="concert-muted" role="status">使用中のマイク: {micInputLabel}。変更するにはマイクを停止してください。</p>}
            <div className="concert-controls"><button className={micStatus === "on" ? "concert-primary" : ""} aria-pressed={micStatus === "on"} onClick={() => void toggleMic()}>{micStatus === "on" ? "マイクを停止" : micStatus === "starting" ? "マイク準備をキャンセル" : "マイクで演奏する"}</button><span className="pitch-reading" aria-live="off">{reading ? `${midiToNoteName(reading.midi - instrumentKey)} ${reading.cents >= 0 ? "+" : ""}${Math.round(reading.cents)}¢` : "—"}</span></div>
            <div className="level-meter" aria-label="マイク音量"><div style={{ width: `${Math.min(100, (reading?.level ?? 0) * 500)}%` }} /></div>
            <div className="concert-controls">
              <label>使用する楽器<select aria-label="使用する楽器" value={instrumentKey} onChange={(event) => { const key = Number(event.target.value); setInstrumentKey(key); changeShift(key - (original ? playerPart(original)?.transposeSemitones ?? entry?.nativeTransposition ?? key : key)); }}>{instrumentTranspositions.map((item) => <option key={item.semitones} value={item.semitones}>{item.label}</option>)}{!instrumentTranspositions.some((item) => item.semitones === instrumentKey) && <option value={instrumentKey}>譜面指定（{instrumentKey}半音）</option>}</select></label>
              <label>伴奏の移調<select aria-label="伴奏の移調" value={shift} onChange={(event) => changeShift(Number(event.target.value))}>{Array.from({ length: 49 }, (_, i) => i - 24).map((n) => <option key={n} value={n}>{n > 0 ? "+" : ""}{n} 半音{n === 0 ? "（原調）" : ""}</option>)}</select></label>
              <label>基準ピッチ<input aria-label="基準ピッチ" type="number" min={430} max={450} value={tuning} onChange={(event) => { const value = Math.max(430, Math.min(450, Number(event.target.value) || 440)); setTuning(value); if (micRef.current) micRef.current.tuning = value; audioRef.current?.setTuning(value); }} /> Hz</label>
            </div>
            <p className="concert-muted">楽器を変えると、同じ運指の譜面で吹けるよう伴奏も移調します。移調済みの譜面を使う場合は「伴奏の移調」を原調に戻してください。</p>
            <details open><summary>MIDI / ClariMate を使う</summary><ol className="input-checks" aria-label="ClariMate接続チェック"><li>{midiDevice ? "✓ 機器を選択済み" : "1. ClariMate / MIDIを接続して機器を選ぶ"}</li><li>{midiDevice && lastMidi ? "✓ 音符を受信しました" : "2. 一音吹いて、音符の受信を確認"}</li><li>{state.inputFeedback === "matched" ? "✓ 演奏中の音が譜面と一致しました" : "3. 正しい音を待つモードで譜面の音を吹く"}</li></ol><div className="concert-controls"><button onClick={async () => {
              await midiRef.current?.init();
              const inputs = midiRef.current?.getInputDevices() ?? []; setDevices(inputs);
              const preferred = inputs.find((device) => /clari.?mate/i.test(device.name)) ?? (inputs.length === 1 ? inputs[0] : undefined);
              if (preferred) { midiRef.current?.selectInput(preferred.id); setMidiDevice(preferred.id); setMidiNotice(`${preferred.name}を選択しました。音を吹いて受信を確認してください。`); }
              else setMidiNotice(inputs.length ? "使用するMIDI機器を選んでください。ClariMateがなければUSBモードと接続を確認してください。" : "MIDI機器が見つかりません。接続・USBモード・ブラウザのMIDI許可を確認してください。");
            }}>ClariMate / MIDIを接続</button><select aria-label="MIDI機器" value={midiDevice} onChange={(event) => { setMidiDevice(event.target.value); midiRef.current?.selectInput(event.target.value); setLastMidi(null); setBreath(null); setMidiNotice(event.target.value ? "MIDI機器を選択しました。音を吹いて受信を確認してください。" : "MIDI機器を選択してください。"); }}><option value="">機器を選択</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select><label>MIDIの音高<select aria-label="MIDIの音高" value={midiWritten ? "written" : "concert"} onChange={(event) => setMidiWritten(event.target.value === "written")}><option value="concert">実音</option><option value="written">記譜音（選択した楽器の移調を適用）</option></select></label><button aria-pressed={midiMonitor} onClick={async () => { try { if (!midiMonitor) await midiRef.current?.initAudio(); midiRef.current?.setLocalSoundEnabled(!midiMonitor); setMidiMonitor(!midiMonitor); } catch { setMidiNotice("試聴音を開始できませんでした。"); } }}>MIDI入力の試聴（電子音） {midiMonitor ? "ON" : "OFF"}</button></div><p className="concert-muted">{midiNotice}</p><p aria-live="polite" className="midi-reading">{lastMidi ? `受信: 記譜 ${midiToNoteName(lastMidi.note - instrumentKey)} / 実音 ${midiToNoteName(lastMidi.note)} · 強さ ${lastMidi.velocity} · ${lastMidi.type === "noteon" ? "発音" : "離鍵"}` : "MIDI入力を待っています"}</p><label className="breath-display">息のコントロール {breath ? `CC${breath.controller} · ${breath.value}/127` : "CC2 / CC11 受信待ち"}<meter aria-label="ClariMateの息" min={0} max={127} value={breath?.value ?? 0} /></label><p className="concert-muted">試聴をONにすると、息に合わせて電子音の音量が変わります。CC2を優先し、CC2が届く前はCC11を使います。息を送らない機器は発音時の強さで鳴ります。音色の連続変化は未対応です。</p><p className="concert-muted">まず「正しい音を吹くまで待つ」で入力を確認し、次に「共奏・入力に追従」へ。機器自身の音を聴く場合、試聴はOFFにしてください。</p></details>
            <p className="concert-muted">表情: {state.expression || "譜面の表情"} · 入力の強弱・音の切り方も、追従の強さに応じて伴奏へ反映します。</p>
            <p className="concert-muted">直近の入力: {state.inputFeedback === "matched" ? "譜面と照合できました" : state.inputFeedback === "unmatched" ? "照合できませんでした" : "入力待ち"}</p>
            <p className="concert-muted">追従状態: {state.matchedBeat == null ? "最初の音を待っています" : `一致した位置 ${state.matchedBeat.toFixed(1)}拍 · 確信度 ${Math.round(state.confidence * 100)}%`}</p>
            {!solo && <p className="concert-message">このデータは伴奏のみです。テンポを設定して演奏できます。</p>}
          </section>
          <section className="concert-panel" aria-label="伴奏パート">
            <p className="concert-eyebrow">YOUR ENSEMBLE</p><h3>{entry?.ensemble === "orchestra" ? "オーケストラ" : "ピアニスト"}</h3>
            <p className="concert-muted">選択した奏者パートの音は伴奏から除外します。</p>
            {ensembleScore && <label>あなたが入る席<select aria-label="奏者パート" disabled={!!busy || active} value={seatId} onChange={(event) => void changeSolo(event.target.value)}>{performanceSeats.map((seat) => <option key={seat.id} value={seat.id}>{seat.name}</option>)}</select></label>}
            {solo?.sourcePartId && <p className="concert-muted">選んだ声部だけを空け、同じパートの他の声部は演奏します。譜面は元のパートをまとめて表示します。声部番号と1番・2番の対応は譜面で確認してください。</p>}

            {score.parts.map((part, index) => !part.isSolo && <div className="part-row" key={part.id}><span>{part.name}</span><button aria-label={`${part.name}を${muted.includes(index) ? "再生" : "ミュート"}`} aria-pressed={muted.includes(index)} onClick={() => { const next = muted.includes(index) ? muted.filter((i) => i !== index) : [...muted, index]; setMuted(next); audioRef.current?.setPartVolume(index, next.includes(index) ? 0 : 1); }}>{muted.includes(index) ? "OFF" : "ON"}</button></div>)}
            {nextNotes.length > 0 && <><h4>次の音（記譜音）</h4><div className="next-notes">{nextNotes.map((note, i) => <span key={i}>{midiToNoteName(note.pitch - instrumentKey)}</span>)}</div></>}
            <p className="concert-muted">{musicXML ? "MusicXMLを演奏の元データとして使用中。反復は展開して再生します。" : "内蔵楽章はMIDI由来の演奏データを使用しています。"}フェルマータや反復によって、お手元の版の小節番号と異なる場合があります。</p>
          </section>
        </div>
        <section className="concert-panel" aria-label="リハーサル設計">
          <div className="concert-now"><div><p className="concert-eyebrow">SHAPE THE PERFORMANCE</p><h3>ここは任せる。ここは待って。</h3></div><button onClick={() => setRehearsal(!rehearsal)} aria-pressed={rehearsal}>リハーサルコマンド</button></div>
          <div className="concert-controls">
            <label>再生小節<input aria-label="編集する小節" type="number" min={1} max={score.totalMeasures} value={editMeasure} onChange={(event) => setEditMeasure(Math.max(1, Math.min(score.totalMeasures, Number(event.target.value) || 1)))} /></label>
            <label>ここからの役割<select aria-label="小節の役割" value={selectedAnnotation?.role?.mode ?? "inherit"} onChange={(event) => editAnnotation(editMeasure, { role: event.target.value === "inherit" ? undefined : roleDirective(event.target.value as "lead" | "follow", "moderate") })}><option value="inherit">前の設定を引き継ぐ</option><option value="lead">AIがリード</option><option value="follow">奏者に追従</option></select></label>
            <label>小節の入り<select aria-label="小節の入り" value={selectedAnnotation?.wait ? selectedAnnotation.wait.duration ? "timed" : "cue" : "continue"} onChange={(event) => editAnnotation(editMeasure, { wait: event.target.value === "continue" ? undefined : event.target.value === "timed" ? { type: "wait", duration: 2 } : { type: "listen" } })}><option value="continue">そのまま進む</option><option value="cue">演奏・うなずき・ボタンの合図を待つ</option><option value="timed">指定秒数待つ</option></select></label>
            {selectedAnnotation?.wait?.duration != null && <label>待機秒数<input aria-label="待機秒数" type="number" min={0.5} max={30} step={0.5} value={selectedAnnotation.wait.duration} onChange={(event) => editAnnotation(editMeasure, { wait: { type: "wait", duration: Math.max(0.5, Math.min(30, Number(event.target.value) || 0.5)) } })} /></label>}
            <label>ここからの主導者<select aria-label="ここからの主導者" value={selectedAnnotation?.leader ?? ""} onChange={(event) => editAnnotation(editMeasure, { leader: event.target.value || undefined })}>
              <option value="">前の設定を引き継ぐ</option><option value="player">あなた</option><option value="conductor">指揮者・全体の拍</option>{score.parts.filter((part) => !part.isSolo).map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}
            </select></label>
            <label>この区間の表情<select aria-label="この区間の表情" value={selectedAnnotation?.expression?.preset ?? ""} onChange={(event) => editAnnotation(editMeasure, { expression: event.target.value ? { preset: event.target.value as keyof typeof expressionPresets, amount: selectedAnnotation?.expression?.amount ?? 0.6, endMeasure: selectedAnnotation?.expression?.endMeasure ?? editMeasure } : undefined })}>
              <option value="">譜面どおり</option>{Object.entries(expressionPresets).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select></label>
            {selectedAnnotation?.expression && <>
              <label>表情の強さ {Math.round(selectedAnnotation.expression.amount * 100)}%<input aria-label="表情の強さ" type="range" min={0} max={1} step={0.05} value={selectedAnnotation.expression.amount} onChange={(event) => editAnnotation(editMeasure, { expression: { ...selectedAnnotation.expression!, amount: Number(event.target.value) } })} /></label>
              <label>表情の終了小節<input aria-label="表情の終了小節" type="number" min={editMeasure} max={score.totalMeasures} value={selectedAnnotation.expression.endMeasure ?? editMeasure} onChange={(event) => editAnnotation(editMeasure, { expression: { ...selectedAnnotation.expression!, endMeasure: Math.max(editMeasure, Math.min(score.totalMeasures, Number(event.target.value) || editMeasure)) } })} /></label>
              <span>{expressionPresets[selectedAnnotation.expression.preset].description}</span>
            </>}
            <button onClick={() => { engineRef.current?.seek(score.measureStartBeats[score.playbackOrder.findIndex((slot) => score.measureNumbers[slot] === editMeasure)] ?? 0); }}>この小節へ</button>
            <button onClick={() => setCamera(!camera)} aria-pressed={camera}>{camera ? "カメラを停止" : "うなずきで合図する"}</button>
            <button onClick={exportPlan}>練習設定を保存</button>
            <label>練習設定を読み込む<input aria-label="練習設定を読み込む" type="file" accept=".json" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file || !entry) return;
              try { updateAnnotations(readRehearsalPlan(await file.text(), entry.id, score.totalMeasures)); setNotice("練習設定を読み込みました。"); }
              catch (error) { setError(error instanceof Error ? error.message : "設定を読み込めませんでした。"); }
              event.target.value = "";
            }} /></label>
          </div>
          <div className="annotation-list">{annotations.map((annotation) => <button key={annotation.measureNumber} onClick={() => setEditMeasure(annotation.measureNumber)}>再生小節 {annotation.measureNumber}{annotation.expression?.endMeasure != null ? `〜${annotation.expression.endMeasure}` : ""} · {annotation.expression ? expressionPresets[annotation.expression.preset].label + " " : ""}{annotation.role?.mode === "lead" ? "リード" : annotation.role ? "追従" : ""}{annotation.wait ? annotation.wait.duration ? ` ${annotation.wait.duration}秒待機` : " 合図待ち" : ""}</button>)}</div>
          {notice && <p role="status">{notice}</p>}
          {rehearsal && <VoiceCommandPanel isActive={rehearsal} onCommand={handleCommand} language="ja" />}
          {camera && <PoseDetectorView isActive={camera} locale="ja" />}
        </section>
        {engineRef.current && <EnsembleLab key={`${entry?.id}:${seatId}`} engine={engineRef.current} initialEnsemble={restoredEnsemble} score={score} annotations={annotations} state={state} disabled={!!busy} seatId={seatId} />}
        {musicXML && <section className="concert-panel score-stage-sheet">
          <button onClick={() => {
            const url = URL.createObjectURL(new Blob([annotatedXML ?? musicXML], { type: "application/vnd.recordare.musicxml+xml" }));
            const link = document.createElement("a"); link.href = url; link.download = "rehearsal.musicxml"; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>指示付きMusicXMLを保存</button>
          <ScoreDisplay focusVoice={displaySeat?.voice} focusStaff={displaySeat?.staff} focusLabel={displaySeat?.name} onSeek={(beat) => { const engine = engineRef.current; if (!engine || busy) return; engine.setLoop(null, null); setLoopEnabled(false); engine.restartFrom(playbackBeatForSource(score, beat, state.beat), 1); }} transpose={shift - instrumentKey + (playerPart(original!)?.transposeSemitones ?? 0)} followPosition musicXML={displayXML} currentMeasure={state.measure} currentBeat={(() => {
            const index = Math.max(0, score.measureStartBeats.reduce((found, beat, index) => beat <= state.beat ? index : found, 0));
            return (score.sourceMeasureStartBeats?.[score.playbackOrder[index]] ?? score.measureStartBeats[index]) + state.beat - score.measureStartBeats[index];
          })()} beatsPerMeasure={score.timeSignature.beats} totalMeasures={score.totalMeasures} engineState={state.status === "finished" ? "idle" : state.status} measures={annotations} measureNumbers={score.measureNumbers} />
        </section>}
        <footer className="concert-muted">音源: FluidR3 GM（CC BY 3.0） · {entry?.source && <a href={entry.source} target="_blank" rel="noreferrer">楽曲データの出典</a>} · <a href="/repertoire/SOURCES.md" target="_blank" rel="noreferrer">データと音源について</a> · <a href="/credits.html">出典とクレジット</a></footer>
      </>}
    </div>
  </StageLayout>;
}
