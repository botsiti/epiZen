#!/usr/bin/env node
// `npm run check`: every check, in order, with its full output. Runs all of them even
// when one fails, then prints one line per check and exits non-zero if any failed.
// `npm run check:fast` (`--fast`) leaves out the e2e run: the day's loop, and CI on a pull
// request. The full run, e2e included, is for the evening, when Bat asks for it.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { diffSnapshots, snapshotVault } from './vault-snapshot.mjs';

const demoVault = fileURLToPath(new URL('../demo-vault', import.meta.url));
const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const steps = [
  ['versions', 'version:check'],
  ['cargo test', 'test:rust'],
  ['cargo clippy -D warnings', 'lint:rust'],
  ['eslint', 'lint'],
  ['tsc', 'typecheck'],
  ['vitest', 'test'],
  ['e2e (WebdriverIO)', 'test:e2e'],
].filter(([name]) => !(process.argv.includes('--fast') && name.startsWith('e2e')));

const before = snapshotVault(demoVault);
const results = [];

for (const [name, script] of steps) {
  console.log(`\n━━━ ${name} ━━━\n$ ${scripts[script]}\n`);
  const started = performance.now();
  const { status } = spawnSync('npm', ['run', '--silent', script], { stdio: 'inherit' });
  results.push({ name, ok: status === 0, seconds: (performance.now() - started) / 1000 });
}

// Tests may only ever touch a copy of the demo vault.
const changes = diffSnapshots(before, snapshotVault(demoVault));
console.log('\n━━━ demo-vault untouched ━━━\n');
console.log(changes.length ? changes.join('\n') : 'No file in demo-vault/ was added, removed or changed.');
results.push({ name: 'demo-vault untouched', ok: changes.length === 0, seconds: 0 });

const failed = results.filter((result) => !result.ok);
console.log('\n━━━ summary ━━━\n');
for (const { name, ok, seconds } of results) {
  console.log(`${ok ? '✔' : '✘'} ${name.padEnd(26)} ${seconds ? `${seconds.toFixed(1)}s` : ''}`);
}
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
