import { overlongMeasures } from "./musicxml-measure-length";
import { musicXMLDocument } from './musicxml-import';

export interface PlaybackIssue {
  id: string;
  title: string;
  description: string;
  count: number;
  locations: { part: string; measure: string }[];
  locationCount: number;
}

const rules = [
  { id: 'grace', title: '装飾音', selector: 'note > grace', description: '小さく記譜された装飾音は、発音・追従の対象に含めません。必要なら通常の長さを持つ音符に書き出し直してください。' },
  { id: 'ornaments', title: 'トリル・装飾記号・トレモロ', selector: 'ornaments > :not(accidental-mark)', description: '記号から細かい音符を生成せず、元の音符だけを演奏します。細かい音符へ展開したMusicXMLなら音列を扱えます。' },
  { id: 'fermata', title: 'フェルマータ', selector: 'fermata', description: '記号だけでは音を長くしたり伴奏を待機させたりしません。必要な小節の入りに「合図を待つ」を指定できます。小節途中のフェルマータの自動解釈は未対応です。' },
  { id: 'wedge', title: 'ヘアピンの強弱', selector: 'wedge[type="crescendo"], wedge[type="diminuendo"]', description: '開始と終了がそろうヘアピンを音量に反映します。終点の強弱がなければ24段階の変化を推定します。未完の区間、重複する区間、途中で別の強弱が入る区間、nienteは反映しません。' },
  { id: 'unpitched', title: '無音程の打楽器', selector: 'note > unpitched', description: '無音程の打楽器の音符は、伴奏の発音・入力の照合に含めません。他の音程付きパートは演奏できます。' },
  { id: 'microtones', title: '半音より細かい音高', selector: 'pitch > alter', description: '単音入力の照合は半音単位なので、微分音の音符は照合できない場合があります。実音を確認し、必要なら楽譜側で音高を調整してください。' },
  { id: 'written-jumps', title: '文字だけの戻り指示', selector: 'direction-type > words', description: 'D.C.・D.S.などの文字だけでは再生順に反映しません。再生用の戻り先を含むMusicXMLで書き出すか、楽譜を押して再生位置を指定してください。' },
];

export function inspectMusicXMLPlayback(xml: string): PlaybackIssue[] {
  const doc = musicXMLDocument(xml);
  const parts = Array.from(doc.documentElement.children).filter(element => element.localName === 'part');
  const names = new Map(Array.from(doc.querySelectorAll('part-list > score-part')).map(part => [part.getAttribute('id'), part.querySelector('part-name')?.textContent?.trim() || part.getAttribute('id') || 'パート']));
  const issues = rules.flatMap(rule => {
    let count = 0;
    const locations = new Map<string, { part: string; measure: string }>();
    for (const [partIndex, part] of parts.entries()) {
      if (rule.id === 'written-jumps' && partIndex !== 0) continue;
      const measures = Array.from(part.children).filter(element => element.localName === 'measure');
      const indices = new Map(measures.map((measure, index) => [measure, index]));
      for (const element of part.querySelectorAll(rule.selector)) {
        if (rule.id === 'microtones' && (!Number.isFinite(Number(element.textContent)) || Number.isInteger(Number(element.textContent)))) continue;
        if (rule.id === 'written-jumps' && !/\b(?:D\.?\s*[CS]\.?|da\s+capo|dal\s+segno|al\s+coda)\b/i.test(element.textContent ?? '')) continue;
        const measure = element.closest('measure');
        if (!measure) continue;
        if (rule.id === 'written-jumps' && measure.querySelector('sound[dacapo], sound[dalsegno], sound[tocoda]')) continue;
        const index = indices.get(measure);
        if (index == null) continue;
        count++;
        locations.set(`${partIndex}:${index}`, { part: names.get(part.getAttribute('id')) ?? 'パート', measure: measure.getAttribute('number') || String(index + 1) });
      }
    }
    return count ? [{ id: rule.id, title: rule.title, description: rule.description, count, locations: [...locations.values()].slice(0, 4), locationCount: locations.size }] : [];
  });
  const overlong = parts.flatMap(part => overlongMeasures(part).map(measure => ({ part: names.get(part.getAttribute('id')) ?? 'パート', measure: measure.getAttribute('number') ?? '?' })));
  if (overlong.length) issues.push({ id: 'measure-overrun', title: '拍子より長い小節', description: '音符・休符の長さが記録された拍子を超えています。認識・書き出しの誤り、または特殊な記譜の可能性があります。伴奏と譜面がずれることがあるため、元の楽譜で該当小節を確認してください。音符を自動で短くする修正は行いません。', count: overlong.length, locations: overlong.slice(0, 4), locationCount: overlong.length });
  return issues;
}
