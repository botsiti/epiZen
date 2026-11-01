import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { useState } from 'react';
import { flushAll } from '../../lib/saving';
import { readMonthlySection, recoveryText, writeMonthlySection, type MonthlyField } from '../../lib/monthlyReview';
import { expenseText } from '../../lib/expensePhotos';
import { MonthlyReview } from './MonthlyReview';

vi.mock('../../lib/api', () => ({ readImage: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]).buffer)) }));

const NOTE = '---\ntype: monthly\n---\n\n## Month Summary\n```dataview\ntable mood\n```\n';

function fixture() {
  let disk = NOTE;
  const recover = vi.fn<(field: MonthlyField, value: string, source: string, expected: string, problem: string) => void>();
  const save = vi.fn((field: MonthlyField, value: string, expected: string) => {
    try { disk = writeMonthlySection(disk, field, value, expected); return Promise.resolve(undefined); }
    catch (err) { return Promise.resolve((err as Error).message); }
  });
  const external = (text: string) => { disk = text; };
  return { save, recover, external, read: () => disk };
}

function Page({ store, tab }: { store: ReturnType<typeof fixture>; tab: string }) {
  const [text, setText] = useState(NOTE);
  return <MonthlyReview path="month.md" text={text} tab={tab} onRecover={store.recover} onSave={async (...args) => {
    const problem = await store.save(...args);
    if (!problem) setText(store.read());
    return problem;
  }} />;
}

it('preserves drafts across tabs and saves each area without replacing other sections', async () => {
  const user = userEvent.setup();
  const store = fixture();
  const view = render(<Page store={store} tab="Reflection" />);
  await user.type(screen.getByLabelText('The month in your own words'), 'A month of progress.');
  view.rerender(<Page store={store} tab="Expenses" />);
  await user.type(screen.getByLabelText('Money reflection'), 'Rent and travel');
  await user.click(within(document.querySelector<HTMLElement>('[data-field="expenses"]')!).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(store.read()).toContain('Rent and travel'));
  view.rerender(<Page store={store} tab="Reflection" />);
  expect(screen.getByLabelText('The month in your own words')).toHaveValue('A month of progress.');
  await act(async () => { expect(await flushAll()).toEqual([]); });
  expect(store.read()).toContain('A month of progress.');
  view.rerender(<Page store={store} tab="Life areas" />);
  await user.click(screen.getByRole('button', { name: /Health\/Fitness/ }));
  await user.selectOptions(screen.getByLabelText('Health/Fitness rating'), '7');
  await user.type(screen.getByLabelText('Health/Fitness reflection'), 'A steady month.');
  await user.click(within(document.querySelector<HTMLElement>('[data-field="sphere:Health/Fitness"]')!).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(store.read()).toContain('- Health/Fitness: 7 — A steady month.'));
  expect(store.read()).toContain('A steady month.');
  expect(store.read()).toContain('```dataview\ntable mood\n```');
});

it('keeps a conflicting draft visible and offers recovery if the page is left', async () => {
  const user = userEvent.setup();
  const store = fixture();
  const view = render(<Page store={store} tab="Reflection" />);
  const field = screen.getByLabelText('The month in your own words');
  await user.type(field, 'My unsaved reflection');
  store.external(`${NOTE}\n## Monthly reflection\nAnother person edited this.\n`);
  await user.click(within(document.querySelector<HTMLElement>('[data-field="summary"]')!).getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(/changed outside Epizen/)).toBeInTheDocument();
  expect(field).toHaveValue('My unsaved reflection');
  expect(store.read()).toContain('Another person edited this.');
  view.unmount();
  await waitFor(() => expect(store.recover).toHaveBeenCalled());
  const [section, value, source, expected, problem] = store.recover.mock.calls[0]!;
  expect(recoveryText(source, section, value, expected)).toContain('My unsaved reflection');
  expect(problem).toMatch(/changed outside/);
  expect(store.read()).toContain('Another person edited this.');
});

it('saves the latest draft when leaving while an earlier save is still running', async () => {
  let disk = NOTE;
  let finishFirst: (() => void) | undefined;
  const recover = vi.fn<(field: MonthlyField, value: string, source: string, expected: string, problem: string) => void>();
  const save = vi.fn(async (field: MonthlyField, value: string, expected: string) => {
    if (!finishFirst) await new Promise<void>((resolve) => { finishFirst = resolve; });
    disk = writeMonthlySection(disk, field, value, expected);
    return undefined;
  });
  const view = render(<MonthlyReview path="month.md" text={NOTE} tab="Reflection" onSave={save} onRecover={recover} />);
  const field = screen.getByLabelText('The month in your own words');
  fireEvent.change(field, { target: { value: 'First version' } });
  fireEvent.click(within(document.querySelector<HTMLElement>('[data-field="summary"]')!).getByRole('button', { name: 'Save' }));
  fireEvent.change(field, { target: { value: 'Final version' } });
  view.unmount();
  act(() => { finishFirst?.(); });
  await waitFor(() => expect(disk).toContain('Final version'));
  expect(save).toHaveBeenCalledTimes(2);
  expect(recover).not.toHaveBeenCalled();
});

