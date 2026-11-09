import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {} from 'webdriverio';
import { prepareWindow } from '../e2e/support';
import { assertTestDesktop } from '../e2e/desktop';

vi.mock('../e2e/paths', () => ({ EVIDENCE: '/unused-e2e-evidence' }));
vi.mock('../e2e/desktop', () => ({ assertTestDesktop: vi.fn() }));
vi.mock('@wdio/globals', () => ({
  browser: {
    execute: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
    setWindowSize: vi.fn(),
  },
  $: vi.fn(), $$: vi.fn(), expect: vi.fn(),
}));

const show = vi.fn();
const setPosition = vi.fn();
const setAlwaysOnTop = vi.fn();
const monitors = [
  { name: 'Monitor #10145', position: { x: 0, y: 0 }, scaleFactor: 2 },
  { name: 'Monitor #41055', position: { x: -3456, y: 0 }, scaleFactor: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__TAURI__', {
    dpi: { PhysicalPosition: class { constructor(public x: number, public y: number) {} } },
    window: {
      availableMonitors: () => Promise.resolve(monitors),
      getCurrentWindow: () => ({ show, setPosition, setAlwaysOnTop }),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete document.documentElement.dataset.motion;
  document.head.querySelectorAll('style').forEach((style) => style.remove());
});

it('rejects unavailable display setup before showing a test window', async () => {
  vi.stubEnv('EPIZEN_TEST_DISPLAY', 'Missing Retina display');
  await expect(prepareWindow()).rejects.toThrow('The MacBook display is unavailable');
  expect(show).not.toHaveBeenCalled();
  expect(setAlwaysOnTop).not.toHaveBeenCalled();
});

it('does not show or raise a window when Desktop 2 cannot be verified', async () => {
  vi.mocked(assertTestDesktop).mockImplementationOnce(() => { throw new Error('Desktop 2 is unavailable.'); });
  await expect(prepareWindow()).rejects.toThrow('Desktop 2 is unavailable');
  expect(show).not.toHaveBeenCalled();
  expect(setPosition).not.toHaveBeenCalled();
  expect(setAlwaysOnTop).not.toHaveBeenCalled();
});

it('positions the requested Retina panel before showing the window without focusing it', async () => {
  vi.stubEnv('EPIZEN_TEST_DISPLAY', 'Monitor #41055');
  await prepareWindow();
  expect(setPosition).toHaveBeenCalledExactlyOnceWith({ x: -3392, y: 96 });
  expect(show).toHaveBeenCalledOnce();
  expect(setPosition.mock.invocationCallOrder[0]).toBeLessThan(show.mock.invocationCallOrder[0]!);
  expect(setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(true);
});
