#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pkg = json('package.json');
const lock = json('package-lock.json');
const tauri = json('src-tauri/tauri.conf.json');
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8');
const packageVersion = /(?<=\[package\][\s\S]*?\nversion = ")[^"]+/;
const lockedVersion = /(?<=\[\[package\]\]\nname = "epizen"\nversion = ")[^"]+/;
const current = pkg.version;
const valid = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const versions = [current, lock.version, lock.packages[''].version, tauri.version, cargo.match(packageVersion)?.[0], cargoLock.match(lockedVersion)?.[0]];
if (!valid.test(current) || versions.some((value) => value !== current)) throw new Error(`Version files disagree: ${versions.join(', ')}`);
const requested = process.argv[2];
if (requested === '--check') {
  console.log(`Version ${current} is consistent across npm, Cargo and Tauri.`);
} else {
  const [major, minor, patch] = current.split('.').map(Number);
  const next = requested === 'patch' ? `${major}.${minor}.${patch + 1}` : requested === 'minor' ? `${major}.${minor + 1}.0` : requested;
  if (!next || !valid.test(next)) throw new Error('Use npm run version:bump -- patch, minor, or an explicit version such as 0.3.0.');
  const compare = next.split('.').map(Number).findIndex((value, index) => value !== [major, minor, patch][index]);
  if (compare < 0 || Number(next.split('.')[compare]) < [major, minor, patch][compare]) throw new Error('A delivered version must increase.');
  pkg.version = next; lock.version = next; lock.packages[''].version = next; tauri.version = next;
  for (const [path, value] of [['package.json', pkg], ['package-lock.json', lock], ['src-tauri/tauri.conf.json', tauri]]) writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  writeFileSync('src-tauri/Cargo.toml', cargo.replace(packageVersion, next));
  writeFileSync('src-tauri/Cargo.lock', cargoLock.replace(lockedVersion, next));
  console.log(`${current} → ${next}. Add releases/${next}.md before publishing v${next}.`);
}
