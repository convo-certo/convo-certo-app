import type { PlaybackIssue } from '~/lib/musicxml-playback-issues';
import { useLocale } from '~/lib/locale-context';

const issueText: Record<string, { title: string; description: string }> = {
  grace: { title: 'Grace notes', description: 'Grace notes are excluded from playback and input matching. To include them, export them as notes with regular durations.' },
  ornaments: { title: 'Trills, ornaments and tremolos', description: 'The written notes play without extra notes generated from these symbols. MusicXML with ornaments written out as individual notes can be played.' },
  fermata: { title: 'Fermatas', description: 'A fermata symbol does not extend a note or pause accompaniment. Add “Wait for my cue” at a bar entrance when needed. Automatic mid-bar fermatas are not supported.' },
  wedge: { title: 'Crescendo and diminuendo hairpins', description: 'Complete hairpins change playback volume. Without an ending dynamic, a change of 24 MIDI velocity steps is estimated. Incomplete or overlapping hairpins, hairpins with another dynamic inside, and niente are not applied.' },
  unpitched: { title: 'Unpitched percussion', description: 'Unpitched percussion notes are excluded from accompaniment playback and input matching. Other pitched parts can still play.' },
  microtones: { title: 'Microtonal pitches', description: 'Single-note matching uses semitones, so microtonal notes may not match. Check the sounding pitch and adjust the score if needed.' },
  'written-jumps': { title: 'Text-only repeat instructions', description: 'Text such as D.C. or D.S. alone does not change playback order. Export MusicXML with playback jump targets, or select a position on the score.' },
  'missing-transpose': { title: 'Missing transposition information', description: 'An instrument name suggests that pitch information should be checked, but the MusicXML has no transposition element. Check written and sounding pitches before playing.' },
  'measure-overrun': { title: 'Bars longer than their time signature', description: 'Note and rest durations exceed the time signature. This may be a recognition or export error, or unusual notation. Check these bars against the source score because playback may drift. Notes are not shortened automatically.' },
};

export function PlaybackIssues({ issues }: { issues: PlaybackIssue[] }) {
  const { text } = useLocale();
  if (!issues.length) return null;
  return <details className="playback-issues" aria-label={text("MusicXMLの再生上の注意", "MusicXML playback notes")}>
    <summary>{text(`この楽譜の再生上の注意（${issues.length}種類）`, `Playback notes for this score (${issues.length})`)}</summary>
    <p>{text("次の表現は、再生時の扱いを確認してください。", "Check how these markings are played.")}</p>
    <ul>{issues.map(issue => <li key={issue.id}>
      <strong>{text(issue.title, issueText[issue.id]?.title ?? 'Notation to check')} · {text(`${issue.count}件`, `${issue.count} ${issue.count === 1 ? 'occurrence' : 'occurrences'}`)}</strong>
      <p>{text(issue.description, issueText[issue.id]?.description ?? 'Compare this notation with the source score before practising.')}</p>
      <p className="concert-muted">{text("場所: ", "Where: ")}{issue.locations.map(location => text(`${location.part}・小節 ${location.measure}`, `${location.part}, bar ${location.measure}`)).join(text('、', '; '))}{issue.locationCount > issue.locations.length ? text(`、ほか${issue.locationCount - issue.locations.length}箇所`, `; ${issue.locationCount - issue.locations.length} more locations`) : ''}</p>
    </li>)}</ul>
    <p className="concert-muted">{text("検出した項目の案内です。すべての記譜法の正確さを保証するものではありません。", "These are detected playback limitations, not a complete check of the score.")}</p>
  </details>;
}
