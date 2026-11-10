import { $, $$, browser, expect } from '@wdio/globals';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { diffSnapshots, snapshotVault } from '../../scripts/vault-snapshot.mjs';
import { vaultCopy } from '../paths';
import { prepareWindow, screenshot, scrollIntoView, selectOption } from '../support';
const root = join(dirname(vaultCopy()), 'assistant-vault');
async function send(text: string) {
  await $('[aria-label="Message Spike"]').waitForEnabled();
  await $('[aria-label="Message Spike"]').setValue(text);
  await $('.assistant-composer button[type="submit"]').waitForEnabled();
  await $('.assistant-composer button[type="submit"]').click();
  await browser.waitUntil(async () => browser.execute((message) => [...document.querySelectorAll('.assistant-message.is-user')].some((item) => item.textContent?.includes(message)), text));
  await browser.waitUntil(async () => !(await $('[aria-label="Stop assistant"]').isExisting()));
}
async function apply() {
  const saved = await $$('.assistant-action.is-saved').length;
  const buttons = $$('.assistant-action-buttons button');
  await buttons[0]!.scrollIntoView(); await buttons[0]!.click();
  await browser.waitUntil(async () => await $$('.assistant-action.is-saved').length > saved);
  await browser.waitUntil(async () => !(await $('[aria-label="Stop assistant"]').isExisting()));
}
describe('Spike conversations and second-brain actions', () => {
  before(prepareWindow);
  it('enables Spike from Plugins and reserves Command 8 for the sidebar', async () => {
    await expect($('[data-testid="open-assistant"]')).not.toBeExisting();
    await browser.execute(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true, cancelable: true })));
    await $('[aria-label="Enable Spike"]').click();
    await $('[data-testid="settings-save"]').click();
    await $('[data-testid="open-assistant"]').waitForDisplayed();
    await $('[aria-label="Configure Spike"]').click();
    await $('button=Set up Spike').click();
    await expect($('.spike-configuration')).toBeDisplayed();
    await screenshot('209-spike-plugin-settings');
    for (const open of [true, false]) {
      await browser.execute(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '8', metaKey: true, bubbles: true, cancelable: true })));
      if (open) await expect($('[data-testid="assistant-sidebar"]')).toBeDisplayed();
      else await expect($('[data-testid="assistant-sidebar"]')).not.toBeExisting();
    }
  });
  it('persists whole-app glass independently of Spike and restores solid appearance', async () => {
    await browser.execute(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true, cancelable: true })));
    await $('[data-testid="settings-nav-appearance"]').click();
    await selectOption('[aria-label="Application surface"]', 'glass');
    await $('button=Save appearance').click();
    await browser.waitUntil(async () => browser.execute(() => document.documentElement.dataset.appearance === 'glass'));
    await screenshot('228-app-appearance');
    await browser.refresh(); await prepareWindow();
    expect(await browser.execute(() => document.documentElement.dataset.appearance)).toBe('glass');
    await $('[data-testid="settings-nav-appearance"]').click();
    await selectOption('[aria-label="Application surface"]', 'solid');
    await $('button=Save appearance').click();
    await browser.waitUntil(async () => browser.execute(() => document.documentElement.dataset.appearance === 'solid'));
  });
  it('connects with a test-only key and adds a requested film through a reviewed note change', async () => {
    const before = snapshotVault(root);
    await $('[data-testid="open-assistant"]').click();
    await screenshot('210-spike-welcome');
    await $('.assistant-sidebar').$('button=Connect Spike').click();
    await selectOption('.assistant-sidebar [aria-label="Spike connection"]', 'openai');
    await $('.assistant-sidebar [aria-label="OpenAI API key"]').setValue('sk-test-not-a-real-credential');
    await $('.assistant-sidebar .assistant-preferences button[type="submit"]').click();
    await $('[aria-label="Message Spike"]').waitForEnabled();
    await send('Yesterday I watched Quiet Harbour. Add it to my library.');
    await expect($('.assistant-action')).toHaveText(expect.stringContaining('Quiet Harbour'));
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await screenshot('211-spike-film-review');
    await apply();
    await expect($('.assistant-message.is-assistant')).toHaveText(expect.stringContaining('Saved.'));
    expect(diffSnapshots(before, snapshotVault(root))).toEqual(['added: Rating/kino/Quiet Harbour.md']);
    expect(readFileSync(join(root, 'Rating/kino/Quiet Harbour.md'), 'utf8')).toContain('Watched: 2026-11-07');
    await screenshot('212-spike-film-saved');
  });
  it('saves a selected movie with its cover, watched date, rating and comments, then opens its page', async () => {
    const before = snapshotVault(root);
    await send('Yesterday I watched American Fiction, 90/100. I liked the cinematography. Add it with its cover.');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await expect($('.assistant-action.is-review')).toHaveText(expect.stringContaining('with its cover'));
    await screenshot('233-spike-library-review');
    await apply();
    await $('[data-testid="media-page"][data-path="Rating/kino/American Fiction.md"]').waitForDisplayed();
    await browser.waitUntil(async () => browser.execute(() => { const image = document.querySelector<HTMLImageElement>('.media-cover'); return Boolean(image?.complete && image.naturalWidth > 0); }));
    const changed = diffSnapshots(before, snapshotVault(root));
    expect(changed).toHaveLength(2);
    expect(changed).toContain('added: Rating/kino/American Fiction.md');
    expect(changed.some((path) => path.startsWith('added: Rating/kino/_attachments/american-fiction'))).toBe(true);
    const note = readFileSync(join(root, 'Rating/kino/American Fiction.md'), 'utf8');
    expect(note).toContain('Rating: 90');
    expect(note).toContain('I liked the cinematography. It is about identity and storytelling.');
    expect(note).toMatch(/!\[\[Rating\/kino\/_attachments\/american-fiction.*\.png\|/);
    await screenshot('234-spike-library-saved');
  });
  it('connects the subscription adapter without an API key and keeps the same reviewed actions', async () => {
    await $('[aria-label="Assistant settings"]').click();
    await selectOption('.assistant-sidebar [aria-label="Spike connection"]', 'codex');
    await expect($('.assistant-sidebar [aria-label="OpenAI API key"]')).not.toBeExisting();
    await browser.execute(async () => {
      const api = (window as unknown as { __TAURI__: { core: { invoke: (command: string, args: unknown) => Promise<unknown> } } }).__TAURI__.core;
      await api.invoke('assistant_set_key', { key: null });
    });
    await screenshot('224-spike-subscription');
    await $('.assistant-sidebar .assistant-preferences button[type="submit"]').click();
    await $('.assistant-context').$('button=New chat').click();
    const before = snapshotVault(root);
    await send('Remember that I prefer to use my subscription.');
    await expect($('.assistant-action')).toHaveText(expect.stringContaining('Assistant/Profile.md'));
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await apply();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual(['added: Assistant/Profile.md']);
    expect(readFileSync(join(root, 'Assistant/Profile.md'), 'utf8')).toContain('subscription');
    await $('.assistant-context').$('button=New chat').click();
  });
  it('remembers a chosen preference in an editable note and uses it in a fresh conversation', async () => {
    const before = snapshotVault(root);
    await send('Remember that I prefer short replies.'); await apply();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual(['changed: Assistant/Profile.md']);
    expect(readFileSync(join(root, 'Assistant/Profile.md'), 'utf8')).toContain('short replies');
    await $('.assistant-context').$('button=New chat').click();
    await send('What do you remember about my preferences?');
    await expect($('.assistant-message.is-assistant')).toHaveText(expect.stringContaining('short replies'));
    await screenshot('213-spike-personal-context');
  });
  it('creates an ordinary Inbox note after review, preserving its Markdown and refusing a duplicate', async () => {
    await $('.assistant-context').$('button=New chat').click();
    const before = snapshotVault(root);
    await send('Create a note called A small idea in my Inbox with today’s idea and a link to Home.');
    await expect($('.assistant-action')).toHaveText(expect.stringContaining('Inbox/A small idea.md'));
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await screenshot('223-spike-note-review');
    await apply();
    const path = 'Inbox/A small idea.md';
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([`added: ${path}`]);
    expect(readFileSync(join(root, path), 'utf8')).toBe('---\r\ntags: [idea]\r\n---\r\n\r\n# A small idea\r\n\r\nKeep one useful thought each day.  \r\nLink it to [[00. Home 2026]].\r\n');
    await expect($(`[data-testid="note"][data-path="${path}"]`)).toBeDisplayed();
    const saved = snapshotVault(root);
    await send('Create a note called A small idea again.');
    await expect($('[aria-label="Conversation with Spike"]')).toHaveText(expect.stringContaining('A file already exists'));
    expect(diffSnapshots(saved, snapshotVault(root))).toEqual([]);
  });
  it('guides reflection and saves the agreed CBT record into a daily Markdown note', async () => {
    const before = snapshotVault(root);
    await $('.assistant-context').$('button=New chat').click();
    await send('Talk through a CBT thought record with me in chat.');
    await expect($('.assistant-message.is-assistant')).toHaveText(expect.stringContaining('What happened'));
    await send('I missed a deadline and thought I was failing. I felt disappointed and anxious.');
    await send('One missed deadline does not define my work. I can agree on a smaller next step. I feel calmer. Save this thought record.');
    await screenshot('214-spike-thought-record');
    await apply();
    const changes = diffSnapshots(before, snapshotVault(root));
    expect(changes).toHaveLength(1);
    const path = changes[0]!.replace(/^(added|changed): /, '');
    const text = readFileSync(join(root, path), 'utf8');
    expect(text).toContain('I missed a deadline and thought I was failing.');
    expect(text).toContain('One missed deadline does not define my work.');
    await expect($(`[data-testid="note"][data-path="${path}"], [data-testid="periodic"][data-path="${path}"]`)).toBeDisplayed();
  });
  it('opens the CBT form and fills daily and monthly plans through native actions', async () => {
    await $('.assistant-context').$('button=New chat').click();
    const before = snapshotVault(root);
    await send('Start CBT now.');
    // The prior CBT journey already created today's daily note; opening it must not write.
    await $('[data-testid="thought-wizard"]').waitForDisplayed();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await screenshot('230-spike-start-cbt');
    await $('[aria-label="Thought record"]').$('button[aria-label="Close"]').click();
    await send('Add my three study tasks.'); await apply();
    const changes = diffSnapshots(before, snapshotVault(root));
    expect(changes).toHaveLength(1);
    const dailyPath = changes[0]!.replace(/^(added|changed): /, '');
    const daily = readFileSync(join(root, dailyPath), 'utf8');
    for (const task of ['#daily/business — Research marketing on X', '#daily/biology — Do the CRISPR course', '#daily/code — Add feature X to Mr Suit']) expect(daily).toContain(task);
    expect(daily).not.toMatch(/Add feature X to Mr Suit \[minutes::/);
    await send('Add a monthly biology quest.'); await apply();
    await send('Save my monthly decisions: I chose to focus on biology.'); await apply();
    await screenshot('231-spike-monthly-plan');
    await send('Plan two hours of code on 2026-12-01 in the morning.');
    await expect($('.assistant-action.is-review')).toHaveText(expect.stringContaining('09:00'));
    await screenshot('232-spike-calendar-plan'); await apply();
    await expect($('[data-testid="cal-view"]')).toHaveAttribute('data-start', '2026-12-01');
    await screenshot('235-spike-calendar-result');
    expect(diffSnapshots(before, snapshotVault(root))).toHaveLength(2);
  });
  it('reads a supplied link with a source and captures it as an ordinary Inbox note', async () => {
    const before = snapshotVault(root);
    await $('.assistant-context').$('button=New chat').click();
    await send('Discuss https://example.com/second-brain');
    await expect($('.assistant-sources button')).toHaveText('Connected notes');
    await send('Save this link and our summary.'); await apply();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual(['added: Inbox/Connected notes.md']);
    expect(readFileSync(join(root, 'Inbox/Connected notes.md'), 'utf8')).toContain('https://example.com/second-brain');
  });
  it('schedules the requested event through the local fake Calendar provider', async () => {
    const before = snapshotVault(root);
    await $('.assistant-context').$('button=New chat').click();
    await send('Schedule a reading hour tomorrow.'); await apply();
    const events = await browser.execute(async () => {
      const api = (window as unknown as { __TAURI__: { core: { invoke: (command: string, args: unknown) => Promise<{ title: string }[]> } } }).__TAURI__.core;
      return api.invoke('calendar_events', { from: Date.parse('2026-11-09T00:00:00Z'), to: Date.parse('2026-11-10T00:00:00Z') });
    });
    expect(events.some((event) => event.title === 'Read and reflect')).toBe(true);
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
  it('recalls a relevant discussion from previous conversations in the same vault', async () => {
    await $('.assistant-context').$('button=New chat').click();
    await send('What did we discuss about a deadline in previous conversations?');
    await expect($('.assistant-message.is-assistant')).toHaveText(expect.stringContaining('I missed a deadline'));
  });
  it('preserves an outside note edit on conflict and retains the requested draft for recovery', async () => {
    await $('.assistant-context').$('button=New chat').click();
    await send('Remember that I prefer quiet mornings.');
    const path = join(root, 'Assistant/Profile.md'), original = readFileSync(path, 'utf8');
    const outside = original + '\nAn outside edit to keep.\n'; writeFileSync(path, outside);
    const before = snapshotVault(root);
    await apply();
    await expect($('.assistant-action')).toHaveText(expect.stringContaining('This note changed'));
    expect(readFileSync(path, 'utf8')).toBe(outside);
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await $('.assistant-action summary').click();
    await expect($('.assistant-action pre')).toHaveText(expect.stringContaining('quiet mornings'));
    await $('.assistant-action-buttons').$('button=Stop retrying').click();
    await browser.waitUntil(async () => !(await $('[aria-label="Stop assistant"]').isExisting()));
    await send('Remember that I prefer quiet mornings.'); await apply();
    expect(readFileSync(path, 'utf8').startsWith(outside)).toBe(true);
    expect(diffSnapshots(before, snapshotVault(root))).toEqual(['changed: Assistant/Profile.md']);
  });
  it('configures an independent OpenRouter voice model with an isolated test key', async () => {
    await $('[aria-label="Assistant settings"]').click();
    await selectOption('.assistant-sidebar [aria-label="Voice provider"]', 'openrouter');
    await selectOption('.assistant-sidebar [aria-label="Transcription model"]', 'microsoft/mai-transcribe-2');
    await expect($('.assistant-sidebar [aria-label="Transcription model"]')).toHaveValue('microsoft/mai-transcribe-2');
    await $('.assistant-sidebar [aria-label="Voice API key"]').setValue('router-test-only-credential');
    await $('.assistant-sidebar').$('button=Save voice settings').click();
    await expect($('.assistant-sidebar .assistant-voice-preferences [role="status"]')).toHaveText('Voice settings saved.');
    await scrollIntoView('.assistant-sidebar .assistant-voice-preferences');
    await screenshot('225-spike-voice-settings');
    await $('button=← Conversation').click();
  });
  it('accepts a recorded voice message without accessing the real microphone', async () => {
    await $('.assistant-context').$('button=New chat').click();
    await browser.execute(() => {
      class Recorder {
        static isTypeSupported() { return true; }
        state = 'inactive'; mimeType = 'audio/webm';
        ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void;
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['EPIZEN_VOICE_FIXTURE'], { type: this.mimeType }) }); this.onstop?.(); }
      }
      Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }) } });
    });
    await $('[aria-label="Speak to Spike"]').click();
    await expect($('.assistant-voice-status')).toHaveText(expect.stringContaining('Listening'));
    await screenshot('215-spike-voice');
    await $('[aria-label="Send voice message"]').click();
    await expect($('.assistant-message.is-user')).toHaveText(expect.stringContaining('I prefer voice notes'));
    await $('.assistant-action-buttons').$('button=Decline').waitForEnabled();
    await $('.assistant-action-buttons').$('button=Decline').click();
    await browser.waitUntil(async () => !(await $('[aria-label="Stop assistant"]').isExisting()));
  });
  it('captures text in the quick pill, retains an unsent draft, and keeps changes in the main review flow', async () => {
    const before = snapshotVault(root);
    await browser.execute(async () => { await (window as unknown as { __TAURI__: { core: { invoke: (command: string, args: unknown) => Promise<unknown> } } }).__TAURI__.core.invoke('prompt_open', { dictate: false }); });
    await browser.waitUntil(async () => (await browser.getWindowHandles()).includes('spike-prompt'));
    await browser.switchToWindow('spike-prompt');
    await $('[aria-label="Quick message to Spike"]').waitForExist();
    await browser.execute(() => { document.documentElement.dataset.motion = 'off'; });
    await browser.waitUntil(async () => browser.execute(() => innerWidth <= 440 && innerHeight <= 80));
    await $('[aria-label="Quick message to Spike"]').setValue('Remember that I enjoy quiet walks.');
    await $('[aria-label="Close quick prompt"]').click();
    await browser.switchToWindow('main');
    await browser.execute(async () => { await (window as unknown as { __TAURI__: { core: { invoke: (command: string, args: unknown) => Promise<unknown> } } }).__TAURI__.core.invoke('prompt_open', { dictate: false }); });
    await browser.switchToWindow('spike-prompt');
    await $('[aria-label="Quick message to Spike"]').waitForExist();
    await browser.execute(() => { document.documentElement.dataset.motion = 'off'; });
    await expect($('[aria-label="Quick message to Spike"]')).toHaveValue('Remember that I enjoy quiet walks.');
    const forbidden = await browser.execute(async () => {
      try { await (window as unknown as { __TAURI__: { core: { invoke: (command: string, args: unknown) => Promise<unknown> } } }).__TAURI__.core.invoke('assistant_apply_note', { action: { id: 'forbidden', root: '/invalid', path: 'Never.md', before: null, after: 'Not allowed' } }); return false; }
      catch { return true; }
    });
    expect(forbidden).toBe(true);
    const coreWritesBlocked = await browser.execute(async () => {
      const invoke = (window as unknown as { __TAURI__: { core: { invoke: (command: string, args: unknown) => Promise<unknown> } } }).__TAURI__.core.invoke;
      const results = await Promise.all(['create_note', 'write_note', 'calendar_create', 'update_settings'].map(async (command) => {
        try { await invoke(command, {}); return false; } catch (error) { return String(error).includes('companion window'); }
      }));
      return results.every(Boolean);
    });
    expect(coreWritesBlocked).toBe(true);
    await screenshot('226-spike-quick-prompt');
    await $('.quick-send').click();
    await expect($('[aria-label="Quick message to Spike"]')).toHaveValue('');
    await $('button=Review in conversation ↗').waitForDisplayed();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await $('button=Review in conversation ↗').click();
    await browser.switchToWindow('main');
    await expect($('.assistant-action-buttons')).toBeDisplayed();
    await $('.assistant-action-buttons').$('button=Decline').waitForEnabled();
    await $('.assistant-action-buttons').$('button=Decline').click();
    await browser.waitUntil(async () => !(await $('[aria-label="Stop assistant"]').isExisting()));
  });
  it('records in the quick prompt and ignores a delayed close from a previous opening', async () => {
    const before = snapshotVault(root);
    const oldOpening = await browser.execute(async () => {
      const api = (window as unknown as { __TAURI__: { core: { invoke: (command: string, args?: unknown) => Promise<{ opened: number }> } } }).__TAURI__.core;
      const previous = await api.invoke('prompt_state');
      await api.invoke('prompt_open', { dictate: false });
      return previous.opened;
    });
    await browser.switchToWindow('spike-prompt');
    await $('[aria-label="Quick message to Spike"]').waitForExist();
    const visible = await browser.execute(async (opened) => {
      document.documentElement.dataset.motion = 'off';
      const api = (window as unknown as { __TAURI__: { core: { invoke: (command: string, args?: unknown) => Promise<{ visible: boolean }> } } }).__TAURI__.core;
      await api.invoke('prompt_hide', { opened });
      return (await api.invoke('prompt_state')).visible;
    }, oldOpening);
    expect(visible).toBe(true);
    await browser.execute(() => {
      class Recorder {
        static isTypeSupported() { return true; }
        state = 'inactive'; mimeType = 'audio/webm';
        ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void;
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['EPIZEN_VOICE_FIXTURE'], { type: this.mimeType }) }); this.onstop?.(); }
      }
      Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }) } });
    });
    await $('[aria-label="Dictate to Spike"]').waitForEnabled();
    await $('[aria-label="Dictate to Spike"]').click();
    await expect($('.quick-recording')).toHaveText(expect.stringContaining('Listening'));
    await screenshot('227-spike-quick-dictation');
    await $('[aria-label="Send quick voice message"]').click();
    await $('button=Review in conversation ↗').waitForDisplayed();
    await $('button=Review in conversation ↗').click();
    await browser.switchToWindow('main');
    await $('.assistant-action-buttons').$('button=Decline').waitForEnabled();
    await $('.assistant-action-buttons').$('button=Decline').click();
    await browser.waitUntil(async () => !(await $('[aria-label="Stop assistant"]').isExisting()));
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
  it('retains conversation history across reload and contains a provider failure', async () => {
    await browser.refresh(); await prepareWindow(); await $('[data-testid="open-assistant"]').click();
    await expect($('.assistant-message.is-user')).toHaveText(expect.stringContaining('I prefer voice notes'));
    await send('simulate offline');
    await expect($('.assistant-error')).toHaveText(expect.stringContaining('offline'));
    await screenshot('217-spike-provider-error');
    await $('button=End this turn').click();
    await browser.setWindowSize(880, 760); await scrollIntoView('.assistant-composer');
    await screenshot('216-spike-narrow-recovery');
    expect(await browser.execute(() => { const panel = document.querySelector('.assistant-sidebar')!.getBoundingClientRect(); return panel.left >= 0 && panel.right <= innerWidth && panel.height <= innerHeight; })).toBe(true);
    await $('[aria-label="Close assistant"]').click();
    await expect($('[data-testid="tabbar"]')).toBeDisplayed();
    await browser.setWindowSize(1280, 820);
  });
  it('plays a generated audio response under the app CSP and stops it on request', async () => {
    await $('[data-testid="open-assistant"]').click();
    await $('.assistant-read-aloud').scrollIntoView(); await $('.assistant-read-aloud').click();
    await expect($('.assistant-voice-status')).toHaveText(expect.stringContaining('Speaking'));
    await $('.assistant-voice-status').$('button=Cancel').click();
    await $('.assistant-voice-status').waitForExist({ reverse: true });
    await $('.assistant-read-aloud').scrollIntoView(); await $('.assistant-read-aloud').click();
    await $('.assistant-voice-status').waitForDisplayed();
    await $('.assistant-voice-status').waitForExist({ reverse: true });
    await expect($('.assistant-composer .assistant-error')).not.toBeExisting();
  });
  it('shows animated desktop Spike, pauses motion, and returns to an unsent draft after closing the main window', async () => {
    const before = snapshotVault(root);
    await $('[aria-label="Assistant settings"]').click();
    await $('.assistant-sidebar').$('button=Show Spike on desktop').click();
    await browser.waitUntil(async () => (await browser.getWindowHandles()).includes('spike'));
    await $('button=← Conversation').click();
    await browser.switchToWindow('spike');
    await $('[data-testid="desktop-pet"]').waitForDisplayed();
    const animation = await browser.execute(() => new Promise<{ frames: number; reducedMotion: boolean }>((resolve) => {
      // A parked pointer selects a still look pose; measure the idle animation instead.
      document.dispatchEvent(new PointerEvent('pointerleave'));
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const positions = new Set<string>(), start = performance.now();
      const read = () => { positions.add(getComputedStyle(document.querySelector('.spike-sprite')!).backgroundPosition); if (performance.now() - start >= 1300) resolve({ frames: positions.size, reducedMotion }); else requestAnimationFrame(read); };
      read();
    }));
    // Hosted macOS runners enable Reduce Motion. The system preference must win.
    if (animation.reducedMotion) expect(animation.frames).toBe(1);
    else expect(animation.frames).toBeGreaterThan(1);
    await screenshot('220-desktop-spike');
    await $('[aria-label="Pause animation"]').click();
    await $('[aria-label="Resume animation"]').waitForDisplayed();
    const paused = await browser.execute(() => getComputedStyle(document.querySelector('.spike-sprite')!).backgroundPosition);
    await browser.pause(350);
    expect(await browser.execute(() => getComputedStyle(document.querySelector('.spike-sprite')!).backgroundPosition)).toBe(paused);
    await $('[aria-label="Resume animation"]').click();
    await browser.switchToWindow('main');
    await $('[aria-label="Message Spike"]').setValue('Keep this unsent thought while Spike stays on my desktop.');
    await browser.execute(async () => { await (window as unknown as { __TAURI__: { window: { getCurrentWindow: () => { close: () => Promise<void> } } } }).__TAURI__.window.getCurrentWindow().close(); });
    await browser.waitUntil(async () => !(await browser.execute(async () => (window as unknown as { __TAURI__: { window: { getCurrentWindow: () => { isVisible: () => Promise<boolean> } } } }).__TAURI__.window.getCurrentWindow().isVisible())));
    await browser.switchToWindow('spike');
    await expect($('[data-testid="desktop-pet"]')).toBeDisplayed();
    await $('[aria-label="Open quick prompt"]').click();
    await browser.switchToWindow('spike-prompt');
    await $('[aria-label="Quick message to Spike"]').waitForExist();
    await browser.execute(() => { document.documentElement.dataset.motion = 'off'; });
    await $('button[aria-label="Open conversation"]').click();
    await browser.switchToWindow('main');
    await expect($('[aria-label="Message Spike"]')).toHaveValue('Keep this unsent thought while Spike stays on my desktop.');
    await browser.switchToWindow('spike'); await browser.switchToWindow('main'); await $('[aria-label="Assistant settings"]').click(); await $('.assistant-sidebar').$('button=Hide desktop Spike').click(); await browser.switchToWindow('spike');
    await browser.waitUntil(async () => !(await browser.execute(async () => (window as unknown as { __TAURI__: { window: { getCurrentWindow: () => { isVisible: () => Promise<boolean> } } } }).__TAURI__.window.getCurrentWindow().isVisible())));
    await browser.switchToWindow('main');
    await $('.assistant-sidebar').$('button=← Conversation').click();
    await expect($('[aria-label="Message Spike"]')).toHaveValue('Keep this unsent thought while Spike stays on my desktop.');
    await screenshot('221-spike-restored-draft');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
  it('exports an unsent draft without rewriting notes or replacing the same export file', async () => {
    await browser.switchToWindow('main');
    await $('[aria-label="Message Spike"]').setValue('Keep this unsent thought while Spike stays on my desktop.');
    const before = snapshotVault(root);
    await $('[aria-label="Conversation history"]').click();
    await $('button=Export conversation…').click();
    await expect($('.assistant-notice')).toHaveText(expect.stringContaining('Conversation exported'));
    const folder = join(dirname(vaultCopy()), 'config', 'assistant-exports');
    const files = readdirSync(folder).filter((file) => file.endsWith('.md'));
    expect(files).toHaveLength(1);
    const exported = readFileSync(join(folder, files[0]!), 'utf8');
    expect(exported).toContain('Keep this unsent thought while Spike stays on my desktop.');
    await $('button=Export conversation…').click();
    await expect($('.assistant-error')).toHaveText(expect.stringContaining('already exists'));
    expect(readFileSync(join(folder, files[0]!), 'utf8')).toBe(exported);
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });

  it('anchors capture below Spike, hides both on right-click, and restores the draft', async () => {
    const before = snapshotVault(root);
    const invoke = (command: string, args: Record<string, unknown> = {}) => browser.execute(async (command, args) => (window as unknown as { __TAURI__: { core: { invoke: (command: string, args: unknown) => Promise<unknown> } } }).__TAURI__.core.invoke(command, args), command, args);
    await invoke('prompt_open', { dictate: false });
    await browser.switchToWindow('spike-prompt');
    await $('[aria-label="Quick message to Spike"]').waitForExist();
    await $('[aria-label="Quick message to Spike"]').setValue('Keep this draft beside Spike.');
    await browser.switchToWindow('spike');
    await browser.waitUntil(async () => (await $('.desktop-pet').getAttribute('class'))?.includes('has-prompt') === true);
    await expect($('.pet-tools')).not.toBeDisplayed();
    const position = await invoke('pet_position') as { x: number; y: number; scale: number };
    await invoke('pet_move', { x: position.x - 100, y: position.y - 100 });
    const dog = await invoke('pet_position') as typeof position;
    await browser.switchToWindow('spike-prompt');
    const prompt = await browser.execute(async () => (window as unknown as { __TAURI__: { window: { getCurrentWindow: () => { outerPosition: () => Promise<{ x: number; y: number }> } } } }).__TAURI__.window.getCurrentWindow().outerPosition());
    expect(prompt.y - dog.y).toBeCloseTo(156 * dog.scale, 0);
    expect(dog.x - prompt.x).toBeCloseTo(130 * dog.scale, 0);
    await screenshot('229-spike-attached-prompt');
    await browser.switchToWindow('spike');
    await $('[aria-label="Talk to Spike · drag to move"]').click({ button: 'right' });
    await browser.waitUntil(async () => !(await browser.execute(async () => (window as unknown as { __TAURI__: { window: { getCurrentWindow: () => { isVisible: () => Promise<boolean> } } } }).__TAURI__.window.getCurrentWindow().isVisible())));
    await browser.switchToWindow('main');
    await invoke('prompt_open', { dictate: false });
    await browser.switchToWindow('spike-prompt');
    await expect($('[aria-label="Quick message to Spike"]')).toHaveValue('Keep this draft beside Spike.');
    await $('[aria-label="Close quick prompt"]').click();
    await browser.switchToWindow('main');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });

});
