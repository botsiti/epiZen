import { beforeAll, describe, expect, it, vi } from 'vitest';
import { lookupImage } from '../../lib/api';
import { hasRemoteImage, remoteImage } from './remoteImage';

vi.mock('../../lib/api', () => ({ lookupImage: vi.fn() }));

beforeAll(() => { URL.createObjectURL = () => 'blob:cover'; });

describe('remote cover images', () => {
  it('distinguishes a missing image from a temporary error and retries after failures', async () => {
    vi.mocked(lookupImage).mockRejectedValueOnce('not found').mockRejectedValueOnce('the service is busy').mockResolvedValueOnce(new Uint8Array([0]).buffer);
    expect(await hasRemoteImage('https://coverartarchive.org/missing')).toBe(false);
    await expect(hasRemoteImage('https://coverartarchive.org/missing')).rejects.toBe('the service is busy');
    expect(await hasRemoteImage('https://coverartarchive.org/missing')).toBe(true);
    expect(await remoteImage('https://coverartarchive.org/missing')).toBe('blob:cover');
    expect(lookupImage).toHaveBeenCalledTimes(3);
  });
});
