import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const DEMO_VAULT = join(root, 'demo-vault');
export const EVIDENCE = join(root, 'evidence');
/** Built by `npm run build:e2e`: a debug build with the test-only WebDriver plugin. */
export const APP = join(root, 'src-tauri/target/debug/epizen');
/** The e2e config copies the demo vault to `<tmp>/epizen-e2e-XXXXXX/demo-vault`. */
export const COPY_PREFIX = 'epizen-e2e-';

/** How the demo vault names its periodic notes; the e2e config seeds the app's settings with it. */
export const PERIODIC = {
  day: { folder: 'Calendar/2026/days 2026', format: 'DD.MM.YYYY', template: 'Templates/Daily' },
  week: { folder: 'Calendar/2026/weeks', format: 'GGGG-[W]WW - DD.MM.YY', template: 'Templates/Weekly' },
  month: { folder: 'Calendar/2026/months 2026', format: 'MM.YY [RPG]', template: 'Templates/Monthly' },
};

/** True only for a folder shaped like the copy the e2e config makes, so nothing else is ever opened or deleted. */
export function isVaultCopy(path: string): boolean {
  const copy = resolve(path);
  const parent = dirname(copy);
  return basename(copy) === 'demo-vault' && dirname(parent) === resolve(tmpdir()) && basename(parent).startsWith(COPY_PREFIX);
}

/** The temporary copy of the demo vault that the app under test opens. */
export function vaultCopy(): string {
  const path = process.env.EPIZEN_E2E_VAULT;
  if (!path) throw new Error('No vault copy yet. Run the e2e tests through e2e/wdio.conf.ts, which makes one.');
  if (!isVaultCopy(path)) {
    throw new Error(`EPIZEN_E2E_VAULT=${path} is not a copy made by e2e/wdio.conf.ts. Unset it and run again.`);
  }
  return path;
}
