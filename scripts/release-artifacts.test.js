import { expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleHash, validateNativeRelease } from './release-artifacts.mjs';

test('bundle evidence detects bytes, permissions, empty directories and link targets', () => {
  const root = mkdtempSync(join(tmpdir(), 'convocerto-hash-'));
  try {
    writeFileSync(join(root, 'app'), 'first');
    const first = bundleHash(root);
    writeFileSync(join(root, 'app'), 'other');
    expect(bundleHash(root)).not.toBe(first);
    const second = bundleHash(root);
    chmodSync(join(root, 'app'), 0o700);
    expect(bundleHash(root)).not.toBe(second);
    const third = bundleHash(root);
    mkdirSync(join(root, 'empty'));
    expect(bundleHash(root)).not.toBe(third);
    symlinkSync('app', join(root, 'link'));
    const linked = bundleHash(root);
    unlinkSync(join(root, 'link')); symlinkSync('empty', join(root, 'link'));
    expect(bundleHash(root)).not.toBe(linked);
    expect(bundleHash(root)).toBe(bundleHash(root));
  } finally { rmSync(root, {recursive:true,force:true}); }
});

test('packaging rejects failed, incomplete, stale and replaced build evidence', () => {
  const report = { mechanicalPassed:true, platform:'darwin', sourceHash:'source', nativeBundleHash:'app', steps:['typecheck','unit','web-build','browser','native-midi-parser','native-build','native-wkwebview','native-recovery'].map(name=>({name,passed:true,status:0})) };
  expect(()=>validateNativeRelease(report,'source','app')).not.toThrow();
  expect(()=>validateNativeRelease({...report,mechanicalPassed:false},'source','app')).toThrow();
  expect(()=>validateNativeRelease({...report,steps:report.steps.slice(0,-1)},'source','app')).toThrow();
  expect(()=>validateNativeRelease(report,'edited','app')).toThrow('Sources changed');
  expect(()=>validateNativeRelease(report,'source','replaced')).toThrow('Native bundle differs');
  expect(()=>validateNativeRelease({...report,nativeBundleHash:undefined},'source','app')).toThrow('Native bundle differs');
});