it('can save twice while the parent has not yet delivered the updated note', async () => {
  const user = userEvent.setup();
  let disk = NOTE;
  const recover = vi.fn<(field: MonthlyField, value: string, source: string, expected: string, problem: string) => void>();
  const save = vi.fn((field: MonthlyField, value: string, expected: string) => {
    disk = writeMonthlySection(disk, field, value, expected);
    return Promise.resolve(undefined);
  });
  render(<MonthlyReview path="month.md" text={NOTE} tab="Reflection" onSave={save} onRecover={recover} />);
  const field = screen.getByLabelText('The month in your own words');
  const button = within(document.querySelector<HTMLElement>('[data-field="summary"]')!).getByRole('button', { name: 'Save' });
  await user.type(field, 'First');
  await user.click(button);
  await waitFor(() => expect(disk).toContain('First'));
  await user.type(field, ' and second');
  await user.click(button);
  await waitFor(() => expect(disk).toContain('First and second'));
  expect(recover).not.toHaveBeenCalled();
});

it('previews a local expense image and explains a missing embed', async () => {
  const text = '### Expenses\n![[budget.png]]\n![[missing.png]]\nRent and travel.\n';
  render(<MonthlyReview path="Calendar/month.md" text={text} tab="Expenses" files={[{ path: 'Calendar/budget.png', kind: 'image' }]}
    onSave={vi.fn(() => Promise.resolve(undefined))} onRecover={vi.fn()} />);
  expect(await screen.findByAltText('budget.png')).toHaveAttribute('src', expect.stringMatching(/^blob:/));
  expect(screen.getByText('Photo unavailable')).toBeInTheDocument();
  expect(screen.getByLabelText('Money reflection')).toHaveValue('Rent and travel.');
});

it('adds a selected photo without exposing image syntax, and removes only its link', async () => {
  const user = userEvent.setup();
  let disk = '### Expenses\n![[old.png]]\nRent and travel.\n';
  const importPhoto = vi.fn(() => Promise.resolve('Calendar/_attachments/expense-1.png'));
  const save = vi.fn((field: MonthlyField, value: string, expected: string) => {
    disk = writeMonthlySection(disk, field, value, expected);
    return Promise.resolve(undefined);
  });
  const photo = new File(['image'], 'receipt.png', { type: 'image/png' });
  Object.defineProperty(photo, 'arrayBuffer', { value: () => Promise.resolve(new Uint8Array([137, 80, 78, 71]).buffer) });
  render(<MonthlyReview path="Calendar/month.md" text={disk} tab="Expenses" files={[{ path: 'Calendar/old.png', kind: 'image' }, { path: 'Calendar/_attachments/expense-1.png', kind: 'image' }]}
    onSave={save} onRecover={vi.fn()} onImportPhoto={importPhoto} />);
  const field = screen.getByLabelText('Money reflection');
  expect(field).toHaveValue('Rent and travel.');
  await user.upload(screen.getByLabelText('Add photo'), photo);
  await waitFor(() => expect(importPhoto).toHaveBeenCalledOnce());
  expect(await screen.findByAltText('Calendar/_attachments/expense-1.png')).toBeInTheDocument();
  expect(field).toHaveValue('Rent and travel.');
  await user.click(within(document.querySelector<HTMLElement>('[data-field="expenses"]')!).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(disk).toContain('![[Calendar/_attachments/expense-1.png]]'));
  expect(disk).toContain('![[old.png]]\nRent and travel.');
  await user.click(screen.getByRole('button', { name: 'Remove photo 2' }));
  await user.click(within(document.querySelector<HTMLElement>('[data-field="expenses"]')!).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(disk).not.toContain('![[old.png]]'));
  expect(disk).toContain('![[Calendar/_attachments/expense-1.png]]');
  expect(disk).toContain('Rent and travel.');
});

