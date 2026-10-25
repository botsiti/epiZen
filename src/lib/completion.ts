import type { Completion, CompletionSource } from '@codemirror/autocomplete';

export interface LinkTarget {
  /** What the user sees and types: the note's name. */
  label: string;
  /** Where it is, or why it's offered ("today"). */
  detail?: string;
  /** What goes between the brackets, when the name alone would be ambiguous. */
  insert?: string;
}

/**
 * Suggests notes after `[[`, as Obsidian does. Picking one completes the link and closes it
 * with `]]` unless the brackets are already there. `targets` is read on every keystroke, so
 * new notes show up without rebuilding the editor.
 */
export function wikilinkSource(targets: () => LinkTarget[]): CompletionSource {
  return (context) => {
    const before = context.matchBefore(/\[\[[^[\]|#\n]*$/);
    if (!before) return null;
    const close = context.state.sliceDoc(context.pos, context.pos + 2) === ']]' ? '' : ']]';
    const options: Completion[] = targets().map((target) => ({
      label: target.label,
      detail: target.detail,
      apply: `${target.insert ?? target.label}${close}`,
    }));
    return { from: before.from + 2, options, validFor: /^[^[\]|#\n]*$/ };
  };
}
