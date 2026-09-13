import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, readlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

export function releaseSourceHash() {
  const files = execFileSync('git', ['ls-files','-z','--cached','--others','--exclude-standard','--','app','public','native','scripts','e2e','package.json','package-lock.json','playwright.config.ts','vite.config.ts','tsconfig.json'], {maxBuffer:20_000_000}).toString().split('\0').filter(Boolean).sort();
  const digest = createHash('sha256');
  for (const path of files) { digest.update(path); digest.update('\0'); digest.update(readFileSync(path)); }
  return digest.digest('hex');
}

export function bundleHash(root) {
  const digest = createHash('sha256');
  const visit = (relative) => {
    const path = join(root, relative), stat = lstatSync(path);
    const type = stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : null;
    if (!type) throw new Error(`Unsupported bundle entry: ${relative}`);
    digest.update(JSON.stringify([relative, type, stat.mode & 0o777]));
    if (type === 'directory') for (const name of readdirSync(path).sort()) visit(relative ? `${relative}/${name}` : name);
    else if (type === 'link') digest.update(JSON.stringify(readlinkSync(path)));
    else digest.update(createHash('sha256').update(readFileSync(path)).digest());
  };
  visit('');
  return digest.digest('hex');
}

export function validateNativeRelease(report, sourceHash, appHash) {
  const required = ['typecheck', 'unit', 'web-build', 'browser', 'native-midi-parser', 'native-build', 'native-wkwebview', 'native-recovery'];
  if (report?.mechanicalPassed !== true || report.platform !== 'darwin' || !required.every(name => report.steps?.some(step => step.name === name && step.passed === true && step.status === 0))) throw new Error('A successful complete Mac release verification is required');
  if (report.sourceHash !== sourceHash) throw new Error('Sources changed since verification; run npm run verify:release again');
  if (!report.nativeBundleHash || report.nativeBundleHash !== appHash) throw new Error('Native bundle differs from the verified app; run npm run verify:release again');
}
