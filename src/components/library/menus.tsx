import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ToolMark } from './marks';

type Mark = Parameters<typeof ToolMark>[0]['name'];

/** The choices in a panel, in order, for the arrow keys. */
const choicesIn = (panel: HTMLElement | null) => [
  ...(panel?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled), [role="radio"]:not(:disabled), [role="checkbox"]:not(:disabled)') ?? []),
];

/**
 * A word in the library's toolbar, or a filter's pill, that opens a small glass panel under it: a
 * menu of choices, or (`dialog`) choices with fields to type in. The panel takes the focus (the
 * chosen item, or the first); ↑ ↓ Home End move between its choices (not inside a field), Escape
 * closes it and goes back to the word, Tab and a click outside close it.
 */
export function Tool({
  label,
  mark,
  testId,
  menuLabel,
  className = 'tool-button',
  badge,
  closes = false,
  dialog = false,
  open: opened,
  children,
}: {
  label: ReactNode;
  mark?: Mark;
  testId: string;
  menuLabel: string;
  className?: string;
  badge?: number;
  /** Picking one of its choices closes it (Covers or List, a sort, a period); filters with several choices stay open. */
  closes?: boolean;
  /** Choices and fields together, as a filter's are: a dialog, not a menu. */
  dialog?: boolean;
  /** Opens as it appears: a filter just added. */
  open?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(opened));
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const choices = choicesIn(panel.current);
    // A field marked to take it first (a genre's search), the chosen choice, or the first.
    (panel.current?.querySelector<HTMLElement>('[data-focus-first]') ?? choices.find((choice) => choice.getAttribute('aria-checked') === 'true') ?? choices[0] ?? panel.current?.querySelector<HTMLElement>('input'))?.focus();
    const away = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  // The focus stays in the panel while it is open: a choice that takes itself away (a filter's Clear)
  // hands it to the first one, so the panel's own keys (Escape, Tab) still reach it.
  useEffect(() => {
    if (open && panel.current && !panel.current.contains(document.activeElement)) choicesIn(panel.current)[0]?.focus();
  });
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const inField = event.target instanceof HTMLInputElement;
    const choices = choicesIn(panel.current);
    const at = choices.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = inField ? {} : { ArrowDown: (at + 1) % choices.length, ArrowUp: (at - 1 + choices.length) % choices.length, Home: 0, End: choices.length - 1 };
    const to = moves[event.key];
    if (to !== undefined) {
      event.preventDefault();
      choices[to]?.focus();
    } else if (event.key === 'Escape') {
      // The panel's, not a sheet's or the window's behind it.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab' && !dialog) {
      setOpen(false);
    }
  };
  return (
    <div
      className="tool"
      ref={box}
      // A dialog closes when the focus leaves it for something else on the page.
      onBlur={(event) => dialog && open && event.relatedTarget instanceof Node && !box.current?.contains(event.relatedTarget) && setOpen(false)}
    >
      <button
        ref={button}
        type="button"
        className={`${className}${badge ? ' is-on' : ''}`}
        aria-haspopup={dialog ? 'dialog' : 'menu'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid={testId}
      >
        {mark && <ToolMark name={mark} />}
        {label}
        {Boolean(badge) && <span className="tool-badge">{badge}</span>}
      </button>
      {open && (
        <div
          ref={panel}
          className={dialog ? 'tool-menu is-dialog' : 'tool-menu'}
          role={dialog ? 'dialog' : 'menu'}
          aria-label={menuLabel}
          onKeyDown={keys}
          onClick={(event) => closes && (event.target as Element).closest('[role="menuitemradio"], [role="radio"]') && close()}
          data-testid={`${testId}-menu`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** One choice in a panel: ticked in accent when chosen, a hint faint at its right. */
export function Item({
  role = 'menuitemradio',
  checked,
  onSelect,
  disabled,
  testId,
  data,
  children,
}: {
  role?: 'menuitemradio' | 'menuitemcheckbox' | 'radio' | 'checkbox';
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  testId: string;
  data?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <button type="button" role={role} aria-checked={checked} className="tool-item" onClick={onSelect} disabled={disabled} tabIndex={-1} data-testid={testId} {...data}>
      <span className="tool-check">{checked && <ToolMark name="check" />}</span>
      {children}
    </button>
  );
}

/** A labelled group of choices in a panel, under a faint label. */
export function Group({ label, role = 'group', children }: { label: string; role?: 'group' | 'radiogroup'; children: ReactNode }) {
  return (
    <div role={role} aria-label={label} className="tool-group">
      <p className="tool-label" aria-hidden="true">
        {label}
      </p>
      {children}
    </div>
  );
}
