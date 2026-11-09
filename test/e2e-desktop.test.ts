import { expect, it } from 'vitest';
import { isDesktopTwo } from '../e2e/desktop';

const space = (id: number, type = 0) => ({ ManagedSpaceID: id, type });
const configuration = (current: number, spaces: unknown[] = [space(1), space(210)]) => ({
  SpacesDisplayConfiguration: { 'Management Data': { Monitors: [
    { 'Current Space': space(current), Spaces: spaces },
    { 'Collapsed Space': space(4) },
  ] } },
});

it('permits Desktop 2 and refuses the user’s first desktop', () => {
  expect(isDesktopTwo(configuration(210))).toBe(true);
  expect(isDesktopTwo(configuration(1))).toBe(false);
});
it('counts desktops separately from fullscreen app Spaces', () => {
  const spaces = [space(1), space(50, 4), space(210)];
  expect(isDesktopTwo(configuration(210, spaces))).toBe(true);
  expect(isDesktopTwo(configuration(50, spaces))).toBe(false);
});
it('refuses missing, malformed or ambiguous desktop information', () => {
  for (const value of [null, {}, configuration(1, [space(1)]), configuration(210, []), configuration(999)]) expect(isDesktopTwo(value)).toBe(false);
  const multiple = configuration(210);
  multiple.SpacesDisplayConfiguration['Management Data'].Monitors.push({ 'Current Space': space(1), Spaces: [space(1), space(2)] });
  expect(isDesktopTwo(multiple)).toBe(false);
});
