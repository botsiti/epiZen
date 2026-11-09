import { PluginAppearance } from '../workspace/PluginDisplay';
import type { PointerEvent } from 'react';
import { DayPage } from './DayPage';
import { followPointer } from './effects';
import { MonthPage, WeekPage } from './RangePage';
import type { PeriodicActions, PeriodicSpec } from './types';
import type { VaultFile } from '../../lib/api';
import './periodic.css';

interface Props {
  spec: PeriodicSpec;
  /** The note's vault path. */
  path: string;
  text: string;
  actions: PeriodicActions;
  /** Why the last change didn't reach the note, if it didn't. */
  warning?: string;
  files?: VaultFile[];
}

/** A daily, weekly or monthly note as a page of its own, computed from the vault. */
export function PeriodicPage({ spec, path, text, actions, warning, files }: Props) {
  const page = { spec, path, text, actions, files };
  return (
    <PluginAppearance id="periodic"><div className="periodic-frame" onPointerMove={(event: PointerEvent<HTMLDivElement>) => followPointer(event)}>
      {warning && (
        <p className="note-warning" data-testid="periodic-warning">
          {warning}
        </p>
      )}
      {spec.period === 'day' ? <DayPage {...page} /> : spec.period === 'week' ? <WeekPage {...page} /> : <MonthPage {...page} />}
    </div></PluginAppearance>
  );
}
