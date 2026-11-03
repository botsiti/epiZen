import type { ReactNode } from 'react';

export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <label className="preference-row"><span className="preference-copy"><strong>{title}</strong>{description && <small>{description}</small>}</span><span className="preference-control">{children}</span></label>;
}
