import { describe, expect, it } from 'vitest';
import { ALL_PLUGINS, NO_PLUGINS, DEFAULT_HOME_SECTIONS, checkInSettings, effectivePlugins, pluginPreferencesPatch, pluginSettings, savedCheckIns, setPlugin } from './plugins';

describe('built-in plugins', () => {
  it('starts new vaults with the Markdown core and preserves existing configured vaults', () => {
    expect(pluginSettings({}, '/new')).toEqual(NO_PLUGINS);
    expect(pluginSettings({ vaults: { '/old': { complete: true } } }, '/old')).toEqual(ALL_PLUGINS);
    expect(pluginSettings({ legacyPeriodicVault: '/old', periodicFeatures: { habits: false, thoughtRecords: false } }, '/old')).toEqual({ ...ALL_PLUGINS, habits: false, cbt: false });
    expect(pluginSettings({ legacyPeriodicVault: '/old' }, '/new')).toEqual(NO_PLUGINS);
  });
  it('retains child preferences while a parent is disabled and enables the required parent explicitly', () => {
    const configured = { ...ALL_PLUGINS, periodic: false };
    expect(effectivePlugins(configured)).toEqual({ ...NO_PLUGINS, home: true, library: true, bases: true, graph: true });
    expect(configured.habits).toBe(true);
    expect(setPlugin(NO_PLUGINS, 'cbt', true)).toEqual({ ...NO_PLUGINS, cbt: true, periodic: true });
    expect(effectivePlugins({ ...configured, periodic: true })).toEqual(ALL_PLUGINS);
  });
  it('stores choices per vault without changing naming or other vaults', () => {
    const settings = { vaults: { one: { complete: true, recognition: { dates: { 'odd.md': null } } }, two: { complete: true, plugins: ALL_PLUGINS } } };
    const patch = pluginPreferencesPatch(settings, 'one', { ...NO_PLUGINS, bases: true }, DEFAULT_HOME_SECTIONS, { enabled: true, metrics: ['mood', 'sleep'] });
    expect(pluginSettings(patch, 'one')).toEqual({ ...NO_PLUGINS, bases: true });
    expect(pluginSettings(patch, 'two')).toEqual(ALL_PLUGINS);
    expect(patch).toMatchObject({ vaults: { one: { recognition: settings.vaults.one.recognition }, two: settings.vaults.two } });
    expect(savedCheckIns(patch, 'one').metrics).toEqual(['mood', 'sleep']);
  });
  it('validates persisted check-ins, including an explicitly empty selection', () => {
    expect(checkInSettings({ enabled: false, metrics: ['mood', 'unknown', 'mood', 3] })).toEqual({ enabled: false, metrics: ['mood'] });
    expect(checkInSettings({ metrics: [] }).metrics).toEqual([]);
    expect(checkInSettings(undefined).metrics).toEqual(['mood', 'energy', 'focus', 'soc', 'sleep']);
  });
  it('retains the saved epiBase choice independently for each vault and after a reload', () => {
    const settings = { vaults: { one: { complete: true, plugins: { bases: false } }, two: { complete: true, plugins: { bases: true } } } };
    expect(pluginSettings(settings, 'one').bases).toBe(false);
    expect(pluginSettings(settings, 'two').bases).toBe(true);
    const enabled = setPlugin(pluginSettings(settings, 'one'), 'bases', true);
    const patch = pluginPreferencesPatch(settings, 'one', enabled, DEFAULT_HOME_SECTIONS);
    expect(pluginSettings(JSON.parse(JSON.stringify(patch)) as typeof patch, 'one').bases).toBe(true);
    expect(effectivePlugins(enabled).periodic).toBe(false);
  });
});
