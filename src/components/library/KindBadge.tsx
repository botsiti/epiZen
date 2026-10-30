import { kindSpec, type MediaKind } from '../../lib/library';
import { KindMark } from './marks';
import './kindBadge.css';

/** A quiet, legible type marker opposite the cover's rating. */
export function KindBadge({ kind }: { kind: MediaKind }) {
  const name = kindSpec(kind).one;
  const label = name[0]?.toUpperCase() + name.slice(1);
  return <span className="media-kind-badge" role="img" aria-label={label} title={label} data-testid="media-kind-badge" data-kind={kind}><KindMark kind={kind} /></span>;
}
