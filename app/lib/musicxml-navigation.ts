export function musicXMLPlaybackOrder(measures: Element[]): number[] {
  const regions: { start: number; end: number; times: number }[] = [];
  const stack: number[] = [];
  const endings: (number[] | null)[] = [];
  let ending: number[] | null = null;
  measures.forEach((measure, index) => {
    if (measure.querySelector("repeat[direction='forward'], sound[forward-repeat]")) stack.push(index);
    const begin = measure.querySelector("ending[type='start']");
    if (begin) ending = (begin.getAttribute("number") ?? "").split(/[, ]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    endings.push(ending);
    if (measure.querySelector("ending[type='stop'], ending[type='discontinue']")) ending = null;
    const back = measure.querySelector("repeat[direction='backward']");
    if (back) regions.push({ start: stack.pop() ?? 0, end: index, times: Math.max(1, Math.min(8, Number(back.getAttribute("times") ?? 2) || 2)) });
  });
  for (const start of stack) regions.push({ start, end: measures.length - 1, times: 2 });
  const passes = new Map<number, number>();
  const order: number[] = [];
  let jumped = false;
  let codaJumped = false;
  let previousRegion: typeof regions[number] | undefined;
  let index = 0;
  let steps = 0;
  while (index < measures.length && steps++ < 100000) {
    const measure = measures[index];
    const region = regions.filter((item) => item.start <= index && item.end >= index).sort((a, b) => b.start - a.start || a.end - b.end)[0];
    const pass = passes.get((region ?? previousRegion)?.end ?? -1) ?? 1;
    const allowed = !endings[index]?.length || endings[index]!.includes(pass);
    if (allowed) order.push(index);
    const sounds = Array.from(measure.querySelectorAll("sound"));
    if (jumped && allowed && sounds.some((sound) => sound.hasAttribute("fine"))) break;
    if (jumped && !codaJumped && allowed) {
      const coda = sounds.find((sound) => sound.hasAttribute("tocoda"))?.getAttribute("tocoda");
      if (coda) {
        const target = measures.findIndex((item) => Array.from(item.querySelectorAll("sound")).some((sound) => sound.getAttribute("coda") === coda));
        if (target >= 0) { index = target; codaJumped = true; continue; }
      }
    }
    if (!jumped && allowed) {
      const dc = sounds.some((sound) => sound.getAttribute("dacapo") === "yes");
      const ds = sounds.find((sound) => sound.hasAttribute("dalsegno"))?.getAttribute("dalsegno");
      if (dc || ds) {
        const target = dc ? 0 : measures.findIndex((item) => Array.from(item.querySelectorAll("sound")).some((sound) => sound.getAttribute("segno") === ds));
        if (target < 0) throw new Error("D.S.の戻り先が見つかりません。");
        jumped = true; index = target; continue;
      }
    }
    const closing = regions.filter((item) => item.end === index).sort((a, b) => b.start - a.start);
    let repeat = false;
    for (const item of closing) {
      previousRegion = item;
      const current = passes.get(item.end) ?? 1;
      if (!jumped && current < item.times) {
        passes.set(item.end, current + 1);
        for (const inner of regions) if (inner.start >= item.start && inner.end < item.end) passes.delete(inner.end);
        index = item.start; repeat = true; break;
      }
    }
    if (!repeat) index++;
  }
  if (steps >= 100000) throw new Error("反復の展開回数が多すぎます。反復記号を確認してください。");
  return order;
}
