import { $, $$, browser, expect } from '@wdio/globals';
import { dirname, join } from 'node:path';
import { diffSnapshots, snapshotVault } from '../../scripts/vault-snapshot.mjs';
import { vaultCopy } from '../paths';
import { addFilter, closeTool, prepareWindow, screenshot } from '../support';

const root = join(dirname(vaultCopy()), 'filters-vault');

describe('advanced library filters', () => {
  before(prepareWindow);
  it('filters, persists across restart, and leaves every note untouched', async () => {
    const before = snapshotVault(root);
    await $('[data-testid="open-library"]').click();
    await $('[data-testid="filter-bar"]').waitForDisplayed();
    if (await $('[data-testid="filter-reset"]').isExisting()) await $('[data-testid="filter-reset"]').click();
    await $('[data-testid="filter-all-time"]').click();
    await addFilter('rating');
    await $('[data-testid="rating-preset"][data-rating="90"]').click();
    await expect($('[data-testid="filter-rating"]')).toHaveText(expect.stringContaining('90+'));
    await closeTool('filter-rating');
    const ratings = $$('[data-testid="library-rating"]'), count = await ratings.length;
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index++) expect(Number(await ratings[index]!.getText())).toBeGreaterThanOrEqual(90);
    await browser.waitUntil(() => browser.execute(async () => {
      const tauri = (window as unknown as { __TAURI__: { core: { invoke: (command: string) => Promise<{ libraryFilters?: { rating?: { min?: number } } }> } } }).__TAURI__;
      return (await tauri.core.invoke('get_settings')).libraryFilters?.rating?.min === 90;
    }), { timeoutMsg: 'the filter was not saved' });
    await browser.setWindowSize(880, 760);
    await screenshot('231-library-advanced-filters');
    expect(await browser.execute(() => document.querySelector('.main')!.scrollWidth <= document.querySelector('.main')!.clientWidth)).toBe(true);
    await browser.refresh(); await prepareWindow();
    await $('[data-testid="open-library"]').click();
    await expect($('[data-testid="filter-rating"]')).toHaveText(expect.stringContaining('90+'));
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
});
