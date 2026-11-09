import { expect, it } from 'vitest';
import { pluginDisplays, savedPluginDisplays } from './pluginDisplay';
import { ALL_PLUGINS, DEFAULT_HOME_SECTIONS, pluginPreferencesPatch } from './plugins';

it('validates display preferences and keeps each vault independent', () => {
  const settings = { vaults: { personal: { pluginDisplay: { habits: { density: 'compact', defaultView: 'History', sections: { today: false } }, statistics: { density: 'giant', defaultView: 'Forever', sections: { activity: false } } } } } };
  const display = savedPluginDisplays(settings, 'personal');
  expect(display.habits).toEqual({ density: 'compact', defaultView: 'History', sections: { today: false } });
  expect(display.statistics).toMatchObject({ density: 'comfortable', defaultView: 'Monthly', sections: { activity: false, habits: true } });
  expect(savedPluginDisplays(settings, 'work')).toEqual(pluginDisplays());
});
it('preserves display choices and other module preferences while disabling a dependency', () => {
  const settings = { vaults: { one: { assistant: { enabled: true }, anotherModule: { retained: true } }, two: { plugins: {} } } };
  const display = pluginDisplays({ habits: { defaultView: 'History', density: 'compact' } });
  const patch = pluginPreferencesPatch(settings, 'one', { ...ALL_PLUGINS, periodic: false }, DEFAULT_HOME_SECTIONS, undefined, display);
  expect(savedPluginDisplays(patch, 'one').habits.defaultView).toBe('History');
  expect(patch.vaults).toMatchObject({ one: { assistant: { enabled: true }, anotherModule: { retained: true } }, two: settings.vaults.two });
});
