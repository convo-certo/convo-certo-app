import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export async function renderComparison(reportPath) {
  const source = await readFile(reportPath);
  const report = JSON.parse(source);
  const external = JSON.parse(await readFile(join(dirname(reportPath), "matchmaker.json"), "utf8"));
  if (createHash("sha256").update(source).digest("hex") !== external.sourceSha256) throw new Error("Matchmaker input hash differs from the TypeScript report");
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const labels = { "sustained-slow-two-beat": "2拍ごとに大きく減速し続ける", steady: "一定のテンポ", "fast-50ms": "50ms間隔の速い音列", "repeated-pitch-drift": "同音反復・伴奏の位置ずれ", "missing-and-extra": "音抜けと余分な音", "gradual-slowdown": "だんだん遅くする", "unannounced-backward-jump": "予告なく冒頭へ戻る", "long-breath": "途中で2.2秒長く息を継ぐ", "ambiguous-motif-return": "同じ旋律が続く場所で戻る", "wrong-note-existing-in-score": "楽譜の別の場所にある音を間違えて吹く" };
  const cards = report.results.map((scenario) => {
    const externalScenario = external.results.find((item) => item.scenario === scenario.scenario);
    const matchmaker = externalScenario?.matchmaker;
    if (!matchmaker || matchmaker.outcomes.length !== scenario.input.inputs.length) throw new Error(`Missing or incompatible scenario: ${scenario.scenario}`);
    const methods = [["標準", scenario.standard], ["音の並び（実験）", scenario.sequence], ["Matchmaker HMM", matchmaker], ...(["arzt", "dixon"].filter(key => externalScenario[key]).map(key => [`OLTW ${key}`, externalScenario[key]]))];
    for (const [name, score] of methods) if (score.outcomes.length !== scenario.input.inputs.length) throw new Error(`Incompatible ${name} outcomes`);
    const series = [["正解位置", scenario.input.inputs.map(item => item.targetBeat)], ...methods.map(([name, result]) => [name, result.outcomes.map(item => item.matchedBeat)])];
    const maxTime = Math.max(1, ...scenario.input.inputs.map(item => item.message.timestamp - scenario.input.inputs[0].message.timestamp));
    const beats = series.flatMap(([, values]) => values.filter(value => value != null));
    const minBeat = Math.min(0, ...beats), maxBeat = Math.max(1, ...beats);
    const colors = ["#111827", "#a43c24", "#167047", "#7145a0", "#006b9e", "#986300"];
    const traces = series.map(([name, values], index) => {
      const points = values.flatMap((beat, i) => beat == null ? [] : [[40 + 640 * (scenario.input.inputs[i].message.timestamp - scenario.input.inputs[0].message.timestamp) / maxTime, 190 - 160 * (beat - minBeat) / (maxBeat - minBeat)]]);
      return `<g data-series="${index}" fill="${colors[index]}" stroke="${colors[index]}"><title>${escape(name)}</title><polyline points="${points.map(point => point.join(",")).join(" ")}" fill="none" stroke-width="2" stroke-dasharray="${index ? `${index * 2} 3` : "none"}"/>${points.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="3"/>`).join("")}</g>`;
    }).join("");
    const chart = `<div class="trace-controls">${series.map(([name], index) => `<label><input type="checkbox" data-trace="${index}" checked> ${escape(name)}</label>`).join(" ")}</div><svg viewBox="0 0 720 230" role="img" aria-label="${escape(labels[scenario.scenario] ?? scenario.scenario)}：入力時刻と推定位置"><path d="M40 25V190H685" fill="none" stroke="#8b968d"/><text x="4" y="25">拍</text><text x="10" y="45">${maxBeat}</text><text x="10" y="193">${minBeat}</text><text x="40" y="218">0</text><text x="540" y="218">${maxTime} ms（入力時刻）</text>${traces}</svg><p class="chart-note">点が各入力での推定位置です。線は点を結んだ目印で、間の時刻の推定を表しません。チェックで重ねる方式を選べます。</p>`;
    const rows = methods.map(([name, score]) => `<tr><th scope="row">${name}</th><td>${score.correct} / ${score.labeledNotes}</td><td>${score.missed}</td><td>${score.wrongPosition}</td><td>${score.falseMatch} / ${score.extraNotes}</td></tr>`).join("");
    const events = scenario.input.inputs.map((input, i) => `<tr><td>${input.message.timestamp}</td><td>${input.message.note}</td><td>${input.targetBeat ?? "余分な音"}</td>${methods.map(([, score]) => `<td class="${score.outcomes[i].outcome === "correct" || score.outcomes[i].outcome === "rejectedExtra" ? "good" : "bad"}">${score.outcomes[i].matchedBeat ?? "見送り"}</td>`).join("")}</tr>`).join("");
    return `<section><h2>${escape(labels[scenario.scenario] ?? scenario.scenario)}</h2>${chart}<div class="scroll"><table><thead><tr><th>方式</th><th>位置正解</th><th>見逃し</th><th>位置間違い</th><th>余分な音への反応</th></tr></thead><tbody>${rows}</tbody></table></div><details><summary>音ごとの位置を見る</summary><p>位置の単位は拍。正解位置は追従器へ渡していません。</p><div class="scroll"><table><thead><tr><th>入力時刻 ms</th><th>MIDI音高</th><th>正解位置</th>${methods.map(([name]) => `<th>${escape(name)}</th>`).join("")}</tr></thead><tbody>${events}</tbody></table></div></details></section>`;
  }).join("");
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>共奏・追従研究室</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f3ee;color:#20372c;font:16px/1.7 system-ui,sans-serif}main{max-width:1050px;margin:auto;padding:32px 20px}h1{font-size:clamp(28px,5vw,42px);line-height:1.25}h2{font-size:20px}section,aside{background:white;border:1px solid #d9dfd8;border-radius:16px;padding:20px;margin:24px 0}aside{border-left:5px solid #9b671d;background:#fffbef}table{border-collapse:collapse;width:100%;white-space:nowrap;text-align:left}th,td{padding:10px;border-bottom:1px solid #e1e6df}thead{font-size:14px}tbody th{font-weight:500}.scroll{overflow-x:auto}details{margin-top:16px}summary{cursor:pointer;color:#235c43}.good{color:#1c6744}.bad{color:#982d19}small{overflow-wrap:anywhere}.trace-controls{display:flex;flex-wrap:wrap;gap:8px 16px}.trace-controls label{cursor:pointer;font-size:14px}svg{display:block;width:100%;max-height:300px}svg text{font:12px system-ui}.chart-note{font-size:13px;color:#526357}a{color:#235c43}</style><main><p>ConvoCerto / RESEARCH</p><h1>どこまで、演奏についてこられる？</h1><p>同じ自作の音列を各方式へ順番に入力し、位置を照合しました。生成日時：${escape(report.createdAt)}</p><aside><strong>これは実演の品質評価ではありません。</strong><br>ClariMate・マイク・伴奏音声を通さない部品比較です。外部の追従器は毎回位置を出力するため、余分な音への反応も数えます。同じ旋律が繰り返される場所の正解は、音高だけでは区別できません。OLTWはMIDIイベント版で、論文の音声版の再現実験ではありません。</aside>${cards}<p><a href="report.json">標準・実験方式の入力と結果 JSON</a> · <a href="matchmaker.json">Matchmakerの結果・環境 JSON</a></p><small>Matchmaker revision: ${escape(external.revision)}<br>入力 SHA-256: ${escape(external.sourceSha256)}<br>研究用ローカル比較。アプリの追従方式の自動変更は行いません。</small></main><script>document.querySelectorAll("input[data-trace]").forEach(input=>input.addEventListener("change",()=>{input.closest("section").querySelector('[data-series="'+input.dataset.trace+'"]').style.display=input.checked?"":"none"}));</script></html>`;
  const destination = join(dirname(reportPath), "comparison.html");
  await writeFile(destination, html);
  console.log(destination);
  return destination;
}
