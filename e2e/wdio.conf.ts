import { browser } from '@wdio/globals';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TauriCapabilities } from '@wdio/tauri-service';
import { APP, COPY_PREFIX, DEMO_VAULT, EVIDENCE, vaultCopy } from './paths';

// Tests only ever touch a copy of the demo vault. The launcher makes the copy once;
// the test workers it starts inherit the path through the environment.
process.env.EPIZEN_E2E_VAULT ??= copyDemoVault();
// Refuses anything that isn't such a copy, before an app is opened on it or it is deleted.
vaultCopy();
// The app inherits this environment. A vault set in your shell must not leak into a test,
// and the app keeps its settings (the last vault, periodic notes) next to the copy, never in
// your own config folder.
delete process.env.EPIZEN_VAULT;
process.env.EPIZEN_CONFIG_DIR = join(dirname(vaultCopy()), 'config');

function copyDemoVault() {
  const copy = join(mkdtempSync(join(tmpdir(), COPY_PREFIX)), 'demo-vault');
  cpSync(DEMO_VAULT, copy, { recursive: true });
  return copy;
}

/**
 * One app launch per spec file, each with its own arguments. The service starts every
 * launch up front, so each needs its own WebDriver port or they all answer on one.
 */
const launch = (port: number, spec: string, appArgs: string[]): TauriCapabilities => ({
  browserName: 'tauri',
  'tauri:options': { application: APP },
  'wdio:tauriServiceOptions': { appArgs, embeddedPort: port },
  'wdio:specs': [spec],
});

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [
    launch(4445, './specs/no-vault.e2e.ts', []),
    launch(4446, './specs/vault-error.e2e.ts', ['--vault', join(tmpdir(), 'epizen-no-such-vault')]),
    launch(4447, './specs/vault.e2e.ts', ['--vault', vaultCopy()]),
  ],
  services: [['@wdio/tauri-service', { driverProvider: 'embedded' }]],
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 60_000 },
  reporters: ['spec'],
  logLevel: 'warn',
  waitforTimeout: 10_000,

  onPrepare() {
    rmSync(EVIDENCE, { recursive: true, force: true });
    mkdirSync(EVIDENCE, { recursive: true });
  },
  async afterTest(test, _context, { passed }) {
    if (!passed) await browser.saveScreenshot(join(EVIDENCE, `FAILED ${test.parent} - ${test.title}.png`));
  },
  onComplete() {
    rmSync(dirname(vaultCopy()), { recursive: true, force: true });
  },
};
