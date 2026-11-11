// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/ui/App';
import { DemoEditor } from '../src/platform/demo';
import { defaultDatabase } from '../src/core/defaults';
import { editorRequest } from '../src/platform/bridge';

vi.mock('../src/platform/bridge', async original => ({...await original<typeof import('../src/platform/bridge')>(), editorRequest: vi.fn()}));
vi.mock('../src/platform/storage', async original => ({...await original<typeof import('../src/platform/storage')>(), loadDatabase: vi.fn(async () => defaultDatabase()), isExtension: () => true}));
let host: HTMLDivElement, root: Root, listener: (message: unknown) => void;
beforeEach(() => {
 vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 vi.stubGlobal('chrome', {runtime:{id:'perf',getURL:(p:string)=>p,onMessage:{addListener:(fn:typeof listener)=>{listener=fn;},removeListener:vi.fn()}},windows:{getCurrent:vi.fn(async()=>({id:77}))},storage:{onChanged:{addListener:vi.fn(),removeListener:vi.fn()}}});
 vi.mocked(editorRequest).mockReset().mockResolvedValue({ok:true,snapshot:new DemoEditor().snapshot()});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.useRealTimers();});

it('refreshes within 80ms without postponing continuous change notifications',async()=>{
 await act(async()=>root.render(<App/>));vi.mocked(editorRequest).mockClear();
 await act(async()=>listener({type:'PANEL_REFRESH'}));await act(async()=>vi.advanceTimersByTimeAsync(79));expect(editorRequest).not.toHaveBeenCalled();
 await act(async()=>vi.advanceTimersByTimeAsync(1));expect(editorRequest).toHaveBeenCalledTimes(1);
 for(let i=0;i<20;i++)await act(async()=>{listener({type:'PANEL_REFRESH'});await vi.advanceTimersByTimeAsync(20);});
 expect(vi.mocked(editorRequest).mock.calls.length).toBeGreaterThan(1);expect(vi.mocked(editorRequest).mock.calls.length).toBeLessThan(10);
});

it('coalesces notifications while a snapshot is in flight and reads once more after it finishes',async()=>{
 await act(async()=>root.render(<App/>));vi.mocked(editorRequest).mockClear();
 let resolve!:(value:Awaited<ReturnType<typeof editorRequest>>)=>void;
 vi.mocked(editorRequest).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
 await act(async()=>{listener({type:'PANEL_REFRESH'});await vi.advanceTimersByTimeAsync(80);});
 for(let i=0;i<40;i++)await act(async()=>{listener({type:'PANEL_REFRESH'});await vi.advanceTimersByTimeAsync(20);});
 expect(editorRequest).toHaveBeenCalledTimes(1);
 await act(async()=>resolve({ok:true,snapshot:new DemoEditor().snapshot()}));await act(async()=>vi.advanceTimersByTimeAsync(80));
 expect(editorRequest).toHaveBeenCalledTimes(2);
});
