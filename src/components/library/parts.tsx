import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { lookupImage } from '../../lib/api';
import { imageType, isDate, isoDate } from '../../lib/library';
import { DateField } from '../DateField';
import { CountUp } from '../periodic/motion';

const TAU = Math.PI * 2;

/**
 * A rating out of 100 as a ring, after the timer's: a thin arc with a glowing dot at its end.
 * With `onSet` it is a slider: drag round it, or use the arrow keys (Shift for tens). A drag is
 * set when the pointer lets go; keys, a moment after the last press.
 */
export function RatingRing({ value, onSet, size = 152, label = 'Rating' }: { value?: number; onSet?: (value: number) => void; size?: number; label?: string }) {
  const [pending, setPending] = useState<number>();
  const dragging = useRef(false);
  const shown = pending ?? value;
  const width = 8;
  const radius = size / 2 - width - 8;
  const length = TAU * radius;
  const share = Math.max(0, Math.min(100, shown ?? 0)) / 100;
  const dot = { x: size / 2 + radius * Math.sin(share * TAU), y: size / 2 - radius * Math.cos(share * TAU) };

  // Keys set the value a moment after the last press, so holding an arrow writes once.
  useEffect(() => {
    if (pending === undefined || dragging.current || !onSet) return;
    const timer = setTimeout(() => {
      if (pending !== value) onSet(pending);
      setPending(undefined);
    }, 700);
    return () => clearTimeout(timer);
  }, [pending, value, onSet]);

  // Where the pointer is round the ring, 0–100, read while the event is live: React clears an
  // event's currentTarget once its handler returns, before a state update reads it.
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const angle = Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2));
    let turn = (angle + Math.PI / 2) / TAU;
    if (turn < 0) turn += 1;
    return Math.round(turn * 100);
  };
  // Across the top the ring wraps; a drag up to 100 stays there instead of jumping to 0.
  const wrapped = (next: number, previous?: number) => {
    if (previous !== undefined && previous > 75 && next < 25) return 100;
    if (previous !== undefined && previous < 25 && next > 75) return 0;
    return next;
  };
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = event.shiftKey ? 10 : 1;
    const moves: Record<string, (n: number) => number> = {
      ArrowUp: (n) => n + by,
      ArrowRight: (n) => n + by,
      ArrowDown: (n) => n - by,
      ArrowLeft: (n) => n - by,
      PageUp: (n) => n + 10,
      PageDown: (n) => n - 10,
      Home: () => 0,
      End: () => 100,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setPending(Math.max(0, Math.min(100, move(shown ?? 50))));
  };

  const interactive = Boolean(onSet);
  return (
    <div
      className={interactive ? 'rating-ring is-interactive' : 'rating-ring'}
      style={{ width: size, height: size }}
      role={interactive ? 'slider' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? shown : undefined}
      aria-valuetext={shown === undefined ? 'not rated' : `${shown} of 100`}
      data-testid="rating-ring"
      data-value={value ?? ''}
      onKeyDown={interactive ? step : undefined}
      onPointerDown={
        interactive
          ? (event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              dragging.current = true;
              setPending(fromPointer(event));
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (event) => {
              if (!dragging.current) return;
              const next = fromPointer(event);
              setPending((previous) => wrapped(next, previous));
            }
          : undefined
      }
      onPointerUp={
        interactive
          ? () => {
              dragging.current = false;
              if (pending !== undefined && pending !== value) onSet?.(pending);
              setPending(undefined);
            }
          : undefined
      }
    >
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * TAU;
          const [inner, outer] = [radius + width / 2 + 3, radius + width / 2 + 7];
          return (
            <line
              key={i}
              className="rating-tick"
              x1={size / 2 + inner * Math.sin(a)}
              y1={size / 2 - inner * Math.cos(a)}
              x2={size / 2 + outer * Math.sin(a)}
              y2={size / 2 - outer * Math.cos(a)}
            />
          );
        })}
        <circle className="donut-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={width} />
        {shown !== undefined && (
          <>
            <circle
              className="rating-arc"
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={width}
              strokeDasharray={`${share * length} ${length}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ '--c': `${length}px` } as CSSProperties}
            />
            <circle className="rating-dot" cx={dot.x} cy={dot.y} r={width / 2 + 2} />
          </>
        )}
      </svg>
      <div className="ring-center">
        {shown === undefined ? (
          <span className="rating-none">—</span>
        ) : pending !== undefined ? (
          <span className="rating-number">{pending}</span>
        ) : (
          <span className="rating-number">
            <CountUp value={shown} />
          </span>
        )}
        <span className="ring-label">{shown === undefined ? 'not rated' : 'of 100'}</span>
      </div>
    </div>
  );
}

/**
 * A short value typed in and set when the field is left or Enter is pressed: a rating or a date.
 * A date also opens a month calendar, and a day picked there is set at once. A value that doesn't
 * fit is refused with a word, never written.
 */
export function ValueField({
  label,
  value,
  onCommit,
  kind,
  testId,
}: {
  label: string;
  value?: string;
  onCommit: (value: string) => void;
  kind: 'rating' | 'date';
  testId: string;
}) {
  const [draft, setDraft] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const shown = draft ?? value ?? '';
  const check = (text: string) => {
    if (!text) return undefined;
    if (kind === 'date') return isDate(text) ? undefined : `${label} is a date like ${isoDate(new Date())}.`;
    return /^\d{1,3}$/.test(text) && Number(text) <= 100 ? undefined : 'A rating is a whole number from 0 to 100.';
  };
  const commit = (next = draft) => {
    if (next === undefined) return;
    const text = next.trim();
    setDraft(undefined);
    if (text === (value ?? '')) return setProblem(undefined);
    const why = check(text);
    setProblem(why);
    if (!why) onCommit(kind === 'rating' && text ? String(Number(text)) : text);
  };
  const input = {
    'aria-invalid': problem ? true : undefined,
    title: problem,
    onBlur: () => commit(),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {
        setDraft(undefined);
        setProblem(undefined);
      }
    },
  };
  return (
    <label className={`value-field is-${kind}`}>
      <span className="tile-label">{label}</span>
      <span className="value-row">
        {kind === 'date' ? (
          <DateField value={shown} onChange={setDraft} onPick={(picked) => commit(picked)} label={label} testId={testId} inputProps={input} />
        ) : (
          <input type="text" inputMode="numeric" value={shown} placeholder="—" onChange={(event) => setDraft(event.target.value)} data-testid={testId} {...input} />
        )}
      </span>
      {problem && (
        <span className="field-problem" role="alert">
          {problem}
        </span>
      )}
    </label>
  );
}

// Covers from a lookup, read once per URL for the whole session.
const fetched = new Map<string, Promise<string | undefined>>();
function remoteImage(url: string): Promise<string | undefined> {
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

/**
 * A cover from a lookup, fetched through the backend (which allows only the lookup hosts). A blank
 * tile with the title when there is none. `onFound` says whether there was one.
 */
export function LookupCover({ url, title, className, onFound }: { url?: string; title: string; className: string; onFound?: (found: boolean) => void }) {
  const [image, setImage] = useState<{ url?: string; src?: string }>({});
  const found = useRef(onFound);
  useEffect(() => {
    found.current = onFound;
  }, [onFound]);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void remoteImage(url).then((src) => {
      if (cancelled) return;
      setImage({ url, src });
      found.current?.(Boolean(src));
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const src = image.url === url ? image.src : undefined;
  return src ? (
    <img className={className} src={src} alt={title} data-testid="lookup-cover" />
  ) : (
    <span className={`${className} is-blank`} aria-label={title}>
      <span>{title}</span>
    </span>
  );
}
