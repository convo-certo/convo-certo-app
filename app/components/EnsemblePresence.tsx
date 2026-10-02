import { useEffect, useRef } from "react";
import type { OrchestraAudio } from "~/lib/orchestra-audio";
import type { ConcertState } from "~/lib/concert-engine";
import type { ScorePart } from "~/lib/types";
import { useLocale } from "~/lib/locale-context";
import { performanceName } from "~/lib/performance-seats";

export function EnsemblePresence({ audio, state, onOpenSpace, parts, nextEntry, beatUnit = 1, onCue, canCue, inputConnected = false, cameraEnabled = false }: { audio: OrchestraAudio; state: ConcertState; onOpenSpace?: () => void; parts: ScorePart[]; nextEntry?: number; beatUnit?: number; onCue: () => void; canCue: boolean; inputConnected?: boolean; cameraEnabled?: boolean }) {
  const { locale, text } = useLocale();
  const surface = useRef<HTMLDivElement>(null);
  const playing = state.status === "playing";
  const waiting = state.status === "waiting";
  useEffect(() => {
    let sounds: { part: number; start: number; end: number; level: number }[] = [];
    const unsubscribe = audio.observeSound(sound => { if (sound) sounds.push(sound); else sounds = []; });
    let frame = 0;
    const draw = () => {
      const now = audio.currentTime;
      sounds = sounds.filter(sound => sound.end > now);
      let total = 0;
      surface.current?.querySelectorAll<HTMLElement>("[data-part]").forEach(element => {
        const sounding = sounds.filter(sound => sound.part === Number(element.dataset.part) && sound.start <= now);
        const level = Math.min(1, sounding.reduce((max, sound) => Math.max(max, sound.level * Math.min(1, (sound.end - now) / 0.15)), 0) * 3);
        total = Math.max(total, level);
        element.style.setProperty("--energy", String(level));
        element.dataset.sounding = String(level > 0);
      });
      surface.current?.style.setProperty("--ensemble-energy", String(total));
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { unsubscribe(); cancelAnimationFrame(frame); };
  }, [audio, parts]);
  const until = nextEntry == null ? null : Math.max(0, Math.ceil((nextEntry - state.beat) / beatUnit));
  const cues = [inputConnected && text("音", "Play"), cameraEnabled && text("うなずき", "Nod"), text("タップ", "Tap")].filter(Boolean).join(text("・", " · "));
  const waitingMessage = canCue ? text("あなたの合図を待っています", "Ready when you are") : text("次の音を待っています", "Waiting for the next note");
  return <div ref={surface} className={`ensemble-presence ${waiting ? "is-waiting" : ""}`} aria-label={text("伴奏の動き", "Ensemble activity")}>
    <button className="ensemble-orb" disabled={!waiting || !canCue} onClick={onCue} aria-label={waiting && canCue ? text("伴奏に入りの合図を送る", "Cue the ensemble") : text("伴奏の発音に連動する表示", "Accompaniment activity")}><span aria-hidden="true">{waiting ? "Ⅱ" : "·"}</span></button>
    <div className="presence-caption"><strong>{waiting ? waitingMessage : state.countInRemaining ? text("まもなく入り", "Get ready") : playing ? until && until > 0 ? text(`あなたの入りまで ${until} 拍`, `Your entry in ${until} beats`) : text("伴奏を演奏中", "Accompaniment playing") : text("伴奏の音が、ここに見えます", "See your ensemble play")}</strong><small>{waiting ? canCue ? cues : inputConnected ? text("次の音を演奏", "Play the next note") : text("マイクまたはMIDIを接続", "Connect a microphone or MIDI device") : text("光は発音、広がりは音の強さ", "Light follows the sound and its intensity")}</small></div>
    {onOpenSpace && <button className="presence-arrangement" onClick={onOpenSpace}>{text("楽器の配置", "Positions")}</button>}
    <div className="ensemble-lights">{parts.map((part, index) => !part.isSolo && <div data-part={index} data-sounding="false" className="ensemble-light" key={part.id}><i aria-hidden="true"/><span>{performanceName(part, locale)}</span></div>)}</div>
  </div>;
}
