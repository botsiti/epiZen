import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ALL_PLUGINS, NO_PLUGINS, effectivePlugins, visibleHomeSections, DEFAULT_HOME_SECTIONS } from '../../lib/plugins';
import { PluginRoute } from './PluginRoute';

it('unmounts disabled views and their subscriptions, including an already-open base creator', () => {
  const stop = vi.fn(), start = vi.fn(() => stop);
  function Subscriber() { useEffect(start, []); return <span>New base form</span>; }
  const props = { view: { kind: 'new', folder: '', item: 'base' } as const, markdownHome: 'Recent notes', onSettings: vi.fn() };
  const { rerender } = render(<PluginRoute {...props} active={ALL_PLUGINS}><Subscriber /></PluginRoute>);
  expect(screen.getByText('New base form')).toBeVisible();
  rerender(<PluginRoute {...props} active={NO_PLUGINS}><Subscriber /></PluginRoute>);
  expect(screen.getByRole('heading', { name: 'epiBase' })).toBeVisible();
  expect(start).toHaveBeenCalledOnce(); expect(stop).toHaveBeenCalledOnce();
  rerender(<PluginRoute {...props} view={{ kind: 'new', folder: '' }} active={NO_PLUGINS}>New Markdown note</PluginRoute>);
  expect(screen.getByText('New Markdown note')).toBeVisible();
  rerender(<PluginRoute {...props} view={{ kind: 'summaries' }} active={effectivePlugins({ ...ALL_PLUGINS, periodic: false })}>Summaries</PluginRoute>);
  expect(screen.getByRole('heading', { name: 'Statistics' })).toBeVisible();
  rerender(<PluginRoute {...props} view={{ kind: 'home' }} active={NO_PLUGINS}>Dashboard</PluginRoute>);
  expect(screen.getByText('Recent notes')).toBeVisible();
});
it('honours each contributing plugin and retains a manually hidden Home section', () => {
  const choices = { ...DEFAULT_HOME_SECTIONS, today: false };
  const active = effectivePlugins({ ...ALL_PLUGINS, checkins: false, library: false, quests: false });
  expect(visibleHomeSections(choices, active)).toEqual({ ...choices, averages: false, library: false, spheres: false, quests: false });
  expect(visibleHomeSections(choices, ALL_PLUGINS)).toEqual(choices);
});
