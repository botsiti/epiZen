import type { PointerEvent, ReactNode } from 'react';
import { DayPage } from './DayPage';
import { followPointer } from './effects';
import { MonthPage, WeekPage } from './RangePage';
import type { PeriodicActions, PeriodicSpec } from './types';
import './periodic.css';

interface Props {
  spec: PeriodicSpec;
  /** The note's vault path. */
  path: string;
  text: string;
  actions: PeriodicActions;
  /** The note itself, rendered, for the page's Note tab. */
  note: ReactNode;
  /** Why the last change didn't reach the note, if it didn't. */
  warning?: string;
}

/** A daily, weekly or monthly note as a page of its own, computed from the vault. */
export function PeriodicPage({ spec, path, text, actions, note, warning }: Props) {
  const page = { spec, path, text, actions, note };
  return (
    <div className="periodic-frame" onPointerMove={(event: PointerEvent<HTMLDivElement>) => followPointer(event)}>
      {warning && (
        <p className="note-warning" data-testid="periodic-warning">
          {warning}
        </p>
      )}
      {spec.period === 'day' ? <DayPage {...page} /> : spec.period === 'week' ? <WeekPage {...page} /> : <MonthPage {...page} />}
    </div>
  );
}
