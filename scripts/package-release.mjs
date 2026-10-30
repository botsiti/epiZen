#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const app = resolve(process.argv[2] ?? 'src-tauri/target/release/bundle/macos/Epizen.app');
if (process.platform !== 'darwin' || basename(app) !== 'Epizen.app') throw new Error('Package the production Epizen.app on macOS.');
const plist = `${app}/Contents/Info.plist`;
const field = (key) => execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim();
if (field('CFBundleIdentifier') !== 'dev.epizen.desktop' || field('CFBundleShortVersionString') !== version) throw new Error('The built app does not match this version.');
const architecture = execFileSync('lipo', ['-archs', `${app}/Contents/MacOS/epizen`], { encoding: 'utf8' }).trim();
if (architecture !== 'arm64') throw new Error(`Expected the Apple Silicon build, got ${architecture}.`);
const output = resolve('release-artifacts');
const name = `Epizen_${version}_macOS_arm64.zip`;
mkdirSync(output, { recursive: true });
if (existsSync(`${output}/${name}`)) throw new Error(`Refusing to replace ${name}; deliver a new version instead.`);
execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'dev.epizen.desktop', app], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, `${output}/${name}`]);
const digest = createHash('sha256').update(readFileSync(`${output}/${name}`)).digest('hex');
writeFileSync(`${output}/SHA256SUMS`, `${digest}  ${name}\n`);
console.log(`${output}/${name}`);