it('keeps text intact when a photo cannot be imported', async () => {
  const user = userEvent.setup();
  expect(expenseText(readMonthlySection('### Expenses\nKeep my words.\n', 'expenses').value)).toBe('Keep my words.');
  const photo = new File(['bad'], 'bad.png', { type: 'image/png' });
  Object.defineProperty(photo, 'arrayBuffer', { value: () => Promise.resolve(new Uint8Array([1, 2]).buffer) });
  render(<MonthlyReview path="month.md" text={'### Expenses\nKeep my words.\n'} tab="Expenses" onSave={vi.fn(() => Promise.resolve(undefined))}
    onRecover={vi.fn()} onImportPhoto={() => Promise.reject(new Error('That photo could not be read.'))} />);
  expect(screen.getByLabelText('Money reflection')).toHaveValue('Keep my words.');
  await user.upload(screen.getByLabelText('Add photo'), photo);
  expect(await screen.findByText('That photo could not be read.')).toBeInTheDocument();
  expect(screen.getByLabelText('Money reflection')).toHaveValue('Keep my words.');
});

it('finishes linking a selected photo when the user leaves during the import', async () => {
  const user = userEvent.setup();
  let finish: ((path: string) => void) | undefined;
  let disk = '### Expenses\nKeep my words.\n';
  const photo = new File(['image'], 'receipt.png', { type: 'image/png' });
  Object.defineProperty(photo, 'arrayBuffer', { value: () => Promise.resolve(new Uint8Array([137, 80, 78, 71]).buffer) });
  const save = vi.fn((field: MonthlyField, value: string, expected: string) => {
    disk = writeMonthlySection(disk, field, value, expected);
    return Promise.resolve(undefined);
  });
  const recover = vi.fn();
  const view = render(<MonthlyReview path="month.md" text={disk} tab="Expenses" onSave={save} onRecover={recover}
    onImportPhoto={() => new Promise((resolve) => { finish = resolve; })} />);
  await user.upload(screen.getByLabelText('Add photo'), photo);
  await waitFor(() => expect(finish).toBeDefined());
  view.unmount();
  act(() => { finish?.('Calendar/_attachments/expense-1.png'); });
  await waitFor(() => expect(disk).toContain('![[Calendar/_attachments/expense-1.png]]'));
  expect(disk).toContain('Keep my words.');
  expect(recover).not.toHaveBeenCalled();
});

it('prevents removing the wrong photo while a new one is being added', async () => {
  const user = userEvent.setup();
  let finish: ((path: string) => void) | undefined;
  const photo = new File(['image'], 'receipt.png', { type: 'image/png' });
  Object.defineProperty(photo, 'arrayBuffer', { value: () => Promise.resolve(new Uint8Array([137, 80, 78, 71]).buffer) });
  render(<MonthlyReview path="month.md" text={'### Expenses\n![[old.png]]\nText.\n'} tab="Expenses" files={[{ path: 'old.png', kind: 'image' }]}
    onSave={vi.fn(() => Promise.resolve(undefined))} onRecover={vi.fn()} onImportPhoto={() => new Promise((resolve) => { finish = resolve; })} />);
  await user.upload(screen.getByLabelText('Add photo'), photo);
  await waitFor(() => expect(finish).toBeDefined());
  expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeDisabled();
  act(() => { finish?.('expense-1.png'); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeEnabled());
});

it('retains an imported photo in the recovery draft when the note changes outside the app', async () => {
  const user = userEvent.setup();
  const original = '### Expenses\nKeep my words.\n';
  let disk = original;
  const photo = new File(['image'], 'receipt.png', { type: 'image/png' });
  Object.defineProperty(photo, 'arrayBuffer', { value: () => Promise.resolve(new Uint8Array([137, 80, 78, 71]).buffer) });
  const recover = vi.fn<(field: MonthlyField, value: string, source: string, expected: string, problem: string) => void>();
  const save = (field: MonthlyField, value: string, expected: string) => {
    try { disk = writeMonthlySection(disk, field, value, expected); return Promise.resolve(undefined); }
    catch (err) { return Promise.resolve((err as Error).message); }
  };
  const view = render(<MonthlyReview path="month.md" text={original} tab="Expenses" onSave={save} onRecover={recover}
    onImportPhoto={() => Promise.resolve('Calendar/_attachments/expense-1.png')} />);
  await user.upload(screen.getByLabelText('Add photo'), photo);
  await screen.findByText('Photo added. Save to keep it with this month.');
  disk = disk.replace('Keep my words.', 'Outside edit.');
  await user.click(within(document.querySelector<HTMLElement>('[data-field="expenses"]')!).getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(/changed outside Epizen/)).toBeInTheDocument();
  expect(disk).toContain('Outside edit.');
  view.unmount();
  await waitFor(() => expect(recover).toHaveBeenCalled());
  const [section, value, source, expected] = recover.mock.calls[0]!;
  expect(recoveryText(source, section, value, expected)).toContain('![[Calendar/_attachments/expense-1.png]]');
});
