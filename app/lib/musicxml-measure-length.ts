export function overlongMeasures(part: Element): Element[] {
  let divisions: number | null = null;
  let beats: number | null = null;
  const result: Element[] = [];
  for (const measure of Array.from(part.children).filter(child => child.localName === 'measure')) {
    let cursor = 0, previousOnset = 0, extent = 0;
    let reliable = true;
    for (const element of Array.from(measure.children)) {
      if (element.localName === 'attributes') {
        const division = element.querySelector(':scope > divisions');
        if (division) {
          const value = Number(division.textContent);
          divisions = Number.isFinite(value) && value > 0 ? value : null;
        }
        const times = Array.from(element.children).filter(child => child.localName === 'time');
        if (times.length) {
          if (extent > 0) reliable = false;
          beats = null;
          if (times.length === 1 && !times[0].hasAttribute('number') && !times[0].querySelector('senza-misura')) {
            const children = Array.from(times[0].children);
            let total = 0, valid = true, pairs = 0;
            for (let i = 0; i < children.length; i++) {
              if (children[i].localName !== 'beats') continue;
              const numerator = children[i].textContent?.trim() ?? '';
              const denominator = children[i + 1]?.localName === 'beat-type' ? Number(children[i + 1].textContent) : NaN;
              if (!/^\d+(\s*\+\s*\d+)*$/.test(numerator) || !Number.isFinite(denominator) || denominator <= 0) { valid = false; break; }
              const sum = numerator.split('+').reduce((sum, value) => sum + Number(value), 0);
              if (sum <= 0) { valid = false; break; }
              total += sum * 4 / denominator;
              pairs++;
            }
            if (valid && pairs && Number.isFinite(total)) beats = total;
          }
        }
        continue;
      }
      if (!['note', 'backup', 'forward'].includes(element.localName) || element.querySelector(':scope > grace')) continue;
      const raw = element.querySelector(':scope > duration');
      const duration = raw && divisions ? Number(raw.textContent) / divisions : NaN;
      if (!Number.isFinite(duration) || duration < 0) { reliable = false; continue; }
      if (element.localName === 'backup') {
        cursor -= duration;
        if (cursor < -0.000001) reliable = false;
      } else if (element.localName === 'forward') {
        cursor += duration;
        extent = Math.max(extent, cursor);
      } else {
        if (!element.querySelector(':scope > chord')) { previousOnset = cursor; cursor += duration; }
        extent = Math.max(extent, previousOnset + duration);
      }
    }
    if (reliable && beats !== null && measure.getAttribute('implicit') !== 'yes' && measure.getAttribute('non-controlling') !== 'yes' && extent > beats + 0.000001) result.push(measure);
  }
  return result;
}
