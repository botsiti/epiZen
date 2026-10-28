import { lookupImage, lookupJson } from '../../lib/api';
import { pacedAsk } from '../../lib/coverRun';
import type { Ask } from '../../lib/covers';
import { imageType } from '../../lib/library';

// Covers from a lookup, read once per URL for the whole session, through the backend (which
// allows only the lookup hosts). Shown from a blob; nothing is saved.
const fetched = new Map<string, Promise<string | undefined>>();

/** A lookup's cover as a URL to show it from, or `undefined` when there is none. */
export function remoteImage(url: string): Promise<string | undefined> {
  let found = fetched.get(url);
  if (!found) {
    found = lookupImage(url)
      .then((bytes) => {
        const view = new Uint8Array(bytes);
        return URL.createObjectURL(new Blob([view], { type: imageType(view) ?? 'image/jpeg' }));
      })
      .catch(() => undefined);
    fetched.set(url, found);
  }
  return found;
}

/** Whether a cover is really there: the Cover Art Archive has art for most albums, not all. */
export const hasRemoteImage = (url: string) => remoteImage(url).then(Boolean);

// Every search for a cover waits its turn at its service, across sheets and pages, for the session.
const pacers = new Map<string, () => Promise<void>>();

/** The backend's lookups, paced per service, busy ones asked again; each new run of searches remembers its own answers. */
export const coverAsk = (): Ask => pacedAsk(lookupJson, pacers);
