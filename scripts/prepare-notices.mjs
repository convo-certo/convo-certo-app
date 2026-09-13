import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const paths = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { encoding:'utf8', maxBuffer:10_000_000 }).trim().split('\n').slice(1);
paths.push(join(process.cwd(), 'node_modules/@react-router/dev'));
const supplements = JSON.parse(readFileSync('scripts/notices/supplements.json','utf8'));
const packages = new Map();
for (const directory of paths) {
  if (!existsSync(join(directory, 'package.json'))) continue;
  const info = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const key = `${info.name}@${info.version}`;
  if (packages.has(key)) continue;
  const names = readdirSync(directory).sort();
  const documents = names.filter(name => /^(licen[sc]es?|copying|notice)([.-]|$)/i.test(name) && statSync(join(directory, name)).isFile()).map(name => ({ name, text:readFileSync(join(directory, name),'utf8') }));
  if (!documents.length) {
    const readme = names.find(name => /^readme([.-]|$)/i.test(name));
    if (readme) {
      const text = readFileSync(join(directory, readme), 'utf8');
      const match = text.match(/(?:^|\n)(?:#+\s*)?License[^\n]*\n[\s\S]*$/i);
      if (match && /Permission is hereby granted/.test(match[0])) documents.push({name:readme + ' (license section)', text:match[0].trim()});
    }
  }
  const supplement = supplements[key];
  if (!documents.length && supplement) {
    const bytes = readFileSync(join('scripts/notices', supplement.file));
    if (createHash('sha256').update(bytes).digest('hex') !== supplement.sha256) throw new Error(`Supplement integrity failed: ${key}`);
    documents.push({name:supplement.file, text:bytes.toString('utf8'), source:supplement.source, sha256:supplement.sha256, basis:supplement.basis});
  }
  packages.set(key, { name:info.name, version:info.version, declaredLicense:info.license ?? info.licenses ?? null, packagePath:relative(process.cwd(),directory), documents });
}
const entries = [...packages.values()].sort((a,b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'));
const missing = entries.filter(item => !item.documents.length).map(item => `${item.name}@${item.version}`);
const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const description = 'Installed production dependency inventory plus the React Router build package that contributes client runtime modules. This includes packages that may be removed by bundling. Embedded dependencies and separately downloaded assets require additional review. License declarations alone do not establish clearance.';
mkdirSync('public/notices', {recursive:true});
const inventory = { scope:description, lockfileSHA256:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'), missingLicenseText:missing, packages:entries };
writeFileSync('public/notices/dependencies.json',JSON.stringify(inventory,null,2)+'\n');
writeFileSync('public/notices/dependencies.html',`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ソフトウェアのライセンス — ConvoCerto</title><style>body{font:16px/1.7 system-ui;margin:24px auto;padding:0 20px;max-width:960px;color:#203a37}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}summary{cursor:pointer;padding:12px 0}a{color:#214f41}</style><a href="/credits.html">クレジットへ戻る</a><h1>ソフトウェアのライセンス</h1><p>使用ライブラリと関連パッケージに含まれる文書です。実際の配布コードに含まれないパッケージも一覧に含みます。</p><p>本文未取得: ${missing.length}件。名称や宣言だけで利用条件の確認完了とはしていません。</p>${entries.map(item=>`<details><summary>${escape(item.name)} ${escape(item.version)} — ${escape(typeof item.declaredLicense === 'string' ? item.declaredLicense : JSON.stringify(item.declaredLicense))}</summary>${item.documents.length ? item.documents.map(document=>`<h2>${escape(document.name)}</h2>${document.source ? `<p>補足資料の出典: <a href="${escape(document.source)}">公式ソースの固定版</a></p><p>${escape(document.basis)}</p>` : ""}<pre>${escape(document.text)}</pre>`).join('') : '<p>パッケージ内にライセンス本文を確認できませんでした。追加確認が必要です。</p>'}</details>`).join('')}</html>`);
console.log(`Collected ${entries.length} package notices; missing license text: ${missing.join(', ') || 'none'}`);
