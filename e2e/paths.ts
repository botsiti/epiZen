import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const DEMO_VAULT = join(root, 'demo-vault');
export const EVIDENCE = join(root, 'evidence');
/** Built by `npm run build:e2e`: a debug build with the test-only WebDriver plugin. */
export const APP = join(root, 'src-tauri/target/debug/epizen');

/** The temporary copy of the demo vault that the app under test opens. */
export function vaultCopy(): string {
  const path = process.env.EPIZEN_E2E_VAULT;
  if (!path) throw new Error('EPIZEN_E2E_VAULT is not set; run the tests through e2e/wdio.conf.ts');
  return path;
}
