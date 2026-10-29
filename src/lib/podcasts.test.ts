import { describe, expect, it } from 'vitest';
import { podcastSettings } from './podcasts';

describe('podcast settings', () => {
  it('defaults missing or malformed settings to the show thumbnail', () => {
    for (const value of [undefined, null, false, 'episode', [], {}, { artwork: false }, { artwork: 'unknown' }]) {
      expect(podcastSettings(value)).toEqual({ artwork: 'show' });
    }
  });

  it('reads either artwork preference from saved settings', () => {
    for (const artwork of ['show', 'episode']) expect(podcastSettings(JSON.parse(JSON.stringify({ artwork })))).toEqual({ artwork });
  });
});
