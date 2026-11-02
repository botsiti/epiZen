import { browser } from '@wdio/globals';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TauriCapabilities } from '@wdio/tauri-service';
import { makeBigVault } from './big-vault';
import { failureScreenshotName } from './failure-screenshot';
import { APP, COPY_PREFIX, DEMO_VAULT, EVIDENCE, PERIODIC, vaultCopy } from './paths';
import { DEFAULT_PERIODIC } from '../src/lib/periodic';

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
  // The demo vault's periodic notes, set up the way a user would in Settings.
  const config = join(dirname(copy), 'config');
  mkdirSync(config);
  // Vault::open canonicalizes paths (on macOS, /var resolves to /private/var).
  // Settings must use the same roots or the test vaults appear to need first-run setup.
  const canonicalParent = realpathSync(dirname(copy));
  writeFileSync(join(config, 'settings.json'), JSON.stringify({ periodic: PERIODIC, legacyPeriodicVault: join(canonicalParent, 'demo-vault'), vaults: { [join(canonicalParent, 'big-vault')]: { complete: true, periodic: DEFAULT_PERIODIC } } }));
  // A generated vault for the graph's 2,000-note check, beside the copy so it goes with it.
  makeBigVault(join(dirname(copy), 'big-vault'));
  mkdirSync(join(dirname(copy), 'starter-vault'));
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
    launch(4448, './specs/graph-2000.e2e.ts', ['--vault', join(dirname(vaultCopy()), 'big-vault')]),
    launch(4449, './specs/setup.e2e.ts', ['--vault', join(dirname(vaultCopy()), 'starter-vault')]),
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
  // Start hidden, choose the built-in panel on the user's Mac, then show without focus.
  // Hosted runners may only have a virtual monitor; the explicit local flag requires Retina.
  async before() {
    await browser.execute(async (displayName) => {
      const tauri = (window as unknown as { __TAURI__: {
        dpi: { PhysicalPosition: new (x: number, y: number) => unknown };
        window: {
          availableMonitors: () => Promise<{ name: string | null; position: { x: number; y: number }; scaleFactor: number }[]>;
          getCurrentWindow: () => { setPosition: (position: unknown) => Promise<void>; show: () => Promise<void> };
        };
      } }).__TAURI__;
      const monitors = await tauri.window.availableMonitors();
      const builtIn = monitors.find((monitor) => displayName && displayName !== 'builtin' ? monitor.name === displayName : /built.?in|color lcd|retina/i.test(monitor.name ?? ''));
      if (displayName && !builtIn) throw new Error(`The MacBook display is unavailable: ${monitors.map((monitor) => monitor.name).join(', ')}`);
      const current = tauri.window.getCurrentWindow();
      if (builtIn) await current.setPosition(new tauri.dpi.PhysicalPosition(builtIn.position.x + Math.round(32 * builtIn.scaleFactor), builtIn.position.y + Math.round(48 * builtIn.scaleFactor)));
      await current.show();
    }, process.env.EPIZEN_TEST_DISPLAY ?? '');
  },
  // The service launches all test apps up front. Reorder the current test window at its
  // floating level without activating it, so earlier windows or another Space cannot occlude
  // its WebKit renderer and suspend animation frames.
  async beforeTest() {
    await browser.execute(async () => {
      const tauri = (window as unknown as { __TAURI__: { window: { getCurrentWindow: () => { setAlwaysOnTop: (value: boolean) => Promise<void> } } } }).__TAURI__;
      const current = tauri.window.getCurrentWindow();
      await current.setAlwaysOnTop(false);
      await current.setAlwaysOnTop(true);
    });
  },
  // The next worker gets the floating slot; leave the keyboard focus with the user.
  async after() {
    await browser.execute(async () => {
      const tauri = (window as unknown as { __TAURI__: { window: { getCurrentWindow: () => { setAlwaysOnTop: (value: boolean) => Promise<void> } } } }).__TAURI__;
      await tauri.window.getCurrentWindow().setAlwaysOnTop(false);
    });
  },
  async afterTest(test, _context, { passed }) {
    if (!passed) await browser.saveScreenshot(join(EVIDENCE, failureScreenshotName(test.parent, test.title)));
  },
  onComplete() {
    rmSync(dirname(vaultCopy()), { recursive: true, force: true });
  },
};
