import { lookupImage, lookupJson } from '../../lib/api';
import { pacedAsk } from '../../lib/coverRun';
import type { Ask } from '../../lib/covers';
import { imageType } from '../../lib/library';

// Covers from a lookup, read once per URL for the whole session, through the backend (which
// allows only the lookup hosts). Shown from a blob; nothing is saved.
const fetched = new Map<string, Promise<string>>();

function fetchRemoteImage(url: string): Promise<string> {
  let found = fetched.get(url);
  if (!found) {
    found = lookupImage(url).then((bytes) => {
      const view = new Uint8Array(bytes);
      return URL.createObjectURL(new Blob([view], { type: imageType(view) ?? 'image/jpeg' }));
    });
    // Temporary failures must not poison the image cache for the rest of the session.
    found.catch(() => fetched.delete(url));
    fetched.set(url, found);
  }
  return found;
}

/** A lookup's cover as a URL to show it from, or `undefined` when it cannot be displayed. */
export function remoteImage(url: string): Promise<string | undefined> {
  return fetchRemoteImage(url).catch(() => undefined);
}

/** A missing image is not a match; network or service failures remain retryable errors. */
export const hasRemoteImage = (url: string) => fetchRemoteImage(url).then(() => true, (error: unknown) => {
  if (/not found/i.test(String(error))) return false;
  throw error;
});

// Every search for a cover waits its turn at its service, across sheets and pages, for the session.
const pacers = new Map<string, () => Promise<void>>();

/** The backend's lookups, paced per service, busy ones asked again; each new run of searches remembers its own answers. */
export const coverAsk = (): Ask => pacedAsk(lookupJson, pacers);
