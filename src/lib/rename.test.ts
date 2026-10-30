import { describe, expect, it } from 'vitest';
import type { VaultFile } from './api';
import { renameLinkEdits, renameLinks } from './rename';

const files: VaultFile[] = ['Notes/Old.md', 'Index.md', 'Notes/Other.md', 'Journal/Day.md', 'Other/Old.md'].map((path) => ({ path, kind: 'note' }));
const change = (text: string, from = 'Index.md', all = files) => renameLinks(text, from, 'Notes/Old.md', 'Notes/New name.md', all);

describe('renaming note links', () => {
  it('changes only destinations, preserving aliases, fragments, embeds, whitespace and CRLF', () => {
    const text = '---\r\nrelated: "[[Notes/Old|friend]]"\r\n---\r\n[[ Notes/Old.md  #Heading | Keep this ]] ![[Notes/Old#^block]]\r\n';
    expect(change(text)).toBe('---\r\nrelated: "[[Notes/New name|friend]]"\r\n---\r\n[[ Notes/New name.md  #Heading | Keep this ]] ![[Notes/New name#^block]]\r\n');
  });

  it('follows the actual resolved note and disambiguates a newly conflicting title', () => {
    expect(change('[[Old]] [[Notes/Old]]', 'Other/Index.md')).toBe('[[Old]] [[Notes/New name]]');
    expect(change('[[Old]]', 'Notes/Other.md')).toBe('[[New name]]');
    const conflict = [...files, { path: 'Journal/New name.md', kind: 'note' as const }];
    expect(change('[[Notes/Old]]', 'Journal/Day.md', conflict)).toBe('[[Notes/New name]]');
    // An existing link to another New name must keep its meaning after the rename.
    expect(change('[[New name]]', 'Notes/Other.md', conflict)).toBe('[[Journal/New name]]');
  });

  it('preserves code, comments, escaped links and Markdown link labels', () => {
    const text = '`[[Notes/Old]]`\n\n```md\n[[Notes/Old]]\n```\n\n    [[Notes/Old]]\n\n<!-- [[Notes/Old]] -->\n\\[[Notes/Old]]\n[Label [[Notes/Old]]](https://example.com)\n[[Notes/Old]]';
    expect(change(text)).toBe(text.slice(0, -'[[Notes/Old]]'.length) + '[[Notes/New name]]');
  });

  it('updates Markdown links and reference definitions while preserving labels, titles and fragments', () => {
    const text = '[old label](../Notes/Old.md#Heading "title")\n![embed](<../Notes/Old.md#^block>)\n\n[ref]: ../Notes/Old.md "keep"\n\n[x][ref]\n[site](https://example.com/Notes/Old.md)';
    expect(change(text, 'Journal/Day.md')).toBe('[old label](../Notes/New%20name.md#Heading "title")\n![embed](<../Notes/New name.md#^block>)\n\n[ref]: ../Notes/New%20name.md "keep"\n\n[x][ref]\n[site](https://example.com/Notes/Old.md)');
  });

  it('handles self references and explicit relative links, without changing same-note fragments', () => {
    expect(change('[[Old#Heading]] [[#Heading]] [self](./Old.md#Heading) [[./Old]]', 'Notes/Old.md')).toBe('[[New name#Heading]] [[#Heading]] [self](./New%20name.md#Heading) [[./New name]]');
  });

  it('handles Unicode normalization and case-only changes', () => {
    const path = 'Notes/Йога.md'.normalize('NFD');
    expect(renameLinks('[[Йога#Сон|Метка]]', 'Index.md', path, 'Notes/Практика.md', [{ path, kind: 'note' }])).toBe('[[Практика#Сон|Метка]]');
    expect(renameLinks('[[Old]]', 'Index.md', 'Old.md', 'OLD.md', [{ path: 'Old.md', kind: 'note' }])).toBe('[[OLD]]');
  });

  it('emits only changed notes with their original text for conflict checks', () => {
    expect(renameLinkEdits([{ path: 'Index.md', text: '[[Notes/Old]]' }, { path: 'Plain.md', text: 'Old is a word.' }], files, 'Notes/Old.md', 'Notes/New.md')).toEqual([{ path: 'Index.md', expected: '[[Notes/Old]]', text: '[[Notes/New]]' }]);
  });
});
