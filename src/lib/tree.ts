import type { VaultFile } from './api';
import { noteTitle } from './links';

export interface FolderNode {
  kind: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}

export interface NoteNode {
  kind: 'note';
  name: string;
  path: string;
}

export type TreeNode = FolderNode | NoteNode;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * The sidebar tree: notes only, folders before notes, natural sort order.
 * Folders that hold no notes (an `_attachments` folder of covers) are left out.
 */
export function buildTree(files: VaultFile[]): TreeNode[] {
  const root: FolderNode = { kind: 'folder', name: '', path: '', children: [] };
  for (const file of files) {
    if (file.kind !== 'note') continue;
    const parts = file.path.split('/');
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${part}` : part;
      let next = folder.children.find((child): child is FolderNode => child.kind === 'folder' && child.path === path);
      if (!next) {
        next = { kind: 'folder', name: part, path, children: [] };
        folder.children.push(next);
      }
      folder = next;
    }
    folder.children.push({ kind: 'note', name: noteTitle(file.path), path: file.path });
  }
  sortTree(root);
  return root.children;
}

function sortTree(folder: FolderNode) {
  folder.children.sort((a, b) =>
    a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === 'folder' ? -1 : 1,
  );
  for (const child of folder.children) if (child.kind === 'folder') sortTree(child);
}

export function countFolders(nodes: TreeNode[]): number {
  return nodes.reduce((sum, node) => (node.kind === 'folder' ? sum + 1 + countFolders(node.children) : sum), 0);
}
