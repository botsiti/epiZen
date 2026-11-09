import { execFileSync } from 'node:child_process';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Fail closed when macOS cannot identify Desktop 2 on the active display. */
export function isDesktopTwo(value: unknown): boolean {
  const configuration = object(object(value).SpacesDisplayConfiguration);
  const monitors = object(configuration['Management Data']).Monitors;
  if (!Array.isArray(monitors)) return false;
  const active = monitors.map(object).filter((monitor) => Array.isArray(monitor.Spaces));
  return active.length > 0 && active.every((monitor) => {
    const desktops = (monitor.Spaces as unknown[]).map(object).filter((space) => space.type === 0);
    const second = desktops[1]?.ManagedSpaceID;
    return typeof second === 'number' && object(monitor['Current Space']).ManagedSpaceID === second;
  });
}

/** Runs before WDIO's service can launch any apps. Never switches the user's desktop. */
export function assertTestDesktop() {
  if (process.platform !== 'darwin' || (process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted')) return;
  let state: unknown;
  try {
    const plist = execFileSync('/usr/bin/defaults', ['export', 'com.apple.spaces', '-'], { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
    state = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: plist, timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  } catch {
    throw new Error('Could not verify Desktop 2. No Epizen test windows were opened. Keep native checks deferred until Desktop 2 can be verified.');
  }
  if (!isDesktopTwo(state)) throw new Error('Epizen native tests require Desktop 2. No test windows were opened; run from Desktop 2 without switching or interrupting the user’s desktop.');
}
