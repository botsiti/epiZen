import { useCallback, useState } from 'react';
import type { TreeNode } from '../../lib/tree';

/** One expansion state for the workspace, retained while the sidebar is hidden. */
export function useExplorer(tree: TreeNode[], selected?: string) {
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const isOpen = (path: string) => toggled.get(path) ?? Boolean(selected?.startsWith(`${path}/`));
  const toggle = (path: string) => setToggled((previous) => new Map(previous).set(path, !(previous.get(path) ?? Boolean(selected?.startsWith(`${path}/`)))));
  const collapseAll = useCallback(() => {
    const closed = new Map<string, boolean>();
    const visit = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.kind !== 'folder') continue;
        closed.set(node.path, false);
        visit(node.children);
      }
    };
    visit(tree);
    setToggled(closed);
  }, [tree]);
  const reset = useCallback(() => setToggled(new Map()), []);
  const reveal = useCallback((folder: string) => {
    if (!folder) return;
    setToggled((previous) => {
      const next = new Map(previous);
      let path = '';
      for (const part of folder.split('/')) { path = path ? `${path}/${part}` : part; next.set(path, true); }
      return next;
    });
  }, []);
  return { isOpen, toggle, collapseAll, reset, reveal };
}
