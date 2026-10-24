// @vitest-environment node
// The e2e run deletes its vault copy when it ends. These pin down that it can only
// ever accept, open and delete a temporary copy it made, never a folder you point it at.
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COPY_PREFIX, DEMO_VAULT, isVaultCopy, vaultCopy } from '../e2e/paths';

const saved = process.env.EPIZEN_E2E_VAULT;
afterEach(() => {
  if (saved === undefined) delete process.env.EPIZEN_E2E_VAULT;
  else process.env.EPIZEN_E2E_VAULT = saved;
});

describe('isVaultCopy', () => {
  it('accepts the copy the e2e config makes', () => {
    const copy = join(mkdtempSync(join(tmpdir(), COPY_PREFIX)), 'demo-vault');
    expect(isVaultCopy(copy)).toBe(true);
    rmSync(dirname(copy), { recursive: true, force: true });
  });

  it('refuses real vaults, the fixture itself, and look-alikes', () => {
    for (const path of [
      join(homedir(), 'Documents/OBSIDIAN/Kaizen'),
      DEMO_VAULT,
      join(tmpdir(), 'demo-vault'),
      join(tmpdir(), 'other', 'demo-vault'),
      join(tmpdir(), `${COPY_PREFIX}abc`, 'notes'),
      join(tmpdir(), `${COPY_PREFIX}abc`, 'demo-vault', '..', '..', 'demo-vault'),
    ]) {
      expect(isVaultCopy(path), path).toBe(false);
    }
  });
});

describe('vaultCopy', () => {
  it('throws instead of handing out a folder that is not a copy', () => {
    process.env.EPIZEN_E2E_VAULT = join(homedir(), 'Documents/OBSIDIAN/Kaizen');
    expect(() => vaultCopy()).toThrow(/not a copy/);
    delete process.env.EPIZEN_E2E_VAULT;
    expect(() => vaultCopy()).toThrow(/No vault copy yet/);
  });
});
