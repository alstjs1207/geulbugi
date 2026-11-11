// Diagnostic tests for the 1.1.2 audit. Run separately from the regression suite:
// npx vitest run --config scripts/live-qa/qa-112.config.ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { DemoEditor } from '../../src/platform/demo';
import { defaultDatabase } from '../../src/core/defaults';
import type { EditorResponse } from '../../src/core/types';
import { editorRequest } from '../../src/platform/bridge';
import { RulesEditor } from '../../src/ui/RulesEditor';
import type { BreakRules } from '../../src/core/types';

vi.mock('../../src/platform/bridge', async original => ({
 ...await original<typeof import('../../src/platform/bridge')>(), editorRequest: vi.fn(),
}));
vi.mock('../../src/platform/storage', async original => ({
 ...await original<typeof import('../../src/platform/storage')>(),
 loadDatabase: vi.fn(async () => defaultDatabase()), isExtension: () => true,
}));

let host: HTMLDivElement, root: Root, listener: (message: unknown) => void;
let getWindow: ReturnType<typeof vi.fn>;
const ready = (session = 'draft-A') => ({ok: true as const, snapshot: {...new DemoEditor().snapshot(), sessionId: session}});
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return {promise, resolve}; }
async function emit(message: unknown) { await act(async () => listener(message)); }
async function poll() { await emit({type: 'PANEL_REFRESH'}); await act(async () => vi.advanceTimersByTimeAsync(500)); }

beforeEach(() => {
 vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 getWindow = vi.fn(async () => ({id: 77}));
 vi.stubGlobal('chrome', {
  runtime: {id: 'audit', getURL: (path: string) => path, onMessage: {addListener: (fn: typeof listener) => {listener = fn;}, removeListener: vi.fn()}},
  windows: {getCurrent: getWindow}, storage: {onChanged: {addListener: vi.fn(), removeListener: vi.fn()}},
 });
 vi.mocked(editorRequest).mockReset().mockResolvedValue(ready());
 host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('keeps the new document after an earlier document edit returns late', async () => {
 await act(async () => root.render(<App/>));
 const edit = deferred<EditorResponse>(); vi.mocked(editorRequest).mockReturnValueOnce(edit.promise);
 await act(async () => button('선택 영역에 적용').click());
 vi.mocked(editorRequest).mockResolvedValue(ready('draft-B'));
 await poll();
 const oldResult = ready('draft-A'); oldResult.snapshot.canUndo = true;
 await act(async () => edit.resolve(oldResult));
 // draft B has no operation to undo. The late A response must not enable it.
 expect(button('되돌리기').disabled).toBe(true);
});

it('does not attach a late old-document failure to the new document', async () => {
 await act(async () => root.render(<App/>));
 const edit = deferred<EditorResponse>(); vi.mocked(editorRequest).mockReturnValueOnce(edit.promise);
 await act(async () => button('선택 영역에 적용').click());
 vi.mocked(editorRequest).mockResolvedValue(ready('draft-B')); await poll();
 await act(async () => edit.resolve({ok: false, error: 'draft A response lost', recoveryRequired: true}));
 expect(host.querySelector('.recovery-banner')).toBeNull();
 expect(button('선택 영역에 적용').disabled).toBe(false);
});

it('keeps the newest shortcut result if window lookups finish out of order', async () => {
 await act(async () => root.render(<App/>));
 const olderWindow = deferred<{id: number}>(); getWindow.mockReturnValueOnce(olderWindow.promise);
 const older = ready(); older.snapshot.canUndo = true;
 await emit({type: 'SHORTCUT_RESULT', response: older, windowId: 77});
 await emit({type: 'SHORTCUT_RESULT', response: ready(), windowId: 77});
 expect(button('되돌리기').disabled).toBe(true);
 await act(async () => olderWindow.resolve({id: 77}));
 expect(button('되돌리기').disabled).toBe(true);
});

it('does not let an old shortcut replace a newer connection read', async () => {
 await act(async () => root.render(<App/>));
 const olderWindow = deferred<{id: number}>(); getWindow.mockReturnValueOnce(olderWindow.promise);
 const older = ready(); older.snapshot.canUndo = true;
 await emit({type: 'SHORTCUT_RESULT', response: older, windowId: 77});
 vi.mocked(editorRequest).mockResolvedValue(ready('draft-B')); await poll();
 await act(async () => olderWindow.resolve({id: 77}));
 expect(button('되돌리기').disabled).toBe(true);
});

it('keeps a confirmed edit after an older poll fails', async () => {
 await act(async () => root.render(<App/>));
 const older = deferred<EditorResponse>(); vi.mocked(editorRequest).mockReturnValueOnce(older.promise); await poll();
 const applied = ready(); applied.snapshot.canUndo = true; vi.mocked(editorRequest).mockResolvedValueOnce(applied);
 await act(async () => button('선택 영역에 적용').click());
 await act(async () => older.resolve({ok: false, error: 'stale poll'}));
 expect(button('되돌리기').disabled).toBe(false); expect(host.querySelector('.recovery-banner')).toBeNull();
});

it('keeps the native unsupported reflow checkbox disabled across a refresh', async () => {
 await act(async () => root.render(<App/>)); await act(async () => button('줄바꿈').click());
 const boxes = () => host.querySelectorAll<HTMLInputElement>('.rules-form input[type=checkbox]');
 expect(boxes()[0].disabled).toBe(false); expect(boxes()[1].disabled).toBe(true);
 await poll(); expect(boxes()[0].disabled).toBe(false); expect(boxes()[1].disabled).toBe(true);
});

it('recovers normal editing after a temporary disconnect and a new session', async () => {
 await act(async () => root.render(<App/>));
 vi.mocked(editorRequest).mockResolvedValueOnce({ok: false, error: 'temporary disconnect'}); await poll();
 expect(button('선택 영역에 적용').disabled).toBe(true);
 vi.mocked(editorRequest).mockResolvedValue(ready('draft-B')); await poll();
 expect(button('선택 영역에 적용').disabled).toBe(false); expect(host.querySelector('.recovery-banner')).toBeNull();
});

it('keeps both toggle intents when the same checkbox is clicked twice before storage responds', async () => {
 const initial = defaultDatabase().settings.rules, pending: Partial<BreakRules>[] = [];
 await act(async () => root.render(<RulesEditor rules={initial} canReflow={false} onChange={patch => pending.push(patch)}/>));
 const box = host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
 await act(async () => box.click());
 await act(async () => box.click());
 const stored = pending.reduce<BreakRules>((rules, patch) => ({...rules, ...patch}), initial);
 await act(async () => root.render(<RulesEditor rules={stored} canReflow={false} onChange={() => {}}/>));
 expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(initial.preserveExisting);
});
