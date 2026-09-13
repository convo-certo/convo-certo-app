import type { PlaybackIssue } from '~/lib/musicxml-playback-issues';

export function PlaybackIssues({ issues }: { issues: PlaybackIssue[] }) {
  if (!issues.length) return null;
  return <details className="playback-issues" aria-label="MusicXMLの再生上の注意">
    <summary>この楽譜の再生上の注意（{issues.length}種類）</summary>
    <p>次の表現は、再生時の扱いを確認してください。</p>
    <ul>{issues.map(issue => <li key={issue.id}>
      <strong>{issue.title} · {issue.count}件</strong>
      <p>{issue.description}</p>
      <p className="concert-muted">場所: {issue.locations.map(location => `${location.part}・小節 ${location.measure}`).join('、')}{issue.locationCount > issue.locations.length ? `、ほか${issue.locationCount - issue.locations.length}箇所` : ''}</p>
    </li>)}</ul>
    <p className="concert-muted">検出した項目の案内です。すべての記譜法の正確さを保証するものではありません。</p>
  </details>;
}
