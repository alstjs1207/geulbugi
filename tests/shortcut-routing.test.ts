import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defaultDatabase} from '../src/core/defaults';
import type {EditorRequest, EditorResponse, Preset} from '../src/core/types';

const ready = {ok: true, snapshot: {editable: true}} as EditorResponse;
const applied = {ok: true, snapshot: {editable: true}, unchanged: false} as EditorResponse;

async function setup(frames = [{id: 1, editable: true}]) {
  const db = defaultDatabase();
  const onCommand = vi.fn();
  const notify = vi.fn(async () => undefined);
  const query = vi.fn(async () => [{id: 10, url: 'https://blog.naver.com/example?Redirect=Write&'}]);
  const send = vi.fn(async (_tab: number, message: {request: EditorRequest}, _options: {frameId: number}) =>
    message.request.type === 'snapshot' ? ready : applied);
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test-extension', sendMessage: notify,
      onInstalled: {addListener: vi.fn()}, onMessage: {addListener: vi.fn()},
    },
    tabs: {query, sendMessage: send, onRemoved: {addListener: vi.fn()}},
    storage: {
      local: {get: vi.fn(async (key: string) => ({[key]: structuredClone(db)}))},
      session: {
        get: vi.fn(async (key: string) => ({[key]: frames})),
        set: vi.fn(), remove: vi.fn(),
      },
    },
    sidePanel: {setPanelBehavior: vi.fn(async () => undefined)},
    commands: {onCommand: {addListener: onCommand}},
  });
  await import('../src/background');
  const command = onCommand.mock.calls[0][0] as (name: string) => Promise<void>;
  return {db, command, send, notify, query};
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('registered extension shortcut commands', () => {
  it.each([
    ['1', 'body'], ['2', 'heading'], ['3', 'emphasis'], ['4', 'quote'],
  ])('dispatches slot %s with its saved %s preset', async (slot, id) => {
    const api = await setup();
    const saved = api.db.presets.find(p => p.id === id)!;
    // Saved values can differ from defaults and from the card open in the panel.
    saved.format.color = '#0078cb';
    if (id === 'quote') saved.format.quoteStyle = 'quotation_bubble';
    await api.command('apply-preset-' + slot);
    expect(api.query).toHaveBeenCalledWith({active: true, currentWindow: true});
    expect(api.send.mock.calls.map(([, message]) => message.request.type)).toEqual(['snapshot', 'format']);
    expect(api.send).toHaveBeenLastCalledWith(10, {type: 'EDITOR', request: {type: 'format', preset: saved}}, {frameId: 1});
    expect(api.notify).toHaveBeenCalledWith({type: 'SHORTCUT_RESULT', response: applied});
  });

  it.each(['5', '6', '7', '8'])('supports a custom saved preset in slot %s', async slot => {
    const api = await setup();
    const custom: Preset = {id: 'custom-format', name: '내 서식', description: '', format: {bold: true, color: '#123456', align: 'right'}};
    api.db.presets.push(custom);
    api.db.settings.shortcutPresets[slot] = custom.id;
    await api.command('apply-preset-' + slot);
    expect(api.send).toHaveBeenLastCalledWith(10, {type: 'EDITOR', request: {type: 'format', preset: custom}}, {frameId: 1});
  });

  it('loads the latest saved mapping again on the next key press', async () => {
    const api = await setup();
    await api.command('apply-preset-1');
    api.db.settings.shortcutPresets['1'] = 'emphasis';
    api.db.presets.find(p => p.id === 'emphasis')!.format.color = '#456789';
    await api.command('apply-preset-1');
    const requests = api.send.mock.calls.filter(([, message]) => message.request.type === 'format');
    expect(requests.map(([, message]) => message.request.type === 'format' && message.request.preset.id)).toEqual(['body', 'emphasis']);
    expect(requests[1][1].request).toMatchObject({preset: {format: {color: '#456789'}}});
  });

  it('does not edit for unassigned, deleted, or unrelated commands', async () => {
    const api = await setup();
    api.db.settings.shortcutPresets['6'] = 'deleted-preset';
    for (const command of ['apply-preset-5', 'apply-preset-6', 'apply-preset-0', 'apply-preset-9', '_execute_action']) {
      await api.command(command);
    }
    expect(api.query).not.toHaveBeenCalled();
    expect(api.send).not.toHaveBeenCalled();
  });

  it('reports a selection rejection without retrying the edit', async () => {
    const api = await setup([{id: 1, editable: true}, {id: 2, editable: true}]);
    const rejected: EditorResponse = {ok: false, error: '본문에서 적용할 글자를 드래그해 주세요.'};
    api.send.mockImplementation(async (_tab, message) => message.request.type === 'snapshot' ? ready : rejected);
    await api.command('apply-preset-3');
    expect(api.send.mock.calls.filter(([, message]) => message.request.type === 'format')).toHaveLength(1);
    expect(api.notify).toHaveBeenCalledWith({type: 'SHORTCUT_RESULT', response: rejected});
  });

  it('skips a disconnected draft frame before dispatching one edit', async () => {
    const api = await setup([{id: 1, editable: true}, {id: 2, editable: true}]);
    api.send.mockImplementation(async (_tab, message, options) => {
      if (options.frameId === 2) throw new Error('Receiving end does not exist.');
      return message.request.type === 'snapshot' ? ready : applied;
    });
    await api.command('apply-preset-4');
    expect(api.send.mock.calls.map(([, message, options]) => [message.request.type, options.frameId])).toEqual([
      ['snapshot', 2], ['snapshot', 1], ['format', 1],
    ]);
    expect(api.notify).toHaveBeenCalledWith({type: 'SHORTCUT_RESULT', response: applied});
  });

  it('does not dispatch another edit after losing its response', async () => {
    const api = await setup([{id: 1, editable: true}, {id: 2, editable: true}]);
    api.send.mockImplementation(async (_tab, message) => {
      if (message.request.type === 'format') throw new Error('Frame closed after dispatch.');
      return ready;
    });
    await api.command('apply-preset-4');
    expect(api.send.mock.calls.filter(([, message]) => message.request.type === 'format')).toHaveLength(1);
    expect(api.notify).toHaveBeenCalledWith({type: 'SHORTCUT_RESULT', response: {ok: false, error: expect.stringContaining('연결이 끊겼어요'), recoveryRequired:true}});
  });

  it('does not broadcast a mutation when no editor frame is connected', async () => {
    const api = await setup([]);
    await api.command('apply-preset-1');
    expect(api.send).not.toHaveBeenCalled();
    expect(api.notify).toHaveBeenCalledWith({type: 'SHORTCUT_RESULT', response: {ok: false, error: expect.stringContaining('편집기와 연결되지 않았어요')}});
  });

  it('does not edit a read-only page or another website', async () => {
    const api = await setup();
    api.send.mockResolvedValue({ok: true, snapshot: {editable: false}} as EditorResponse);
    await api.command('apply-preset-2');
    expect(api.send.mock.calls.map(([, message]) => message.request.type)).toEqual(['snapshot']);
    api.send.mockClear();
    api.query.mockResolvedValue([{id: 20, url: 'https://example.com/'}]);
    await api.command('apply-preset-2');
    expect(api.send).not.toHaveBeenCalled();
  });
});
