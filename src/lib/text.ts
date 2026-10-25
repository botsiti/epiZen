/**
 * The line ending a note uses throughout, so the editor writes it back the same way.
 * `undefined` when it mixes them (or uses a lone `\r`): the editor couldn't keep that as it is.
 */
export function lineEnding(text: string): '\n' | '\r\n' | undefined {
  const crlf = text.split('\r\n').length - 1;
  const lf = text.split('\n').length - 1 - crlf;
  const cr = text.split('\r').length - 1 - crlf;
  if (cr || (crlf && lf)) return undefined;
  return crlf ? '\r\n' : '\n';
}

// Obsidian refuses these in a note name, and `#^[]|` would break a [[link]] to it.
const FORBIDDEN = /[\\/:*?"<>|#^[\]]/;

/** Why a new note can't have this name, or `undefined` when it can. */
export function noteNameProblem(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return 'Give the note a name.';
  if (trimmed.startsWith('.')) return "A note name can't start with a dot.";
  if (FORBIDDEN.test(trimmed)) return 'A note name can\'t contain \\ / : * ? " < > | # ^ [ ]';
  return undefined;
}
